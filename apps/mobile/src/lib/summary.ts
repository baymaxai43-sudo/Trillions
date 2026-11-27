/**
 * Assistant replies can carry summary cards as fenced blocks the agent's show_summary tool writes:
 *
 *   ```trillion-summary
 *   {"id":"…","title":"…","markdown":"…"}
 *   ```
 *
 * The JSON is on one line, so markdown with backticks inside is safe.
 */
export type Summary = { id: string; title: string; markdown: string };
export type Segment = { kind: 'text'; text: string } | { kind: 'summary'; summary: Summary };

const OPEN = '```trillion-summary';
const BLOCK = /(^|\n)[ \t]*```trillion-summary[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```[ \t]*(?=\r?\n|$)/g;

function decode(body: string, n: number): Summary | null {
  try {
    const v = JSON.parse(body.trim());
    if (!v || typeof v.markdown !== 'string') return null;
    return { id: String(v.id ?? `s${n}`), title: String(v.title || 'Summary'), markdown: v.markdown };
  } catch {
    return null;
  }
}

const pushText = (out: Segment[], text: string) => {
  if (!text.trim()) return;
  const last = out[out.length - 1];
  if (last?.kind === 'text') last.text = `${last.text}\n\n${text.trim()}`;
  else out.push({ kind: 'text', text: text.trim() });
};

/** Splits assistant content into text and summary segments. An unfinished trailing block (still streaming) is hidden. */
export function parseSummaries(content: string): Segment[] {
  if (!content.includes(OPEN)) return content.trim() ? [{ kind: 'text', text: content }] : [];
  const out: Segment[] = [];
  let at = 0;
  let n = 0;
  BLOCK.lastIndex = 0;
  for (let m = BLOCK.exec(content); m; m = BLOCK.exec(content)) {
    pushText(out, content.slice(at, m.index));
    const s = decode(m[2], n++);
    if (s) out.push({ kind: 'summary', summary: s });
    at = m.index + m[0].length;
  }
  let rest = content.slice(at);
  const open = rest.search(/(^|\n)[ \t]*```trillion-summary/);
  if (open >= 0) rest = rest.slice(0, open); // incomplete block: wait for the rest
  pushText(out, rest);
  return out;
}

/** Plain-text preview of markdown (for the card's two-line teaser). */
export function plainPreview(markdown: string, max = 220): string {
  return markdown
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/[*`~|]/g, '')
    .replace(/(^|\s)_+|_+(?=\s|$|[.,;:!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * Some models (or providers whose native tool calling fails) write tool calls or planner JSON as plain
 * text: `{"name": "github_get_file", ...}`, `<function=fetch_url>{...}</function>`, `{"steps": [...]}`.
 * This filter sits on the delta stream and drops such blocks when they start a line, so the user never
 * sees raw machinery. Ordinary prose and fenced code blocks pass through unchanged.
 */
const PREFIXES = ['{"name"', '{"steps"', '{"tool', '{"function"', '{"arguments"', '{"type":"function"', '[{"name"', '<function', '<tool_call>', '<|tool', '<|python_tag|>'];

type Mode = 'text' | 'json' | 'tag';

export class ToolCallTextFilter {
  private buf = '';
  private mode: Mode = 'text';
  private lineStart = true;
  private depth = 0;
  private inStr = false;
  private esc = false;
  private inFence = false;
  /** True once anything was dropped in this turn. */
  suppressed = false;

  /** Feed a delta; returns the text that is safe to show now. */
  push(chunk: string): string {
    this.buf += chunk;
    return this.drain(false);
  }

  /** End of turn: returns whatever is left that is safe to show. */
  flush(): string {
    const out = this.drain(true);
    if (this.mode !== 'text') this.suppressed = true;
    this.buf = '';
    this.mode = 'text';
    this.lineStart = true;
    return out;
  }

  private drain(final: boolean): string {
    let out = '';
    while (this.buf.length) {
      if (this.mode === 'json') {
        if (!this.skipJson()) return out;
        continue;
      }
      if (this.mode === 'tag') {
        const m = this.buf.match(/<\/function>|<\/tool_call>|<\|eom_id\|>|<\|eot_id\|>/);
        if (!m || m.index === undefined) {
          this.buf = '';
          return out;
        }
        this.buf = this.buf.slice(m.index + m[0].length);
        this.mode = 'text';
        this.lineStart = true;
        continue;
      }
      if (this.lineStart && !this.inFence) {
        const lead = this.buf.match(/^[ \t\r\n]*/)?.[0] ?? '';
        const rest = this.buf.slice(lead.length);
        const compact = rest.replace(/\s+/g, '').slice(0, 24);
        if (!compact && !final) return out; // only whitespace so far: wait
        const hit = PREFIXES.find((p) => compact.startsWith(p));
        if (hit) {
          this.suppressed = true;
          this.buf = rest;
          if (hit.startsWith('<')) this.mode = 'tag';
          else {
            this.mode = 'json';
            this.depth = 0;
            this.inStr = false;
            this.esc = false;
          }
          continue;
        }
        const maybe = PREFIXES.some((p) => p.startsWith(compact) && compact.length < p.length);
        if (maybe && !final) return out; // could still become a tool call: wait for more
      }
      const nl = this.buf.indexOf('\n');
      const line = nl >= 0 ? this.buf.slice(0, nl + 1) : this.buf;
      if (nl < 0 && !final && this.lineStart && line.length < 24 && /^[ \t]*[{<[]/.test(line)) return out;
      out += line;
      if (/^\s*```/.test(line)) this.inFence = !this.inFence;
      this.buf = this.buf.slice(line.length);
      this.lineStart = nl >= 0;
    }
    return out;
  }

  /** Consumes a JSON value from buf; returns false when more input is needed. */
  private skipJson(): boolean {
    for (let i = 0; i < this.buf.length; i++) {
      const c = this.buf[i];
      if (this.inStr) {
        if (this.esc) this.esc = false;
        else if (c === '\\') this.esc = true;
        else if (c === '"') this.inStr = false;
        continue;
      }
      if (c === '"') this.inStr = true;
      else if (c === '{' || c === '[') this.depth++;
      else if (c === '}' || c === ']') {
        this.depth--;
        if (this.depth <= 0) {
          this.buf = this.buf.slice(i + 1).replace(/^[ \t]*\r?\n?/, '');
          this.mode = 'text';
          this.lineStart = true;
          return true;
        }
      }
    }
    this.buf = '';
    return false;
  }
}

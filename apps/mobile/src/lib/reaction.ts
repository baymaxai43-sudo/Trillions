/** Agent tapbacks travel in the assistant reply as a hidden marker: <!--trillion-react:👍--> (mirrors @trillion/shared). */
export const REACTION_EMOJIS = ['👍', '❤️', '😂', '🔥', '🎉', '👀', '🙏', '✅'];
const MARKER = /<!--trillion-react:([^>]{1,16}?)-->[ \t]*(\r?\n)?/g;
const OPEN = '<!--trillion-react:';

/** Drops a marker that is still streaming in (cut mid-way at the end of the text). */
function dropPartial(text: string): string {
  const at = text.lastIndexOf('<');
  if (at < 0 || text.length - at > OPEN.length + 20) return text;
  const tail = text.slice(at);
  return OPEN.startsWith(tail) || (tail.startsWith(OPEN) && !tail.includes('-->')) ? text.slice(0, at) : text;
}

/** Splits off the reaction marker: `{ emoji, text }` where text never contains a marker. */
export function extractReaction(content: string): { emoji: string | null; text: string } {
  let emoji: string | null = null;
  const text = content.replace(MARKER, (_m, e: string) => {
    if (!emoji && REACTION_EMOJIS.includes(e)) emoji = e;
    return '';
  });
  return { emoji, text: dropPartial(text) };
}

export const stripReaction = (content: string) => extractReaction(content).text;

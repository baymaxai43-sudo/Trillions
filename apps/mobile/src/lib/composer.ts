/**
 * Tiny bus to the chat composer: anything (e.g. the summary sheet's Reply) can prefill the draft
 * and focus the input. app/index.tsx owns the draft and subscribes.
 */
type Listener = (ev: { draft: string; mode: 'replace' | 'prepend' }) => void;
const listeners = new Set<Listener>();

export function onComposerDraft(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Puts text in the composer and focuses it. `prepend` keeps whatever the user already typed after it. */
export function setComposerDraft(draft: string, mode: 'replace' | 'prepend' = 'prepend') {
  listeners.forEach((fn) => fn({ draft, mode }));
}

/** The quote the Reply action starts a follow-up with. */
export const replyQuote = (title: string) => `> Re: ${title.replace(/\s+/g, ' ').trim()}\n\n`;

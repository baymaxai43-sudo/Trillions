import { router } from 'expo-router';

/** Lets Home ask the (already mounted) chat screen to open a conversation, then go back to it. */
type Listener = (conversationId: string | null) => void;
const listeners = new Set<Listener>();

export function onOpenConversation(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Open a conversation (or a new chat when id is null) in the chat screen. */
export function openConversation(id: string | null) {
  if (listeners.size > 0 && router.canDismiss()) {
    listeners.forEach((l) => l(id));
    router.dismissAll();
    return;
  }
  router.replace(id ? { pathname: '/', params: { id } } : { pathname: '/', params: { new: String(Date.now()) } });
}

export type Tab = 'chat' | 'home' | 'projects';
const TAB_PATH: Record<Exclude<Tab, 'chat'>, '/home' | '/projects'> = { home: '/home', projects: '/projects' };

/** Tab-like switching on top of one stack: Chat stays mounted at the root so runs keep streaming. */
export function goTab(target: Tab, current: Tab | null) {
  if (target === current) return;
  if (target === 'chat') {
    if (router.canDismiss()) router.dismissAll();
    else router.replace('/');
    return;
  }
  if (current === 'chat') router.push(TAB_PATH[target]);
  else router.replace(TAB_PATH[target]);
}

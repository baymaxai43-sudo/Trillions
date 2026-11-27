import AsyncStorage from '@react-native-async-storage/async-storage';

export type PanelId = 'welcome' | 'recent' | 'schedules' | 'accounts' | 'memory';
export const ALL_PANELS: { id: PanelId; label: string; description: string; span: 1 | 2 }[] = [
  { id: 'welcome', label: 'Welcome', description: 'Greeting and today\u2019s date', span: 2 },
  { id: 'recent', label: 'Recent chats', description: 'Your latest conversations', span: 2 },
  { id: 'schedules', label: 'Scheduled tasks', description: 'What TRILLION runs for you', span: 1 },
  { id: 'accounts', label: 'Connected accounts', description: 'Which accounts the agent can use', span: 1 },
  { id: 'memory', label: 'What TRILLION knows', description: 'Saved memories', span: 2 },
];
const PANELS_KEY = 'trillion.panels.v1';

export async function getEnabledPanels(): Promise<PanelId[]> {
  try {
    const raw = await AsyncStorage.getItem(PANELS_KEY);
    if (raw) {
      const ids = JSON.parse(raw) as PanelId[];
      return ALL_PANELS.map((p) => p.id).filter((id) => ids.includes(id));
    }
  } catch {}
  return ALL_PANELS.map((p) => p.id);
}
export const setEnabledPanels = (ids: PanelId[]) => AsyncStorage.setItem(PANELS_KEY, JSON.stringify(ids)).catch(() => {});

const onboardKey = (userId: string) => `trillion.onboarded.${userId}`;
export async function hasOnboarded(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(onboardKey(userId))) === '1';
  } catch {
    return true;
  }
}
const onboardListeners = new Set<(userId: string) => void>();
export function onOnboarded(fn: (userId: string) => void) {
  onboardListeners.add(fn);
  return () => {
    onboardListeners.delete(fn);
  };
}
export async function markOnboarded(userId: string) {
  await AsyncStorage.setItem(onboardKey(userId), '1').catch(() => {});
  onboardListeners.forEach((l) => l(userId));
}

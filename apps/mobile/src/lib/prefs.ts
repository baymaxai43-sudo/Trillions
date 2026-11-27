import * as SecureStore from 'expo-secure-store';

const MODEL_KEY = 'trillion.defaultModel';
const AGENT_KEY = 'trillion.agentMode';

export async function getDefaultModel(): Promise<string> {
  try {
    return (await SecureStore.getItemAsync(MODEL_KEY)) || 'auto';
  } catch {
    return 'auto';
  }
}
export const setDefaultModel = (id: string) => SecureStore.setItemAsync(MODEL_KEY, id);

export async function getAgentMode(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(AGENT_KEY)) !== 'off';
  } catch {
    return true;
  }
}
export const setAgentModePref = (on: boolean) => SecureStore.setItemAsync(AGENT_KEY, on ? 'on' : 'off');

import { supabase } from './supabase';
import type { Conversation } from './conversations';

/** Projects live in public.projects (title = the project's name). Conversations link via project_id. */
export type Project = { id: string; title: string; description: string | null; created_at: string; updated_at: string };

export async function listProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, title, description, created_at, updated_at')
    .is('archived_at', null)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Project[];
}

export async function getProject(id: string): Promise<Project | null> {
  const { data, error } = await supabase.from('projects').select('id, title, description, created_at, updated_at').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Project) ?? null;
}

export async function createProject(name: string, description?: string): Promise<Project> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Not signed in');
  const { data, error } = await supabase
    .from('projects')
    .insert({ owner_id: u.user.id, title: name.trim(), description: description?.trim() || null })
    .select('id, title, description, created_at, updated_at')
    .single();
  if (error) throw new Error(error.message);
  return data as Project;
}

export async function archiveProject(id: string) {
  const { error } = await supabase.from('projects').update({ archived_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function projectConversations(projectId: string): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, title, updated_at, created_at')
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Conversation[];
}

/** Creates an empty conversation inside a project; the agent continues it via conversationId. */
export async function createProjectConversation(projectId: string): Promise<string> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Not signed in');
  const { data, error } = await supabase.from('conversations').insert({ owner_id: u.user.id, project_id: projectId, title: null }).select('id').single();
  if (error) throw new Error(error.message);
  await supabase.from('projects').update({ updated_at: new Date().toISOString() }).eq('id', projectId);
  return data.id as string;
}

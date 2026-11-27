import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../src/lib/supabase';
import { Alert, AppState, FlatList, Image, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Composer } from '../src/components/Composer';
import { MessageView } from '../src/components/MessageView';
import { TopBar } from '../src/components/TopBar';
import { ArtifactCard, ConfirmCard, PlanCard, ToolCard } from '../src/components/AgentCards';
import { ConfirmSheet } from '../src/components/ConfirmSheet';
import { streamChat } from '../src/lib/chat';
import { cancelRun, ChatItem, confirmAction, PendingConfirmation, reattachRun, streamAgent, toHistory } from '../src/lib/agent';
import { colors, space, type } from '../src/theme';

type RunState = { id?: string; lastSeq: number; done: boolean; attached: boolean };

export default function Chat() {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [agentMode, setAgentMode] = useState(true);
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const conv = useRef<string | undefined>();
  const stopRef = useRef<() => void>();
  const run = useRef<RunState>({ lastSeq: 0, done: true, attached: false });
  const replayText = useRef('');
  const listRef = useRef<FlatList<ChatItem>>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace('/auth');
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) router.replace('/auth');
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const appendText = (text: string) =>
    setItems((m) => {
      const last = m[m.length - 1];
      if (last?.kind === 'assistant') return [...m.slice(0, -1), { ...last, content: last.content + text }];
      return [...m, { kind: 'assistant', content: text }];
    });

  const handleAgentEvent = useCallback((ev: any) => {
    const r = run.current;
    if (typeof ev.seq === 'number') r.lastSeq = Math.max(r.lastSeq, ev.seq);
    else if (r.attached && ev.type !== 'meta') {
      // Replay of a finished run from the DB: only take its final text and status.
      if (ev.type === 'delta') replayText.current += ev.text;
      if (ev.type !== 'done') return;
    }
    switch (ev.type) {
      case 'meta':
        if (ev.conversationId) conv.current = ev.conversationId;
        if (ev.runId) r.id = ev.runId;
        break;
      case 'plan':
        setItems((m) => {
          const lastUser = m.map((i) => i.kind).lastIndexOf('user');
          const idx = m.findIndex((i, k) => k > lastUser && i.kind === 'plan');
          if (idx >= 0) return m.map((i, k) => (k === idx ? { kind: 'plan', steps: ev.steps } : i));
          return [...m, { kind: 'plan', steps: ev.steps }];
        });
        break;
      case 'step_status':
        setItems((m) => {
          const idx = m.map((i) => i.kind).lastIndexOf('plan');
          if (idx < 0) return m;
          const p = m[idx] as Extract<ChatItem, { kind: 'plan' }>;
          const steps = p.steps.map((s, i) => (i === ev.index ? { ...s, status: ev.status } : s));
          return m.map((i, k) => (k === idx ? { kind: 'plan', steps } : i));
        });
        break;
      case 'delta':
        if (!ev.depth) appendText(ev.text);
        break;
      case 'tool_call':
        setItems((m) => [...m, { kind: 'tool', id: ev.id, name: ev.name, args: ev.args ?? {}, status: 'running', depth: ev.depth ?? 0 }]);
        break;
      case 'tool_result':
        setItems((m) => m.map((i) => (i.kind === 'tool' && i.id === ev.id ? { ...i, status: ev.ok ? 'ok' : 'error', summary: ev.summary } : i)));
        break;
      case 'artifact':
        setItems((m) => [...m, { kind: 'artifact', name: ev.name, url: ev.url, mime: ev.mime, size: ev.size }]);
        break;
      case 'pending_confirmation':
        setItems((m) => [...m, { kind: 'confirm', id: ev.id, tool: ev.tool, summary: ev.summary, args: ev.args ?? {}, state: 'pending' }]);
        if (r.id) setPending({ runId: r.id, id: ev.id, tool: ev.tool, summary: ev.summary, args: ev.args ?? {} });
        break;
      case 'confirmation_resolved':
        setItems((m) => m.map((i) => (i.kind === 'confirm' && i.id === ev.id ? { ...i, state: ev.approved ? 'approved' : 'declined' } : i)));
        setPending((p) => (p?.id === ev.id ? null : p));
        break;
      case 'error':
        appendText(`\n\n⚠️ ${ev.message}`);
        break;
      case 'done':
        if (replayText.current) {
          const text = replayText.current;
          setItems((m) => {
            const last = m[m.length - 1];
            if (last?.kind === 'assistant' && text.length > last.content.length) return [...m.slice(0, -1), { kind: 'assistant', content: text }];
            return last?.kind === 'assistant' ? m : [...m, { kind: 'assistant', content: text }];
          });
          replayText.current = '';
        }
        r.done = true;
        setBusy(false);
        setPending(null);
        break;
    }
  }, []);

  const onStreamClose = useCallback((reason: 'end' | 'error') => {
    if (reason === 'error' && !run.current.id) {
      appendText('\n\n⚠️ Connection lost.');
      setBusy(false);
    }
    // If the run is still going server-side, AppState 'active' re-attaches.
  }, []);

  /** Coming back to the app mid-run: replay what we missed and keep streaming. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      const r = run.current;
      if (state !== 'active' || r.done || !r.id) return;
      stopRef.current?.();
      r.attached = true;
      stopRef.current = await reattachRun(r.id, r.lastSeq, handleAgentEvent, onStreamClose);
    });
    return () => sub.remove();
  }, [handleAgentEvent, onStreamClose]);

  const send = async (text: string) => {
    const nextItems: ChatItem[] = [...items, { kind: 'user', content: text }];
    const history = toHistory(nextItems);
    setItems(nextItems);
    setBusy(true);
    if (agentMode) {
      run.current = { lastSeq: 0, done: false, attached: false };
      stopRef.current = await streamAgent(history, { conversationId: conv.current }, handleAgentEvent, onStreamClose);
      return;
    }
    setItems([...nextItems, { kind: 'assistant', content: '' }]);
    stopRef.current = await streamChat(history, { conversationId: conv.current }, (ev) => {
      if (ev.type === 'meta') conv.current = ev.conversationId;
      if (ev.type === 'delta') appendText(ev.text);
      if (ev.type === 'error') appendText(ev.message);
      if (ev.type === 'done' || ev.type === 'error') setBusy(false);
    });
  };

  const stop = () => {
    const r = run.current;
    if (agentMode && r.id && !r.done) cancelRun(r.id).catch(() => undefined);
    stopRef.current?.();
    setBusy(false);
  };

  const decide = async (approve: boolean) => {
    if (!pending) return;
    try {
      await confirmAction(pending.runId, pending.id, approve);
    } catch (err) {
      Alert.alert('Not sent', (err as Error).message);
    }
    setPending(null);
  };

  const render = ({ item }: { item: ChatItem }) => {
    switch (item.kind) {
      case 'user':
      case 'assistant':
        return item.content ? <MessageView m={{ role: item.kind, content: item.content }} /> : null;
      case 'plan':
        return <PlanCard steps={item.steps} />;
      case 'tool':
        return <ToolCard item={item} />;
      case 'artifact':
        return <ArtifactCard item={item} />;
      case 'confirm':
        return (
          <ConfirmCard
            item={item}
            onReview={() => run.current.id && setPending({ runId: run.current.id, id: item.id, tool: item.tool, summary: item.summary, args: item.args })}
          />
        );
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <TopBar title={agentMode ? 'Agent' : 'Chat'} onHome={() => router.push('/home')} onProfile={() => router.push('/connections')} />
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {items.length === 0 ? (
          <View style={s.empty}>
            <Image source={require('../assets/logo-mark.png')} style={s.mark} />
            <Text style={s.hello}>Good to see you.</Text>
            <Text style={s.sub}>{agentMode ? 'Give me a task. I plan it, use tools, and ask before anything risky.' : 'What would you like to work on?'}</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            contentContainerStyle={s.list}
            data={items}
            keyExtractor={(_, i) => String(i)}
            renderItem={render}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          />
        )}
        {busy && agentMode && <Text style={s.working}>Working… you can leave the app, the task keeps running.</Text>}
        <Composer busy={busy} onSend={send} onStop={stop} agentMode={agentMode} onToggleAgent={() => setAgentMode((v) => !v)} />
      </KeyboardAvoidingView>
      <ConfirmSheet pending={pending} onDecide={decide} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  list: { paddingHorizontal: space(2.5), paddingBottom: space(2) },
  empty: { flex: 1, justifyContent: 'center', paddingHorizontal: space(3) },
  mark: { width: 56, height: 56, borderRadius: 14, marginBottom: space(2) },
  hello: { ...type.display, color: colors.text },
  sub: { ...type.body, color: colors.textMuted, marginTop: space(1) },
  working: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginBottom: -4 },
});

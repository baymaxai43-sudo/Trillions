import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  FlatList,
  Image,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Composer } from '../src/components/Composer';
import { MessageView } from '../src/components/MessageView';
import { TopBar } from '../src/components/TopBar';
import { ArtifactCard, ConfirmCard, ErrorCard, PlanCard, ToolCard } from '../src/components/AgentCards';
import { ConfirmSheet } from '../src/components/ConfirmSheet';
import { TypingDots } from '../src/components/TypingDots';
import { ThreadSkeleton } from '../src/components/Skeleton';
import { streamChat } from '../src/lib/chat';
import {
  cancelRun,
  ChatItem,
  mk,
  confirmAction,
  getRun,
  PendingConfirmation,
  reattachRun,
  RunRecord,
  streamAgent,
  TERMINAL,
  toHistory,
} from '../src/lib/agent';
import { ensureTitle, getConversation, greeting, loadMessages } from '../src/lib/conversations';
import { onOpenConversation } from '../src/lib/nav';
import { getAgentMode, getDefaultModel, setAgentModePref } from '../src/lib/prefs';
import { userInfo, useSession } from '../src/lib/session';
import type { SseClose } from '../src/lib/sse';
import { colors, radius, space, type } from '../src/theme';

type RunState = { id?: string; lastSeq: number; done: boolean; attached: boolean };
type Phase = 'idle' | 'connecting' | 'waking' | 'streaming' | 'polling';

const SUGGESTIONS = [
  'Plan my week around three priorities',
  'Summarize the latest AI news',
  'Draft a polite follow-up email',
  'Explain a concept like I\u2019m new to it',
];

const WAKE_AFTER_MS = 3500; // no first byte by then: the server is probably cold-starting
const STALL_MS = 25_000; // no events for this long: start polling the run as a backup
const POLL_MS = 2000;
const POLL_MAX_MS = 20 * 60_000;

export default function Chat() {
  const params = useLocalSearchParams<{ id?: string; new?: string }>();
  const { session } = useSession();
  const me = userInfo(session?.user);

  const [items, setItems] = useState<ChatItem[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [agentMode, setAgentMode] = useState(true);
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [draft, setDraft] = useState('');
  const [scrolled, setScrolled] = useState(false);
  const busy = phase !== 'idle';

  const conv = useRef<string | undefined>();
  const model = useRef('auto');
  const stopRef = useRef<(() => void) | undefined>();
  const run = useRef<RunState>({ lastSeq: 0, done: true, attached: false });
  const replayText = useRef('');
  const lastEventAt = useRef(0);
  const wakeTimer = useRef<ReturnType<typeof setTimeout>>();
  const pollTimer = useRef<ReturnType<typeof setTimeout>>();
  const pollStarted = useRef(0);
  const pendingRef = useRef<PendingConfirmation | null>(null);
  const reattaching = useRef(false);
  const phaseRef = useRef<Phase>('idle');
  const listRef = useRef<FlatList<ChatItem>>(null);
  const firstUserText = useRef<string | null>(null);

  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    getDefaultModel().then((m) => (model.current = m));
    getAgentMode().then(setAgentMode);
  }, []);

  // ---------- lifecycle helpers ----------

  const stopPolling = () => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = undefined;
  };

  const finish = useCallback(() => {
    run.current.done = true;
    if (wakeTimer.current) clearTimeout(wakeTimer.current);
    stopPolling();
    setPhaseBoth('idle');
    // Pick up the server-generated title for a new conversation.
    const id = conv.current;
    if (id && firstUserText.current) {
      const first = firstUserText.current;
      firstUserText.current = null;
      ensureTitle(id, first);
    }
    if (id) setTimeout(() => getConversation(id).then((c) => c?.title && conv.current === id && setTitle(c.title)).catch(() => {}), 1500);
  }, []);

  const pushError = (message: string) => setItems((m) => [...m.filter((i) => i.kind !== 'error'), mk({ kind: 'error', message })]);

  const appendText = (text: string) =>
    setItems((m) => {
      const last = m[m.length - 1];
      if (last?.kind === 'assistant') return [...m.slice(0, -1), { ...last, content: last.content + text }];
      return [...m, mk({ kind: 'assistant', content: text })];
    });

  /** Make sure the final run text is shown, even if deltas were missed. */
  const applyFinalText = (text: string) =>
    setItems((m) => {
      const lastUser = m.map((i) => i.kind).lastIndexOf('user');
      let idx = -1;
      for (let k = m.length - 1; k > lastUser; k--) if (m[k].kind === 'assistant') { idx = k; break; }
      if (idx >= 0) {
        const cur = m[idx] as Extract<ChatItem, { kind: 'assistant' }>;
        if (text.length > cur.content.length) return m.map((i, k) => (k === idx ? { ...cur, content: text } : i));
        return m;
      }
      return [...m, mk({ kind: 'assistant', content: text })];
    });

  const applyRunRecord = useCallback(
    (rec: RunRecord) => {
      stopRef.current?.();
      if (rec.result) applyFinalText(rec.result);
      if (rec.status === 'failed') pushError(rec.error || 'The task failed.');
      setPending(null);
      finish();
    },
    [finish],
  );

  // ---------- agent events ----------

  const handleAgentEvent = useCallback(
    (ev: any) => {
      const r = run.current;
      lastEventAt.current = Date.now();
      if (phaseRef.current === 'connecting' || phaseRef.current === 'waking') setPhaseBoth('streaming');
      if (typeof ev.seq === 'number') r.lastSeq = Math.max(r.lastSeq, ev.seq);
      else if (r.attached && ev.type !== 'meta') {
        // Replay of a finished run from the DB: only take its final text and status.
        if (ev.type === 'delta') replayText.current += ev.text ?? '';
        if (ev.type !== 'done' && ev.type !== 'error') return;
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
            if (idx >= 0) return m.map((i, k) => (k === idx ? { ...(i as Extract<ChatItem, { kind: 'plan' }>), steps: ev.steps ?? [] } : i));
            return [...m, mk({ kind: 'plan', steps: ev.steps ?? [] })];
          });
          break;
        case 'step_status':
          setItems((m) => {
            const idx = m.map((i) => i.kind).lastIndexOf('plan');
            if (idx < 0) return m;
            const p = m[idx] as Extract<ChatItem, { kind: 'plan' }>;
            const steps = p.steps.map((st, i) => (i === ev.index ? { ...st, status: ev.status } : st));
            return m.map((i, k) => (k === idx ? { ...p, steps } : i));
          });
          break;
        case 'delta':
          if (!ev.depth && ev.text) appendText(ev.text);
          break;
        case 'tool_call':
          setItems((m) => [...m, mk({ kind: 'tool', id: ev.id, name: ev.name, args: ev.args ?? {}, status: 'running', depth: ev.depth ?? 0 })]);
          break;
        case 'tool_result':
          setItems((m) => m.map((i) => (i.kind === 'tool' && i.id === ev.id ? { ...i, status: ev.ok ? 'ok' : 'error', summary: ev.summary } : i)));
          break;
        case 'artifact':
          setItems((m) => [...m, mk({ kind: 'artifact', name: ev.name, url: ev.url, mime: ev.mime, size: ev.size ?? 0 })]);
          break;
        case 'pending_confirmation':
          setItems((m) =>
            m.some((i) => i.kind === 'confirm' && i.id === ev.id)
              ? m
              : [...m, mk({ kind: 'confirm', id: ev.id, tool: ev.tool, summary: ev.summary, args: ev.args ?? {}, state: 'pending' })],
          );
          if (r.id) setPending({ runId: r.id, id: ev.id, tool: ev.tool, summary: ev.summary, args: ev.args ?? {} });
          break;
        case 'confirmation_resolved':
          setItems((m) => m.map((i) => (i.kind === 'confirm' && i.id === ev.id ? { ...i, state: ev.approved ? 'approved' : 'declined' } : i)));
          setPending((p) => (p?.id === ev.id ? null : p));
          break;
        case 'error':
          pushError(ev.message || 'Something went wrong.');
          break;
        case 'done':
          if (replayText.current) {
            applyFinalText(replayText.current);
            replayText.current = '';
          }
          setPending(null);
          finish();
          break;
      }
    },
    [finish],
  );

  // ---------- polling fallback ----------

  const startPolling = useCallback(() => {
    const r = run.current;
    if (pollTimer.current || r.done || !r.id) return;
    pollStarted.current = Date.now();
    const tick = async () => {
      const cur = run.current;
      if (cur.done || !cur.id) return stopPolling();
      try {
        const rec = await getRun(cur.id);
        if (run.current.done) return stopPolling();
        if (TERMINAL.includes(rec.status)) return applyRunRecord(rec);
        if (rec.status === 'waiting_approval' && !pendingRef.current && !reattaching.current) {
          // Need the confirmation details: re-attach to the live stream.
          reattaching.current = true;
          stopRef.current?.();
          cur.attached = true;
          stopRef.current = reattachRun(cur.id, cur.lastSeq, {
            onEvent: handleAgentEvent,
            onClose: () => {
              reattaching.current = false;
            },
          });
        }
      } catch {
        // Network hiccup: keep polling.
      }
      if (Date.now() - pollStarted.current > POLL_MAX_MS) {
        stopRef.current?.();
        pushError('This is taking longer than expected. It may still finish in the background.');
        return finish();
      }
      pollTimer.current = setTimeout(tick, POLL_MS);
    };
    pollTimer.current = setTimeout(tick, 0);
  }, [applyRunRecord, finish, handleAgentEvent]);

  const onAgentClose = useCallback(
    (info: SseClose) => {
      const r = run.current;
      if (r.done) return;
      if (r.id) {
        // Stream ended without 'done': the run may still be going (or finished). Poll for its result.
        setPhaseBoth('polling');
        startPolling();
        return;
      }
      pushError(info.message || 'Could not reach TRILLION.');
      finish();
    },
    [finish, startPolling],
  );

  // Watchdog: never stay stuck if the stream silently stalls.
  useEffect(() => {
    if (!busy || !agentMode) return;
    const t = setInterval(() => {
      const r = run.current;
      if (!r.done && r.id && Date.now() - lastEventAt.current > STALL_MS) startPolling();
    }, 5000);
    return () => clearInterval(t);
  }, [busy, agentMode, startPolling]);

  /** Coming back to the app mid-run: replay what we missed and keep streaming. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const r = run.current;
      if (state !== 'active' || r.done || !r.id) return;
      stopRef.current?.();
      r.attached = true;
      lastEventAt.current = Date.now();
      stopRef.current = reattachRun(r.id, r.lastSeq, { onEvent: handleAgentEvent, onClose: onAgentClose });
    });
    return () => sub.remove();
  }, [handleAgentEvent, onAgentClose]);

  // ---------- sending ----------

  const start = (history: ReturnType<typeof toHistory>) => {
    setPhaseBoth('connecting');
    lastEventAt.current = Date.now();
    if (wakeTimer.current) clearTimeout(wakeTimer.current);
    wakeTimer.current = setTimeout(() => {
      if (phaseRef.current === 'connecting') setPhaseBoth('waking');
    }, WAKE_AFTER_MS);
    const onOpen = () => {
      if (wakeTimer.current) clearTimeout(wakeTimer.current);
      if (phaseRef.current === 'connecting' || phaseRef.current === 'waking') setPhaseBoth('streaming');
    };

    if (agentMode) {
      run.current = { lastSeq: 0, done: false, attached: false };
      replayText.current = '';
      stopRef.current = streamAgent(history, { conversationId: conv.current, model: model.current }, {
        onEvent: handleAgentEvent,
        onOpen,
        onClose: onAgentClose,
      });
      return;
    }

    run.current = { lastSeq: 0, done: false, attached: false };
    let gotDone = false;
    stopRef.current = streamChat(history, { conversationId: conv.current, model: model.current }, {
      onOpen,
      onEvent: (ev) => {
        lastEventAt.current = Date.now();
        if (phaseRef.current !== 'streaming') setPhaseBoth('streaming');
        if (ev.type === 'meta' && ev.conversationId) conv.current = ev.conversationId;
        if (ev.type === 'delta' && ev.text) appendText(ev.text);
        if (ev.type === 'error') {
          gotDone = true;
          pushError(ev.message || 'Something went wrong.');
          finish();
        }
        if (ev.type === 'done') {
          gotDone = true;
          finish();
        }
      },
      onClose: (info) => {
        if (gotDone || run.current.done) return;
        pushError(info.reason === 'error' ? info.message || 'Connection lost.' : 'The reply was cut off.');
        finish();
      },
    });
  };

  const send = (text: string) => {
    if (busy) return;
    const next: ChatItem[] = [...items.filter((i) => i.kind !== 'error'), mk({ kind: 'user', content: text })];
    setItems(next);
    if (!items.some((i) => i.kind === 'user')) firstUserText.current = text;
    start(toHistory(next));
  };

  const retry = () => {
    if (busy) return;
    const lastUser = items.map((i) => i.kind).lastIndexOf('user');
    if (lastUser < 0) return;
    const next = items.slice(0, lastUser + 1);
    setItems(next);
    start(toHistory(next));
  };

  const stop = () => {
    const r = run.current;
    if (agentMode && r.id && !r.done) cancelRun(r.id).catch(() => undefined);
    stopRef.current?.();
    setPending(null);
    finish();
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

  const toggleAgent = () =>
    setAgentMode((v) => {
      setAgentModePref(!v).catch(() => {});
      return !v;
    });

  // ---------- conversation switching ----------

  const reset = useCallback(() => {
    stopRef.current?.();
    stopPolling();
    if (wakeTimer.current) clearTimeout(wakeTimer.current);
    run.current = { lastSeq: 0, done: true, attached: false };
    conv.current = undefined;
    setItems([]);
    setTitle(null);
    setPending(null);
    setLoadingThread(false);
    setPhaseBoth('idle');
  }, []);

  const openThread = useCallback(
    (id: string | null) => {
      if (!id) return reset();
      if (id === conv.current) return;
      reset();
      conv.current = id;
      setLoadingThread(true);
      Promise.all([loadMessages(id), getConversation(id)])
        .then(([msgs, c]) => {
          if (conv.current !== id) return;
          setItems(msgs);
          setTitle(c?.title ?? null);
        })
        .catch((e) => conv.current === id && pushError(`Could not load this conversation. ${(e as Error).message}`))
        .finally(() => conv.current === id && setLoadingThread(false));
    },
    [reset],
  );

  // Opened via route params (deep link / replace) ...
  useEffect(() => {
    if (params.new) reset();
    else if (params.id && params.id !== conv.current) openThread(params.id);
  }, [params.id, params.new, reset, openThread]);

  // ... or from Home while this screen stays mounted.
  useEffect(() => onOpenConversation(openThread), [openThread]);

  useEffect(() => () => {
    stopRef.current?.();
    stopPolling();
    if (wakeTimer.current) clearTimeout(wakeTimer.current);
  }, []);

  // ---------- rendering ----------

  const lastUserIdx = useMemo(() => items.map((i) => i.kind).lastIndexOf('user'), [items]);
  const hasReplyText = useMemo(() => items.slice(lastUserIdx + 1).some((i) => i.kind === 'assistant' && i.content.length > 0), [items, lastUserIdx]);
  const showTyping = busy && (!hasReplyText || phase === 'polling');
  const typingLabel = phase === 'waking' ? 'Waking up TRILLION\u2026' : phase === 'polling' ? 'Still working\u2026' : null;

  /** Logo mark only on the first assistant text after each user message. */
  const markKeys = useMemo(() => {
    const set = new Set<string>();
    let seen = false;
    items.forEach((i) => {
      if (i.kind === 'user') seen = false;
      else if (i.kind === 'assistant' && i.content && !seen) {
        seen = true;
        if (i.key) set.add(i.key);
      }
    });
    return set;
  }, [items]);

  const reversed = useMemo(() => [...items].reverse(), [items]);

  const render = ({ item }: { item: ChatItem }) => {
    switch (item.kind) {
      case 'user':
        return <MessageView m={{ role: 'user', content: item.content }} />;
      case 'assistant':
        if (!item.content) return null;
        return <MessageView m={{ role: 'assistant', content: item.content }} showMark={!!item.key && markKeys.has(item.key)} />;
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
      case 'error':
        return <ErrorCard message={item.message} onRetry={!busy && lastUserIdx >= 0 ? retry : undefined} />;
    }
  };

  // Inverted list: offset 0 is the newest message, so "scrolled" means away from the bottom.
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const atTop = contentSize.height - (contentOffset.y + layoutMeasurement.height) < 4;
    const next = !atTop && contentSize.height > layoutMeasurement.height;
    if (next !== scrolled) setScrolled(next);
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <TopBar active="chat" scrolled={scrolled} />
      {!!title && items.length > 0 && (
        <View style={s.threadHead}>
          <Text style={s.threadTitle} numberOfLines={1}>{title}</Text>
          <Pressable onPress={() => openThread(null)} hitSlop={8} style={({ pressed }) => [s.newBtn, pressed && { opacity: 0.6 }]} accessibilityLabel="New chat">
            <Ionicons name="create-outline" size={18} color={colors.textMuted} />
          </Pressable>
        </View>
      )}
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {loadingThread ? (
          <View style={s.flex}><ThreadSkeleton /></View>
        ) : items.length === 0 ? (
          <ScrollView contentContainerStyle={s.empty} keyboardShouldPersistTaps="handled">
            <Image source={require('../assets/logo-mark.png')} style={s.mark} />
            <Text style={s.hello}>
              {greeting()}
              {me.firstName ? `, ${me.firstName}` : ''}
            </Text>
            <Text style={s.sub}>{agentMode ? 'Give me a task. I plan it, use tools, and ask before anything risky.' : 'What would you like to work on?'}</Text>
            <View style={s.chips}>
              {SUGGESTIONS.map((t) => (
                <Pressable key={t} onPress={() => send(t)} style={({ pressed }) => [s.chip, pressed && s.chipPressed]}>
                  <Text style={s.chipText} numberOfLines={1}>{t}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        ) : (
          <FlatList
            ref={listRef}
            inverted
            style={s.flex}
            contentContainerStyle={s.list}
            data={reversed}
            keyExtractor={(item, i) => item.key ?? `i${items.length - 1 - i}`}
            renderItem={render}
            onScroll={onScroll}
            scrollEventThrottle={64}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            removeClippedSubviews={false}
            maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 80 }}
            ListHeaderComponent={showTyping ? <View style={s.typing}><TypingDots label={typingLabel} /></View> : null}
          />
        )}
        <Composer
          busy={busy}
          onSend={send}
          onStop={stop}
          agentMode={agentMode}
          onToggleAgent={toggleAgent}
          value={draft}
          onChangeValue={setDraft}
        />
      </KeyboardAvoidingView>
      <ConfirmSheet pending={pending} onDecide={decide} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  list: { paddingHorizontal: space(2), paddingTop: space(1.5), paddingBottom: space(2) },
  empty: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: space(3), paddingBottom: space(4) },
  mark: { width: 40, height: 40, borderRadius: 10, marginBottom: space(2.5) },
  hello: { ...type.greeting, color: colors.text },
  sub: { ...type.body, color: colors.textMuted, marginTop: space(1) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(1), marginTop: space(3) },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: space(1.5), paddingVertical: space(1), backgroundColor: colors.bg, maxWidth: '100%' },
  chipPressed: { backgroundColor: colors.surface },
  chipText: { ...type.caption, fontSize: 14, color: colors.text },
  typing: { paddingLeft: 22 + space(1.25) },
  threadHead: { flexDirection: 'row', alignItems: 'center', paddingLeft: space(2.5), paddingRight: space(1.5), paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  threadTitle: { flex: 1, ...type.caption, color: colors.textMuted, fontWeight: '500' },
  newBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});

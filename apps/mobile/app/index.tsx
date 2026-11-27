import { useRef, useState } from 'react';
import { FlatList, Image, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Composer } from '../src/components/Composer';
import { MessageView } from '../src/components/MessageView';
import { TopBar } from '../src/components/TopBar';
import { Msg, streamChat } from '../src/lib/chat';
import { colors, space, type } from '../src/theme';

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const conv = useRef<string | undefined>();
  const stopRef = useRef<() => void>();

  const send = async (text: string) => {
    const next: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages([...next, { role: 'assistant', content: '' }]);
    setBusy(true);
    stopRef.current = await streamChat(next, { conversationId: conv.current }, (ev) => {
      if (ev.type === 'meta') conv.current = ev.conversationId;
      if (ev.type === 'delta')
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: 'assistant', content: copy[copy.length - 1].content + ev.text };
          return copy;
        });
      if (ev.type === 'error')
        setMessages((m) => [...m.slice(0, -1), { role: 'assistant', content: ev.message }]);
      if (ev.type === 'done' || ev.type === 'error') setBusy(false);
    });
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <TopBar title="Chat" onHome={() => router.push('/home')} />
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {messages.length === 0 ? (
          <View style={s.empty}>
            <Image source={require('../assets/logo-mark.png')} style={s.mark} />
            <Text style={s.hello}>Good morning.</Text>
            <Text style={s.sub}>What would you like to work on?</Text>
          </View>
        ) : (
          <FlatList
            contentContainerStyle={s.list}
            data={messages}
            keyExtractor={(_, i) => String(i)}
            renderItem={({ item }) => <MessageView m={item} />}
          />
        )}
        <Composer busy={busy} onSend={send} onStop={() => { stopRef.current?.(); setBusy(false); }} />
      </KeyboardAvoidingView>
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
});

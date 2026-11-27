import { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, sheetShadow, space, type } from '../theme';

/** Frosted bottom sheet. Tap the scrim or use Android back to close. */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={s.scrim} onPress={onClose} accessibilityLabel="Close" />
        <View style={[s.sheet, { paddingBottom: space(2.5) + insets.bottom }]}>
          <BlurView intensity={60} tint="light" experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined} style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, s.veil]} />
          <View style={s.grab} />
          {!!title && <Text style={s.title}>{title}</Text>}
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.scrim },
  sheet: {
    overflow: 'hidden',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    paddingHorizontal: space(2.5),
    paddingTop: space(1.5),
    maxHeight: '88%',
    ...sheetShadow,
  },
  veil: { backgroundColor: 'rgba(247,249,252,0.97)' },
  grab: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: space(2) },
  title: { ...type.title, color: colors.text, marginBottom: space(1.5) },
});

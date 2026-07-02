import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, TextInput, StyleSheet, Platform } from 'react-native';
import { Alert } from 'react-native';
import { webAlertBridge, AlertButton } from '@/src/utils/webAlertBridge';
import { colors, spacing } from '@/src/constants/theme';

// Monta esto UNA sola vez en el layout raiz. Sólo actúa en web: en
// Android/iOS Alert.alert/Alert.prompt nativos ya funcionan bien y no se
// tocan.
export function WebAlertHost() {
  const [args, setArgs] = useState<any>(null);
  const [promptValue, setPromptValue] = useState('');

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    webAlertBridge._setListener((a) => {
      setPromptValue(a?.defaultValue || '');
      setArgs(a);
    });

    // Parchamos Alert.alert / Alert.prompt SOLO en web -- en nativo se deja
    // el comportamiento real de la plataforma intacto.
    (Alert as any).alert = (title?: string, message?: string, buttons?: AlertButton[]) => {
      webAlertBridge.show({ title, message, buttons: buttons && buttons.length ? buttons : [{ text: 'OK' }] });
    };
    (Alert as any).prompt = (
      title?: string,
      message?: string,
      buttons?: AlertButton[],
      _type?: string,
      defaultValue?: string
    ) => {
      webAlertBridge.show({ title, message, buttons, isPrompt: true, defaultValue });
    };

    return () => webAlertBridge._setListener(null);
  }, []);

  if (Platform.OS !== 'web' || !args) return null;

  const buttons: AlertButton[] = args.buttons && args.buttons.length ? args.buttons : [{ text: 'OK' }];

  const close = () => webAlertBridge.dismiss();

  const handlePress = (btn: AlertButton) => {
    close();
    if (btn.onPress) {
      if (args.isPrompt) btn.onPress(promptValue);
      else btn.onPress();
    }
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {!!args.title && <Text style={styles.title}>{args.title}</Text>}
          {!!args.message && <Text style={styles.message}>{args.message}</Text>}
          {args.isPrompt && (
            <TextInput
              style={styles.input}
              value={promptValue}
              onChangeText={setPromptValue}
              autoFocus
              placeholder=""
            />
          )}
          <View style={styles.buttonsRow}>
            {buttons.map((btn, i) => (
              <Pressable
                key={i}
                style={[
                  styles.button,
                  btn.style === 'cancel' && styles.buttonCancel,
                  btn.style === 'destructive' && styles.buttonDestructive,
                ]}
                onPress={() => handlePress(btn)}
              >
                <Text
                  style={[
                    styles.buttonText,
                    btn.style === 'cancel' && styles.buttonTextCancel,
                    btn.style === 'destructive' && styles.buttonTextDestructive,
                  ]}
                >
                  {(btn.text || 'OK').toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 340,
  },
  title: { fontSize: 16, fontWeight: '900', color: colors.onSurface, marginBottom: 6 },
  message: { fontSize: 13, color: colors.onSurface, marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    padding: 10,
    fontSize: 14,
    borderRadius: 4,
    marginBottom: 12,
  },
  buttonsRow: { flexDirection: 'column', gap: 8 },
  button: {
    paddingVertical: 10,
    borderRadius: 4,
    alignItems: 'center',
    backgroundColor: colors.brandPrimary,
  },
  buttonCancel: { backgroundColor: '#EEE' },
  buttonDestructive: { backgroundColor: colors.error },
  buttonText: { color: '#FFF', fontWeight: '900', fontSize: 12 },
  buttonTextCancel: { color: colors.onSurface },
  buttonTextDestructive: { color: '#FFF' },
});

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/src/context/AuthContext';
import { apiCall } from '@/src/api/client';
import { colors, spacing, typography } from '@/src/constants/theme';
import MainHeader from '@/src/components/MainHeader';
import { useNotifications } from '@/src/context/NotificationsContext';

interface DirectoryUser {
  id: string;
  name: string;
  role: string;
}

interface Message {
  id: string;
  user_id: string;
  user_name: string;
  text: string;
  created_at: string;
}

export default function ChatScreen() {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const { refresh: refreshNotifications } = useNotifications();
  const { room: paramRoom, title: paramTitle } = useLocalSearchParams<{ room?: string; title?: string }>();
  const router = useRouter();

  const room = paramRoom || 'GENERAL';
  const title = paramTitle || t('chat_general');

  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [mentionSuggestions, setMentionSuggestions] = useState<DirectoryUser[]>([]);

  // Cargar directorio de usuarios (inspector/supervisor/administrador) para @mencionar
  useEffect(() => {
    if (!token) return;
    apiCall<DirectoryUser[]>('/users/directory', { token }).then(setDirectory).catch(() => {});
  }, [token]);

  // Al entrar al chat, se apaga el punto rojo del logotipo marcando como leidas
  // solo las notificaciones de tipo 'chat' (las de inspeccion/caseta no se tocan).
  useEffect(() => {
    if (!token) return;
    apiCall('/notifications/read-by-kind', { method: 'POST', token, body: { kind: 'chat' } })
      .then(() => refreshNotifications())
      .catch(() => {});
  }, [token, room, refreshNotifications]);

  const handleChangeText = (v: string) => {
    setText(v);
    const match = v.match(/@([^\s@]*)$/);
    if (match) {
      const prefix = match[1].toLowerCase();
      const matches = directory.filter((d) => d.name.toLowerCase().includes(prefix)).slice(0, 5);
      setMentionSuggestions(matches);
    } else {
      setMentionSuggestions([]);
    }
  };

  const selectMention = (u: DirectoryUser) => {
    const newText = text.replace(/@([^\s@]*)$/, `@${u.name} `);
    setText(newText);
    setMentionSuggestions([]);
  };

  const fetchMessages = async (showLoading = false) => {
    if (!token) return;
    if (showLoading) setLoading(true);
    try {
      const data = await apiCall<Message[]>(`/chat/${room}`, { token });
      setMessages(data);
    } catch (e) {
      console.error('Error fetching messages:', e);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  // Polling para mensajes en tiempo real (cada 3 segundos)
  useEffect(() => {
    fetchMessages(true);
    const interval = setInterval(() => fetchMessages(), 3000);
    return () => clearInterval(interval);
  }, [room, token]);

  const handleSend = async () => {
    if (!text.trim() || !token || sending) return;
    setSending(true);
    try {
      const newMessage = await apiCall<Message>('/chat/send', {
        method: 'POST',
        body: { room, text: text.trim() },
        token
      });
      setMessages(prev => [...prev, newMessage]);
      setText('');
      setMentionSuggestions([]);
      // Scroll to end
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) {
      alert(e.message || 'Error al enviar');
    } finally {
      setSending(true); // Evitar spam, reactivamos rápido
      setTimeout(() => setSending(false), 200);
    }
  };

  const renderItem = ({ item }: { item: Message }) => {
    const isMe = item.user_id === user?.id;
    return (
      <View style={[styles.msgContainer, isMe ? styles.msgMe : styles.msgOther]}>
        {!isMe && <Text style={styles.msgUserName}>{item.user_name}</Text>}
        <View style={[styles.msgBubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
          <Text style={[styles.msgText, isMe ? styles.textMe : styles.textOther]}>{item.text}</Text>
          <Text style={styles.msgTime}>{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <MainHeader
        showBack={!!paramRoom}
        title={title}
        subtitle={room !== 'GENERAL' ? `UNIDAD: ${room.replace('PLATES_', '')}` : t('tiempo_real')}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={styles.content}>
          {loading ? (
            <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              contentContainerStyle={styles.list}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            />
          )}

          {mentionSuggestions.length > 0 && (
            <View style={styles.mentionBox}>
              {mentionSuggestions.map((mu) => (
                <Pressable key={mu.id} style={styles.mentionItem} onPress={() => selectMention(mu)}>
                  <Ionicons name="at" size={14} color={colors.brandPrimary} />
                  <Text style={styles.mentionName}>{mu.name}</Text>
                  <Text style={styles.mentionRole}>{mu.role.toUpperCase()}</Text>
                </Pressable>
              ))}
            </View>
          )}

          <View style={styles.inputArea}>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={handleChangeText}
              placeholder={t('escribir_mensaje')}
              placeholderTextColor={colors.muted}
              multiline
              maxLength={500}
            />
            <Pressable
              style={[styles.sendBtn, !text.trim() && { opacity: 0.5 }]}
              onPress={handleSend}
              disabled={!text.trim() || sending}
            >
              <Ionicons name="send" size={20} color="#FFF" />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { flex: 1 },
  list: { padding: spacing.md },
  msgContainer: { marginBottom: spacing.md, maxWidth: '85%' },
  msgMe: { alignSelf: 'flex-end' },
  msgOther: { alignSelf: 'flex-start' },
  msgUserName: { fontSize: 10, fontWeight: '700', color: colors.muted, marginBottom: 2, marginLeft: 4 },
  msgBubble: { padding: spacing.sm, borderRadius: 8, borderWidth: 1 },
  bubbleMe: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary, borderBottomRightRadius: 0 },
  bubbleOther: { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderBottomLeftRadius: 0 },
  msgText: { fontSize: 14, lineHeight: 20 },
  textMe: { color: '#FFF' },
  textOther: { color: colors.onSurface },
  msgTime: { fontSize: 8, alignSelf: 'flex-end', marginTop: 2, opacity: 0.7, color: 'inherit' },
  inputArea: {
    flexDirection: 'row',
    padding: spacing.md,
    borderTopWidth: 2,
    borderTopColor: colors.borderStrong,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'flex-end',
    gap: spacing.sm
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 14,
    color: colors.onSurface
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brandPrimary,
    justifyContent: 'center',
    alignItems: 'center'
  },
  mentionBox: {
    backgroundColor: colors.surfaceSecondary,
    borderTopWidth: 2,
    borderTopColor: colors.borderStrong,
    paddingVertical: spacing.xs,
  },
  mentionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  mentionName: { color: colors.onSurface, fontWeight: '900', fontSize: typography.sizes.sm },
  mentionRole: { color: colors.muted, fontSize: 10, marginLeft: 'auto', fontWeight: '700' },
});

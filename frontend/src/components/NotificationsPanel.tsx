import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useNotifications } from '@/src/context/NotificationsContext';
import { useTranslation } from 'react-i18next';
import { colors, spacing, typography } from '@/src/constants/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function NotificationsPanel({ visible, onClose }: Props) {
  const { notifications, markRead, markAllRead, unreadCount } = useNotifications();
  const { t } = useTranslation();
  const router = useRouter();

  const open = async (n: any) => {
    if (!n.read) await markRead(n.id);
    if (n.inspection_id) {
      onClose();
      router.push(`/inspection/${n.inspection_id}`);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <SafeAreaView style={styles.sheet} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('notificaciones')}</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {unreadCount > 0 && (
                <Pressable testID="notif-mark-all" onPress={markAllRead}>
                  <Text style={styles.markAll}>{t('marcar_todo').toUpperCase()}</Text>
                </Pressable>
              )}
              <Pressable testID="notif-close" onPress={onClose}><Ionicons name="close" size={28} color={colors.onSurface} /></Pressable>
            </View>
          </View>

          <FlatList
            data={notifications}
            keyExtractor={(n) => n.id}
            contentContainerStyle={{ padding: spacing.lg }}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="notifications-off-outline" size={48} color={colors.muted} />
                <Text style={styles.emptyText}>{t('sin_notificaciones')}</Text>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                testID={`notif-item-${item.id}`}
                style={[styles.item, !item.read && styles.itemUnread]}
                onPress={() => open(item)}
              >
                {!item.read && <View style={styles.unreadDot} />}
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <Text style={styles.itemMessage}>{item.message}</Text>
                  <Text style={styles.itemDate}>{new Date(item.created_at).toLocaleString('es-MX')}</Text>
                </View>
                {item.inspection_id && <Ionicons name="chevron-forward" size={20} color={colors.muted} />}
              </Pressable>
            )}
          />
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { flex: 1, backgroundColor: colors.surface, marginTop: 60 },
  header: { padding: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 2, borderBottomColor: colors.borderStrong, backgroundColor: colors.surfaceSecondary },
  title: { fontSize: typography.sizes.xl, fontWeight: '900', color: colors.onSurface, letterSpacing: 1 },
  markAll: { color: colors.brandPrimary, fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  empty: { alignItems: 'center', padding: spacing.xxxl },
  emptyText: { color: colors.muted, marginTop: spacing.md, fontWeight: '700' },
  item: { backgroundColor: colors.surfaceSecondary, borderWidth: 2, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  itemUnread: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brandPrimary },
  itemTitle: { fontWeight: '900', color: colors.onSurface, fontSize: typography.sizes.base },
  itemMessage: { color: colors.onSurfaceTertiary, fontSize: typography.sizes.sm, marginTop: 4 },
  itemDate: { color: colors.muted, fontSize: 11, marginTop: 4 },
});

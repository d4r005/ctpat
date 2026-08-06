import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform, useWindowDimensions } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useInspections } from '../context/InspectionContext';
import { colors, spacing, radius, shadows } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import NotificationsPanel from './NotificationsPanel';
import ProfilePanel from './ProfilePanel';
import { useNotifications } from '../context/NotificationsContext';
import { useTranslation } from 'react-i18next';

interface MainHeaderProps {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightAction?: {
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
  };
}

const isWeb = Platform.OS === 'web';

const MainHeader: React.FC<MainHeaderProps> = ({ title, subtitle, showBack, onBack, rightAction }) => {
  const { user } = useAuth();
  const { isOnline } = useInspections();
  const { unreadCount, notifications } = useNotifications();
  const hasUnreadChat = notifications.some((n) => n.kind === 'chat' && !n.read);
  const { t } = useTranslation();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktopWeb = isWeb && width >= 1080;
  const [showNotifs, setShowNotifs] = React.useState(false);
  const [showProfile, setShowProfile] = React.useState(false);

  // ── Desktop web: clean topbar ──
  if (isDesktopWeb) {
    const pageTitle = subtitle ? subtitle.split(':').pop()?.trim() : title;
    return (
      <View style={styles.webTopbar}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: spacing.md }}>
          {showBack && (
            <Pressable onPress={() => (onBack ? onBack() : router.back())} style={styles.webBackBtn}>
              <Ionicons name="arrow-back" size={20} color={colors.onSurface} />
            </Pressable>
          )}
          <Text style={styles.webPageTitle} numberOfLines={1}>{pageTitle}</Text>
          {subtitle && subtitle.includes(':') && (
            <View style={styles.webBreadcrumb}>
              <Text style={styles.webBreadcrumbText}>{subtitle.split(':')[0].trim()}</Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {rightAction && (
            <Pressable onPress={rightAction.onPress} style={styles.webIconBtn}>
              <Ionicons name={rightAction.icon} size={20} color={colors.brandPrimary} />
            </Pressable>
          )}
          <Pressable
            onPress={() => router.push('/(app)/chat')}
            style={({ pressed }) => [styles.webIconBtn, pressed && { backgroundColor: colors.surfaceTertiary }]}
          >
            <Ionicons name={hasUnreadChat ? "chatbubbles" : "chatbubbles-outline"} size={20} color={colors.mutedDark} />
            {hasUnreadChat && <View style={styles.webDot} />}
          </Pressable>
          <Pressable
            onPress={() => setShowNotifs(true)}
            style={({ pressed }) => [styles.webIconBtn, pressed && { backgroundColor: colors.surfaceTertiary }]}
          >
            <Ionicons name={unreadCount > 0 ? "notifications" : "notifications-outline"} size={20} color={colors.mutedDark} />
            {unreadCount > 0 && (
              <View style={styles.webNotifBadge}>
                <Text style={styles.webNotifBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </Pressable>
          <View style={styles.webDivider} />
          <Pressable
            onPress={() => setShowProfile(true)}
            style={({ pressed }) => [styles.webAvatarWrap, pressed && { opacity: 0.85 }]}
          >
            <View style={styles.webAvatarCircle}>
              <Text style={styles.webAvatarText}>{user?.name?.charAt(0).toUpperCase() || 'D'}</Text>
            </View>
            <View style={[styles.webOnlineDot, !isOnline && { backgroundColor: colors.error }]} />
          </Pressable>
        </View>
        <NotificationsPanel visible={showNotifs} onClose={() => setShowNotifs(false)} />
        <ProfilePanel visible={showProfile} onClose={() => setShowProfile(false)} />
      </View>
    );
  }

  // ── Mobile: full brand header ──
  return (
    <View style={styles.brandHeader}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
        {showBack && (
          <Pressable onPress={() => (onBack ? onBack() : router.back())} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.onBrandPrimary} />
          </Pressable>
        )}
        <View style={styles.logoBadge}>
          <Ionicons name="shield-checkmark" size={20} color={colors.brandSecondary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.brandLogo}>{title || 'NAF'}</Text>
          <Text style={styles.brandSubtitle}>
            {subtitle || t('sistema_registro')}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        {rightAction && (
          <Pressable onPress={rightAction.onPress} style={styles.headerBtn}>
            <Ionicons name={rightAction.icon} size={24} color={colors.onBrandPrimary} />
          </Pressable>
        )}
        <Pressable onPress={() => router.push('/(app)/chat')} style={styles.headerBtn}>
          <Ionicons name={hasUnreadChat ? "chatbubbles" : "chatbubbles-outline"} size={22} color={colors.onBrandPrimary} />
          {hasUnreadChat && <View style={styles.chatDot} />}
        </Pressable>
        <Pressable onPress={() => setShowNotifs(true)} style={styles.notifBtn}>
          <Ionicons name={unreadCount > 0 ? "notifications" : "notifications-outline"} size={22} color={colors.onBrandPrimary} />
          {unreadCount > 0 && (
            <View style={styles.notifBadge}>
              <Text style={styles.notifBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
            </View>
          )}
        </Pressable>
        <Pressable onPress={() => setShowProfile(true)} style={styles.userContainer}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{user?.name?.charAt(0).toUpperCase() || 'D'}</Text>
            <View style={[styles.onlineIndicator, !isOnline && { backgroundColor: colors.error }]} />
          </View>
          <Text style={[styles.onlineStatusText, !isOnline && { color: '#FCA5A5' }]}>● {isOnline ? t('online') : t('fuera_linea')}</Text>
        </Pressable>
      </View>
      <NotificationsPanel visible={showNotifs} onClose={() => setShowNotifs(false)} />
      <ProfilePanel visible={showProfile} onClose={() => setShowProfile(false)} />
    </View>
  );
};

const styles = StyleSheet.create({
  // ── Web desktop topbar ──
  webTopbar: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 32,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  webPageTitle: { fontSize: 22, fontWeight: '700', color: colors.onSurface, letterSpacing: -0.3 },
  webBreadcrumb: {
    backgroundColor: colors.surfaceTertiary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  webBreadcrumbText: { fontSize: 11, fontWeight: '700', color: colors.muted, letterSpacing: 0.5 },
  webBackBtn: { padding: 4, marginRight: 4 },
  webIconBtn: {
    padding: 10,
    borderRadius: 10,
    position: 'relative',
  },
  webDot: {
    position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.error, borderWidth: 2, borderColor: '#FFFFFF',
  },
  webNotifBadge: {
    position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: colors.error, borderWidth: 2, borderColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2,
  },
  webNotifBadgeText: { color: '#FFFFFF', fontSize: 8, fontWeight: '800' },
  webDivider: { width: 1, height: 28, backgroundColor: colors.border, marginHorizontal: 6 },
  webAvatarWrap: { position: 'relative', padding: 2 },
  webAvatarCircle: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brandPrimary,
    alignItems: 'center', justifyContent: 'center',
  },
  webAvatarText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  webOnlineDot: {
    position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: 5,
    backgroundColor: colors.success, borderWidth: 2, borderColor: '#FFFFFF',
  },

  // ── Mobile brand header ──
  brandHeader: {
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    ...shadows.md,
  },
  logoBadge: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  notifBtn: { padding: 8, position: 'relative' },
  headerBtn: { padding: 8, position: 'relative' },
  chatDot: {
    position: 'absolute', top: 6, right: 6, width: 10, height: 10, borderRadius: 5,
    backgroundColor: colors.error, borderWidth: 2, borderColor: colors.brandPrimary,
  },
  notifBadge: {
    position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: colors.error, borderWidth: 2, borderColor: colors.brandPrimary,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2,
  },
  notifBadgeText: { color: colors.onBrandPrimary, fontSize: 9, fontWeight: '900' },
  backBtn: { marginRight: spacing.md, padding: 4 },
  brandLogo: { color: colors.onBrandPrimary, fontSize: 22, fontWeight: '800', letterSpacing: 1.5 },
  brandSubtitle: {
    color: 'rgba(255,255,255,0.7)', fontSize: 10, marginTop: 2, fontWeight: '600',
    letterSpacing: 0.5, textTransform: 'uppercase',
  },
  userContainer: { alignItems: 'center' },
  avatarCircle: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  avatarText: { color: colors.onBrandPrimary, fontSize: 16, fontWeight: '800' },
  onlineIndicator: {
    position: 'absolute', bottom: 0, right: 0, width: 11, height: 11, borderRadius: 6,
    backgroundColor: colors.success, borderWidth: 2, borderColor: colors.brandPrimary,
  },
  onlineStatusText: { color: '#86EFAC', fontSize: 8, fontWeight: '800', marginTop: 4 },
});

export default MainHeader;

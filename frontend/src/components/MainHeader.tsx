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
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  webPageTitle: { fontSize: 24, fontWeight: '800', color: colors.onSurface, letterSpacing: -0.5 },
  webBreadcrumb: {
    backgroundColor: colors.surfaceTertiary,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  webBreadcrumbText: { fontSize: 10, fontWeight: '800', color: colors.muted, letterSpacing: 1 },
  webBackBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: colors.surfaceTertiary,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 4
  },
  webIconBtn: {
    width: 42, height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  webDot: {
    position: 'absolute', top: 10, right: 10, width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.error, borderWidth: 2, borderColor: '#FFFFFF',
  },
  webNotifBadge: {
    position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.error, borderWidth: 2, borderColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2,
  },
  webNotifBadgeText: { color: '#FFFFFF', fontSize: 8, fontWeight: '900' },
  webDivider: { width: 1, height: 32, backgroundColor: colors.border, marginHorizontal: 12 },
  webAvatarWrap: { position: 'relative' },
  webAvatarCircle: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandPrimary,
    alignItems: 'center', justifyContent: 'center',
    ...shadows.sm,
  },
  webAvatarText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  webOnlineDot: {
    position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6,
    backgroundColor: colors.success, borderWidth: 2, borderColor: '#FFFFFF',
  },

  // ── Mobile brand header (MD3 Style) ──
  brandHeader: {
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  logoBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.brandPrimary + '08',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    borderWidth: 1,
    borderColor: colors.brandPrimary + '10',
  },
  notifBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: colors.surfaceTertiary,
    alignItems: 'center', justifyContent: 'center',
    position: 'relative'
  },
  headerBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: colors.surfaceTertiary,
    alignItems: 'center', justifyContent: 'center',
    position: 'relative'
  },
  chatDot: {
    position: 'absolute', top: 10, right: 10, width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.error, borderWidth: 2, borderColor: colors.surfaceTertiary,
  },
  notifBadge: {
    position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.error, borderWidth: 2, borderColor: colors.surfaceSecondary,
    alignItems: 'center', justifyContent: 'center',
  },
  notifBadgeText: { color: '#FFFFFF', fontSize: 8, fontWeight: '900' },
  backBtn: { marginRight: spacing.md, padding: 4 },
  brandLogo: { color: colors.onSurface, fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  brandSubtitle: {
    color: colors.muted, fontSize: 10, marginTop: 1, fontWeight: '700',
    letterSpacing: 0.5, textTransform: 'uppercase',
  },
  userContainer: { alignItems: 'center', marginLeft: spacing.sm },
  avatarCircle: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandPrimary + '10',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.brandPrimary + '20',
  },
  avatarText: { color: colors.brandPrimary, fontSize: 16, fontWeight: '800' },
  onlineIndicator: {
    position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6,
    backgroundColor: colors.success, borderWidth: 2, borderColor: colors.surfaceSecondary,
  },
  onlineStatusText: { color: colors.success, fontSize: 8, fontWeight: '800', marginTop: 4 },
});

export default MainHeader;

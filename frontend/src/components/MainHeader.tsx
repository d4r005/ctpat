import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useInspections } from '../context/InspectionContext';
import { colors, spacing } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import NotificationsPanel from './NotificationsPanel';
import ProfilePanel from './ProfilePanel';

import { useTranslation } from 'react-i18next';

interface MainHeaderProps {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
}

const MainHeader: React.FC<MainHeaderProps> = ({ title, subtitle, showBack }) => {
  const { user } = useAuth();
  const { isOnline } = useInspections();
  const { t } = useTranslation();
  const router = useRouter();
  const [showNotifs, setShowNotifs] = React.useState(false);
  const [showProfile, setShowProfile] = React.useState(false);

  return (
    <View style={styles.brandHeader}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
        {showBack && (
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.brandLogo}>{title || 'NAF'}</Text>
          <Text style={styles.brandSubtitle}>
            {subtitle || t('sistema_registro')}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Pressable onPress={() => router.push('/(app)/chat')} style={styles.headerBtn}>
          <Ionicons name="chatbubbles-outline" size={24} color="#FFF" />
        </Pressable>
        <Pressable onPress={() => setShowNotifs(true)} style={styles.notifBtn}>
          <Ionicons name="notifications-outline" size={24} color="#FFF" />
          <View style={styles.notifBadge} />
        </Pressable>
        <Pressable onPress={() => setShowProfile(true)} style={styles.userContainer}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{user?.name?.charAt(0).toUpperCase() || 'D'}</Text>
            <View style={[styles.onlineIndicator, !isOnline && { backgroundColor: colors.muted }]} />
          </View>
          <Text style={[styles.onlineStatusText, !isOnline && { color: colors.muted }]}>● {isOnline ? t('online') : t('fuera_linea')}</Text>
        </Pressable>
      </View>
      <NotificationsPanel visible={showNotifs} onClose={() => setShowNotifs(false)} />
      <ProfilePanel visible={showProfile} onClose={() => setShowProfile(false)} />
    </View>
  );
};

const styles = StyleSheet.create({
  brandHeader: {
    backgroundColor: colors.brandPrimary,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: spacing.xl,
  },
  notifBtn: {
    padding: 8,
    position: 'relative',
  },
  headerBtn: {
    padding: 8,
  },
  notifBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.error,
    borderWidth: 2,
    borderColor: colors.brandPrimary,
  },
  backBtn: {
    marginRight: spacing.md,
    padding: 4,
  },
  brandLogo: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 2,
  },
// ... rest of styles
  brandSubtitle: {
    color: '#FFF',
    fontSize: 10,
    opacity: 0.8,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  userContainer: {
    alignItems: 'center',
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FFF',
  },
  avatarText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: colors.brandPrimary,
  },
  onlineStatusText: {
    color: colors.success,
    fontSize: 8,
    fontWeight: '900',
    marginTop: 4,
  },
});

export default MainHeader;

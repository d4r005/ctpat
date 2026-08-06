import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, spacing, radius } from '@/src/constants/theme';
import { useAuth } from '@/src/context/AuthContext';
import { useInspections } from '@/src/context/InspectionContext';

interface NavItem {
  key: string;
  route: string;
  match: string;
  label: string;
  render: (color: string) => React.ReactNode;
}

// Left navigation rail for desktop/web — replaces the mobile bottom tab bar
// so the app reads as a proper enterprise dashboard on wide screens.
export default function SidebarNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { isOnline } = useInspections();

  const isAdminOrSup = user?.role === 'admin' || user?.role === 'supervisor' ||
    ['d.trujillo@brancoindustries.com', 'd4r005@gmail.com'].includes(user?.email || '');

  const items: NavItem[] = [
    { key: 'inicio', route: '/(app)/inicio', match: '/inicio', label: t('inicio'), render: (c) => <Ionicons name="home-sharp" size={19} color={c} /> },
    { key: 'historico', route: '/(app)/historico', match: '/historico', label: t('historico'), render: (c) => <Ionicons name="time-sharp" size={19} color={c} /> },
    { key: 'caseta', route: '/(app)/caseta', match: '/caseta', label: t('caseta'), render: (c) => <Ionicons name="business-sharp" size={19} color={c} /> },
    { key: 'nueva', route: '/(app)/nueva', match: '/nueva', label: t('inspeccion'), render: (c) => <Ionicons name="clipboard-sharp" size={19} color={c} /> },
    { key: 'embarque', route: '/(app)/embarque', match: '/embarque', label: t('embarque'), render: (c) => <MaterialCommunityIcons name="truck-fast" size={20} color={c} /> },
  ];
  if (isAdminOrSup) {
    items.push({ key: 'supervisor', route: '/(app)/supervisor', match: '/supervisor', label: t('maestro').toUpperCase(), render: (c) => <Ionicons name="shield-checkmark-sharp" size={19} color={c} /> });
  }

  const isActive = (match: string) => !!pathname && pathname.includes(match);

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
  };

  return (
    <View style={styles.sidebar}>
      <View style={styles.brandRow}>
        <View style={styles.logoBadge}>
          <Ionicons name="shield-checkmark" size={22} color={colors.brandSecondary} />
        </View>
        <View>
          <Text style={styles.brandName}>NAF</Text>
          <Text style={styles.brandSub}>SRIUC</Text>
        </View>
      </View>

      <ScrollView style={styles.navList} showsVerticalScrollIndicator={false}>
        {items.map((item) => {
          const active = isActive(item.match);
          return (
            <Pressable
              key={item.key}
              onPress={() => router.push(item.route as any)}
              style={({ pressed }) => [
                styles.navItem,
                active && styles.navItemActive,
                pressed && !active && { backgroundColor: 'rgba(255,255,255,0.06)' },
              ]}
            >
              {active && <View style={styles.activeBar} />}
              {item.render(active ? colors.onBrandPrimary : 'rgba(255,255,255,0.6)')}
              <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.profileRow} onPress={() => router.push('/(app)/perfil' as any)}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{user?.name?.charAt(0).toUpperCase() || 'D'}</Text>
            <View style={[styles.onlineIndicator, !isOnline && { backgroundColor: colors.error }]} />
          </View>
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={styles.userName} numberOfLines={1}>{user?.name || 'Usuario'}</Text>
            <Text style={styles.userRole} numberOfLines={1}>{(user?.role || '').toUpperCase()}</Text>
          </View>
        </Pressable>
        <Pressable style={styles.signOutBtn} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={17} color="rgba(255,255,255,0.65)" />
          <Text style={styles.signOutText}>{t('cerrar_sesion')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const SIDEBAR_WIDTH = 240;

const styles = StyleSheet.create({
  sidebar: {
    width: SIDEBAR_WIDTH,
    backgroundColor: colors.brandPrimary,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    flexDirection: 'column',
    height: '100%',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    marginBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  logoBadge: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  brandName: { color: colors.onBrandPrimary, fontSize: 18, fontWeight: '800', letterSpacing: 1.5 },
  brandSub: { color: colors.brandSecondary, fontSize: 10, fontWeight: '800', letterSpacing: 3, marginTop: 1 },

  navList: { flex: 1, paddingHorizontal: spacing.md },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 11,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    marginBottom: 4,
    position: 'relative',
  },
  navItemActive: {
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  activeBar: {
    position: 'absolute',
    left: -spacing.md,
    top: 6,
    bottom: 6,
    width: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSecondary,
  },
  navLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
  navLabelActive: { color: colors.onBrandPrimary, fontWeight: '800' },

  footer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    gap: spacing.sm,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  avatarCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  avatarText: { color: colors.onBrandPrimary, fontSize: 14, fontWeight: '800' },
  onlineIndicator: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.success,
    borderWidth: 1.5,
    borderColor: colors.brandPrimary,
  },
  userName: { color: colors.onBrandPrimary, fontSize: 12, fontWeight: '700' },
  userRole: { color: 'rgba(255,255,255,0.5)', fontSize: 9, fontWeight: '700', letterSpacing: 0.5, marginTop: 1 },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 9,
    borderRadius: radius.sm,
  },
  signOutText: { color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '700' },
});

export { SIDEBAR_WIDTH };

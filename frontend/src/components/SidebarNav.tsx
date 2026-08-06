import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Platform } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, spacing, radius, shadows } from '@/src/constants/theme';
import { useAuth } from '@/src/context/AuthContext';
import { useInspections } from '@/src/context/InspectionContext';

interface NavItem {
  key: string;
  route: string;
  match: string;
  label: string;
  render: (color: string, size: number) => React.ReactNode;
}

const isWeb = Platform.OS === 'web';

// Left navigation rail for desktop/web — premium enterprise sidebar
export default function SidebarNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { isOnline } = useInspections();

  const isAdminOrSup = user?.role === 'admin' || user?.role === 'supervisor' ||
    ['d.trujillo@brancoindustries.com', 'd4r005@gmail.com'].includes(user?.email || '');

  const items: NavItem[] = [
    { key: 'inicio', route: '/(app)/inicio', match: '/inicio', label: t('inicio'), render: (c, s) => <Ionicons name="home" size={s} color={c} /> },
    { key: 'historico', route: '/(app)/historico', match: '/historico', label: t('historico'), render: (c, s) => <Ionicons name="time" size={s} color={c} /> },
    { key: 'caseta', route: '/(app)/caseta', match: '/caseta', label: t('caseta'), render: (c, s) => <Ionicons name="business" size={s} color={c} /> },
    { key: 'nueva', route: '/(app)/nueva', match: '/nueva', label: t('inspeccion'), render: (c, s) => <Ionicons name="clipboard" size={s} color={c} /> },
    { key: 'embarque', route: '/(app)/embarque', match: '/embarque', label: t('embarque'), render: (c, s) => <MaterialCommunityIcons name="truck-fast" size={s} color={c} /> },
  ];

  const adminItems: NavItem[] = isAdminOrSup ? [
    { key: 'analitica', route: '/(app)/analitica', match: '/analitica', label: t('analitica') || 'Analítica', render: (c, s) => <Ionicons name="bar-chart" size={s} color={c} /> },
    { key: 'supervisor', route: '/(app)/supervisor', match: '/supervisor', label: t('maestro').toUpperCase(), render: (c, s) => <Ionicons name="shield-checkmark" size={s} color={c} /> },
  ] : [];

  const isActive = (match: string) => !!pathname && pathname.includes(match);

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
  };

  const renderNavItem = (item: NavItem) => {
    const active = isActive(item.match);
    return (
      <Pressable
        key={item.key}
        onPress={() => router.push(item.route as any)}
        style={({ pressed }) => [
          styles.navItem,
          active && styles.navItemActive,
          pressed && !active && { backgroundColor: colors.sidebarHover },
        ]}
      >
        {active && <View style={styles.activeBar} />}
        {item.render(active ? colors.sidebarTextActive : colors.sidebarText, 20)}
        <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.sidebar}>
      {/* ── Brand area ── */}
      <View style={styles.brandArea}>
        <View style={styles.logoWrap}>
          <View style={styles.logoBadge}>
            <Ionicons name="shield-checkmark" size={24} color={colors.brandSecondary} />
          </View>
          <View>
            <Text style={styles.brandName}>NAF</Text>
            <Text style={styles.brandSub}>SRIUC</Text>
          </View>
        </View>
      </View>

      {/* ── Navigation ── */}
      <ScrollView style={styles.navScroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.navSectionLabel}>{t('menu') || 'MENÚ'}</Text>
        <View style={styles.navGroup}>
          {items.map(renderNavItem)}
        </View>

        {adminItems.length > 0 && (
          <>
            <Text style={[styles.navSectionLabel, { marginTop: spacing.xl }]}>{t('administracion') || 'ADMINISTRACIÓN'}</Text>
            <View style={styles.navGroup}>
              {adminItems.map(renderNavItem)}
            </View>
          </>
        )}
      </ScrollView>

      {/* ── Footer / user ── */}
      <View style={styles.footer}>
        <View style={styles.footerDivider} />
        <Pressable
          style={({ pressed }) => [styles.profileRow, pressed && { backgroundColor: colors.sidebarHover }]}
          onPress={() => router.push('/(app)/perfil' as any)}
        >
          <View style={styles.avatarWrap}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{user?.name?.charAt(0).toUpperCase() || 'D'}</Text>
            </View>
            <View style={[styles.onlineDot, !isOnline && { backgroundColor: colors.error }]} />
          </View>
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={styles.userName} numberOfLines={1}>{user?.name || 'Usuario'}</Text>
            <Text style={styles.userRole} numberOfLines={1}>{(user?.role || 'user').toUpperCase()}</Text>
          </View>
          <Pressable onPress={handleSignOut} hitSlop={8}>
            <Ionicons name="log-out-outline" size={18} color={colors.sidebarText} />
          </Pressable>
        </Pressable>
      </View>
    </View>
  );
}

const SIDEBAR_WIDTH = 260;

const styles = StyleSheet.create({
  sidebar: {
    width: SIDEBAR_WIDTH,
    backgroundColor: colors.sidebarBg,
    flexDirection: 'column',
    height: '100%',
  },
  brandArea: {
    paddingTop: 28,
    paddingBottom: 24,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.sidebarBorder,
  },
  logoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  logoBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  brandName: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', letterSpacing: 1 },
  brandSub: { color: colors.brandSecondary, fontSize: 10, fontWeight: '800', letterSpacing: 4, marginTop: 2 },

  navScroll: { flex: 1, paddingHorizontal: 16, paddingTop: 20 },
  navSectionLabel: {
    color: colors.sidebarSectionLabel,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 8,
    marginLeft: 12,
  },
  navGroup: { gap: 2 },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 10,
    position: 'relative',
  },
  navItemActive: {
    backgroundColor: colors.sidebarActive,
  },
  activeBar: {
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 2,
    backgroundColor: colors.sidebarActiveBar,
  },
  navLabel: { color: colors.sidebarText, fontSize: 14, fontWeight: '600' },
  navLabelActive: { color: colors.sidebarTextActive, fontWeight: '700' },

  footer: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    paddingTop: 12,
  },
  footerDivider: {
    height: 1,
    backgroundColor: colors.sidebarBorder,
    marginBottom: 12,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  avatarWrap: { position: 'relative' },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  avatarText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  onlineDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: colors.sidebarBg,
  },
  userName: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  userRole: { color: colors.sidebarSectionLabel, fontSize: 9, fontWeight: '700', letterSpacing: 0.5, marginTop: 2 },
});

export { SIDEBAR_WIDTH };

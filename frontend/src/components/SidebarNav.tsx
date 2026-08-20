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

// Left navigation rail for desktop/web â€” premium enterprise sidebar
export default function SidebarNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { isOnline } = useInspections();

  const isAdminOrSup = user?.role === 'admin' || user?.role === 'supervisor';

  const items: NavItem[] = [
    { key: 'inicio', route: '/(app)/inicio', match: '/inicio', label: t('inicio'), render: (c, s) => <Ionicons name="home" size={s} color={c} /> },
    { key: 'historico', route: '/(app)/historico', match: '/historico', label: t('historico'), render: (c, s) => <Ionicons name="time" size={s} color={c} /> },
    { key: 'caseta', route: '/(app)/caseta', match: '/caseta', label: t('caseta'), render: (c, s) => <Ionicons name="business" size={s} color={c} /> },
    { key: 'nueva', route: '/(app)/nueva', match: '/nueva', label: t('inspeccion'), render: (c, s) => <Ionicons name="clipboard" size={s} color={c} /> },
    { key: 'embarque', route: '/(app)/embarque', match: '/embarque', label: t('embarque'), render: (c, s) => <MaterialCommunityIcons name="truck-fast" size={s} color={c} /> },
  ];

  const adminItems: NavItem[] = isAdminOrSup ? [
    { key: 'analitica', route: '/(app)/analitica', match: '/analitica', label: t('analitica') || 'AnalÃ­tica', render: (c, s) => <Ionicons name="bar-chart" size={s} color={c} /> },
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
      {/* â”€â”€ Brand area â”€â”€ */}
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

      {/* â”€â”€ Navigation â”€â”€ */}
      <ScrollView style={styles.navScroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.navSectionLabel}>{t('menu') || 'MENÃš'}</Text>
        <View style={styles.navGroup}>
          {items.map(renderNavItem)}
        </View>

        {adminItems.length > 0 && (
          <>
            <Text style={[styles.navSectionLabel, { marginTop: spacing.xl }]}>{t('administracion') || 'ADMINISTRACIÃ“N'}</Text>
            <View style={styles.navGroup}>
              {adminItems.map(renderNavItem)}
            </View>
          </>
        )}
      </ScrollView>

      {/* â”€â”€ Footer / user â”€â”€ */}
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

const SIDEBAR_WIDTH = 280;

const styles = StyleSheet.create({
  sidebar: {
    width: SIDEBAR_WIDTH,
    backgroundColor: colors.sidebarBg,
    flexDirection: 'column',
    height: '100%',
    borderRightWidth: 1,
    borderRightColor: colors.sidebarBorder,
  },
  brandArea: {
    paddingTop: 32,
    paddingBottom: 28,
    paddingHorizontal: 28,
    borderBottomWidth: 1,
    borderBottomColor: colors.sidebarBorder,
  },
  logoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  logoBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  brandName: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', letterSpacing: 0.5 },
  brandSub: { color: colors.brandSecondary, fontSize: 10, fontWeight: '800', letterSpacing: 4, marginTop: 4 },

  navScroll: { flex: 1, paddingHorizontal: 20, paddingTop: 24 },
  navSectionLabel: {
    color: colors.sidebarSectionLabel,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 12,
    marginLeft: 12,
    textTransform: 'uppercase',
  },
  navGroup: { gap: 4 },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    position: 'relative',
  },
  navItemActive: {
    backgroundColor: colors.sidebarActive,
  },
  activeBar: {
    position: 'absolute',
    left: 4,
    top: 12,
    bottom: 12,
    width: 4,
    borderRadius: 4,
    backgroundColor: colors.sidebarActiveBar,
  },
  navLabel: { color: colors.sidebarText, fontSize: 14, fontWeight: '600' },
  navLabelActive: { color: colors.sidebarTextActive, fontWeight: '700' },

  footer: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    paddingTop: 16,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  footerDivider: {
    height: 1,
    backgroundColor: colors.sidebarBorder,
    marginBottom: 16,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  avatarWrap: { position: 'relative' },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.sidebarActive,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  avatarText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: colors.sidebarBg,
  },
  userName: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  userRole: { color: colors.sidebarText, fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginTop: 2 },
});

export { SIDEBAR_WIDTH };


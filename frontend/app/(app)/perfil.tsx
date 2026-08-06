import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/src/context/AuthContext';
import { useInspections } from '@/src/context/InspectionContext';
import { colors, spacing, radius, shadows } from '@/src/constants/theme';
import MainHeader from '@/src/components/MainHeader';

export default function Perfil() {
  const { user, signOut } = useAuth();
  const { inspections, pendingCount, isOnline, syncQueue, isSyncing } = useInspections();
  const { t, i18n } = useTranslation();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
  };

  const changeLanguage = (lng: string) => { i18n.changeLanguage(lng); };

  const languages = [
    { code: 'es', label: 'Español' },
    { code: 'en', label: 'English' },
    { code: 'zh', label: '中文' },
  ];

  const stats = [
    { label: t('total_inspecciones'), value: inspections.length, color: colors.onSurface },
    { label: t('pendientes_sincronizar'), value: pendingCount, color: pendingCount > 0 ? colors.warning : colors.onSurface },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']} testID="perfil-screen">
      <MainHeader title="NAF" subtitle={t('perfil').toUpperCase()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* ── Profile card ── */}
        <View style={styles.profileCard}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{user?.name?.[0]?.toUpperCase() || 'I'}</Text>
            </View>
            <View style={[styles.onlineDot, !isOnline && { backgroundColor: colors.warning }]} />
          </View>
          <Text style={styles.name}>{user?.name || 'Usuario'}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          {user?.role && (
            <View style={[styles.roleChip, user.role === 'admin' && { backgroundColor: colors.info }]}>
              <Text style={styles.roleChipText}>{user.role.toUpperCase()}</Text>
            </View>
          )}
        </View>

        {/* ── Stats ── */}
        <View style={styles.statsCard}>
          {stats.map((s, i) => (
            <View key={i} style={[styles.statRow, i < stats.length - 1 && styles.statRowBorder]}>
              <Text style={styles.statLabel}>{s.label}</Text>
              <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
            </View>
          ))}
          <View style={[styles.statRow, styles.statRowBorder]}>
            <Text style={styles.statLabel}>{t('estado')}</Text>
            <View style={[styles.statusPill, { backgroundColor: isOnline ? colors.success : colors.warning }]}>
              <Text style={styles.statusPillText}>{isOnline ? t('en_linea') : t('fuera_linea')}</Text>
            </View>
          </View>
        </View>

        {/* ── Sync button ── */}
        {pendingCount > 0 && isOnline && (
          <Pressable testID="perfil-sync-button" style={[styles.syncBtn, isSyncing && { opacity: 0.6 }]} onPress={syncQueue} disabled={isSyncing}>
            {isSyncing ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="cloud-upload" size={20} color="#FFFFFF" />}
            <Text style={styles.syncBtnText}>{isSyncing ? 'Sincronizando...' : `${t('sincronizar_ahora')} (${pendingCount})`}</Text>
          </Pressable>
        )}

        {/* ── Settings ── */}
        <Text style={styles.sectionTitle}>{t('ajustes')}</Text>
        <View style={styles.settingsCard}>
          <View style={styles.settingHeader}>
            <View style={styles.settingIconWrap}>
              <Ionicons name="language" size={18} color={colors.brandPrimary} />
            </View>
            <Text style={styles.settingTitle}>{t('idioma')}</Text>
          </View>
          <View style={styles.langOptions}>
            {languages.map((lang) => (
              <Pressable
                key={lang.code}
                style={[styles.langBtn, i18n.language === lang.code && styles.langBtnActive]}
                onPress={() => changeLanguage(lang.code)}
              >
                <Text style={[styles.langBtnText, i18n.language === lang.code && styles.langBtnTextActive]}>{lang.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* ── Sign out ── */}
        <Pressable testID="perfil-signout-button" style={({ pressed }) => [styles.signOutBtn, pressed && { opacity: 0.9 }]} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={20} color="#FFFFFF" />
          <Text style={styles.signOutText}>{t('cerrar_sesion')}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.lg, paddingBottom: 48 },

  profileCard: {
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.border,
    borderRadius: 14, padding: 28, alignItems: 'center', marginBottom: 16, ...shadows.sm,
  },
  avatarWrap: { position: 'relative', marginBottom: 16 },
  avatar: {
    width: 80, height: 80, backgroundColor: colors.brandPrimary,
    borderRadius: 40, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#FFFFFF', fontWeight: '800', fontSize: 32 },
  onlineDot: {
    position: 'absolute', bottom: 2, right: 2, width: 14, height: 14, borderRadius: 7,
    backgroundColor: colors.success, borderWidth: 3, borderColor: '#FFFFFF',
  },
  name: { fontSize: 20, fontWeight: '800', color: colors.onSurface, letterSpacing: -0.2 },
  email: { color: colors.muted, fontSize: 14, marginTop: 4, fontWeight: '500' },
  roleChip: { backgroundColor: colors.brandPrimary, paddingHorizontal: 12, paddingVertical: 5, marginTop: 12, borderRadius: 999 },
  roleChipText: { color: '#FFFFFF', fontWeight: '800', fontSize: 10, letterSpacing: 1 },

  statsCard: {
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, marginBottom: 16, overflow: 'hidden', ...shadows.sm,
  },
  statRow: {
    padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  statRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  statLabel: { fontSize: 13, fontWeight: '600', color: colors.mutedDark, letterSpacing: 0.3 },
  statValue: { fontSize: 18, fontWeight: '800', color: colors.onSurface },
  statusPill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 },
  statusPillText: { color: '#FFFFFF', fontWeight: '800', fontSize: 10, letterSpacing: 0.5 },

  syncBtn: {
    backgroundColor: colors.info, padding: 16, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 24, borderRadius: 10, ...shadows.sm,
  },
  syncBtnText: { color: '#FFFFFF', fontWeight: '700', letterSpacing: 0.5, fontSize: 14 },

  sectionTitle: { fontSize: 11, fontWeight: '800', color: colors.mutedDark, letterSpacing: 1.5, marginBottom: 10, textTransform: 'uppercase' },
  settingsCard: {
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, padding: 16, marginBottom: 24, ...shadows.sm,
  },
  settingHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  settingIconWrap: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: colors.surfaceTertiary,
    alignItems: 'center', justifyContent: 'center',
  },
  settingTitle: { fontSize: 14, fontWeight: '700', color: colors.onSurface },
  langOptions: { flexDirection: 'row', gap: 8 },
  langBtn: {
    flex: 1, paddingVertical: 10, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 8,
  },
  langBtnActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  langBtnText: { fontSize: 12, fontWeight: '600', color: colors.onSurfaceTertiary },
  langBtnTextActive: { color: '#FFFFFF', fontWeight: '700' },

  signOutBtn: {
    backgroundColor: colors.error, padding: 16, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 10, ...shadows.sm,
  },
  signOutText: { color: '#FFFFFF', fontWeight: '700', letterSpacing: 0.5, fontSize: 14 },
});

import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/src/context/AuthContext';
import { useInspections } from '@/src/context/InspectionContext';
import { useNotifications } from '@/src/context/NotificationsContext';
import NotificationsPanel from '@/src/components/NotificationsPanel';
import { colors, spacing, radius, typography } from '@/src/constants/theme';

export default function Inicio() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { inspections, allInspections, isOnline, pendingCount, refresh, loading } = useInspections();
  const { unreadCount } = useNotifications();
  const [showNotifs, setShowNotifs] = useState(false);
  const router = useRouter();

  const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local
  const source = allInspections.length > 0 ? allInspections : inspections;
  const todayInspections = source.filter((i) => {
    const createdDate = new Date(i.created_at).toLocaleDateString('en-CA');
    return createdDate === todayStr;
  });

  const sortedInspections = [...todayInspections].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const totalBuenas = sortedInspections.filter((i) => i.status_general === 'bueno').length;
  const totalMalas = sortedInspections.filter((i) => i.status_general === 'malo').length;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']} testID="inicio-screen">
      {!isOnline && (
        <View style={styles.offlineBanner} testID="offline-banner">
          <Ionicons name="cloud-offline" size={16} color={colors.onWarning} />
          <Text style={styles.offlineText}>{t('modo_offline')}</Text>
        </View>
      )}
      {pendingCount > 0 && (
        <View style={styles.pendingBanner} testID="pending-banner">
          <Ionicons name="cloud-upload" size={16} color={colors.onInfo} />
          <Text style={styles.pendingText}>{pendingCount} {t('pendientes_sincronizar').toLowerCase()}</Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.brandPrimary} />}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hello}>{t('hola')}, {user?.name?.split(' ')[0] || t('inspector')}</Text>
          </View>
          <Pressable testID="inicio-bell-btn" style={styles.bellBtn} onPress={() => setShowNotifs(true)}>
            <Ionicons name="notifications" size={24} color={colors.onSurface} />
            {unreadCount > 0 && (
              <View style={styles.badge} testID="inicio-bell-badge">
                <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </Pressable>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{todayInspections.length}</Text>
            <Text style={styles.statLabel}>{t('hoy')}</Text>
          </View>
          <View style={[styles.statCard, { borderLeftWidth: 0 }]}>
            <Text style={[styles.statValue, { color: colors.success }]}>{totalBuenas}</Text>
            <Text style={styles.statLabel}>{t('aprobada')}</Text>
          </View>
          <View style={[styles.statCard, { borderLeftWidth: 0 }]}>
            <Text style={[styles.statValue, { color: colors.error }]}>{totalMalas}</Text>
            <Text style={styles.statLabel}>{t('con_fallas')}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>{t('inspecciones_hoy_caps')} ({t('tiempo_real')})</Text>
        {sortedInspections.length === 0 ? (
          <View style={styles.emptyBox} testID="inicio-empty">
            <Ionicons name="clipboard-outline" size={48} color={colors.muted} />
            <Text style={styles.emptyText}>{t('no_hay_inspecciones')}</Text>
            <Text style={styles.emptySub}>{t('nuevas_apareceran_aqui')}</Text>
          </View>
        ) : (
          sortedInspections.map((i) => (
            <Pressable
              key={i.id}
              testID={`inicio-inspection-${i.id}`}
              style={styles.listItem}
              onPress={() => router.push(`/inspection/${i.id}`)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.listTitle}>{i.placas_unidad || t('sin_placas')}</Text>
                <Text style={styles.listSub}>{i.compania_transportista} · {i.numero_trailer}</Text>
                <Text style={styles.listTime}>{new Date(i.created_at).toLocaleTimeString()}</Text>
                <Text style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>{t('inspector')}: {i.inspector_nombre}</Text>
              </View>
              <View style={[styles.statusChip, { backgroundColor: i.status_general === 'bueno' ? colors.success : colors.error }]}>
                <Text style={styles.statusChipText}>{i.status_general === 'bueno' ? t('bueno') : t('con_falla')}</Text>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>

      <NotificationsPanel visible={showNotifs} onClose={() => setShowNotifs(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  offlineBanner: {
    backgroundColor: colors.warning, padding: spacing.sm, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
  },
  offlineText: { color: colors.onWarning, fontWeight: '900', fontSize: 12, letterSpacing: 0.5 },
  pendingBanner: {
    backgroundColor: colors.info, padding: spacing.sm, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
  },
  pendingText: { color: colors.onInfo, fontWeight: '700', fontSize: 12 },
  container: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  header: { marginBottom: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  bellBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.borderStrong, backgroundColor: colors.surfaceSecondary, position: 'relative' },
  badge: { position: 'absolute', top: -6, right: -6, backgroundColor: colors.error, minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: colors.surface },
  badgeText: { color: '#FFF', fontWeight: '900', fontSize: 11 },
  hello: { fontSize: typography.sizes.xxl, fontWeight: '900', color: colors.onSurface },
  headerSub: { fontSize: typography.sizes.base, color: colors.muted, marginTop: 2 },
  statsRow: {
    flexDirection: 'row', borderWidth: 2, borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceSecondary, marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1, padding: spacing.md, alignItems: 'center', borderLeftWidth: 2,
    borderLeftColor: colors.borderStrong,
  },
  statValue: { fontSize: 28, fontWeight: '900', color: colors.onSurface },
  statLabel: { fontSize: 10, fontWeight: '700', color: colors.muted, letterSpacing: 1, marginTop: 2 },
  fabBlock: {
    backgroundColor: colors.brandSecondary, padding: spacing.lg,
    flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl, minHeight: 80,
  },
  fabTitle: { color: colors.onBrandSecondary, fontWeight: '900', fontSize: typography.sizes.lg, letterSpacing: 1 },
  fabSub: { color: colors.onBrandSecondary, fontSize: typography.sizes.sm, opacity: 0.8, marginTop: 2 },
  sectionTitle: {
    fontSize: typography.sizes.sm, fontWeight: '900', color: colors.onSurfaceTertiary,
    letterSpacing: 1.5, marginBottom: spacing.md,
  },
  emptyBox: {
    borderWidth: 2, borderColor: colors.border, borderStyle: 'dashed',
    padding: spacing.xl, alignItems: 'center',
  },
  emptyText: { fontWeight: '700', color: colors.onSurfaceTertiary, marginTop: spacing.md },
  emptySub: { color: colors.muted, fontSize: typography.sizes.sm, marginTop: 4 },
  listItem: {
    backgroundColor: colors.surfaceSecondary, borderWidth: 2, borderColor: colors.borderStrong,
    padding: spacing.md, marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center',
  },
  listTitle: { fontWeight: '900', fontSize: typography.sizes.lg, color: colors.onSurface },
  listSub: { color: colors.muted, fontSize: typography.sizes.sm, marginTop: 2 },
  listTime: { color: colors.onSurfaceTertiary, fontSize: typography.sizes.sm, marginTop: 4 },
  statusChip: { paddingHorizontal: spacing.sm, paddingVertical: 4 },
  statusChipText: { color: '#FFF', fontWeight: '900', fontSize: 10, letterSpacing: 1 },
});

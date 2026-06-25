import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl, Platform, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/src/context/AuthContext';
import { useInspections } from '@/src/context/InspectionContext';
import { useNotifications } from '@/src/context/NotificationsContext';
import NotificationsPanel from '@/src/components/NotificationsPanel';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius, typography } from '@/src/constants/theme';
import { apiCall } from '@/src/api/client';

export default function Inicio() {
  const { user, token } = useAuth();
  const { t } = useTranslation();
  const { inspections, allInspections, isOnline, pendingCount, refresh: refreshInspections, loading: inspectionsLoading } = useInspections();
  const { unreadCount, refresh: refreshNotifications } = useNotifications();
  const [showNotifs, setShowNotifs] = useState(false);
  const router = useRouter();

  const [activities, setActivities] = useState<any[]>([]);
  const [lastActivityId, setLastActivityId] = useState<string | null>(null);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [pendingYardCount, setPendingYardCount] = useState(0);
  const [pendingApprovCount, setPendingApprovCount] = useState(0);

  const loadActivities = useCallback(async (isInitial = false) => {
    if (!token) return;
    if (isInitial) setLoadingActivities(true);
    try {
      const [actData, yardData] = await Promise.all([
        apiCall<any[]>('/activities', { token }),
        apiCall<any[]>('/vehicle-records', { token })
      ]);

      const newActivities = Array.isArray(actData) ? actData : [];

      // Conteo de pendientes para las notificaciones del panel
      setPendingYardCount(yardData.filter((r: any) => !r.inspection_id && r.status === 'entrada').length);
      setPendingApprovCount(allInspections.filter(i => i.approval_status === 'pendiente').length);

      // Lógica de notificación (Sonido/Vibración) si hay actividad nueva
      if (!isInitial && newActivities.length > 0) {
        const latest = newActivities[0];
        if (latest.id !== lastActivityId) {
          setLastActivityId(latest.id);
          // Vibración
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          // El sonido usualmente requiere expo-av, pero la vibración táctil
          // es inmediata para el usuario en el panel maestro.
        }
      } else if (isInitial && newActivities.length > 0) {
        setLastActivityId(newActivities[0].id);
      }

      setActivities(newActivities);
    } catch (e) {
      console.error('Error fetching activities:', e);
      setActivities([]);
    } finally {
      if (isInitial) setLoadingActivities(false);
    }
  }, [token, lastActivityId]);

  const refreshAll = async () => {
    await Promise.all([
      refreshInspections(),
      refreshNotifications(),
      loadActivities(true)
    ]);
  };

  useEffect(() => {
    loadActivities(true);
    const interval = setInterval(() => loadActivities(false), 8000); // Polling cada 8 segundos para "tiempo real"
    return () => clearInterval(interval);
  }, [loadActivities]);

  const todayStr = new Date().toLocaleDateString('en-CA');
  const source = allInspections.length > 0 ? allInspections : inspections;
  const todayInspections = source.filter((i) => {
    const createdDate = new Date(i.created_at).toLocaleDateString('en-CA');
    return createdDate === todayStr;
  });

  const totalBuenas = (todayInspections || []).filter((i) => i.status_general === 'bueno').length;
  const totalMalas = (todayInspections || []).filter((i) => i.status_general === 'malo').length;

  const getActivityIcon = (type: string): any => {
    switch (type) {
      case 'inspection': return 'clipboard-outline';
      case 'caseta': return 'car-outline';
      case 'embarque': return 'cube-outline';
      default: return 'radio-button-on-outline';
    }
  };

  const formatTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const navigateToActivity = (activity: any) => {
    if (activity.type === 'inspection') {
      router.push(`/inspection/${activity.id}`);
    } else if (activity.type === 'caseta') {
      router.push(`/caseta/${activity.id}`);
    } else if (activity.type === 'embarque') {
      router.push(`/embarque/${activity.id}`);
    }
  };

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
        refreshControl={<RefreshControl refreshing={inspectionsLoading || loadingActivities} onRefresh={refreshAll} tintColor={colors.brandPrimary} />}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hello}>{t('hola')}, {user?.name?.split(' ')[0] || t('usuario')}</Text>
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

        {(pendingYardCount > 0 || pendingApprovCount > 0) && (
          <View style={styles.alertBox}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.sm }}>
              <Ionicons name="warning" size={20} color={colors.warning} />
              <Text style={styles.alertTitle}>ATENCIÓN: PROCESOS PENDIENTES</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              {pendingYardCount > 0 && (
                <Pressable
                  style={[styles.alertItem, { backgroundColor: colors.warning + '15', borderColor: colors.warning }]}
                  onPress={() => router.push('/(app)/nueva')}
                >
                  <Text style={styles.alertCount}>{pendingYardCount}</Text>
                  <Text style={styles.alertText}>Por Inspeccionar</Text>
                </Pressable>
              )}
              {pendingApprovCount > 0 && (
                <Pressable
                  style={[styles.alertItem, { backgroundColor: colors.info + '15', borderColor: colors.info }]}
                  onPress={() => router.push('/(app)/supervisor')}
                >
                  <Text style={styles.alertCount}>{pendingApprovCount}</Text>
                  <Text style={styles.alertText}>Por Aprobar</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}

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

        <Text style={styles.sectionTitle}>{t('actividad_reciente', 'ACTIVIDAD RECIENTE')} ({t('tiempo_real')})</Text>
        <FlatList
          data={activities}
          keyExtractor={(a) => `${a.type}-${a.id}`}
          renderItem={({ item: a }) => (
            <Pressable
              testID={`inicio-activity-${a.id}`}
              style={styles.listItem}
              onPress={() => navigateToActivity(a)}
            >
              <View style={[styles.typeIconBox, { backgroundColor: a.type === 'inspection' ? colors.brandPrimary : a.type === 'caseta' ? colors.success : colors.info }]}>
                <Ionicons name={getActivityIcon(a.type) as any} size={20} color="#FFF" />
              </View>
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text style={styles.listTitle}>{a.title}</Text>
                <Text style={styles.listSub}>{a.subtitle}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 }}>
                  <Text style={styles.listTime}>{formatTime(a.created_at)}</Text>
                  <Text style={{ fontSize: 10, color: colors.muted }}>• {a.user_name}</Text>
                </View>
              </View>
              {a.type === 'inspection' && (
                <View style={[styles.statusChip, { backgroundColor: a.status === 'bueno' ? colors.success : colors.error }]}>
                  <Text style={styles.statusChipText}>{a.status === 'bueno' ? t('bueno') : t('con_falla')}</Text>
                </View>
              )}
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.emptyBox} testID="inicio-empty">
              <Ionicons name="flash-outline" size={48} color={colors.muted} />
              <Text style={styles.emptyText}>{t('no_hay_actividad', 'No hay actividad reciente')}</Text>
              <Text style={styles.emptySub}>{t('nuevas_apareceran_aqui')}</Text>
            </View>
          }
          scrollEnabled={false} // Since it's inside a ScrollView
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={true}
        />
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
  alertBox: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  alertTitle: { fontSize: 11, fontWeight: '900', color: colors.onSurface, letterSpacing: 1 },
  alertItem: {
    flex: 1,
    borderWidth: 1,
    padding: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertCount: { fontSize: 18, fontWeight: '900', color: colors.onSurface },
  alertText: { fontSize: 10, fontWeight: '700', color: colors.muted, marginTop: 2 },
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
  typeIconBox: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  listSub: { color: colors.muted, fontSize: typography.sizes.sm, marginTop: 2 },
  listTime: { color: colors.onSurfaceTertiary, fontSize: typography.sizes.sm, marginTop: 4 },
  statusChip: { paddingHorizontal: spacing.sm, paddingVertical: 4 },
  statusChipText: { color: '#FFF', fontWeight: '900', fontSize: 10, letterSpacing: 1 },
});

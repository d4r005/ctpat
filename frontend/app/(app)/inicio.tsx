import React, { useState, useCallback, useEffect } from 'react';
import { useWindowDimensions } from 'react-native';
import { useIsTablet } from '@/src/hooks/useIsTablet';
import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl, Platform, FlatList, Image, Vibration, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/src/context/AuthContext';
import { useInspections } from '@/src/context/InspectionContext';
import { useNotifications } from '@/src/context/NotificationsContext';
import NotificationsPanel from '@/src/components/NotificationsPanel';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius, typography, shadows } from '@/src/constants/theme';
import { apiCall } from '@/src/api/client';
import ProcessTracker from '@/src/components/ProcessTracker';

import MainHeader from '@/src/components/MainHeader';

// UI Update: Professional Brand Header
export default function Inicio() {
  const { user, token } = useAuth();
  const { t } = useTranslation();
  const {
    inspections, allInspections, refresh: refreshInspections, loading: inspectionsLoading,
    pendingCount, syncQueue, offlineRecords, isSyncing,
  } = useInspections();
  const { refresh: refreshNotifications } = useNotifications();
  const [showNotifs, setShowNotifs] = useState(false);
  const router = useRouter();

  const [activities, setActivities] = useState<any[]>([]);
  const [inProcessUnits, setInProcessUnits] = useState<any[]>([]);
  const [lastActivityId, setLastActivityId] = useState<string | null>(null);
  const [loadingActivities, setLoadingActivities] = useState(false);

  const loadActivities = useCallback(async (isInitial = false) => {
    if (!token) return;
    if (isInitial) setLoadingActivities(true);
    try {
      const [actData, recordsEntrada, recordsInsp] = await Promise.all([
        apiCall<any[]>('/activities', { token }),
        // Solo traer unidades que están en patio para mayor velocidad
        apiCall<any[]>('/vehicle-records?status=entrada', { token }),
        apiCall<any[]>('/vehicle-records?status=inspeccionado', { token })
      ]);

      setActivities(Array.isArray(actData) ? actData : []);

      // Incluir registros offline generados en este dispositivo
      const combined = [...offlineRecords, ...(Array.isArray(recordsEntrada) ? recordsEntrada : []), ...(Array.isArray(recordsInsp) ? recordsInsp : [])];
      setInProcessUnits(combined.sort((a,b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()));

      if (!isInitial && actData.length > 0 && actData[0].id !== lastActivityId) {
        setLastActivityId(actData[0].id);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (isInitial && actData.length > 0) {
        setLastActivityId(actData[0].id);
      }
    } catch (e) {
      setActivities([]);
    } finally {
      if (isInitial) setLoadingActivities(false);
    }
  }, [token, lastActivityId, offlineRecords]);

  const refreshAll = async () => {
    await Promise.all([refreshInspections(), refreshNotifications(), loadActivities(true)]);
  };

  useEffect(() => {
    loadActivities(true);
    const interval = setInterval(() => loadActivities(false), 10000);
    return () => clearInterval(interval);
  }, [loadActivities]);

  const todayStr = new Date().toLocaleDateString('en-CA');
  const source = allInspections.length > 0 ? allInspections : inspections;
  const todayInspections = source.filter((i) => new Date(i.created_at).toLocaleDateString('en-CA') === todayStr);

  const totalBuenas = (todayInspections || []).filter((i) => i.status_general === 'bueno').length;
  const totalMalas = (todayInspections || []).filter((i) => i.status_general === 'malo').length;

  const getActivityIcon = (type: string): any => {
    switch (type) {
      case 'inspection': return { name: 'clipboard', family: 'ionicons' };
      case 'caseta': return { name: 'car-sport', family: 'ionicons' };
      case 'embarque': return { name: 'truck-trailer', family: 'mci' };
      default: return { name: 'radio-button-on', family: 'ionicons' };
    }
  };

  const formatTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  };

  const navigateToActivity = (activity: any) => {
    const routes: any = { inspection: `/inspection/${activity.id}`, caseta: `/caseta/${activity.id}`, embarque: `/embarque/${activity.id}` };
    if (routes[activity.type]) router.push(routes[activity.type]);
  };

  const renderActivity = ({ item: a }: { item: any }) => {
    const icon = getActivityIcon(a.type);
    return (
      <Pressable style={({ pressed }) => [styles.activityCard, pressed && { opacity: 0.85 }]} onPress={() => navigateToActivity(a)}>
        <View style={[styles.iconCircle, { backgroundColor: a.status === 'malo' || a.type === 'rechazada' ? colors.errorSurface : (a.type === 'caseta' ? colors.successSurface : colors.infoSurface) }]}>
          {icon.family === 'mci' ? (
            <MaterialCommunityIcons name={icon.name} size={20} color={a.status === 'malo' || a.type === 'rechazada' ? colors.error : (a.type === 'caseta' ? colors.success : colors.info)} />
          ) : (
            <Ionicons name={icon.name} size={18} color={a.status === 'malo' || a.type === 'rechazada' ? colors.error : (a.type === 'caseta' ? colors.success : colors.info)} />
          )}
        </View>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={styles.cardTitleText}>{a.title}</Text>
          <Text style={styles.cardSubText}>{a.subtitle}</Text>
          <Text style={styles.cardMetaText}>{formatTime(a.created_at)} • {a.user_name}</Text>
        </View>
        {a.status === 'malo' && <View style={styles.miniStatusBadgeError}><Text style={styles.miniStatusText}>{t('con_falla').toUpperCase()}</Text></View>}
        {a.status === 'bueno' && a.type === 'inspection' && <View style={styles.miniStatusBadgeSuccess}><Text style={styles.miniStatusText}>{t('bueno').toUpperCase()}</Text></View>}
      </Pressable>
    );
  };

  const ListHeader = () => (
    <>
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <View style={[styles.statIconWrap, { backgroundColor: colors.infoSurface }]}>
            <Ionicons name="stats-chart" size={18} color={colors.info} />
          </View>
          <Text style={styles.statValue}>{todayInspections.length}</Text>
          <Text style={styles.statLabel}>{t('inspecciones_hoy').toUpperCase()}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCard}>
          <View style={[styles.statIconWrap, { backgroundColor: colors.successSurface }]}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
          </View>
          <Text style={[styles.statValue, { color: colors.success }]}>{totalBuenas}</Text>
          <Text style={styles.statLabel}>{t('aprobada').toUpperCase()}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCard}>
          <View style={[styles.statIconWrap, { backgroundColor: colors.errorSurface }]}>
            <Ionicons name="alert-circle" size={18} color={colors.error} />
          </View>
          <Text style={[styles.statValue, { color: colors.error }]}>{totalMalas}</Text>
          <Text style={styles.statLabel}>{t('con_fallas').toUpperCase()}</Text>
        </View>
      </View>

      <View style={styles.processHeader}>
        <Text style={styles.processTitle}>{t('unidades_en_patio_activo')}</Text>
        <Pressable onPress={() => loadActivities(true)} hitSlop={8} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={16} color={colors.brandPrimary} />
        </Pressable>
      </View>
    </>
  );

  const ListEmpty = () => (
    <View style={styles.emptyInline}>
      <Ionicons name="checkmark-circle-outline" size={32} color={colors.mutedLight} style={{ marginBottom: 6 }} />
      <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '700' }}>{t('no_hay_unidades_patio')}</Text>
      {pendingCount > 0 && (
        <Text style={{ color: colors.warning, fontSize: 11, marginTop: 4, textAlign: 'center' }}>
          {pendingCount} registro(s) en cola, esperando conexión...
        </Text>
      )}
    </View>
  );

  const renderActiveUnit = ({ item: r }: { item: any }) => {
    const isFull = r.entry?.tipo_unidad === 'full';
    const isDescarga = r.entry?.condicion_carga === 'descarga';
    const showShipping = !isFull && !isDescarga;
    const isInspected = !!r.inspection_id || r.status === 'inspeccionado';

    const steps = {
      entry: true,
      inspection: isInspected,
      shipping: !!r.has_shipping_ticket,
      exit: r.status === 'salida'
    };

    return (
      <Pressable style={({ pressed }) => [styles.activeUnitCard, pressed && { opacity: 0.9 }]} onPress={() => router.push(`/caseta/${r.id}`)}>
        <View style={styles.activeUnitTop}>
          <View style={styles.activeUnitLeft}>
            <View style={[styles.plateIconWrap, { backgroundColor: r.status === 'entrada' ? colors.warningSurface : colors.infoSurface }]}>
              <MaterialCommunityIcons name="truck" size={20} color={r.status === 'entrada' ? colors.warning : colors.info} />
            </View>
            <View style={styles.activeUnitTextBlock}>
              <Text style={styles.trackingTitle} numberOfLines={1}>{r.entry?.placas_unidad} {isFull ? '(FULL)' : ''}</Text>
              <Text style={styles.trackingSub} numberOfLines={1}>{r.entry?.chofer_nombre} · {r.entry?.compania_transporte}</Text>
            </View>
          </View>
          <View style={[styles.statusPill, isInspected ? styles.statusPillInfo : styles.statusPillWarning]}>
            <Text style={[styles.statusPillText, { color: isInspected ? colors.info : colors.warning }]}>
              {isInspected ? t('inspeccion').toUpperCase() : t('entrada').toUpperCase()}
            </Text>
          </View>
        </View>
        <View style={styles.activeUnitTracker}>
          <ProcessTracker steps={steps} compact showShipping={showShipping} />
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <MainHeader title="NAF" subtitle={t('inicio').toUpperCase()} />

      {/* Banner de sincronización pendiente */}
      {pendingCount > 0 && (
        <Pressable
          style={{
            backgroundColor: isSyncing ? colors.info : colors.warning,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingVertical: 10,
          }}
          onPress={() => syncQueue()}
          disabled={isSyncing}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {isSyncing ? (
              <ActivityIndicator size="small" color={colors.onBrandPrimary} />
            ) : (
              <Ionicons name="cloud-upload-outline" size={18} color={colors.onBrandPrimary} />
            )}
            <Text style={{ color: colors.onBrandPrimary, fontWeight: '700', fontSize: 13 }}>
              {isSyncing ? 'Sincronizando...' : `${pendingCount} ${pendingCount === 1 ? 'registro pendiente' : 'registros pendientes'} de sincronizar`}
            </Text>
          </View>
          {!isSyncing && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ color: colors.onBrandPrimary, fontSize: 12, opacity: 0.9 }}>Reintentar</Text>
              <Ionicons name="refresh" size={16} color={colors.onBrandPrimary} />
            </View>
          )}
        </Pressable>
      )}

      <FlatList
        data={inProcessUnits}
        renderItem={renderActiveUnit}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={loadingActivities} onRefresh={refreshAll} tintColor={colors.brandPrimary} />}
        ListHeaderComponent={<ListHeader />}
        ListEmptyComponent={<ListEmpty />}
        ListFooterComponent={
          <>
            <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>{t('actividad_reciente').toUpperCase()}</Text>
            {activities.slice(0, 10).map((a) => (
              <View key={`${a.type}-${a.id}`}>{renderActivity({ item: a })}</View>
            ))}
          </>
        }
      />

      <NotificationsPanel visible={showNotifs} onClose={() => setShowNotifs(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  container: { padding: spacing.md, paddingBottom: spacing.xxxl },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  statDivider: { width: 1, backgroundColor: colors.divider, marginVertical: spacing.xs },
  statCard: { flex: 1, alignItems: 'center' },
  statIconWrap: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statValue: { fontSize: 22, fontWeight: '800', color: colors.onSurface },
  statLabel: { fontSize: 9, fontWeight: '700', color: colors.muted, marginTop: 4, letterSpacing: 0.3 },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: colors.onSurfaceTertiary, letterSpacing: 1, marginBottom: spacing.md, marginLeft: 4 },
  activityCard: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm,
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, ...shadows.sm,
  },
  iconCircle: { width: 38, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  cardTitleText: { fontSize: 14, fontWeight: '800', color: colors.onSurface },
  cardSubText: { fontSize: 12, color: colors.muted, marginTop: 2 },
  cardMetaText: { fontSize: 10, color: colors.mutedLight, marginTop: 4 },
  miniStatusBadgeError: { backgroundColor: colors.errorSurface, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  miniStatusBadgeSuccess: { backgroundColor: colors.successSurface, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  miniStatusText: { color: colors.onSurface, fontSize: 8, fontWeight: '800' },
  processHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md, paddingHorizontal: 4 },
  processTitle: { fontSize: 15, fontWeight: '800', color: colors.onSurface },
  refreshBtn: {
    width: 30, height: 30, borderRadius: radius.sm, backgroundColor: colors.brandTertiary,
    alignItems: 'center', justifyContent: 'center',
  },
  activeUnitCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  activeUnitTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  activeUnitLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexShrink: 1, flex: 1, marginRight: spacing.sm },
  plateIconWrap: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  activeUnitTextBlock: { flexShrink: 1 },
  activeUnitTracker: { marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  trackingTitle: { fontWeight: '800', fontSize: 15, color: colors.onSurface, letterSpacing: 0.3 },
  trackingSub: { fontSize: 11, color: colors.muted, marginTop: 2, fontWeight: '500' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  statusPillWarning: { backgroundColor: colors.warningSurface },
  statusPillInfo: { backgroundColor: colors.infoSurface },
  statusPillText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  emptyInline: {
    alignItems: 'center', padding: spacing.xl, borderStyle: 'dashed', borderWidth: 1.5,
    borderColor: colors.border, borderRadius: radius.md, marginTop: spacing.md, backgroundColor: colors.surfaceSecondary,
  },
});

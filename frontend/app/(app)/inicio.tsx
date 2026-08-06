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
import { supabase } from '@/src/api/supabase';
import ProcessTracker from '@/src/components/ProcessTracker';

import MainHeader from '@/src/components/MainHeader';

// UI Update: Professional Brand Header + desktop dashboard layout (grid + activity sidebar)
export default function Inicio() {
  const { user, token } = useAuth();
  const { t } = useTranslation();
  const isTablet = useIsTablet();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1080;
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
      // Direct Supabase queries for faster response and real-time feel
      const [recData, inspData, ticketData] = await Promise.all([
        supabase.from('vehicle_records').select('*').order('created_at', { ascending: false }).limit(20),
        supabase.from('inspections').select('*').order('created_at', { ascending: false }).limit(10),
        supabase.from('shipping_tickets').select('*').order('created_at', { ascending: false }).limit(10)
      ]);

      // Process activities
      const acts: any[] = [];
      if (recData.data) {
        recData.data.forEach(r => {
          acts.push({
            id: r.id,
            type: 'caseta',
            title: r.plates || 'S/P',
            subtitle: `${r.entry_data?.chofer_nombre || ''} - ${r.entry_data?.compania_transporte || ''}`,
            created_at: r.created_at,
            user_name: r.entry_data?.guardia_caseta_nombre || 'Guardia',
            status: r.exit_data ? 'salida' : 'entrada'
          });
        });
      }
      if (inspData.data) {
        inspData.data.forEach(i => {
          const payload = i.data || {};
          acts.push({
            id: i.id,
            type: 'inspection',
            title: i.plates || 'S/P',
            subtitle: payload.compania_transportista || '',
            created_at: i.created_at,
            user_name: payload.inspector_nombre || 'Inspector',
            status: i.status_general
          });
        });
      }
      if (ticketData.data) {
        ticketData.data.forEach(t => {
          const payload = t.data || {};
          acts.push({
            id: t.id,
            type: 'embarque',
            title: t.plates || 'S/P',
            subtitle: payload.almacenista_nombre || '',
            created_at: t.created_at,
            user_name: payload.almacenista_nombre || 'Almacenista',
            status: 'bueno'
          });
        });
      }

      const sortedActs = acts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setActivities(sortedActs);

      // In-process units: vehicle records without exit_data
      let inProcess = [];
      if (recData.data) {
        inProcess = recData.data
          .filter(r => !r.exit_data)
          .map(r => ({
            ...r,
            entry: r.entry_data,
            exit: r.exit_data,
            // Determine if inspected based on data or assume based on plates for now
            status: r.entry_data?.status || (r.inspection_id ? 'inspeccionado' : 'entrada')
          }));
      }

      const combined = [...offlineRecords, ...inProcess];
      setInProcessUnits(combined.sort((a,b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()));

      if (!isInitial && sortedActs.length > 0 && sortedActs[0].id !== lastActivityId) {
        setLastActivityId(sortedActs[0].id);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (isInitial && sortedActs.length > 0) {
        setLastActivityId(sortedActs[0].id);
      }
    } catch (e) {
      console.error("Error loading activities:", e);
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

  const renderActivity = (a: any) => {
    const icon = getActivityIcon(a.type);
    const tone = a.status === 'malo' || a.type === 'rechazada' ? 'error' : (a.type === 'caseta' ? 'success' : 'info');
    const toneColor = tone === 'error' ? colors.error : tone === 'success' ? colors.success : colors.info;
    const toneSurface = tone === 'error' ? colors.errorSurface : tone === 'success' ? colors.successSurface : colors.infoSurface;
    return (
      <Pressable key={`${a.type}-${a.id}`} style={({ pressed }) => [styles.activityCard, pressed && { opacity: 0.85 }]} onPress={() => navigateToActivity(a)}>
        <View style={[styles.iconCircle, { backgroundColor: toneSurface }]}>
          {icon.family === 'mci' ? (
            <MaterialCommunityIcons name={icon.name} size={18} color={toneColor} />
          ) : (
            <Ionicons name={icon.name} size={16} color={toneColor} />
          )}
        </View>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={styles.cardTitleText} numberOfLines={1}>{a.title}</Text>
          <Text style={styles.cardSubText} numberOfLines={1}>{a.subtitle}</Text>
          <Text style={styles.cardMetaText}>{formatTime(a.created_at)} • {a.user_name}</Text>
        </View>
        {a.status === 'malo' && <View style={styles.miniStatusBadgeError}><Text style={styles.miniStatusText}>{t('con_falla').toUpperCase()}</Text></View>}
        {a.status === 'bueno' && a.type === 'inspection' && <View style={styles.miniStatusBadgeSuccess}><Text style={styles.miniStatusText}>{t('bueno').toUpperCase()}</Text></View>}
      </Pressable>
    );
  };

  const StatsRow = () => (
    <View style={styles.statsRow}>
      <View style={styles.statCard}>
        <View style={[styles.statIconWrap, { backgroundColor: colors.infoSurface }]}>
          <Ionicons name="stats-chart" size={18} color={colors.info} />
        </View>
        <Text style={styles.statValue}>{todayInspections.length}</Text>
        <Text style={styles.statLabel}>{t('inspecciones_hoy').toUpperCase()}</Text>
      </View>
      <View style={styles.statCard}>
        <View style={[styles.statIconWrap, { backgroundColor: colors.successSurface }]}>
          <Ionicons name="checkmark-circle" size={18} color={colors.success} />
        </View>
        <Text style={[styles.statValue, { color: colors.success }]}>{totalBuenas}</Text>
        <Text style={styles.statLabel}>{t('aprobada').toUpperCase()}</Text>
      </View>
      <View style={styles.statCard}>
        <View style={[styles.statIconWrap, { backgroundColor: colors.errorSurface }]}>
          <Ionicons name="alert-circle" size={18} color={colors.error} />
        </View>
        <Text style={[styles.statValue, { color: colors.error }]}>{totalMalas}</Text>
        <Text style={styles.statLabel}>{t('con_fallas').toUpperCase()}</Text>
      </View>
    </View>
  );

  const SectionHeader = () => (
    <View style={styles.processHeader}>
      <Text style={styles.processTitle}>{t('unidades_en_patio_activo')}</Text>
      <Pressable onPress={() => loadActivities(true)} hitSlop={8} style={styles.refreshBtn}>
        <Ionicons name="refresh" size={16} color={colors.brandPrimary} />
      </Pressable>
    </View>
  );

  const EmptyUnits = () => (
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

  const UnitCard = ({ r }: { r: any }) => {
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
      <Pressable
        style={({ pressed }) => [styles.unitCard, isDesktop && styles.unitCardGrid, pressed && { opacity: 0.92 }]}
        onPress={() => router.push(`/caseta/${r.id}`)}
      >
        <View style={styles.unitCardTop}>
          <View style={[styles.photoBox, { backgroundColor: r.status === 'entrada' ? colors.warningSurface : colors.infoSurface }]}>
            <MaterialCommunityIcons name="truck" size={26} color={r.status === 'entrada' ? colors.warning : colors.info} />
          </View>
          <View style={styles.unitCardInfo}>
            <Text style={styles.plateLabel}>{t('placas') ? t('placas').toUpperCase() : 'LICENSE PLATE'}</Text>
            <Text style={styles.trackingTitle} numberOfLines={1}>{r.entry?.placas_unidad} {isFull ? '(FULL)' : ''}</Text>
            <Text style={styles.trackingSub} numberOfLines={1}>{r.entry?.chofer_nombre}</Text>
            <Text style={styles.trackingSub} numberOfLines={1}>{r.entry?.compania_transporte}</Text>
          </View>
          <View style={[styles.statusPill, isInspected ? styles.statusPillInfo : styles.statusPillWarning]}>
            <Text style={[styles.statusPillText, { color: isInspected ? colors.info : colors.warning }]}>
              {isInspected ? t('inspeccion').toUpperCase() : t('entrada').toUpperCase()}
            </Text>
          </View>
        </View>
        <View style={styles.unitCardTracker}>
          <ProcessTracker steps={steps} showShipping={showShipping} showLabels />
        </View>
      </Pressable>
    );
  };

  const gridColumns = isDesktop ? 2 : 1;
  const rows: any[][] = [];
  for (let i = 0; i < inProcessUnits.length; i += gridColumns) {
    rows.push(inProcessUnits.slice(i, i + gridColumns));
  }

  const MainContent = (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={loadingActivities} onRefresh={refreshAll} tintColor={colors.brandPrimary} />}
    >
      <StatsRow />
      <SectionHeader />
      {inProcessUnits.length === 0 ? (
        <EmptyUnits />
      ) : (
        rows.map((row, idx) => (
          <View key={idx} style={isDesktop ? styles.gridRow : undefined}>
            {row.map((r) => <UnitCard key={r.id} r={r} />)}
          </View>
        ))
      )}

      {!isDesktop && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>{t('actividad_reciente').toUpperCase()}</Text>
          {activities.slice(0, 10).map((a) => renderActivity(a))}
        </>
      )}
    </ScrollView>
  );

  const Sidebar = (
    <View style={styles.sidebar}>
      <Text style={styles.sidebarTitle}>{t('actividad_reciente')}</Text>
      <ScrollView showsVerticalScrollIndicator={false}>
        {activities.length === 0 ? (
          <Text style={{ color: colors.mutedLight, fontSize: 12, marginTop: spacing.md }}>{t('no_hay_unidades_patio')}</Text>
        ) : (
          activities.slice(0, 20).map((a) => renderActivity(a))
        )}
      </ScrollView>
    </View>
  );

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

      {isDesktop ? (
        <View style={styles.desktopBody}>
          {MainContent}
          {Sidebar}
        </View>
      ) : (
        MainContent
      )}

      <NotificationsPanel visible={showNotifs} onClose={() => setShowNotifs(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  container: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  desktopBody: { flex: 1, flexDirection: 'row' },
  sidebar: {
    width: 320,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.lg,
  },
  sidebarTitle: { fontSize: 15, fontWeight: '800', color: colors.onSurface, marginBottom: spacing.md },

  statsRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  statCard: {
    flex: 1, alignItems: 'center', backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    paddingVertical: spacing.lg, borderWidth: 1, borderColor: colors.border, ...shadows.sm,
  },
  statIconWrap: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statValue: { fontSize: 22, fontWeight: '800', color: colors.onSurface },
  statLabel: { fontSize: 9, fontWeight: '700', color: colors.muted, marginTop: 4, letterSpacing: 0.3 },

  sectionTitle: { fontSize: 11, fontWeight: '800', color: colors.onSurfaceTertiary, letterSpacing: 1, marginBottom: spacing.md, marginLeft: 4 },
  activityCard: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm,
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, ...shadows.sm,
  },
  iconCircle: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  cardTitleText: { fontSize: 13, fontWeight: '800', color: colors.onSurface },
  cardSubText: { fontSize: 11, color: colors.muted, marginTop: 2 },
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

  gridRow: { flexDirection: 'row', gap: spacing.md },
  unitCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  unitCardGrid: { flex: 1 },
  unitCardTop: { flexDirection: 'row', alignItems: 'flex-start' },
  photoBox: { width: 52, height: 52, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  unitCardInfo: { flex: 1, marginRight: spacing.sm },
  plateLabel: { fontSize: 9, fontWeight: '800', color: colors.mutedLight, letterSpacing: 0.5, marginBottom: 2 },
  trackingTitle: { fontWeight: '800', fontSize: 15, color: colors.onSurface, letterSpacing: 0.3 },
  trackingSub: { fontSize: 11, color: colors.muted, marginTop: 1, fontWeight: '500' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  statusPillWarning: { backgroundColor: colors.warningSurface },
  statusPillInfo: { backgroundColor: colors.infoSurface },
  statusPillText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  unitCardTracker: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },

  emptyInline: {
    alignItems: 'center', padding: spacing.xl, borderStyle: 'dashed', borderWidth: 1.5,
    borderColor: colors.border, borderRadius: radius.md, marginTop: spacing.md, backgroundColor: colors.surfaceSecondary,
  },
});

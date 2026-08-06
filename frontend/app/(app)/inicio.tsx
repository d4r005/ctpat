import React, { useState, useCallback, useEffect } from 'react';
import { useWindowDimensions } from 'react-native';
import { useIsTablet } from '@/src/hooks/useIsTablet';
import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl, Platform, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/src/context/AuthContext';
import { useInspections } from '@/src/context/InspectionContext';
import { useNotifications } from '@/src/context/NotificationsContext';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius, shadows } from '@/src/constants/theme';
import { supabase } from '@/src/api/supabase';
import ProcessTracker from '@/src/components/ProcessTracker';
import MainHeader from '@/src/components/MainHeader';

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
  const router = useRouter();

  const [activities, setActivities] = useState<any[]>([]);
  const [inProcessUnits, setInProcessUnits] = useState<any[]>([]);
  const [lastActivityId, setLastActivityId] = useState<string | null>(null);
  const [loadingActivities, setLoadingActivities] = useState(false);

  const loadActivities = useCallback(async (isInitial = false) => {
    if (!token) return;
    if (isInitial) setLoadingActivities(true);
    try {
      const [recData, inspData, ticketData] = await Promise.all([
        supabase.from('vehicle_records').select('*').order('created_at', { ascending: false }).limit(20),
        supabase.from('inspections').select('*').order('created_at', { ascending: false }).limit(10),
        supabase.from('shipping_tickets').select('*').order('created_at', { ascending: false }).limit(10)
      ]);

      const acts: any[] = [];
      if (recData.data) {
        recData.data.forEach(r => {
          acts.push({
            id: r.id, type: 'caseta', title: r.plates || 'S/P',
            subtitle: `${r.entry_data?.chofer_nombre || ''} - ${r.entry_data?.compania_transporte || ''}`,
            created_at: r.created_at, user_name: r.entry_data?.guardia_caseta_nombre || 'Guardia',
            status: r.exit_data ? 'salida' : 'entrada'
          });
        });
      }
      if (inspData.data) {
        inspData.data.forEach(i => {
          const payload = i.data || {};
          acts.push({
            id: i.id, type: 'inspection', title: i.plates || 'S/P',
            subtitle: payload.compania_transportista || '', created_at: i.created_at,
            user_name: payload.inspector_nombre || 'Inspector', status: i.status_general
          });
        });
      }
      if (ticketData.data) {
        ticketData.data.forEach(t => {
          const payload = t.data || {};
          acts.push({
            id: t.id, type: 'embarque', title: t.plates || 'S/P',
            subtitle: payload.almacenista_nombre || '', created_at: t.created_at,
            user_name: payload.almacenista_nombre || 'Almacenista', status: 'bueno'
          });
        });
      }

      const sortedActs = acts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setActivities(sortedActs);

      let inProcess = [];
      if (recData.data) {
        inProcess = recData.data.filter(r => !r.exit_data).map(r => ({
          ...r, entry: r.entry_data, exit: r.exit_data,
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
    try { return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
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
          <Text style={styles.cardMetaText}>{formatTime(a.created_at)} · {a.user_name}</Text>
        </View>
        {a.status === 'malo' && <View style={[styles.miniBadge, { backgroundColor: colors.errorSurface }]}><Text style={[styles.miniBadgeText, { color: colors.error }]}>{t('con_falla').toUpperCase()}</Text></View>}
        {a.status === 'bueno' && a.type === 'inspection' && <View style={[styles.miniBadge, { backgroundColor: colors.successSurface }]}><Text style={[styles.miniBadgeText, { color: colors.success }]}>{t('bueno').toUpperCase()}</Text></View>}
      </Pressable>
    );
  };

  const stats = [
    { num: todayInspections.length, label: t('inspecciones_hoy').toUpperCase(), color: colors.info, surface: colors.infoSurface, icon: 'stats-chart' as const },
    { num: totalBuenas, label: t('aprobada').toUpperCase(), color: colors.success, surface: colors.successSurface, icon: 'checkmark-circle' as const },
    { num: totalMalas, label: t('con_fallas').toUpperCase(), color: colors.error, surface: colors.errorSurface, icon: 'alert-circle' as const },
  ];

  const StatsRow = () => (
    <View style={[styles.statsRow, isDesktop && styles.statsRowWeb]}>
      {stats.map((s, i) => (
        <View key={i} style={[styles.statCard, isDesktop && styles.statCardWeb]}>
          <View style={[styles.statIconWrap, { backgroundColor: s.surface }]}>
            <Ionicons name={s.icon} size={18} color={s.color} />
          </View>
          <Text style={[styles.statValue, { color: s.color }]}>{s.num}</Text>
          <Text style={styles.statLabel}>{s.label}</Text>
        </View>
      ))}
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
      <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '600' }}>{t('no_hay_unidades_patio')}</Text>
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
    const steps = { entry: true, inspection: isInspected, shipping: !!r.has_shipping_ticket, exit: r.status === 'salida' };

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
            <Text style={styles.plateLabel}>{t('placas') ? t('placas').toUpperCase() : 'PLACAS'}</Text>
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
      contentContainerStyle={[styles.container, isDesktop && styles.containerWeb]}
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

      {pendingCount > 0 && (
        <Pressable
          style={{ backgroundColor: isSyncing ? colors.info : colors.warning, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 }}
          onPress={() => syncQueue()} disabled={isSyncing}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {isSyncing ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="cloud-upload-outline" size={18} color="#FFFFFF" />}
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>
              {isSyncing ? 'Sincronizando...' : `${pendingCount} ${pendingCount === 1 ? 'registro pendiente' : 'registros pendientes'} de sincronizar`}
            </Text>
          </View>
          {!isSyncing && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 12, opacity: 0.9 }}>Reintentar</Text>
              <Ionicons name="refresh" size={16} color="#FFFFFF" />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  container: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  containerWeb: { padding: 32, paddingBottom: 48 },
  desktopBody: { flex: 1, flexDirection: 'row' },
  sidebar: {
    width: 340, borderLeftWidth: 1, borderLeftColor: colors.border,
    backgroundColor: '#FFFFFF', padding: 24,
  },
  sidebarTitle: { fontSize: 14, fontWeight: '800', color: colors.onSurface, marginBottom: 16, letterSpacing: 0.5 },

  statsRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  statsRowWeb: { gap: 20 },
  statCard: {
    flex: 1, alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 12,
    paddingVertical: 18, borderWidth: 1, borderColor: colors.border, ...shadows.sm,
  },
  statCardWeb: { paddingVertical: 24, borderRadius: 14 },
  statIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  statValue: { fontSize: 24, fontWeight: '800', color: colors.onSurface },
  statLabel: { fontSize: 9, fontWeight: '700', color: colors.muted, marginTop: 4, letterSpacing: 0.3 },

  sectionTitle: { fontSize: 11, fontWeight: '800', color: colors.mutedDark, letterSpacing: 1, marginBottom: spacing.md, marginLeft: 4 },
  activityCard: {
    backgroundColor: '#FFFFFF', borderRadius: 10, padding: 14, marginBottom: 8,
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, ...shadows.xs,
  },
  iconCircle: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardTitleText: { fontSize: 13, fontWeight: '700', color: colors.onSurface },
  cardSubText: { fontSize: 11, color: colors.muted, marginTop: 2 },
  cardMetaText: { fontSize: 10, color: colors.mutedLight, marginTop: 3 },
  miniBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  miniBadgeText: { fontSize: 8, fontWeight: '800' },

  processHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md, paddingHorizontal: 4 },
  processTitle: { fontSize: 15, fontWeight: '700', color: colors.onSurface, letterSpacing: -0.2 },
  refreshBtn: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: colors.surfaceTertiary,
    alignItems: 'center', justifyContent: 'center',
  },

  gridRow: { flexDirection: 'row', gap: 20 },
  unitCard: {
    backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, marginBottom: spacing.md, ...shadows.sm,
  },
  unitCardGrid: { flex: 1 },
  unitCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  photoBox: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  unitCardInfo: { flex: 1 },
  plateLabel: { fontSize: 9, fontWeight: '800', color: colors.muted, letterSpacing: 1 },
  trackingTitle: { fontSize: 16, fontWeight: '800', color: colors.onSurface, marginTop: 2 },
  trackingSub: { fontSize: 11, color: colors.muted, marginTop: 1 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  statusPillInfo: { backgroundColor: colors.infoSurface },
  statusPillWarning: { backgroundColor: colors.warningSurface },
  statusPillText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  unitCardTracker: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.divider },

  emptyInline: {
    alignItems: 'center', padding: 32, borderStyle: 'dashed', borderWidth: 1,
    borderColor: colors.border, borderRadius: 12, marginTop: spacing.md, backgroundColor: '#FFFFFF',
  },
});

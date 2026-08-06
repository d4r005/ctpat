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

  const KPIBox = ({ title, value, icon, color, surface }: any) => (
    <View style={[styles.statCard, { borderTopColor: color, borderTopWidth: 4 }]}>
      <View style={styles.statHeader}>
        <Text style={styles.statTitle}>{title}</Text>
        <View style={[styles.statIconWrap, { backgroundColor: surface }]}>
          <MaterialCommunityIcons name={icon} size={20} color={color} />
        </View>
      </View>
      <Text style={styles.statValue}>{value}</Text>
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
        style={({ pressed }) => [styles.unitCard, pressed && { opacity: 0.95 }]}
        onPress={() => router.push(`/caseta/${r.id}`)}
      >
        <View style={styles.unitHeader}>
          <View>
            <View style={styles.row}>
              <Text style={styles.unitPlates}>{r.plates || 'S/P'}</Text>
              {isFull && <View style={styles.fullBadge}><Text style={styles.fullText}>FULL</Text></View>}
            </View>
            <Text style={styles.unitSub}>{r.entry?.chofer_nombre || 'S/N'}</Text>
            <Text style={styles.unitSub}>{r.entry?.compania_transporte || '-'}</Text>
          </View>
          <View style={[styles.statusDot, { backgroundColor: isInspected ? colors.success : colors.warning }]} />
        </View>
        <View style={styles.divider} />
        <ProcessTracker steps={steps} compact showLabels showShipping={showShipping} />
      </Pressable>
    );
  };

  const renderActivityItem = (a: any) => {
    const icon = getActivityIcon(a.type);
    const tone = a.status === 'malo' || a.type === 'rechazada' ? 'error' : (a.type === 'caseta' ? 'success' : 'info');
    const toneColor = tone === 'error' ? colors.error : tone === 'success' ? colors.success : colors.info;
    const toneSurface = tone === 'error' ? colors.errorSurface : tone === 'success' ? colors.successSurface : colors.infoSurface;

    return (
      <Pressable key={`${a.type}-${a.id}`} style={styles.activityCard} onPress={() => navigateToActivity(a)}>
        <View style={[styles.iconCircle, { backgroundColor: toneSurface }]}>
          {icon.family === 'mci' ? (
            <MaterialCommunityIcons name={icon.name} size={18} color={toneColor} />
          ) : (
            <Ionicons name={icon.name} size={16} color={toneColor} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitleText} numberOfLines={1}>{a.title}</Text>
          <Text style={styles.cardSubText} numberOfLines={1}>{a.subtitle}</Text>
          <Text style={styles.cardMetaText}>{formatTime(a.created_at)} · {a.user_name}</Text>
          {a.status === 'malo' && (
            <View style={[styles.miniBadge, { backgroundColor: colors.errorSurface }]}>
              <Text style={[styles.miniBadgeText, { color: colors.error }]}>{t('con_falla').toUpperCase()}</Text>
            </View>
          )}
        </View>
      </Pressable>
    );
  };

  const MainContent = (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.container, isDesktop && styles.containerWeb]}
      refreshControl={<RefreshControl refreshing={loadingActivities} onRefresh={refreshAll} tintColor={colors.brandPrimary} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.welcome}>{t('inicio')}</Text>
          <Text style={styles.date}>{new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase()}</Text>
        </View>
        <Pressable onPress={() => loadActivities(true)} hitSlop={8} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={18} color={colors.brandPrimary} />
        </Pressable>
      </View>

      <View style={styles.statsRow}>
        <KPIBox title="EN PATIO" value={inProcessUnits.length} icon="truck" color={colors.info} surface={colors.infoSurface} />
        <KPIBox title="FALLAS HOY" value={totalMalas} icon="alert-circle" color={colors.error} surface={colors.errorSurface} />
        <KPIBox title="APROBADAS" value={totalBuenas} icon="check-circle" color={colors.success} surface={colors.successSurface} />
      </View>

      <Text style={styles.sectionTitle}>{t('unidades_en_patio_activo').toUpperCase()}</Text>
      {inProcessUnits.length === 0 ? (
        <View style={styles.emptyInline}>
          <Ionicons name="checkmark-circle-outline" size={32} color={colors.mutedLight} style={{ marginBottom: 6 }} />
          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '600' }}>{t('no_hay_unidades_patio')}</Text>
        </View>
      ) : (
        <View style={styles.unitsGrid}>
          {inProcessUnits.map((r) => <UnitCard key={r.id} r={r} />)}
        </View>
      )}

      {!isDesktop && activities.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 40 }]}>{t('actividad_reciente').toUpperCase()}</Text>
          {activities.slice(0, 10).map(renderActivityItem)}
        </>
      )}
    </ScrollView>
  );

  const ActivitySidebar = (
    <View style={styles.activitySidebar}>
      <Text style={styles.sidebarTitle}>{t('actividad_reciente').toUpperCase()}</Text>
      <ScrollView showsVerticalScrollIndicator={false}>
        {activities.length === 0 ? (
          <Text style={{ color: colors.mutedLight, fontSize: 12 }}>{t('no_hay_unidades_patio')}</Text>
        ) : (
          activities.slice(0, 15).map(renderActivityItem)
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
              {isSyncing ? 'Sincronizando...' : `${pendingCount} registro(s) pendiente(s) de sincronizar`}
            </Text>
          </View>
        </Pressable>
      )}

      <View style={{ flex: 1, flexDirection: 'row' }}>
        {MainContent}
        {isDesktop && ActivitySidebar}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  mainScroll: { flex: 1 },
  desktopLayout: { flexDirection: 'row', padding: 32, gap: 32 },
  mobileLayout: { padding: 20 },

  contentArea: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
  welcome: { fontSize: 32, fontWeight: '900', color: colors.brandPrimary, letterSpacing: -0.5 },
  date: { fontSize: 10, fontWeight: '800', color: colors.muted, letterSpacing: 1, marginTop: 4 },

  statsRow: { flexDirection: 'row', gap: 20, marginBottom: 40 },
  statCard: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24,
    borderWidth: 1, borderColor: colors.border, ...shadows.sm
  },
  statHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  statTitle: { fontSize: 10, fontWeight: '900', color: colors.muted, letterSpacing: 1 },
  statIconWrap: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 32, fontWeight: '900', color: colors.onSurface },

  sectionTitle: { fontSize: 12, fontWeight: '900', color: colors.brandPrimary, marginBottom: 20, letterSpacing: 1.5 },
  unitsGrid: { gap: 16, flexDirection: 'row', flexWrap: 'wrap' },
  unitCard: {
    width: Platform.OS === 'web' ? '48%' : '100%',
    minWidth: 320,
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24,
    borderWidth: 1, borderColor: colors.border, ...shadows.xs
  },
  unitHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  unitPlates: { fontSize: 20, fontWeight: '900', color: colors.onSurface },
  unitSub: { fontSize: 12, color: colors.muted, marginTop: 2, fontWeight: '600' },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  fullBadge: { marginLeft: 8, backgroundColor: colors.warningSurface, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  fullText: { color: colors.onWarning, fontSize: 9, fontWeight: '900' },
  divider: { height: 1, backgroundColor: colors.divider, marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center' },

  activitySidebar: {
    width: 360, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 28,
    borderWidth: 1, borderColor: colors.border, alignSelf: 'flex-start',
    ...shadows.sm
  },
  sidebarTitle: { fontSize: 12, fontWeight: '900', color: colors.muted, marginBottom: 28, letterSpacing: 2 },
  activityCard: { flexDirection: 'row', gap: 16, marginBottom: 24 },
  iconCircle: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardTitleText: { fontSize: 14, fontWeight: '800', color: colors.onSurface },
  cardSubText: { fontSize: 12, color: colors.muted, marginTop: 2 },
  cardMetaText: { fontSize: 10, color: colors.muted, marginTop: 4, fontWeight: '700' },
  miniBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start', marginTop: 8 },
  miniBadgeText: { fontSize: 8, fontWeight: '900' },

  emptyInline: {
    alignItems: 'center', padding: 48, borderStyle: 'dashed', borderWidth: 1,
    borderColor: colors.borderStrong, borderRadius: 16, marginTop: spacing.md, backgroundColor: '#FFFFFF',
  },
  refreshBtn: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: colors.surfaceTertiary,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border
  }
});

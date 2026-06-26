import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl, Platform, FlatList, Image, Vibration } from 'react-native';
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
import ProcessTracker from '@/src/components/ProcessTracker';

import MainHeader from '@/src/components/MainHeader';

// UI Update: Professional Brand Header
export default function Inicio() {
  const { user, token } = useAuth();
  const { t } = useTranslation();
  const { inspections, allInspections, refresh: refreshInspections, loading: inspectionsLoading } = useInspections();
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
      const [actData, recData] = await Promise.all([
        apiCall<any[]>('/activities', { token }),
        // Buscamos todas las unidades que NO han salido (están en patio)
        apiCall<any[]>('/vehicle-records', { token })
      ]);

      const newActivities = Array.isArray(actData) ? actData : [];
      setActivities(newActivities);

      // Filtrar para dejar solo las que están en patio (entrada o inspeccionado)
      const active = (Array.isArray(recData) ? recData : []).filter(r => r.status !== 'salida');
      setInProcessUnits(active);

      if (!isInitial && newActivities.length > 0) {
        const latest = newActivities[0];
        if (latest.id !== lastActivityId) {
          setLastActivityId(latest.id);
          // Vibración fuerte para nuevas actividades
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Vibration.vibrate([0, 500, 100, 500]);
        }
      } else if (isInitial && newActivities.length > 0) {
        setLastActivityId(newActivities[0].id);
      }
    } catch (e) {
      setActivities([]);
    } finally {
      if (isInitial) setLoadingActivities(false);
    }
  }, [token, lastActivityId]);

  const refreshAll = async () => {
    await Promise.all([refreshInspections(), refreshNotifications(), loadActivities(true)]);
  };

  useEffect(() => {
    loadActivities(true);
    const interval = setInterval(() => loadActivities(false), 15000);
    return () => clearInterval(interval);
  }, [loadActivities]);

  const todayStr = new Date().toLocaleDateString('en-CA');
  const source = allInspections.length > 0 ? allInspections : inspections;
  const todayInspections = source.filter((i) => new Date(i.created_at).toLocaleDateString('en-CA') === todayStr);

  const totalBuenas = (todayInspections || []).filter((i) => i.status_general === 'bueno').length;
  const totalMalas = (todayInspections || []).filter((i) => i.status_general === 'malo').length;

  const getActivityIcon = (type: string): any => {
    switch (type) {
      case 'inspection': return 'clipboard';
      case 'caseta': return 'car-sport';
      case 'embarque': return 'cube';
      default: return 'radio-button-on';
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

  const renderActivity = ({ item: a }: { item: any }) => (
    <Pressable style={styles.activityCard} onPress={() => navigateToActivity(a)}>
      <View style={[styles.iconCircle, { backgroundColor: a.status === 'malo' || a.type === 'rechazada' ? colors.error : (a.type === 'caseta' ? colors.success : colors.info) }]}>
        <Ionicons name={getActivityIcon(a.type)} size={20} color="#FFF" />
      </View>
      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <Text style={styles.cardTitleText}>{a.title}</Text>
        <Text style={styles.cardSubText}>{a.subtitle}</Text>
        <Text style={styles.cardMetaText}>{formatTime(a.created_at)} • {a.user_name}</Text>
      </View>
      {a.status === 'malo' && <View style={styles.miniStatusBadgeError}><Text style={styles.miniStatusText}>CON FALLA</Text></View>}
      {a.status === 'bueno' && a.type === 'inspection' && <View style={styles.miniStatusBadgeSuccess}><Text style={styles.miniStatusText}>BUENO</Text></View>}
    </Pressable>
  );

  const ListHeader = () => (
    <>
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{todayInspections.length}</Text>
          <Text style={styles.statLabel}>HOY</Text>
        </View>
        <View style={[styles.statCard, { borderLeftWidth: 1, borderLeftColor: colors.border }]}>
          <Text style={[styles.statValue, { color: colors.success }]}>{totalBuenas}</Text>
          <Text style={styles.statLabel}>APROBADA</Text>
        </View>
        <View style={[styles.statCard, { borderLeftWidth: 1, borderLeftColor: colors.border }]}>
          <Text style={[styles.statValue, { color: colors.error }]}>{totalMalas}</Text>
          <Text style={styles.statLabel}>CON FALLAS</Text>
        </View>
      </View>

      <View style={styles.processHeader}>
        <Text style={styles.processTitle}>UNIDADES EN PATIO (ACTIVO)</Text>
        <Ionicons name="refresh-circle" size={24} color={colors.brandPrimary} onPress={() => loadActivities(true)} />
      </View>
    </>
  );

  const ListEmpty = () => (
    <View style={styles.emptyInline}>
      <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '700' }}>No hay unidades activas en patio</Text>
    </View>
  );

  const renderActiveUnit = ({ item: r }: { item: any }) => {
    const steps = {
      entry: true,
      inspection: !!r.inspection_id,
      shipping: !!r.has_shipping_ticket,
      exit: r.status === 'salida'
    };

    // Determine the primary status label
    let statusLabel = 'REGISTRADO';
    let statusColor = colors.info;

    if (r.status === 'inspeccionado') {
      statusLabel = 'INSPECCIONADO';
      statusColor = colors.success;
    } else if (r.has_shipping_ticket) {
      statusLabel = 'EN EMBARQUE';
      statusColor = colors.brandSecondary;
    }

    return (
      <Pressable
        key={`track-${r.id}`}
        style={styles.trackingCard}
        onPress={() => router.push(`/caseta/${r.id}`)}
      >
        <View style={styles.activeUnitLeft}>
          <View style={[styles.statusIndicator, { backgroundColor: statusColor }]} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.trackingTitle}>{r.entry.placas_unidad}</Text>
              <Text style={[styles.miniStatusText, { color: statusColor, fontWeight: '900' }]}>{statusLabel}</Text>
            </View>
            <Text style={styles.trackingSub}>{r.entry.chofer_nombre} • {r.entry.compania_transporte}</Text>
            <View style={{ marginTop: spacing.sm }}>
               <ProcessTracker steps={steps} compact />
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.border} />
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <MainHeader />
      <FlatList
        data={inProcessUnits}
        renderItem={renderActiveUnit}
        keyExtractor={(item) => `unit-${item.id}`}
        contentContainerStyle={styles.container}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        ListFooterComponent={() => (
           <>
             <Text style={[styles.sectionTitle, { marginTop: spacing.xl }]}>ACTIVIDAD RECIENTE (LOG)</Text>
             {activities.slice(0, 5).map((a) => (
                <Pressable key={`act-${a.id}-${a.type}`} style={[styles.activityCard, { opacity: 0.8 }]} onPress={() => navigateToActivity(a)}>
                  <View style={[styles.iconCircleSmall, { backgroundColor: a.status === 'malo' ? colors.error : colors.borderStrong }]}>
                    <Ionicons name={getActivityIcon(a.type)} size={14} color="#FFF" />
                  </View>
                  <View style={{ flex: 1, marginLeft: spacing.sm }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.onSurface }}>{a.title}</Text>
                    <Text style={{ fontSize: 10, color: colors.muted }}>{formatTime(a.created_at)} • {a.user_name}</Text>
                  </View>
                </Pressable>
             ))}
             <View style={{ height: 100 }} />
           </>
        )}
        refreshControl={
          <RefreshControl
            refreshing={inspectionsLoading || loadingActivities}
            onRefresh={refreshAll}
            tintColor={colors.brandPrimary}
          />
        }
      />
      <NotificationsPanel visible={showNotifs} onClose={() => setShowNotifs(false)} />
    </SafeAreaView>
  );
}


const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  container: { padding: spacing.md },
  statsRow: { flexDirection: 'row', backgroundColor: colors.surfaceSecondary, borderWidth: 2, borderColor: colors.borderStrong, padding: spacing.md, marginBottom: spacing.lg },
  statCard: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '900', color: colors.onSurface },
  statLabel: { fontSize: 9, fontWeight: '700', color: colors.muted, marginTop: 4 },
  sectionTitle: { fontSize: 11, fontWeight: '900', color: colors.onSurfaceTertiary, letterSpacing: 1.5, marginBottom: spacing.md, marginLeft: 4, textTransform: 'uppercase' },
  activityCard: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, padding: spacing.sm, marginBottom: 4, flexDirection: 'row', alignItems: 'center' },
  iconCircle: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  iconCircleSmall: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  cardTitleText: { fontSize: 14, fontWeight: '900', color: colors.onSurface },
  cardSubText: { fontSize: 12, color: colors.muted, marginTop: 2 },
  cardMetaText: { fontSize: 10, color: colors.muted, marginTop: 4 },
  miniStatusBadgeError: { backgroundColor: colors.error, paddingHorizontal: 6, paddingVertical: 2 },
  miniStatusBadgeSuccess: { backgroundColor: colors.success, paddingHorizontal: 6, paddingVertical: 2 },
  miniStatusText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
  processHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md, paddingHorizontal: 4 },
  processTitle: { fontSize: 13, fontWeight: '900', color: colors.onSurfaceTertiary, letterSpacing: 1.5 },
  timelineContainer: { paddingLeft: 10, marginBottom: spacing.xxl },
  trackingCard: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  activeUnitLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  statusIndicator: { width: 4, height: '100%', borderRadius: 2 },
  trackingTitle: { fontWeight: '900', fontSize: 16, color: colors.onSurface, letterSpacing: 0.5 },
  trackingSub: { fontSize: 11, color: colors.muted, marginTop: 2, fontWeight: '600' },
  emptyInline: { alignItems: 'center', padding: spacing.xl, borderStyle: 'dashed', borderWidth: 2, borderColor: colors.border, marginTop: spacing.md },
});

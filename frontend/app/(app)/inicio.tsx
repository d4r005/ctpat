import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl, Platform, FlatList, Image } from 'react-native';
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
        apiCall<any[]>('/vehicle-records?status=entrada', { token })
      ]);

      const newActivities = Array.isArray(actData) ? actData : [];
      setActivities(newActivities);
      setInProcessUnits(Array.isArray(recData) ? recData : []);

      if (!isInitial && newActivities.length > 0) {
        const latest = newActivities[0];
        if (latest.id !== lastActivityId) {
          setLastActivityId(latest.id);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
      <Text style={styles.sectionTitle}>ACTIVIDAD RECIENTE (TIEMPO REAL)</Text>
    </>
  );

  const ListFooter = () => (
    <>
      <View style={styles.processHeader}>
        <Text style={styles.processTitle}>Unidades en Seguimiento (Patio)</Text>
        <Ionicons name="refresh-circle" size={24} color={colors.brandPrimary} onPress={() => loadActivities(true)} />
      </View>

      {inProcessUnits.length === 0 ? (
        <View style={styles.emptyInline}>
          <Text style={{ color: colors.muted, fontSize: 12 }}>No hay unidades activas en patio</Text>
        </View>
      ) : (
        <View style={styles.timelineContainer}>
          {inProcessUnits.map((r) => {
            const steps = {
              entry: true,
              inspection: !!r.inspection_id,
              shipping: !!r.has_shipping_ticket,
              exit: r.status === 'salida'
            };
            return (
              <Pressable
                key={`track-${r.id}`}
                style={styles.trackingCard}
                onPress={() => router.push(`/caseta/${r.id}`)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.trackingTitle}>{r.entry.placas_unidad}</Text>
                  <Text style={styles.trackingSub}>{r.entry.chofer_nombre}</Text>
                </View>
                <ProcessTracker steps={steps} compact />
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={{ height: 40 }} />
    </>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <MainHeader />
      <FlatList
        data={activities.slice(0, 10)}
        renderItem={renderActivity}
        keyExtractor={(item) => `${item.type}-${item.id}`}
        contentContainerStyle={styles.container}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        refreshControl={
          <RefreshControl
            refreshing={inspectionsLoading || loadingActivities}
            onRefresh={refreshAll}
            tintColor={colors.brandPrimary}
          />
        }
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        windowSize={5}
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
  activityCard: { backgroundColor: colors.surfaceSecondary, borderWidth: 2, borderColor: colors.borderStrong, padding: spacing.md, marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center' },
  iconCircle: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  cardTitleText: { fontSize: 14, fontWeight: '900', color: colors.onSurface },
  cardSubText: { fontSize: 12, color: colors.muted, marginTop: 2 },
  cardMetaText: { fontSize: 10, color: colors.muted, marginTop: 4 },
  miniStatusBadgeError: { backgroundColor: colors.error, paddingHorizontal: 6, paddingVertical: 2 },
  miniStatusBadgeSuccess: { backgroundColor: colors.success, paddingHorizontal: 6, paddingVertical: 2 },
  miniStatusText: { color: '#FFF', fontSize: 8, fontWeight: '900' },
  processHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing.md, paddingHorizontal: 4 },
  processTitle: { fontSize: 16, fontWeight: '900', color: colors.onSurfaceTertiary, letterSpacing: 1 },
  timelineContainer: { paddingLeft: 10, marginBottom: spacing.xxl },
  timelineLine: { position: 'absolute', left: 14, top: 10, bottom: 20, width: 2, backgroundColor: colors.borderStrong },
  timelineItem: { flexDirection: 'row', alignItems: 'flex-start' },
  timelineDot: { width: 10, height: 10, marginTop: 6, zIndex: 1, borderWidth: 1, borderColor: colors.borderStrong },
  timelineTitle: { fontSize: 13, fontWeight: '700', color: colors.onSurface },
  timelineMeta: { fontSize: 11, color: colors.muted, marginTop: 2 },
  offlineBanner: { backgroundColor: colors.warning, padding: 4, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  offlineText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  trackingCard: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    padding: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md
  },
  trackingTitle: { fontWeight: '900', fontSize: 14, color: colors.onSurface },
  trackingSub: { fontSize: 11, color: colors.muted, marginTop: 2 },
  emptyInline: { alignItems: 'center', padding: spacing.xl, borderStyle: 'dashed', borderWidth: 2, borderColor: colors.border },
});

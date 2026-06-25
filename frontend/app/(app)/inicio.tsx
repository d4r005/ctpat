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

// UI Update: Professional Brand Header
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
      setPendingYardCount(yardData.filter((r: any) => !r.inspection_id && r.status === 'entrada').length);
      setPendingApprovCount(allInspections.filter(i => i.approval_status === 'pendiente').length);

      if (!isInitial && newActivities.length > 0) {
        const latest = newActivities[0];
        if (latest.id !== lastActivityId) {
          setLastActivityId(latest.id);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } else if (isInitial && newActivities.length > 0) {
        setLastActivityId(newActivities[0].id);
      }
      setActivities(newActivities);
    } catch (e) {
      setActivities([]);
    } finally {
      if (isInitial) setLoadingActivities(false);
    }
  }, [token, lastActivityId, allInspections]);

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

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.brandHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.brandLogo}>NAF</Text>
          <Text style={styles.brandSubtitle}>Sistema de Registro e Inspección de Unidades de Carga</Text>
        </View>
        <View style={styles.userContainer}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{user?.name?.charAt(0).toUpperCase() || 'D'}</Text>
            <View style={styles.onlineIndicator} />
          </View>
          <Text style={styles.onlineStatusText}>● ON LINE</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={inspectionsLoading || loadingActivities} onRefresh={refreshAll} tintColor={colors.brandPrimary} />}
      >
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

        {activities.slice(0, 8).map((a) => (
          <Pressable key={`${a.type}-${a.id}`} style={styles.activityCard} onPress={() => navigateToActivity(a)}>
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
        ))}

        <View style={styles.processHeader}>
          <Text style={styles.processTitle}>Flujo de Proceso</Text>
          <Ionicons name="chevron-up" size={20} color={colors.onSurface} />
        </View>

        <View style={styles.timelineContainer}>
          <View style={styles.timelineLine} />
          {activities.slice(0, 6).map((a) => (
            <View key={`timeline-${a.id}`} style={styles.timelineItem}>
              <View style={[styles.timelineDot, { backgroundColor: a.status === 'malo' ? colors.error : colors.success }]} />
              <View style={{ flex: 1, marginLeft: spacing.lg, paddingBottom: spacing.lg }}>
                <Text style={styles.timelineTitle}>{a.title}</Text>
                <Text style={styles.timelineMeta}>{formatTime(a.created_at)} • {a.user_name}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <NotificationsPanel visible={showNotifs} onClose={() => setShowNotifs(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F9FA' },
  brandHeader: { backgroundColor: colors.brandPrimary, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', paddingBottom: spacing.xl },
  brandLogo: { color: '#FFF', fontSize: 28, fontWeight: '900', letterSpacing: 2 },
  brandSubtitle: { color: '#FFF', fontSize: 10, opacity: 0.8, marginTop: 2 },
  userContainer: { alignItems: 'center' },
  avatarCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FFF' },
  avatarText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  onlineIndicator: { position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.success, borderWidth: 2, borderColor: colors.brandPrimary },
  onlineStatusText: { color: colors.success, fontSize: 8, fontWeight: '900', marginTop: 4 },
  container: { padding: spacing.md },
  statsRow: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 12, padding: spacing.md, marginBottom: spacing.lg, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
  statCard: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '900', color: colors.onSurface },
  statLabel: { fontSize: 9, fontWeight: '700', color: colors.muted, marginTop: 4 },
  sectionTitle: { fontSize: 11, fontWeight: '900', color: colors.onSurface, letterSpacing: 1, marginBottom: spacing.md, marginLeft: 4 },
  activityCard: { backgroundColor: '#FFF', borderRadius: 12, padding: spacing.md, marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', elevation: 1 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  cardTitleText: { fontSize: 14, fontWeight: '900', color: colors.onSurface },
  cardSubText: { fontSize: 12, color: colors.muted, marginTop: 2 },
  cardMetaText: { fontSize: 10, color: colors.muted, marginTop: 4 },
  miniStatusBadgeError: { backgroundColor: colors.error, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  miniStatusBadgeSuccess: { backgroundColor: colors.success, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  miniStatusText: { color: '#FFF', fontSize: 8, fontWeight: '900' },
  processHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing.md, paddingHorizontal: 4 },
  processTitle: { fontSize: 16, fontWeight: '900', color: colors.onSurface },
  timelineContainer: { paddingLeft: 10 },
  timelineLine: { position: 'absolute', left: 14, top: 10, bottom: 20, width: 2, backgroundColor: colors.border },
  timelineItem: { flexDirection: 'row', alignItems: 'flex-start' },
  timelineDot: { width: 10, height: 10, borderRadius: 5, marginTop: 6, zIndex: 1 },
  timelineTitle: { fontSize: 13, fontWeight: '700', color: colors.onSurface },
  timelineMeta: { fontSize: 11, color: colors.muted, marginTop: 2 },
  offlineBanner: { backgroundColor: colors.warning, padding: 4, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  offlineText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
});

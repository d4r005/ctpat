import React from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/src/context/AuthContext';
import { useInspections } from '@/src/context/InspectionContext';
import { colors, spacing, radius, typography } from '@/src/constants/theme';

export default function Inicio() {
  const { user } = useAuth();
  const { inspections, isOnline, pendingCount, refresh, loading } = useInspections();
  const router = useRouter();

  const today = new Date().toISOString().slice(0, 10);
  const todayInspections = inspections.filter((i) => i.created_at.slice(0, 10) === today);
  const totalBuenas = inspections.filter((i) => i.status_general === 'bueno').length;
  const totalMalas = inspections.filter((i) => i.status_general === 'malo').length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']} testID="inicio-screen">
      {!isOnline && (
        <View style={styles.offlineBanner} testID="offline-banner">
          <Ionicons name="cloud-offline" size={16} color={colors.onWarning} />
          <Text style={styles.offlineText}>MODO OFFLINE — Se sincronizará al reconectar</Text>
        </View>
      )}
      {pendingCount > 0 && (
        <View style={styles.pendingBanner} testID="pending-banner">
          <Ionicons name="cloud-upload" size={16} color={colors.onInfo} />
          <Text style={styles.pendingText}>{pendingCount} inspección(es) pendientes de sincronizar</Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.brandPrimary} />}
      >
        <View style={styles.header}>
          <Text style={styles.hello}>Hola, {user?.name?.split(' ')[0] || 'Inspector'}</Text>
          <Text style={styles.headerSub}>Inspección 19 Puntos NAF</Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{todayInspections.length}</Text>
            <Text style={styles.statLabel}>HOY</Text>
          </View>
          <View style={[styles.statCard, { borderLeftWidth: 0 }]}>
            <Text style={[styles.statValue, { color: colors.success }]}>{totalBuenas}</Text>
            <Text style={styles.statLabel}>APROBADAS</Text>
          </View>
          <View style={[styles.statCard, { borderLeftWidth: 0 }]}>
            <Text style={[styles.statValue, { color: colors.error }]}>{totalMalas}</Text>
            <Text style={styles.statLabel}>CON FALLAS</Text>
          </View>
        </View>

        <Pressable
          testID="inicio-nueva-button"
          style={({ pressed }) => [styles.fabBlock, pressed && { opacity: 0.9 }]}
          onPress={() => router.push('/(app)/nueva')}
        >
          <Ionicons name="add-circle" size={32} color={colors.onBrandSecondary} />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={styles.fabTitle}>NUEVA INSPECCIÓN</Text>
            <Text style={styles.fabSub}>Iniciar formato de 19 puntos</Text>
          </View>
          <Ionicons name="arrow-forward" size={24} color={colors.onBrandSecondary} />
        </Pressable>

        <Text style={styles.sectionTitle}>INSPECCIONES DE HOY</Text>
        {todayInspections.length === 0 ? (
          <View style={styles.emptyBox} testID="inicio-empty">
            <Ionicons name="clipboard-outline" size={48} color={colors.muted} />
            <Text style={styles.emptyText}>No hay inspecciones hoy</Text>
            <Text style={styles.emptySub}>Toca NUEVA INSPECCIÓN para iniciar</Text>
          </View>
        ) : (
          todayInspections.map((i) => (
            <Pressable
              key={i.id}
              testID={`inicio-inspection-${i.id}`}
              style={styles.listItem}
              onPress={() => router.push(`/inspection/${i.id}`)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.listTitle}>{i.placas_unidad || 'Sin placas'}</Text>
                <Text style={styles.listSub}>{i.compania_transportista} · {i.numero_trailer}</Text>
                <Text style={styles.listTime}>{new Date(i.created_at).toLocaleTimeString('es-MX')}</Text>
              </View>
              <View style={[styles.statusChip, { backgroundColor: i.status_general === 'bueno' ? colors.success : colors.error }]}>
                <Text style={styles.statusChipText}>{i.status_general === 'bueno' ? 'BUENO' : 'CON FALLA'}</Text>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
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
  header: { marginBottom: spacing.lg },
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

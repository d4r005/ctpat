import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { apiCall } from '@/src/api/client';
import { useAuth } from '@/src/context/AuthContext';
import { colors, spacing, typography } from '@/src/constants/theme';
import ProcessTracker from '@/src/components/ProcessTracker';

interface VehicleRecord {
  id: string;
  status: 'entrada' | 'inspeccionado' | 'salida';
  entry: any;
  exit: any;
  inspection_id?: string;
  created_at: string;
}

export default function Caseta() {
  const { token } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const [records, setRecords] = useState<VehicleRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const STATUS_LABEL: Record<string, { label: string; color: string }> = {
    entrada: { label: t('en_patio'), color: '#F59E0B' },
    inspeccionado: { label: t('inspeccionado'), color: '#0284C7' },
    salida: { label: t('salio'), color: '#16A34A' },
  };

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiCall<VehicleRecord[]>('/vehicle-records', { token });
      setRecords(data);
    } catch {} finally { setLoading(false); }
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pendingInspections = useMemo(() => {
    return records.filter(r => r.status === 'entrada' && !r.inspection_id);
  }, [records]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']} testID="caseta-screen">
      <View style={styles.header}>
        <Text style={styles.title}>{t('caseta')}</Text>
        <Text style={styles.subtitle}>{t('caseta_subtitle')}</Text>
      </View>

      <Pressable
        testID="caseta-new-btn"
        style={styles.fab}
        onPress={() => router.push('/caseta/nuevo')}
      >
        <Ionicons name="add-circle" size={32} color={colors.onBrandSecondary} />
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={styles.fabTitle}>{t('nuevo_registro_entrada')}</Text>
          <Text style={styles.fabSub}>{t('vehiculo_llegando')}</Text>
        </View>
        <Ionicons name="arrow-forward" size={24} color={colors.onBrandSecondary} />
      </Pressable>

      <FlatList
        data={records}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brandPrimary} />}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        ListHeaderComponent={
          <>
            {pendingInspections.length > 0 && (
              <View style={styles.pendingSection}>
                <Text style={styles.sectionTitle}>UNIDADES PENDIENTES DE INSPECCIÓN</Text>
                {pendingInspections.map((r: VehicleRecord) => (
                  <Pressable
                    key={r.id}
                    style={styles.pendingCard}
                    onPress={() => {
                      const params = new URLSearchParams({
                        record_id: r.id,
                        compania: r.entry.compania_transporte || '',
                        placas: r.entry.placas_unidad || '',
                        trailer: r.entry.numero_caja || '',
                        sello: r.entry.sello_entrada !== 'N/A' ? r.entry.sello_entrada : ''
                      });
                      router.push(`/(app)/nueva?${params.toString()}`);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pendingTitle}>{r.entry.placas_unidad}</Text>
                      <Text style={styles.pendingSub}>{r.entry.chofer_nombre} · {r.entry.compania_transporte}</Text>
                    </View>
                    <View style={styles.pendingBtn}>
                      <Text style={styles.pendingBtnText}>INSPECCIONAR</Text>
                    </View>
                  </Pressable>
                ))}
                <View style={{ height: spacing.xl }} />
              </View>
            )}
            {records.length > 0 ? <Text style={styles.sectionTitle}>{t('vehiculos_registrados')}</Text> : null}
          </>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} />
          ) : (
            <View style={styles.empty}>
              <Ionicons name="car-outline" size={48} color={colors.muted} />
              <Text style={styles.emptyText}>{t('sin_vehiculos')}</Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const st = STATUS_LABEL[item.status] || STATUS_LABEL.entrada;
          const steps = {
            entry: true,
            inspection: !!item.inspection_id,
            shipping: !!item.has_shipping_ticket,
            exit: item.status === 'salida'
          };

          return (
            <Pressable
              testID={`caseta-record-${item.id}`}
              style={styles.row}
              onPress={() => router.push(`/caseta/${item.id}`)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.entry.placas_unidad}</Text>
                <Text style={styles.rowSub}>{item.entry.chofer_nombre} · {item.entry.compania_transporte || '-'}</Text>
                <ProcessTracker steps={steps} compact />
                <Text style={styles.rowDate}>{new Date(item.entry.fecha_entrada || item.created_at).toLocaleString()}</Text>
              </View>
              <View style={[styles.statusChip, { backgroundColor: st.color }]}>
                <Text style={styles.statusChipText}>{st.label}</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { padding: spacing.lg, backgroundColor: colors.surfaceSecondary, borderBottomWidth: 2, borderBottomColor: colors.borderStrong },
  title: { fontSize: typography.sizes.xxl, fontWeight: '900', color: colors.onSurface },
  subtitle: { color: colors.muted, marginTop: 2 },
  fab: { backgroundColor: colors.brandSecondary, padding: spacing.lg, margin: spacing.lg, flexDirection: 'row', alignItems: 'center', minHeight: 80 },
  fabTitle: { color: colors.onBrandSecondary, fontWeight: '900', fontSize: typography.sizes.base, letterSpacing: 1 },
  fabSub: { color: colors.onBrandSecondary, fontSize: typography.sizes.sm, opacity: 0.8, marginTop: 2 },
  sectionTitle: { fontSize: 11, fontWeight: '900', color: colors.onSurfaceTertiary, letterSpacing: 1.5, marginBottom: spacing.md },
  empty: { alignItems: 'center', padding: spacing.xxxl, marginTop: spacing.xl },
  emptyText: { fontWeight: '700', color: colors.onSurfaceTertiary, marginTop: spacing.md },
  row: { backgroundColor: colors.surfaceSecondary, borderWidth: 2, borderColor: colors.borderStrong, padding: spacing.md, marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center' },
  rowTitle: { fontWeight: '900', fontSize: typography.sizes.lg, color: colors.onSurface },
  rowSub: { color: colors.muted, fontSize: typography.sizes.sm, marginTop: 2 },
  rowMeta: { color: colors.onSurfaceTertiary, fontSize: typography.sizes.sm, marginTop: 2 },
  rowDate: { color: colors.muted, fontSize: 11, marginTop: 4 },
  statusChip: { paddingHorizontal: spacing.sm, paddingVertical: 4 },
  statusChipText: { color: '#FFF', fontWeight: '900', fontSize: 10, letterSpacing: 1 },
  pendingSection: { marginBottom: spacing.sm },
  pendingCard: {
    backgroundColor: colors.brandPrimary,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  pendingTitle: { fontWeight: '900', fontSize: typography.sizes.lg, color: colors.onBrandPrimary },
  pendingSub: { color: colors.onBrandPrimary, opacity: 0.8, fontSize: typography.sizes.sm },
  pendingBtn: { backgroundColor: colors.brandSecondary, paddingHorizontal: spacing.md, paddingVertical: 6 },
  pendingBtnText: { color: colors.onBrandSecondary, fontWeight: '900', fontSize: 10 },
});

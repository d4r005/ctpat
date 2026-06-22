import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { apiCall } from '@/src/api/client';
import { useAuth } from '@/src/context/AuthContext';
import { colors, spacing, typography } from '@/src/constants/theme';

interface VehicleRecord {
  id: string;
  status: 'entrada' | 'inspeccionado' | 'salida';
  entry: any;
  exit: any;
  inspection_id?: string;
  created_at: string;
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  entrada: { label: 'EN PATIO', color: '#F59E0B' },
  inspeccionado: { label: 'INSPECCIONADO', color: '#0284C7' },
  salida: { label: 'SALIÓ', color: '#16A34A' },
};

export default function Caseta() {
  const { token } = useAuth();
  const router = useRouter();
  const [records, setRecords] = useState<VehicleRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiCall<VehicleRecord[]>('/vehicle-records', { token });
      setRecords(data);
    } catch {} finally { setLoading(false); }
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.safe} edges={['top']} testID="caseta-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Caseta</Text>
        <Text style={styles.subtitle}>Registro de entrada y salida de vehículos</Text>
      </View>

      <Pressable
        testID="caseta-new-btn"
        style={styles.fab}
        onPress={() => router.push('/caseta/nuevo')}
      >
        <Ionicons name="add-circle" size={32} color={colors.onBrandSecondary} />
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={styles.fabTitle}>NUEVO REGISTRO DE ENTRADA</Text>
          <Text style={styles.fabSub}>Vehículo llegando al patio</Text>
        </View>
        <Ionicons name="arrow-forward" size={24} color={colors.onBrandSecondary} />
      </Pressable>

      <FlatList
        data={records}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brandPrimary} />}
        ListHeaderComponent={
          records.length > 0 ? <Text style={styles.sectionTitle}>VEHÍCULOS REGISTRADOS</Text> : null
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} />
          ) : (
            <View style={styles.empty}>
              <Ionicons name="car-outline" size={48} color={colors.muted} />
              <Text style={styles.emptyText}>Sin vehículos registrados</Text>
              <Text style={styles.emptySub}>Toca "NUEVO REGISTRO DE ENTRADA"</Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const st = STATUS_LABEL[item.status] || STATUS_LABEL.entrada;
          return (
            <Pressable
              testID={`caseta-record-${item.id}`}
              style={styles.row}
              onPress={() => router.push(`/caseta/${item.id}`)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.entry.placas_unidad}</Text>
                <Text style={styles.rowSub}>{item.entry.chofer_nombre} · {item.entry.compania_transporte || '-'}</Text>
                <Text style={styles.rowMeta}>Tráiler: {item.entry.numero_caja || '-'} · Sello: {item.entry.sello_entrada || '-'}</Text>
                <Text style={styles.rowDate}>{new Date(item.entry.fecha_entrada || item.created_at).toLocaleString('es-MX')}</Text>
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
  emptySub: { color: colors.muted, fontSize: typography.sizes.sm, marginTop: 4 },
  row: { backgroundColor: colors.surfaceSecondary, borderWidth: 2, borderColor: colors.borderStrong, padding: spacing.md, marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center' },
  rowTitle: { fontWeight: '900', fontSize: typography.sizes.lg, color: colors.onSurface },
  rowSub: { color: colors.muted, fontSize: typography.sizes.sm, marginTop: 2 },
  rowMeta: { color: colors.onSurfaceTertiary, fontSize: typography.sizes.sm, marginTop: 2 },
  rowDate: { color: colors.muted, fontSize: 11, marginTop: 4 },
  statusChip: { paddingHorizontal: spacing.sm, paddingVertical: 4 },
  statusChipText: { color: '#FFF', fontWeight: '900', fontSize: 10, letterSpacing: 1 },
});

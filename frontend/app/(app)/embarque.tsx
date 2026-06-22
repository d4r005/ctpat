import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { apiCall } from '@/src/api/client';
import { useAuth } from '@/src/context/AuthContext';
import { colors, spacing, typography } from '@/src/constants/theme';

interface Ticket {
  id: string;
  almacenista: string;
  cliente: string;
  operador: string;
  placas_unidad: string;
  numero_caja: string;
  numero_sello: string;
  fecha: string;
  created_at: string;
}

export default function Embarque() {
  const { token } = useAuth();
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiCall<Ticket[]>('/shipping-tickets', { token });
      setTickets(data);
    } catch {} finally { setLoading(false); }
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.safe} edges={['top']} testID="embarque-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Tickets de Embarque</Text>
        <Text style={styles.subtitle}>Control de carga y despacho</Text>
      </View>

      <Pressable testID="embarque-new-btn" style={styles.fab} onPress={() => router.push('/embarque/nuevo')}>
        <Ionicons name="add-circle" size={32} color={colors.onBrandSecondary} />
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={styles.fabTitle}>NUEVO TICKET DE EMBARQUE</Text>
          <Text style={styles.fabSub}>Registrar carga y despacho</Text>
        </View>
        <Ionicons name="arrow-forward" size={24} color={colors.onBrandSecondary} />
      </Pressable>

      <FlatList
        data={tickets}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brandPrimary} />}
        ListHeaderComponent={tickets.length > 0 ? <Text style={styles.sectionTitle}>TICKETS RECIENTES</Text> : null}
        ListEmptyComponent={loading ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} /> : (
          <View style={styles.empty}>
            <Ionicons name="cube-outline" size={48} color={colors.muted} />
            <Text style={styles.emptyText}>Sin tickets registrados</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <Pressable testID={`embarque-item-${item.id}`} style={styles.row} onPress={() => router.push(`/embarque/${item.id}`)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{item.cliente || 'Sin cliente'}</Text>
              <Text style={styles.rowSub}>{item.operador} · {item.placas_unidad}</Text>
              <Text style={styles.rowMeta}>Caja: {item.numero_caja} · Sello: {item.numero_sello}</Text>
              <Text style={styles.rowDate}>{new Date(item.fecha || item.created_at).toLocaleString('es-MX')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color={colors.muted} />
          </Pressable>
        )}
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
  emptyText: { color: colors.muted, marginTop: spacing.md, fontWeight: '700' },
  row: { backgroundColor: colors.surfaceSecondary, borderWidth: 2, borderColor: colors.borderStrong, padding: spacing.md, marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center' },
  rowTitle: { fontWeight: '900', fontSize: typography.sizes.lg, color: colors.onSurface },
  rowSub: { color: colors.muted, fontSize: typography.sizes.sm, marginTop: 2 },
  rowMeta: { color: colors.onSurfaceTertiary, fontSize: typography.sizes.sm, marginTop: 2 },
  rowDate: { color: colors.muted, fontSize: 11, marginTop: 4 },
});

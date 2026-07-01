import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable,
  TextInput, RefreshControl, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useInspections } from '@/src/context/InspectionContext';
import { useAuth } from '@/src/context/AuthContext';
import { apiCall } from '@/src/api/client';
import { colors, spacing } from '@/src/constants/theme';
import ProcessTracker from '@/src/components/ProcessTracker';
import MainHeader from '@/src/components/MainHeader';
import { useTranslation } from 'react-i18next';

export default function CasetaList() {
  const router = useRouter();
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const { refresh } = useInspections();

  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'todos' | 'entrada' | 'inspeccionado' | 'salida'>('todos');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiCall<any[]>('/vehicle-records', { token });
      setRecords(Array.isArray(data) ? data : []);
    } catch { setRecords([]); }
    finally { setLoading(false); }
  }, [token]);

  React.useEffect(() => { load(); }, [load]);

  const norm = (s: string) => s?.replace(/[^A-Z0-9]/g, '').toUpperCase() || '';

  const filtered = records.filter(r => {
    if (filter !== 'todos' && r.status !== filter) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      r.entry?.placas_unidad?.toLowerCase().includes(q) ||
      r.entry?.chofer_nombre?.toLowerCase().includes(q) ||
      r.entry?.compania_transporte?.toLowerCase().includes(q)
    );
  });

  const isAdmin = user?.role === 'admin' || user?.role === 'supervisor' ||
    ['d.trujillo@brancoindustries.com', 'd4r005@gmail.com'].includes(user?.email || '');

  const renderItem = ({ item: r }: { item: any }) => {
    const isFull = r.entry?.tipo_unidad === 'full';
    const isDescarga = r.entry?.condicion_carga === 'descarga';
    const showShipping = !isFull && !isDescarga;

    const hasInspection = (r.inspection_ids?.length || 0) > 0 || !!r.inspection_id;
    const hasTicket = !!(r.has_shipping_ticket || r.shipping_ticket_id);

    const steps = {
      entry: true,
      inspection: hasInspection,
      shipping: hasTicket,
      exit: r.status === 'salida',
    };

    const statusColor =
      r.status === 'salida' ? colors.success :
      r.status === 'inspeccionado' ? colors.info :
      colors.warning;

    const statusLabel =
      r.status === 'salida' ? 'SALIÓ' :
      r.status === 'inspeccionado' ? 'INSPECCIONADO' : 'EN PATIO';

    return (
      <Pressable
        style={styles.card}
        onPress={() => router.push(`/caseta/${r.id}`)}
      >
        <View style={{ flex: 1 }}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>
              {r.entry?.placas_unidad || 'S/P'} {isFull ? '(FULL)' : ''}
            </Text>
            <View style={[styles.badge, { backgroundColor: statusColor }]}>
              <Text style={styles.badgeText}>{statusLabel}</Text>
            </View>
          </View>
          <Text style={styles.cardSub}>
            {r.entry?.chofer_nombre || '-'} · {r.entry?.compania_transporte || '-'}
          </Text>
          <View style={{ marginVertical: 8 }}>
            <ProcessTracker steps={steps} compact showShipping={showShipping} showLabels />
          </View>
          <Text style={styles.cardMeta}>
            {r.entry?.fecha_entrada ? new Date(r.entry.fecha_entrada).toLocaleString('es-MX') : new Date(r.created_at).toLocaleString('es-MX')}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.muted} />
      </Pressable>
    );
  };

  const FILTERS: Array<{ key: typeof filter; label: string }> = [
    { key: 'todos', label: 'TODOS' },
    { key: 'entrada', label: 'EN PATIO' },
    { key: 'inspeccionado', label: 'INSPECCIONADO' },
    { key: 'salida', label: 'SALIÓ' },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <MainHeader
        title="NAF"
        subtitle="CASETA: REGISTRO DE MOVIMIENTOS"
        rightAction={isAdmin ? {
          icon: 'add-circle',
          onPress: () => router.push('/caseta/nuevo'),
        } : undefined}
      />

      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Placas, chofer, compañía..."
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={setQuery}
        />
        {query ? (
          <Pressable onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map(f => (
          <Pressable
            key={f.key}
            style={[styles.chip, filter === f.key && styles.chipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={filtered}
        renderItem={renderItem}
        keyExtractor={r => r.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brandPrimary} />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons name="business-outline" size={48} color={colors.muted} />
              <Text style={styles.emptyText}>{t('sin_registros')}</Text>
            </View>
          ) : null
        }
      />

      {/* FAB para nuevo registro de caseta */}
      <Pressable
        style={styles.fab}
        onPress={() => router.push('/caseta/nuevo')}
      >
        <Ionicons name="add" size={28} color="#FFF" />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: spacing.md, paddingVertical: 10,
    backgroundColor: colors.surfaceSecondary,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  searchInput: { flex: 1, color: colors.onSurface, fontSize: 14, fontWeight: '600' },
  filterRow: {
    flexDirection: 'row', gap: 6, paddingHorizontal: spacing.md,
    paddingVertical: 8, backgroundColor: colors.surfaceSecondary,
    borderBottomWidth: 2, borderBottomColor: colors.borderStrong,
  },
  chip: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1.5, borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { fontWeight: '900', fontSize: 9, color: colors.onSurface, letterSpacing: 0.5 },
  chipTextActive: { color: '#FFF' },
  list: { padding: spacing.md, paddingBottom: 90 },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 2, borderColor: colors.borderStrong,
    padding: spacing.md, marginBottom: spacing.sm,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '900', color: colors.onSurface, flex: 1 },
  cardSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  cardMeta: { fontSize: 10, color: colors.muted, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { color: '#FFF', fontWeight: '900', fontSize: 9, letterSpacing: 0.5 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: colors.muted, fontWeight: '700', marginTop: 12 },
  fab: {
    position: 'absolute', bottom: 24, right: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.brandPrimary,
    alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: '#000', shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 3 }, shadowRadius: 6,
  },
});

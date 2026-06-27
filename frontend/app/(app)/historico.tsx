import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useInspections } from '@/src/context/InspectionContext';
import { useAuth } from '@/src/context/AuthContext';
import { apiCall } from '@/src/api/client';
import { colors, spacing, typography } from '@/src/constants/theme';
import ProcessTracker from '@/src/components/ProcessTracker';
import MainHeader from '@/src/components/MainHeader';

type Filter = 'todos' | 'bueno' | 'malo';

export default function Historico() {
  const router = useRouter();
  const { t } = useTranslation();
  const { inspections, refresh, loading, token } = useInspections();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('todos');
  const [records, setRecords] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);

  const fetchExtra = useCallback(async () => {
    if (!token) return;
    try {
      const [r, tick] = await Promise.all([
        apiCall<any[]>('/vehicle-records', { token }),
        apiCall<any[]>('/shipping-tickets', { token })
      ]);
      setRecords(r);
      setTickets(tick);
    } catch {}
  }, [token]);

  React.useEffect(() => {
    fetchExtra();
  }, [fetchExtra]);

  const refreshAll = async () => {
    await Promise.all([refresh(), fetchExtra()]);
  };

  const filtered = useMemo(() => {
    return inspections.filter((i) => {
      if (filter !== 'todos' && i.status_general !== filter) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        i.placas_unidad?.toLowerCase().includes(q) ||
        i.compania_transportista?.toLowerCase().includes(q) ||
        i.numero_trailer?.toLowerCase().includes(q) ||
        i.numero_precinto?.toLowerCase().includes(q)
      );
    });
  }, [inspections, query, filter]);

  const renderItem = ({ item }: { item: any }) => {
    const relatedRecord = records.find(r =>
      (r.inspection_id === item.id) ||
      (r.inspection_ids && r.inspection_ids.includes(item.id)) ||
      (r.entry.placas_unidad === item.placas_unidad)
    );
    const hasTicket = tickets.some(t => t.placas_unidad === item.placas_unidad);

    const isFull = relatedRecord?.entry?.tipo_unidad === 'full';
    const isDescarga = relatedRecord?.entry?.condicion_carga === 'descarga';
    const showShipping = !isFull && !isDescarga;

    const steps = {
      entry: !!relatedRecord,
      inspection: true,
      shipping: hasTicket,
      exit: relatedRecord?.status === 'salida'
    };

    return (
      <Pressable
        key={item.id}
        testID={`historico-item-${item.id}`}
        style={styles.activityCard}
        onPress={() => router.push(`/inspection/${item.id}`)}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitleText}>{item.placas_unidad || t('sin_placas')} {isFull ? '(FULL)' : ''}</Text>
          <Text style={styles.cardSubText}>{item.compania_transportista}</Text>
          <View style={{ marginVertical: 6 }}>
            <ProcessTracker steps={steps} compact showShipping={showShipping} />
          </View>
          <Text style={styles.cardMetaText}>{new Date(item.created_at).toLocaleString()}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          {item._pending && (
            <View style={styles.pendingChip}>
              <Text style={styles.pendingChipText}>{t('pend')}</Text>
            </View>
          )}
          <View style={[styles.statusBadge, { backgroundColor: item.status_general === 'bueno' ? colors.success : colors.error }]}>
            <Text style={styles.statusBadgeText}>{item.status_general === 'bueno' ? t('bueno').toUpperCase() : t('falla').toUpperCase()}</Text>
          </View>
        </View>
      </Pressable>
    );
  };

  const ListHeader = () => (
    <>
      <View style={styles.searchRow}>
        <TextInput
          testID="historico-search-input"
          style={styles.searchInput}
          placeholder={t('buscar_placeholder')}
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={setQuery}
        />
        <Ionicons name="search" size={20} color={colors.muted} />
      </View>

      <View style={styles.chipsRow}>
        {(['todos', 'bueno', 'malo'] as Filter[]).map((f) => (
          <Pressable
            key={f}
            testID={`historico-filter-${f}`}
            onPress={() => setFilter(f)}
            style={[styles.chip, filter === f && styles.chipActive]}
          >
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>
              {f === 'todos' ? t('todos').toUpperCase() : f === 'bueno' ? t('bueno').toUpperCase() : t('falla').toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionTitle}>{t('inspeccion').toUpperCase()}</Text>
    </>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <MainHeader title="NAF" subtitle={`${t('historico').toUpperCase()}: ${t('archivo_digital') || 'ARCHIVO DIGITAL'}`} />

      <FlatList
        data={filtered}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.container}
        ListHeaderComponent={ListHeader}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refreshAll} tintColor={colors.brandPrimary} />}
        ListEmptyComponent={!loading ? (
          <View style={styles.emptyBox}>
            <Ionicons name="clipboard-outline" size={48} color={colors.muted} />
            <Text style={styles.emptyText}>{t('sin_resultados_inspecciones')}</Text>
          </View>
        ) : null}
        initialNumToRender={10}
      />
    </SafeAreaView>
  );
}


const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  container: { padding: spacing.md },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 12,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    marginTop: -20,
    marginHorizontal: spacing.sm,
  },
  searchInput: { flex: 1, height: 48, color: colors.onSurface, fontSize: 14, fontWeight: '700' },
  chipsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  chip: { borderWidth: 2, borderColor: colors.borderStrong, paddingHorizontal: spacing.md, paddingVertical: 6, flexShrink: 0, backgroundColor: colors.surfaceSecondary },
  chipActive: { backgroundColor: colors.brandPrimary },
  chipText: { fontWeight: '900', fontSize: 11, color: colors.onSurface, letterSpacing: 1 },
  chipTextActive: { color: colors.onBrandPrimary },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.onSurfaceTertiary,
    letterSpacing: 1.5,
    marginBottom: spacing.md,
    marginLeft: 4,
    marginTop: spacing.xl,
    textTransform: 'uppercase',
  },
  activityCard: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    padding: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardTitleText: { fontSize: 16, fontWeight: '900', color: colors.onSurface },
  cardSubText: { fontSize: 13, color: colors.muted, marginTop: 2 },
  cardMetaText: { fontSize: 10, color: colors.muted, marginTop: 4 },
  statusBadge: { paddingHorizontal: spacing.sm, paddingVertical: 4 },
  statusBadgeText: { color: '#FFF', fontWeight: '900', fontSize: 10, letterSpacing: 1 },
  pendingChip: { backgroundColor: colors.info, paddingHorizontal: spacing.sm, paddingVertical: 2, marginBottom: 4 },
  pendingChipText: { color: '#FFF', fontWeight: '900', fontSize: 9, letterSpacing: 1 },
  emptyBox: { alignItems: 'center', padding: spacing.xxxl, marginTop: spacing.xl },
  emptyText: { fontWeight: '700', color: colors.muted, marginTop: spacing.md },
});

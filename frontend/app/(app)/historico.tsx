import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, RefreshControl, Platform, useWindowDimensions } from 'react-native';
import { useIsTablet } from '@/src/hooks/useIsTablet';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useInspections } from '@/src/context/InspectionContext';
import { useAuth } from '@/src/context/AuthContext';
import { supabase } from '@/src/api/supabase';
import { colors, spacing, radius, shadows } from '@/src/constants/theme';
import ProcessTracker from '@/src/components/ProcessTracker';
import MainHeader from '@/src/components/MainHeader';

const isWeb = Platform.OS === 'web';
type Filter = 'todos' | 'bueno' | 'malo';

export default function Historico() {
  const router = useRouter();
  const { t } = useTranslation();
  const { inspections, refresh, loading, token } = useInspections();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = isWeb && width >= 1080;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('todos');
  const [records, setRecords] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);

  const fetchExtra = useCallback(async () => {
    if (!token) return;
    try {
      const [recsRes, ticksRes] = await Promise.all([
        supabase.from('vehicle_records').select('*'),
        supabase.from('shipping_tickets').select('*')
      ]);
      if (recsRes.data) setRecords(recsRes.data.map(r => ({ ...r, entry: r.entry_data, exit: r.exit_data })));
      if (ticksRes.data) setTickets(ticksRes.data.map(tk => ({ ...tk, ...tk.data })));
    } catch (e) { console.error("Error fetching extra data:", e); }
  }, [token]);

  React.useEffect(() => { fetchExtra(); }, [fetchExtra]);

  const refreshAll = async () => { await Promise.all([refresh(), fetchExtra()]); };

  const filtered = useMemo(() => {
    return inspections.filter((i) => {
      if (filter !== 'todos' && i.status_general !== filter) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        i.plates?.toLowerCase().includes(q) ||
        i.compania_transportista?.toLowerCase().includes(q) ||
        i.numero_trailer?.toLowerCase().includes(q) ||
        i.numero_precinto?.toLowerCase().includes(q)
      );
    });
  }, [inspections, query, filter]);

  const normalize = (s: string) => s?.replace(/[^A-Z0-9]/g, '').toUpperCase() || '';

  // ── Desktop table row ──
  const renderTableRow = ({ item, index }: { item: any; index: number }) => {
    const inspPlates = normalize(item.plates);
    const relatedRecord = records.find(r =>
      (r.inspection_id === item.id) ||
      (r.inspection_ids && r.inspection_ids.includes(item.id)) ||
      normalize(r.entry?.placas_unidad) === inspPlates
    );
    const hasTicket = !!(relatedRecord?.has_shipping_ticket || relatedRecord?.shipping_ticket_id ||
      tickets.some((t: any) => normalize(t.placas_unidad) === inspPlates));
    const isFull = relatedRecord?.entry?.tipo_unidad === 'full';
    const isDescarga = relatedRecord?.entry?.condicion_carga === 'descarga';
    const showShipping = !isFull && !isDescarga;
    const inspCount = Math.max(relatedRecord?.inspection_ids?.length || 0, 1);
    const inspComplete = isFull ? inspCount >= 2 : true;
    const steps = { entry: !!relatedRecord, inspection: inspComplete, shipping: hasTicket, exit: relatedRecord?.status === 'salida' };
    const isGood = item.status_general === 'bueno';
    const statusColor = isGood ? colors.success : colors.error;
    const statusSurface = isGood ? colors.successSurface : colors.errorSurface;

    return (
      <Pressable
        style={({ pressed }) => [styles.tableRow, index % 2 === 1 && styles.tableRowAlt, pressed && styles.tableRowHover]}
        onPress={() => router.push(`/inspection/${item.id}`)}
      >
        <View style={[styles.tableCell, { flex: 1.2 }]}>
          <Text style={styles.tablePlate}>{item.plates || t('sin_placas')}{isFull ? ' (FULL)' : ''}</Text>
          {item._pending && <View style={styles.pendingChip}><Text style={styles.pendingChipText}>PEND</Text></View>}
        </View>
        <View style={[styles.tableCell, { flex: 1.5 }]}>
          <Text style={styles.tableText} numberOfLines={1}>{item.compania_transportista || '—'}</Text>
        </View>
        <View style={[styles.tableCell, { flex: 1.5 }]}>
          <ProcessTracker steps={steps} compact showShipping={showShipping} />
        </View>
        <View style={[styles.tableCell, { flex: 1 }]}>
          <View style={[styles.statusBadge, { backgroundColor: statusSurface }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{isGood ? t('bueno').toUpperCase() : t('falla').toUpperCase()}</Text>
          </View>
        </View>
        <View style={[styles.tableCell, { flex: 1.2 }]}>
          <Text style={styles.tableMeta}>{new Date(item.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' })}</Text>
        </View>
        <View style={[styles.tableCell, { flex: 0.3, alignItems: 'flex-end' }]}>
          <Ionicons name="chevron-forward" size={16} color={colors.mutedLight} />
        </View>
      </Pressable>
    );
  };

  // ── Mobile card ──
  const renderCard = ({ item }: { item: any }) => {
    const inspPlates = normalize(item.plates);
    const relatedRecord = records.find(r =>
      (r.inspection_id === item.id) || (r.inspection_ids && r.inspection_ids.includes(item.id)) ||
      normalize(r.entry?.placas_unidad) === inspPlates
    );
    const hasTicket = !!(relatedRecord?.has_shipping_ticket || relatedRecord?.shipping_ticket_id ||
      tickets.some((t: any) => normalize(t.placas_unidad) === inspPlates));
    const isFull = relatedRecord?.entry?.tipo_unidad === 'full';
    const isDescarga = relatedRecord?.entry?.condicion_carga === 'descarga';
    const showShipping = !isFull && !isDescarga;
    const inspCount = Math.max(relatedRecord?.inspection_ids?.length || 0, 1);
    const inspComplete = isFull ? inspCount >= 2 : true;
    const steps = { entry: !!relatedRecord, inspection: inspComplete, shipping: hasTicket, exit: relatedRecord?.status === 'salida' };
    const isGood = item.status_general === 'bueno';

    return (
      <Pressable style={styles.card} onPress={() => router.push(`/inspection/${item.id}`)}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{item.plates || t('sin_placas')} {isFull ? '(FULL)' : ''}</Text>
          <Text style={styles.cardSub}>{item.compania_transportista}</Text>
          <View style={{ marginVertical: 8 }}>
            <ProcessTracker steps={steps} compact showShipping={showShipping} />
          </View>
          <Text style={styles.cardMeta}>{new Date(item.created_at).toLocaleString()}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          {item._pending && <View style={styles.pendingChip}><Text style={styles.pendingChipText}>{t('pend')}</Text></View>}
          <View style={[styles.badge, { backgroundColor: isGood ? colors.success : colors.error }]}>
            <Text style={styles.badgeText}>{isGood ? t('bueno').toUpperCase() : t('falla').toUpperCase()}</Text>
          </View>
        </View>
      </Pressable>
    );
  };

  const FILTERS: Array<{ key: Filter; label: string }> = [
    { key: 'todos', label: t('todos').toUpperCase() },
    { key: 'bueno', label: t('bueno').toUpperCase() },
    { key: 'malo', label: t('falla').toUpperCase() },
  ];

  const TableHeader = () => (
    <View style={styles.tableHeader}>
      <Text style={[styles.tableHeaderText, { flex: 1.2 }]}>PLACAS</Text>
      <Text style={[styles.tableHeaderText, { flex: 1.5 }]}>COMPAÑÍA</Text>
      <Text style={[styles.tableHeaderText, { flex: 1.5 }]}>PROGRESO</Text>
      <Text style={[styles.tableHeaderText, { flex: 1 }]}>ESTADO</Text>
      <Text style={[styles.tableHeaderText, { flex: 1.2 }]}>FECHA</Text>
      <View style={{ flex: 0.3 }} />
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <MainHeader title="NAF" subtitle={`${t('historico').toUpperCase()}: ${t('archivo_digital') || 'ARCHIVO DIGITAL'}`} />

      <View style={[styles.toolbar, isDesktop && styles.toolbarWeb]}>
        <View style={[styles.searchWrap, isDesktop && styles.searchWrapWeb]}>
          <Ionicons name="search" size={18} color={colors.mutedLight} />
          <TextInput
            testID="historico-search-input"
            style={styles.searchInput}
            placeholder={t('buscar_placeholder')}
            placeholderTextColor={colors.mutedLight}
            value={query}
            onChangeText={setQuery}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.mutedLight} />
            </Pressable>
          ) : null}
        </View>
        <View style={styles.filterRow}>
          {FILTERS.map(f => (
            <Pressable
              key={f.key}
              testID={`historico-filter-${f.key}`}
              style={[styles.chip, filter === f.key && styles.chipActive]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>{f.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {isDesktop ? (
        <View style={styles.tableContainer}>
          <View style={styles.tableCard}>
            <TableHeader />
            <FlatList
              data={filtered}
              renderItem={renderTableRow}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: spacing.xl }}
              refreshControl={<RefreshControl refreshing={loading} onRefresh={refreshAll} tintColor={colors.brandPrimary} />}
              ListEmptyComponent={!loading ? (
                <View style={styles.empty}>
                  <Ionicons name="clipboard-outline" size={40} color={colors.mutedLight} />
                  <Text style={styles.emptyText}>{t('sin_resultados_inspecciones')}</Text>
                </View>
              ) : null}
              initialNumToRender={10}
            />
          </View>
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refreshAll} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={!loading ? (
            <View style={styles.empty}>
              <Ionicons name="clipboard-outline" size={48} color={colors.mutedLight} />
              <Text style={styles.emptyText}>{t('sin_resultados_inspecciones')}</Text>
            </View>
          ) : null}
          initialNumToRender={10}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  toolbar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: spacing.md, paddingVertical: 10,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  toolbarWeb: { paddingHorizontal: 32, paddingVertical: 16, gap: 12 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  searchWrapWeb: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, paddingHorizontal: 14, height: 40, maxWidth: 340, flexGrow: 0,
  },
  searchInput: { flex: 1, color: colors.onSurface, fontSize: 14, fontWeight: '500' },
  filterRow: { flexDirection: 'row', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: '#FFFFFF', borderRadius: 999 },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { fontWeight: '700', fontSize: 10, color: colors.mutedDark, letterSpacing: 0.5 },
  chipTextActive: { color: '#FFFFFF' },

  // ── Desktop table ──
  tableContainer: { flex: 1, paddingHorizontal: 32, paddingTop: 24 },
  tableCard: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...shadows.sm },
  tableHeader: {
    flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12,
    backgroundColor: colors.surfaceTertiary, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  tableHeaderText: { fontSize: 10, fontWeight: '800', color: colors.muted, letterSpacing: 1 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.divider },
  tableRowAlt: { backgroundColor: colors.surfaceTertiary },
  tableRowHover: { backgroundColor: '#F1F5F9' },
  tableCell: { justifyContent: 'center' },
  tablePlate: { fontSize: 14, fontWeight: '800', color: colors.onSurface },
  tableText: { fontSize: 13, color: colors.onSurfaceTertiary, fontWeight: '500' },
  tableMeta: { fontSize: 12, color: colors.muted },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, alignSelf: 'flex-start' },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  pendingChip: { backgroundColor: colors.info, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 4, alignSelf: 'flex-start' },
  pendingChipText: { color: '#FFFFFF', fontWeight: '800', fontSize: 8, letterSpacing: 1 },

  // ── Mobile ──
  list: { padding: spacing.md, paddingBottom: 90 },
  card: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: spacing.md, marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', ...shadows.sm },
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.onSurface },
  cardSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  cardMeta: { fontSize: 10, color: colors.muted, marginTop: 4 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginTop: 4 },
  badgeText: { color: '#FFFFFF', fontWeight: '800', fontSize: 10, letterSpacing: 0.5 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: colors.muted, fontWeight: '600', marginTop: 12, fontSize: 14 },
});

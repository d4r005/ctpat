import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable,
  TextInput, RefreshControl, Platform, useWindowDimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useInspections } from '@/src/context/InspectionContext';
import { useAuth } from '@/src/context/AuthContext';
import { supabase } from '@/src/api/supabase';
import { colors, spacing, radius, shadows } from '@/src/constants/theme';
import ProcessTracker from '@/src/components/ProcessTracker';
import MainHeader from '@/src/components/MainHeader';
import { useTranslation } from 'react-i18next';

const isWeb = Platform.OS === 'web';

export default function CasetaList() {
  const router = useRouter();
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const { refresh } = useInspections();
  const { width } = useWindowDimensions();
  const isDesktop = isWeb && width >= 1080;

  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'todos' | 'activo' | 'salida'>('activo');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('vehicle_records')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const mapped = (data || []).map(r => ({
        ...r,
        plates: r.plates,
        entry: r.entry_data,
        exit: r.exit_data,
        status: r.exit_data ? 'salida' : (r.inspection_id ? 'inspeccionado' : 'entrada')
      }));
      setRecords(mapped);
    } catch (e) {
      console.error("Error loading vehicle records:", e);
      setRecords([]);
    } finally { setLoading(false); }
  }, [token]);

  React.useEffect(() => { load(); }, [load]);

  const filtered = records.filter(r => {
    if (filter === 'activo' && r.status === 'salida') return false;
    if (filter === 'salida' && r.status !== 'salida') return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      r.plates?.toLowerCase().includes(q) || r.entry?.placas_unidad?.toLowerCase().includes(q) ||
      r.entry?.chofer_nombre?.toLowerCase().includes(q) ||
      r.entry?.compania_transporte?.toLowerCase().includes(q)
    );
  });

  const isAdmin = user?.role === 'admin' || user?.role === 'supervisor' ||
    ['d.trujillo@brancoindustries.com', 'd4r005@gmail.com'].includes(user?.email || '');

  const getStatus = (r: any) => {
    const map = {
      salida: { color: colors.success, surface: colors.successSurface, label: t('salio').toUpperCase() },
      inspeccionado: { color: colors.info, surface: colors.infoSurface, label: t('inspeccionado').toUpperCase() },
      entrada: { color: colors.warning, surface: colors.warningSurface, label: t('en_patio').toUpperCase() },
    };
    return map[r.status as keyof typeof map] || map.entrada;
  };

  // ── Desktop: premium data table ──
  const renderTableRow = ({ item: r, index }: { item: any; index: number }) => {
    const isFull = r.entry?.tipo_unidad === 'full';
    const isDescarga = r.entry?.condicion_carga === 'descarga';
    const showShipping = !isFull && !isDescarga;
    const hasInspection = (r.inspection_ids?.length || 0) > 0 || !!r.inspection_id;
    const hasTicket = !!(r.has_shipping_ticket || r.shipping_ticket_id);
    const steps = { entry: true, inspection: hasInspection, shipping: hasTicket, exit: r.status === 'salida' };
    const { color, surface, label } = getStatus(r);

    return (
      <Pressable
        style={({ pressed }) => [styles.tableRow, index % 2 === 1 && styles.tableRowAlt, pressed && styles.tableRowHover]}
        onPress={() => router.push(`/caseta/${r.id}`)}
      >
        <View style={[styles.tableCell, { flex: 1.2 }]}>
          <Text style={styles.tablePlate}>{r.plates || r.entry?.placas_unidad || 'S/P'}{isFull ? ' (FULL)' : ''}</Text>
        </View>
        <View style={[styles.tableCell, { flex: 1.4 }]}>
          <Text style={styles.tableText} numberOfLines={1}>{r.entry?.chofer_nombre || '—'}</Text>
        </View>
        <View style={[styles.tableCell, { flex: 1.4 }]}>
          <Text style={styles.tableText} numberOfLines={1}>{r.entry?.compania_transporte || '—'}</Text>
        </View>
        <View style={[styles.tableCell, { flex: 1.6 }]}>
          <ProcessTracker steps={steps} compact showShipping={showShipping} />
        </View>
        <View style={[styles.tableCell, { flex: 1 }]}>
          <View style={[styles.statusBadge, { backgroundColor: surface }]}>
            <View style={[styles.statusDot, { backgroundColor: color }]} />
            <Text style={[styles.statusText, { color }]}>{label}</Text>
          </View>
        </View>
        <View style={[styles.tableCell, { flex: 1.3 }]}>
          <Text style={styles.tableMeta}>
            {(() => {
              const d = r.entry?.fecha_entrada || r.created_at;
              return d ? new Date(d).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
            })()}
          </Text>
        </View>
        <View style={[styles.tableCell, { flex: 0.3, alignItems: 'flex-end' }]}>
          <Ionicons name="chevron-forward" size={16} color={colors.mutedLight} />
        </View>
      </Pressable>
    );
  };

  // ── Mobile: card ──
  const renderCard = ({ item: r }: { item: any }) => {
    const isFull = r.entry?.tipo_unidad === 'full';
    const isDescarga = r.entry?.condicion_carga === 'descarga';
    const showShipping = !isFull && !isDescarga;
    const hasInspection = (r.inspection_ids?.length || 0) > 0 || !!r.inspection_id;
    const hasTicket = !!(r.has_shipping_ticket || r.shipping_ticket_id);
    const steps = { entry: true, inspection: hasInspection, shipping: hasTicket, exit: r.status === 'salida' };
    const { color, label } = getStatus(r);

    return (
      <Pressable style={styles.card} onPress={() => router.push(`/caseta/${r.id}`)}>
        <View style={{ flex: 1 }}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{r.plates || r.entry?.placas_unidad || 'S/P'}{isFull ? ' (FULL)' : ''}</Text>
            <View style={[styles.badge, { backgroundColor: color }]}>
              <Text style={styles.badgeText}>{label}</Text>
            </View>
          </View>
          <Text style={styles.cardSub}>{r.entry?.chofer_nombre || '—'} · {r.entry?.compania_transporte || '—'}</Text>
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
    { key: 'activo', label: t('en_patio').toUpperCase() },
    { key: 'salida', label: t('salio').toUpperCase() },
    { key: 'todos', label: t('todos').toUpperCase() },
  ];

  const TableHeader = () => (
    <View style={styles.tableHeader}>
      <Text style={[styles.tableHeaderText, { flex: 1.2 }]}>PLACAS</Text>
      <Text style={[styles.tableHeaderText, { flex: 1.4 }]}>CHOFER</Text>
      <Text style={[styles.tableHeaderText, { flex: 1.4 }]}>COMPAÑÍA</Text>
      <Text style={[styles.tableHeaderText, { flex: 1.6 }]}>PROGRESO</Text>
      <Text style={[styles.tableHeaderText, { flex: 1 }]}>ESTADO</Text>
      <Text style={[styles.tableHeaderText, { flex: 1.3 }]}>FECHA</Text>
      <View style={{ flex: 0.3 }} />
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <MainHeader
        title="NAF"
        subtitle={`${t('caseta').toUpperCase()}: ${t('registro_movimientos').toUpperCase()}`}
        rightAction={isAdmin ? { icon: 'add-circle', onPress: () => router.push('/caseta/nuevo') } : undefined}
      />

      <View style={[styles.toolbar, isDesktop && styles.toolbarWeb]}>
        <View style={[styles.searchWrap, isDesktop && styles.searchWrapWeb]}>
          <Ionicons name="search" size={18} color={colors.mutedLight} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('buscar_placeholder_caseta')}
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
              style={[styles.chip, filter === f.key && styles.chipActive]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>{f.label}</Text>
            </Pressable>
          ))}
        </View>

        {isDesktop && isAdmin && (
          <Pressable style={styles.newBtnWeb} onPress={() => router.push('/caseta/nuevo')}>
            <Ionicons name="add" size={18} color="#FFFFFF" />
            <Text style={styles.newBtnWebText}>Nuevo Registro</Text>
          </Pressable>
        )}
      </View>

      {isDesktop ? (
        <View style={styles.tableContainer}>
          <View style={styles.tableCard}>
            <TableHeader />
            <FlatList
              data={filtered}
              renderItem={renderTableRow}
              keyExtractor={r => r.id}
              contentContainerStyle={{ paddingBottom: spacing.xl }}
              refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brandPrimary} />}
              ListEmptyComponent={
                !loading ? (
                  <View style={styles.empty}>
                    <Ionicons name="business-outline" size={40} color={colors.mutedLight} />
                    <Text style={styles.emptyText}>{t('sin_registros')}</Text>
                  </View>
                ) : null
              }
            />
          </View>
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderCard}
          keyExtractor={r => r.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.empty}>
                <Ionicons name="business-outline" size={48} color={colors.mutedLight} />
                <Text style={styles.emptyText}>{t('sin_registros')}</Text>
              </View>
            ) : null
          }
        />
      )}

      {!isDesktop && (
        <Pressable style={styles.fab} onPress={() => router.push('/caseta/nuevo')}>
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  toolbar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: spacing.md, paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: colors.border,
    flexWrap: 'wrap',
    zIndex: 10,
  },
  toolbarWeb: { paddingHorizontal: 32, paddingVertical: 18 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    flex: 1, minWidth: 200,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: 12, paddingHorizontal: 16, height: 44,
  },
  searchWrapWeb: {
    maxWidth: 360, flexGrow: 0,
  },
  searchInput: { flex: 1, color: colors.onSurface, fontSize: 14, fontWeight: '600' },
  filterRow: { flexDirection: 'row', gap: 8 },
  chip: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: '#FFFFFF', borderRadius: 12,
    ...shadows.xs,
  },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { fontWeight: '700', fontSize: 12, color: colors.mutedDark, letterSpacing: 0.5 },
  chipTextActive: { color: '#FFFFFF', fontWeight: '800' },
  newBtnWeb: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.brandPrimary, paddingHorizontal: 20, height: 44,
    borderRadius: 12, marginLeft: 'auto', ...shadows.sm,
  },
  newBtnWebText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },

  // ── Desktop table ──
  tableContainer: { flex: 1, paddingHorizontal: 32, paddingTop: 24 },
  tableCard: {
    backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden', ...shadows.sm,
  },
  tableHeader: {
    flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12,
    backgroundColor: colors.surfaceTertiary, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  tableHeaderText: { fontSize: 10, fontWeight: '800', color: colors.muted, letterSpacing: 1 },
  tableRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  tableRowAlt: { backgroundColor: colors.surfaceTertiary },
  tableRowHover: { backgroundColor: '#F1F5F9' },
  tableCell: { justifyContent: 'center' },
  tablePlate: { fontSize: 14, fontWeight: '800', color: colors.onSurface, letterSpacing: 0.3 },
  tableText: { fontSize: 13, color: colors.onSurfaceTertiary, fontWeight: '500' },
  tableMeta: { fontSize: 12, color: colors.muted },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, alignSelf: 'flex-start',
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },

  // ── Mobile ──
  list: { padding: spacing.md, paddingBottom: 90 },
  card: {
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    padding: spacing.md, marginBottom: spacing.sm,
    flexDirection: 'row', alignItems: 'center', gap: 8, ...shadows.sm,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.onSurface, flex: 1 },
  cardSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  cardMeta: { fontSize: 10, color: colors.muted, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { color: '#FFFFFF', fontWeight: '800', fontSize: 9, letterSpacing: 0.5 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: colors.muted, fontWeight: '600', marginTop: 12, fontSize: 14 },
  fab: {
    position: 'absolute', bottom: 24, right: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.brandPrimary,
    alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: '#000', shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 3 }, shadowRadius: 6,
  },
});

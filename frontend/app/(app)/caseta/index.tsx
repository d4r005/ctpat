import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable,
  TextInput, RefreshControl, ActivityIndicator, Platform, useWindowDimensions
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
        entry: r.entry_data,
        exit: r.exit_data,
        status: r.exit_data ? 'salida' : (r.inspection_id ? 'inspeccionado' : 'entrada')
      }));
      setRecords(mapped);
    } catch (e) {
      console.error("Error loading vehicle records:", e);
      setRecords([]);
    }
    finally { setLoading(false); }
  }, [token]);

  React.useEffect(() => { load(); }, [load]);

  const norm = (s: string) => s?.replace(/[^A-Z0-9]/g, '').toUpperCase() || '';

  const filtered = records.filter(r => {
    if (filter === 'activo' && r.status === 'salida') return false;
    if (filter === 'salida' && r.status !== 'salida') return false;

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

  const getStatus = (r: any) => {
    const statusColor =
      r.status === 'salida' ? colors.success :
      r.status === 'inspeccionado' ? colors.info :
      colors.warning;
    const statusSurface =
      r.status === 'salida' ? colors.successSurface :
      r.status === 'inspeccionado' ? colors.infoSurface :
      colors.warningSurface;
    const statusLabel =
      r.status === 'salida' ? t('salio').toUpperCase() :
      r.status === 'inspeccionado' ? t('inspeccionado').toUpperCase() : t('en_patio').toUpperCase();
    return { statusColor, statusSurface, statusLabel };
  };

  // ── Desktop: data table row ──
  const renderTableRow = ({ item: r }: { item: any }) => {
    const isFull = r.entry?.tipo_unidad === 'full';
    const isDescarga = r.entry?.condicion_carga === 'descarga';
    const showShipping = !isFull && !isDescarga;
    const hasInspection = (r.inspection_ids?.length || 0) > 0 || !!r.inspection_id;
    const hasTicket = !!(r.has_shipping_ticket || r.shipping_ticket_id);
    const steps = { entry: true, inspection: hasInspection, shipping: hasTicket, exit: r.status === 'salida' };
    const { statusColor, statusSurface, statusLabel } = getStatus(r);

    return (
      <Pressable style={({ pressed }) => [styles.tableRow, pressed && { backgroundColor: colors.surfaceTertiary }]} onPress={() => router.push(`/caseta/${r.id}`)}>
        <View style={[styles.tableCell, { flex: 1.2 }]}>
          <Text style={styles.tablePlate}>{r.entry?.placas_unidad || 'S/P'} {isFull ? '(FULL)' : ''}</Text>
        </View>
        <View style={[styles.tableCell, { flex: 1.4 }]}>
          <Text style={styles.tableText} numberOfLines={1}>{r.entry?.chofer_nombre || '-'}</Text>
        </View>
        <View style={[styles.tableCell, { flex: 1.4 }]}>
          <Text style={styles.tableText} numberOfLines={1}>{r.entry?.compania_transporte || '-'}</Text>
        </View>
        <View style={[styles.tableCell, { flex: 1.6 }]}>
          <ProcessTracker steps={steps} compact showShipping={showShipping} />
        </View>
        <View style={[styles.tableCell, { flex: 1.1, alignItems: 'flex-start' }]}>
          <View style={[styles.tableBadge, { backgroundColor: statusSurface }]}>
            <View style={[styles.tableBadgeDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.tableBadgeText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>
        <View style={[styles.tableCell, { flex: 1.3 }]}>
          <Text style={styles.tableMeta}>
            {r.entry?.fecha_entrada ? new Date(r.entry.fecha_entrada).toLocaleString('es-MX') : new Date(r.created_at).toLocaleString('es-MX')}
          </Text>
        </View>
        <View style={[styles.tableCell, { flex: 0.4, alignItems: 'flex-end' }]}>
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
    const { statusColor, statusLabel } = getStatus(r);

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
    { key: 'activo', label: t('en_patio').toUpperCase() },
    { key: 'salida', label: t('salio').toUpperCase() },
    { key: 'todos', label: t('todos').toUpperCase() },
  ];

  const TableHeader = () => (
    <View style={styles.tableHeaderRow}>
      <Text style={[styles.tableHeaderText, { flex: 1.2 }]}>{t('placas') || 'PLACAS'}</Text>
      <Text style={[styles.tableHeaderText, { flex: 1.4 }]}>{t('chofer') || 'CHOFER'}</Text>
      <Text style={[styles.tableHeaderText, { flex: 1.4 }]}>{t('compania') || 'COMPAÑÍA'}</Text>
      <Text style={[styles.tableHeaderText, { flex: 1.6 }]}>{t('progreso') || 'PROGRESO'}</Text>
      <Text style={[styles.tableHeaderText, { flex: 1.1 }]}>{t('estado') || 'ESTADO'}</Text>
      <Text style={[styles.tableHeaderText, { flex: 1.3 }]}>{t('fecha') || 'FECHA'}</Text>
      <View style={{ flex: 0.4 }} />
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <MainHeader
        title="NAF"
        subtitle={`${t('caseta').toUpperCase()}: ${t('registro_movimientos').toUpperCase()}`}
        rightAction={isAdmin ? {
          icon: 'add-circle',
          onPress: () => router.push('/caseta/nuevo'),
        } : undefined}
      />

      <View style={[styles.toolbar, isDesktop && styles.toolbarWeb]}>
        <View style={[styles.searchRow, isDesktop && styles.searchRowWeb]}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('buscar_placeholder_caseta')}
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

        {isDesktop && isAdmin && (
          <Pressable style={styles.newBtnWeb} onPress={() => router.push('/caseta/nuevo')}>
            <Ionicons name="add" size={18} color={colors.onBrandPrimary} />
            <Text style={styles.newBtnWebText}>{t('nuevo_registro') || 'Nuevo Registro'}</Text>
          </Pressable>
        )}
      </View>

      {isDesktop ? (
        <View style={styles.tableWrap}>
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
                  <Ionicons name="business-outline" size={40} color={colors.muted} />
                  <Text style={styles.emptyText}>{t('sin_registros')}</Text>
                </View>
              ) : null
            }
          />
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderCard}
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
      )}

      {!isDesktop && (
        <Pressable
          style={styles.fab}
          onPress={() => router.push('/caseta/nuevo')}
        >
          <Ionicons name="add" size={28} color="#FFF" />
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  toolbar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: spacing.md, paddingVertical: 10,
    backgroundColor: colors.surfaceSecondary,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    flexWrap: 'wrap',
  },
  toolbarWeb: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    flex: 1,
  },
  searchRowWeb: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingHorizontal: spacing.md,
    height: 40,
    maxWidth: 320,
    flexGrow: 0,
  },
  searchInput: { flex: 1, color: colors.onSurface, fontSize: 14, fontWeight: '600' },
  filterRow: {
    flexDirection: 'row', gap: 6,
  },
  chip: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1.5, borderColor: colors.borderStrong,
    backgroundColor: colors.surface, borderRadius: radius.pill,
  },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { fontWeight: '900', fontSize: 9, color: colors.onSurface, letterSpacing: 0.5 },
  chipTextActive: { color: '#FFF' },
  newBtnWeb: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.md, height: 40,
    borderRadius: radius.md, marginLeft: 'auto',
  },
  newBtnWebText: { color: colors.onBrandPrimary, fontWeight: '800', fontSize: 12 },

  // Table (desktop)
  tableWrap: { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  tableHeaderRow: {
    flexDirection: 'row', paddingHorizontal: spacing.md, paddingBottom: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.borderStrong,
  },
  tableHeaderText: { fontSize: 10, fontWeight: '800', color: colors.muted, letterSpacing: 0.6 },
  tableRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.divider, backgroundColor: colors.surfaceSecondary,
  },
  tableCell: { justifyContent: 'center' },
  tablePlate: { fontSize: 14, fontWeight: '800', color: colors.onSurface },
  tableText: { fontSize: 13, color: colors.onSurfaceTertiary, fontWeight: '500' },
  tableMeta: { fontSize: 12, color: colors.muted },
  tableBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill,
  },
  tableBadgeDot: { width: 6, height: 6, borderRadius: 3 },
  tableBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },

  // List (mobile)
  list: { padding: spacing.md, paddingBottom: 90 },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.sm,
    flexDirection: 'row', alignItems: 'center', gap: 8, ...shadows.sm,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '900', color: colors.onSurface, flex: 1 },
  cardSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  cardMeta: { fontSize: 10, color: colors.muted, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
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

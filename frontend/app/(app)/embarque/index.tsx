import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable,
  TextInput, RefreshControl, Platform, useWindowDimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/src/context/AuthContext';
import { supabase } from '@/src/api/supabase';
import { colors, spacing, radius, shadows } from '@/src/constants/theme';
import MainHeader from '@/src/components/MainHeader';
import { useTranslation } from 'react-i18next';

const isWeb = Platform.OS === 'web';

export default function EmbarqueList() {
  const router = useRouter();
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = isWeb && width >= 1080;

  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      // El guardia de embarque ahora ve tanto los tickets ya creados como las
      // unidades en patio que requieren un ticket.
      // Quitamos el filtro status=inspeccionado del backend para capturar
      // unidades que tengan inspeccion pero el status no haya cambiado.
      const [ticketsRes, recordsRes] = await Promise.all([
        supabase.from('shipping_tickets').select('*').order('created_at', { ascending: false }),
        supabase.from('vehicle_records').select('*').order('created_at', { ascending: false })
      ]);

      const tickets = (ticketsRes.data || []).map(t => ({
        ...t.data,
        id: t.id,
        created_at: t.created_at
      }));

      const allUnits = (recordsRes.data || []).map(r => ({
        ...r.entry_data,
        id: r.id,
        created_at: r.created_at,
        status: r.status,
        entry: r.entry_data,
        exit: r.exit_data,
        inspection_id: r.inspection_id,
        inspection_ids: r.inspection_ids
      }));

      const existingRecordsIds = new Set(tickets.map(t => t.record_id));

      // Convertimos las unidades pendientes al formato de la lista
      // Una unidad está pendiente de ticket si:
      // 1. Está en patio (status != salida)
      // 2. Tiene al menos una inspección (r.inspection_id o r.inspection_ids)
      // 3. No tiene ticket aún
      // FIX: solo mostrar como 'POR CREAR' las unidades del día de hoy
      // Para no mezclar días distintos en el panel de embarque
      const todayDate = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
      const virtualTickets = allUnits
        .filter(u => {
          const unitDate = u.created_at ? new Date(u.created_at).toLocaleDateString('en-CA') : null;
          return (
            u.status !== 'salida' &&
            (u.inspection_id || (u.inspection_ids?.length > 0)) &&
            !existingRecordsIds.has(u.id) &&
            u.entry?.condicion_carga !== 'descarga' &&
            unitDate === todayDate  // solo pendientes de HOY
          );
        })
        .map(u => ({
          id: `new-${u.id}`,
          record_id: u.id,
          placas_unidad: u.entry?.placas_unidad,
          cliente: u.entry?.descripcion_carga || 'PENDIENTE',
          linea_transporte: u.entry?.compania_transporte,
          numero_caja: u.entry?.numero_caja,
          created_at: u.created_at,
          is_virtual: true
        }));

      setTickets([...virtualTickets, ...(Array.isArray(tickets) ? tickets : [])]);
    } catch { setTickets([]); }
    finally { setLoading(false); }
  }, [token]);

  React.useEffect(() => { load(); }, [load]);

  const filtered = tickets.filter(tk => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      tk.placas_unidad?.toLowerCase().includes(q) ||
      tk.cliente?.toLowerCase().includes(q) ||
      tk.operador?.toLowerCase().includes(q) ||
      tk.almacenista?.toLowerCase().includes(q) ||
      tk.linea_transporte?.toLowerCase().includes(q)
    );
  });

  const goToItem = (tk: any) => {
    if (tk.is_virtual) {
      router.push(`/embarque/nuevo?record_id=${tk.record_id}`);
    } else {
      router.push(`/embarque/${tk.id}`);
    }
  };

  // ── Desktop: data table row ──
  const renderTableRow = ({ item: tk }: { item: any }) => {
    const hasGuardia = !!tk.firma_guardia || !!tk.nombre_guardia;
    const hasAlmacenista = !!tk.firma_almacenista || !!tk.almacenista;
    const isComplete = hasGuardia && hasAlmacenista;
    const isVirtual = !!tk.is_virtual;
    const statusColor = isVirtual ? colors.info : (isComplete ? colors.success : colors.warning);
    const statusSurface = isVirtual ? colors.infoSurface : (isComplete ? colors.successSurface : colors.warningSurface);
    const statusLabel = isVirtual ? (t('por_crear') || 'POR CREAR') : (isComplete ? t('completo') : t('en_proceso'));

    return (
      <Pressable style={({ pressed }) => [styles.tableRow, pressed && { backgroundColor: colors.surfaceTertiary }]} onPress={() => goToItem(tk)}>
        <View style={[styles.tableCell, { flex: 1 }]}>
          <Text style={styles.tablePlate}>{tk.placas_unidad || 'S/P'}</Text>
        </View>
        <View style={[styles.tableCell, { flex: 1.4 }]}>
          <Text style={styles.tableText} numberOfLines={1}>{tk.cliente || '-'}</Text>
        </View>
        <View style={[styles.tableCell, { flex: 1.4 }]}>
          <Text style={styles.tableText} numberOfLines={1}>{tk.linea_transporte || '-'}</Text>
        </View>
        <View style={[styles.tableCell, { flex: 0.8 }]}>
          <Text style={styles.tableText}>{tk.numero_caja || '-'}</Text>
        </View>
        <View style={[styles.tableCell, { flex: 0.8 }]}>
          <Text style={styles.tableText}>{tk.numero_sello || '-'}</Text>
        </View>
        <View style={[styles.tableCell, { flex: 1.2, flexDirection: 'row', gap: 10 }]}>
          <View style={styles.sigChip}>
            <Ionicons name={hasAlmacenista ? 'checkmark-circle' : 'ellipse-outline'} size={13} color={hasAlmacenista ? colors.success : colors.mutedLight} />
            <Text style={[styles.sigText, { color: hasAlmacenista ? colors.success : colors.mutedLight }]}>{t('almacenista')}</Text>
          </View>
          <View style={styles.sigChip}>
            <Ionicons name={hasGuardia ? 'checkmark-circle' : 'ellipse-outline'} size={13} color={hasGuardia ? colors.success : colors.mutedLight} />
            <Text style={[styles.sigText, { color: hasGuardia ? colors.success : colors.mutedLight }]}>{t('guardia')}</Text>
          </View>
        </View>
        <View style={[styles.tableCell, { flex: 1, alignItems: 'flex-start' }]}>
          <View style={[styles.tableBadge, { backgroundColor: statusSurface }]}>
            <View style={[styles.tableBadgeDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.tableBadgeText, { color: statusColor }]}>{statusLabel.toString().toUpperCase()}</Text>
          </View>
        </View>
        <View style={[styles.tableCell, { flex: 1.1 }]}>
          <Text style={styles.tableMeta}>{tk.created_at ? new Date(tk.created_at).toLocaleString('es-MX') : '-'}</Text>
        </View>
        <View style={[styles.tableCell, { flex: 0.3, alignItems: 'flex-end' }]}>
          <Ionicons name="chevron-forward" size={16} color={colors.mutedLight} />
        </View>
      </Pressable>
    );
  };

  // ── Mobile: card ──
  const renderCard = ({ item: tk }: { item: any }) => {
    const hasGuardia = !!tk.firma_guardia || !!tk.nombre_guardia;
    const hasAlmacenista = !!tk.firma_almacenista || !!tk.almacenista;
    const isComplete = hasGuardia && hasAlmacenista;
    const isVirtual = !!tk.is_virtual;

    return (
      <Pressable
        style={[styles.card, isVirtual && { borderStyle: 'dashed', borderColor: colors.info }]}
        onPress={() => goToItem(tk)}
      >
        <View style={{ flex: 1 }}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{tk.placas_unidad || 'S/P'}</Text>
            <View style={[styles.badge, { backgroundColor: isVirtual ? colors.info : (isComplete ? colors.success : colors.warning) }]}>
              <Text style={styles.badgeText}>
                {isVirtual ? 'POR CREAR' : (isComplete ? t('completo').toUpperCase() : t('en_proceso').toUpperCase())}
              </Text>
            </View>
          </View>

          <Text style={styles.cardSub}>
            {tk.cliente || '-'} · {tk.linea_transporte || '-'}
          </Text>

          <View style={styles.detailRow}>
            <View style={styles.detailItem}>
              <Ionicons name="bus-outline" size={12} color={colors.muted} />
              <Text style={styles.detailText}>{t('caja')}: {tk.numero_caja || '-'}</Text>
            </View>
            <View style={styles.detailItem}>
              <Ionicons name="lock-closed-outline" size={12} color={colors.muted} />
              <Text style={styles.detailText}>{t('sello')}: {tk.numero_sello || '-'}</Text>
            </View>
            <View style={styles.detailItem}>
              <Ionicons name="layers-outline" size={12} color={colors.muted} />
              <Text style={styles.detailText}>{t('pallets')}: {tk.numero_pallets || '-'}</Text>
            </View>
          </View>

          <View style={styles.sigRow}>
            <View style={styles.sigChip}>
              <Ionicons
                name={hasAlmacenista ? 'checkmark-circle' : 'ellipse-outline'}
                size={12}
                color={hasAlmacenista ? colors.success : colors.muted}
              />
              <Text style={[styles.sigText, { color: hasAlmacenista ? colors.success : colors.muted }]}>
                {t('almacenista')}
              </Text>
            </View>
            <View style={styles.sigChip}>
              <Ionicons
                name={hasGuardia ? 'checkmark-circle' : 'ellipse-outline'}
                size={12}
                color={hasGuardia ? colors.success : colors.muted}
              />
              <Text style={[styles.sigText, { color: hasGuardia ? colors.success : colors.muted }]}>
                {t('guardia')}
              </Text>
            </View>
          </View>

          <Text style={styles.cardMeta}>
            {tk.created_at ? new Date(tk.created_at).toLocaleString('es-MX') : '-'}
            {tk.almacenista ? ` · ${tk.almacenista}` : ''}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.muted} />
      </Pressable>
    );
  };

  const StatsBar = () => (
    <View style={[styles.statsBar, isDesktop && styles.statsBarWeb]}>
      <View style={[styles.stat, isDesktop && styles.statWeb]}>
        <Text style={styles.statNum}>{tickets.length}</Text>
        <Text style={styles.statLabel}>{t('total').toUpperCase()}</Text>
      </View>
      <View style={[styles.stat, isDesktop && styles.statWeb]}>
        <Text style={[styles.statNum, { color: colors.info }]}>
          {tickets.filter(tk => !!tk.is_virtual).length}
        </Text>
        <Text style={styles.statLabel}>{t('por_crear').toUpperCase()}</Text>
      </View>
      <View style={[styles.stat, isDesktop && styles.statWeb]}>
        <Text style={[styles.statNum, { color: colors.warning }]}>
          {tickets.filter(tk => !tk.is_virtual && (!tk.firma_guardia || !tk.almacenista)).length}
        </Text>
        <Text style={styles.statLabel}>{t('en_proceso').toUpperCase()}</Text>
      </View>
      <View style={[styles.stat, isDesktop && styles.statWeb]}>
        <Text style={[styles.statNum, { color: colors.success }]}>
          {tickets.filter(tk => !tk.is_virtual && (!!tk.firma_guardia && !!tk.almacenista)).length}
        </Text>
        <Text style={styles.statLabel}>{t('realizados').toUpperCase()}</Text>
      </View>
    </View>
  );

  const TableHeader = () => (
    <View style={styles.tableHeaderRow}>
      <Text style={[styles.tableHeaderText, { flex: 1 }]}>{t('placas') || 'PLACAS'}</Text>
      <Text style={[styles.tableHeaderText, { flex: 1.4 }]}>{t('cliente') || 'CLIENTE'}</Text>
      <Text style={[styles.tableHeaderText, { flex: 1.4 }]}>{t('linea_transporte') || 'LÍNEA'}</Text>
      <Text style={[styles.tableHeaderText, { flex: 0.8 }]}>{t('caja') || 'CAJA'}</Text>
      <Text style={[styles.tableHeaderText, { flex: 0.8 }]}>{t('sello') || 'SELLO'}</Text>
      <Text style={[styles.tableHeaderText, { flex: 1.2 }]}>{t('firma') || 'FIRMAS'}</Text>
      <Text style={[styles.tableHeaderText, { flex: 1 }]}>{t('estado') || 'ESTADO'}</Text>
      <Text style={[styles.tableHeaderText, { flex: 1.1 }]}>{t('fecha') || 'FECHA'}</Text>
      <View style={{ flex: 0.3 }} />
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <MainHeader
        title="NAF"
        subtitle={`${t('embarque').toUpperCase()}: ${t('tickets_embarque').toUpperCase()}`}
        rightAction={isDesktop ? undefined : undefined}
      />

      <View style={[styles.toolbar, isDesktop && styles.toolbarWeb]}>
        <View style={[styles.searchRow, isDesktop && styles.searchRowWeb]}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('buscar_placeholder_embarque')}
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

        {isDesktop && (
          <Pressable style={styles.newBtnWeb} onPress={() => router.push('/embarque/nuevo')}>
            <Ionicons name="add" size={18} color={colors.onBrandPrimary} />
            <Text style={styles.newBtnWebText}>{t('nuevo_ticket') || 'Nuevo Ticket'}</Text>
          </Pressable>
        )}
      </View>

      <StatsBar />

      {isDesktop ? (
        <View style={styles.tableWrap}>
          <TableHeader />
          <FlatList
            data={filtered}
            renderItem={renderTableRow}
            keyExtractor={tk => tk.id}
            contentContainerStyle={{ paddingBottom: spacing.xl }}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brandPrimary} />}
            ListEmptyComponent={
              !loading ? (
                <View style={styles.empty}>
                  <Ionicons name="bus-outline" size={40} color={colors.muted} />
                  <Text style={styles.emptyText}>{t('sin_tickets_embarque')}</Text>
                </View>
              ) : null
            }
          />
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderCard}
          keyExtractor={tk => tk.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brandPrimary} />
          }
          ListEmptyComponent={
            !loading ? (
              <View style={styles.empty}>
                <Ionicons name="bus-outline" size={48} color={colors.muted} />
                <Text style={styles.emptyText}>{t('sin_tickets_embarque')}</Text>
              </View>
            ) : null
          }
        />
      )}

      {!isDesktop && (
        <Pressable
          style={styles.fab}
          onPress={() => router.push('/embarque/nuevo')}
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
  },
  toolbarWeb: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1,
  },
  searchRowWeb: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.input, paddingHorizontal: spacing.md, height: 40,
    maxWidth: 320, flexGrow: 0,
  },
  searchInput: { flex: 1, color: colors.onSurface, fontSize: 14, fontWeight: '600' },
  newBtnWeb: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.md, height: 40,
    borderRadius: radius.md, marginLeft: 'auto',
  },
  newBtnWebText: { color: colors.onBrandPrimary, fontWeight: '800', fontSize: 12 },
  statsBar: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSecondary,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    paddingVertical: 8,
  },
  statsBarWeb: {
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md, gap: spacing.md,
  },
  stat: { flex: 1, alignItems: 'center' },
  statWeb: {
    alignItems: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.md, ...shadows.sm,
  },
  statNum: { fontSize: 18, fontWeight: '900', color: colors.onSurface },
  statLabel: { fontSize: 8, fontWeight: '900', color: colors.muted, letterSpacing: 0.5 },

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
  cardMeta: { fontSize: 10, color: colors.muted, marginTop: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  badgeText: { color: '#FFF', fontWeight: '900', fontSize: 9, letterSpacing: 0.5 },
  detailRow: { flexDirection: 'row', gap: 12, marginTop: 6, flexWrap: 'wrap' },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  detailText: { fontSize: 10, color: colors.muted, fontWeight: '600' },
  sigRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  sigChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  sigText: { fontSize: 10, fontWeight: '700' },
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

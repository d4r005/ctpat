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
import { colors, spacing, radius } from '@/src/constants/theme';
import MainHeader from '@/src/components/MainHeader';
import { useTranslation } from 'react-i18next';
import { countDamages } from '@/src/components/BoxDamageMap';

const isWeb = Platform.OS === 'web';

export default function AlmacenList() {
  const router = useRouter();
  const { t } = useTranslation();
  const { token } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = isWeb && width >= 1080;

  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('warehouse_records')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setRecords((data || []).map((r: any) => ({
        ...r.data, id: r.id, plates: r.plates, created_at: r.created_at, record_id: r.record_id
      })));
    } catch { setRecords([]); }
    finally { setLoading(false); }
  }, [token]);

  React.useEffect(() => { load(); }, [load]);

  const filtered = records.filter(r => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      r.plates?.toLowerCase().includes(q) || r.placas_unidad?.toLowerCase().includes(q) ||
      r.cliente?.toLowerCase().includes(q) || r.almacenista?.toLowerCase().includes(q) ||
      r.operador?.toLowerCase().includes(q)
    );
  });

  const fmtDate = (d: any) => {
    if (!d) return '';
    try {
      return new Date(d).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
    } catch { return ''; }
  };

  const goToItem = (r: any) => router.push(`/almacen/${r.id}`);

  const renderItem = ({ item: r, index }: { item: any; index: number }) => {
    const danos = countDamages(r.damage_map);
    const mats = Array.isArray(r.materiales) ? r.materiales.length : 0;
    return (
      <Pressable
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]}
        onPress={() => goToItem(r)}
      >
        <View style={styles.cardHeader}>
          <View style={styles.plateBadge}>
            <Text style={styles.plateText}>{r.plates || r.placas_unidad || 'S/P'}</Text>
          </View>
          <View style={styles.badgesRow}>
            {danos > 0 && (
              <View style={styles.badgeBad}>
                <Text style={styles.badgeBadText}>{danos} DAÑO{danos > 1 ? 'S' : ''}</Text>
              </View>
            )}
            {danos === 0 && (
              <View style={styles.badgeOk}>
                <Text style={styles.badgeOkText}>SIN DAÑOS</Text>
              </View>
            )}
            <View style={styles.badgeNeutral}>
              <Text style={styles.badgeNeutralText}>{mats} MATERIAL{mats !== 1 ? 'ES' : ''}</Text>
            </View>
          </View>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>CLIENTE</Text>
          <Text style={styles.cardValue}>{r.cliente || '—'}</Text>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>ALMACENISTA</Text>
          <Text style={styles.cardValue}>{r.almacenista || '—'}</Text>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>CAJA</Text>
          <Text style={styles.cardValue}>{r.numero_caja || '—'}</Text>
        </View>
        <View style={styles.cardFooter}>
          <Text style={styles.cardDate}>{fmtDate(r.created_at)}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedLight} />
        </View>
      </Pressable>
    );
  };

  const renderTableRow = ({ item: r }: { item: any }) => {
    const danos = countDamages(r.damage_map);
    const mats = Array.isArray(r.materiales) ? r.materiales.length : 0;
    return (
      <Pressable style={({ pressed }) => [styles.tableRow, pressed && styles.tableRowHover]} onPress={() => goToItem(r)}>
        <View style={[styles.tableCell, { flex: 0.9 }]}>
          <Text style={styles.tablePlate}>{r.plates || r.placas_unidad || 'S/P'}</Text>
        </View>
        <View style={[styles.tableCell, { flex: 0.7 }]}>
          <Text style={styles.tableText} numberOfLines={1}>{r.numero_caja || '—'}</Text>
        </View>
        <View style={[styles.tableCell, { flex: 1.1 }]}>
          <Text style={styles.tableText} numberOfLines={1}>{r.cliente || '—'}</Text>
        </View>
        <View style={[styles.tableCell, { flex: 1.1 }]}>
          <Text style={styles.tableText} numberOfLines={1}>{r.almacenista || '—'}</Text>
        </View>
        <View style={[styles.tableCell, { flex: 0.6 }]}>
          <Text style={[styles.tableText, { color: danos > 0 ? colors.error : colors.success, fontWeight: '900' }]}>{danos > 0 ? `${danos} DAÑO${danos > 1 ? 'S' : ''}` : 'OK'}</Text>
        </View>
        <View style={[styles.tableCell, { flex: 0.5 }]}>
          <Text style={styles.tableText}>{mats}</Text>
        </View>
        <View style={[styles.tableCell, { flex: 0.8 }]}>
          <Text style={styles.tableDate}>{fmtDate(r.created_at)}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <MainHeader title="ALMACÉN" subtitle="Almacén: Registros de revisión de caja" />
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por placas, cliente, almacenista…"
            placeholderTextColor={colors.mutedLight}
            value={query}
            onChangeText={setQuery}
          />
        </View>
        <Pressable style={styles.addBtn} onPress={() => router.push('/almacen/nuevo')}>
          <Ionicons name="add" size={22} color={colors.onBrandPrimary} />
        </Pressable>
      </View>

      {isDesktop ? (
        <View style={styles.tableWrap}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, { flex: 0.9 }]}>PLACAS</Text>
            <Text style={[styles.tableHeaderText, { flex: 0.7 }]}>CAJA</Text>
            <Text style={[styles.tableHeaderText, { flex: 1.1 }]}>CLIENTE</Text>
            <Text style={[styles.tableHeaderText, { flex: 1.1 }]}>ALMACENISTA</Text>
            <Text style={[styles.tableHeaderText, { flex: 0.6 }]}>DAÑOS</Text>
            <Text style={[styles.tableHeaderText, { flex: 0.5 }]}>MATS.</Text>
            <Text style={[styles.tableHeaderText, { flex: 0.8 }]}>FECHA</Text>
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(i: any) => i.id}
            renderItem={renderTableRow}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brandSecondary} />}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Ionicons name="cube-outline" size={48} color={colors.mutedLight} />
                <Text style={styles.emptyTitle}>SIN REGISTROS DE ALMACÉN</Text>
                <Text style={styles.emptySub}>Crea el primero con el botón +</Text>
              </View>
            }
            contentContainerStyle={{ paddingBottom: spacing.xxl }}
          />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i: any) => i.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brandSecondary} />}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="cube-outline" size={48} color={colors.mutedLight} />
              <Text style={styles.emptyTitle}>SIN REGISTROS DE ALMACÉN</Text>
              <Text style={styles.emptySub}>Crea el primero con el botón +</Text>
            </View>
          }
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: spacing.md, height: 46, borderRadius: radius.sm },
  searchInput: { flex: 1, color: colors.onSurface, fontSize: 14 },
  addBtn: { width: 46, height: 46, backgroundColor: colors.brandPrimary, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  plateBadge: { backgroundColor: colors.brandPrimary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.xs },
  plateText: { color: colors.onBrandPrimary, fontWeight: '900', fontSize: 13, letterSpacing: 1 },
  badgesRow: { flexDirection: 'row', gap: 6 },
  badgeBad: { backgroundColor: colors.errorSurface, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.xs },
  badgeBadText: { color: colors.onError, fontWeight: '900', fontSize: 9, letterSpacing: 0.5 },
  badgeOk: { backgroundColor: colors.successSurface, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.xs },
  badgeOkText: { color: colors.onSuccess, fontWeight: '900', fontSize: 9, letterSpacing: 0.5 },
  badgeNeutral: { backgroundColor: colors.surfaceTertiary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.xs },
  badgeNeutralText: { color: colors.mutedDark, fontWeight: '900', fontSize: 9, letterSpacing: 0.5 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  cardLabel: { fontSize: 10, fontWeight: '900', color: colors.mutedLight, letterSpacing: 1 },
  cardValue: { fontSize: 11, color: colors.onSurface, fontWeight: '700' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.sm },
  cardDate: { fontSize: 10, color: colors.muted },
  tableWrap: { flex: 1, paddingHorizontal: spacing.lg },
  tableHeader: { flexDirection: 'row', backgroundColor: colors.brandPrimary, paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.xs, marginBottom: spacing.xs },
  tableHeaderText: { color: colors.onBrandPrimary, fontWeight: '900', fontSize: 10, letterSpacing: 1 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.divider, backgroundColor: colors.surfaceSecondary, borderRadius: radius.xs, marginBottom: 4 },
  tableRowHover: { backgroundColor: colors.surfaceTertiary },
  tableCell: { paddingHorizontal: 4 },
  tablePlate: { fontWeight: '900', fontSize: 13, color: colors.onSurface, letterSpacing: 1 },
  tableText: { fontSize: 12, color: colors.onSurfaceSecondary },
  tableDate: { fontSize: 11, color: colors.muted },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxxl, gap: 8 },
  emptyTitle: { fontWeight: '900', color: colors.muted, letterSpacing: 1, fontSize: 12 },
  emptySub: { color: colors.mutedLight, fontSize: 11 },
});

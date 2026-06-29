import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable,
  TextInput, RefreshControl
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/src/context/AuthContext';
import { apiCall } from '@/src/api/client';
import { colors, spacing } from '@/src/constants/theme';
import MainHeader from '@/src/components/MainHeader';
import { useTranslation } from 'react-i18next';

export default function EmbarqueList() {
  const router = useRouter();
  const { t } = useTranslation();
  const { token, user } = useAuth();

  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiCall<any[]>('/shipping-tickets', { token });
      setTickets(Array.isArray(data) ? data : []);
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

  const renderItem = ({ item: tk }: { item: any }) => {
    const hasGuardia = !!tk.firma_guardia || !!tk.nombre_guardia;
    const hasAlmacenista = !!tk.firma_almacenista || !!tk.almacenista;
    const isComplete = hasGuardia && hasAlmacenista;

    return (
      <Pressable
        style={styles.card}
        onPress={() => router.push(`/embarque/${tk.id}`)}
      >
        <View style={{ flex: 1 }}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{tk.placas_unidad || 'S/P'}</Text>
            <View style={[styles.badge, { backgroundColor: isComplete ? colors.success : colors.warning }]}>
              <Text style={styles.badgeText}>{isComplete ? 'COMPLETO' : 'EN PROCESO'}</Text>
            </View>
          </View>

          <Text style={styles.cardSub}>
            {tk.cliente || '-'} · {tk.linea_transporte || '-'}
          </Text>

          <View style={styles.detailRow}>
            <View style={styles.detailItem}>
              <Ionicons name="cube-outline" size={12} color={colors.muted} />
              <Text style={styles.detailText}>Caja: {tk.numero_caja || '-'}</Text>
            </View>
            <View style={styles.detailItem}>
              <Ionicons name="lock-closed-outline" size={12} color={colors.muted} />
              <Text style={styles.detailText}>Sello: {tk.numero_sello || '-'}</Text>
            </View>
            <View style={styles.detailItem}>
              <Ionicons name="layers-outline" size={12} color={colors.muted} />
              <Text style={styles.detailText}>Pallets: {tk.numero_pallets || '-'}</Text>
            </View>
          </View>

          {/* Indicadores de firmas */}
          <View style={styles.sigRow}>
            <View style={styles.sigChip}>
              <Ionicons
                name={hasAlmacenista ? 'checkmark-circle' : 'ellipse-outline'}
                size={12}
                color={hasAlmacenista ? colors.success : colors.muted}
              />
              <Text style={[styles.sigText, { color: hasAlmacenista ? colors.success : colors.muted }]}>
                Almacenista
              </Text>
            </View>
            <View style={styles.sigChip}>
              <Ionicons
                name={hasGuardia ? 'checkmark-circle' : 'ellipse-outline'}
                size={12}
                color={hasGuardia ? colors.success : colors.muted}
              />
              <Text style={[styles.sigText, { color: hasGuardia ? colors.success : colors.muted }]}>
                Guardia
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

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <MainHeader
        title="NAF"
        subtitle="EMBARQUE: TICKETS DE CARGA"
      />

      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Placas, cliente, almacenista..."
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

      <View style={styles.statsBar}>
        <View style={styles.stat}>
          <Text style={styles.statNum}>{tickets.length}</Text>
          <Text style={styles.statLabel}>TOTAL</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statNum, { color: colors.success }]}>
            {tickets.filter(tk => !!tk.firma_guardia && !!tk.almacenista).length}
          </Text>
          <Text style={styles.statLabel}>COMPLETOS</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statNum, { color: colors.warning }]}>
            {tickets.filter(tk => !tk.firma_guardia || !tk.almacenista).length}
          </Text>
          <Text style={styles.statLabel}>PENDIENTES</Text>
        </View>
      </View>

      <FlatList
        data={filtered}
        renderItem={renderItem}
        keyExtractor={tk => tk.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brandPrimary} />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons name="cube-outline" size={48} color={colors.muted} />
              <Text style={styles.emptyText}>Sin tickets de embarque</Text>
            </View>
          ) : null
        }
      />

      {/* FAB nuevo ticket */}
      <Pressable
        style={styles.fab}
        onPress={() => router.push('/embarque/nuevo')}
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
  statsBar: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSecondary,
    borderBottomWidth: 2, borderBottomColor: colors.borderStrong,
    paddingVertical: 8,
  },
  stat: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 18, fontWeight: '900', color: colors.onSurface },
  statLabel: { fontSize: 8, fontWeight: '900', color: colors.muted, letterSpacing: 0.5 },
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
  cardMeta: { fontSize: 10, color: colors.muted, marginTop: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 3 },
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

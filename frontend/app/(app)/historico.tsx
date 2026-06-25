import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useInspections } from '@/src/context/InspectionContext';
import { apiCall } from '@/src/api/client';
import { colors, spacing, typography } from '@/src/constants/theme';
import ProcessTracker from '@/src/components/ProcessTracker';

type Filter = 'todos' | 'bueno' | 'malo';

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
    const relatedRecord = records.find(r => r.inspection_id === item.id || r.entry.placas_unidad === item.placas_unidad);
    const hasTicket = tickets.some(t => t.placas_unidad === item.placas_unidad);

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
          <Text style={styles.cardTitleText}>{item.placas_unidad || t('sin_placas')}</Text>
          <Text style={styles.cardSubText}>{item.compania_transportista}</Text>
          <View style={{ marginVertical: 6 }}>
            <ProcessTracker steps={steps} compact />
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
            <Text style={styles.statusBadgeText}>{item.status_general === 'bueno' ? t('bueno') : t('falla')}</Text>
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
              {f === 'todos' ? t('todos') : f === 'bueno' ? t('bueno') : t('con_falla')}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionTitle}>{t('inspecciones').toUpperCase()}</Text>
    </>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <MainHeader title="NAF" subtitle={`${t('historico').toUpperCase()}: ARCHIVO DIGITAL`} />

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
  safe: { flex: 1, backgroundColor: '#F8F9FA' },
  brandHeader: { backgroundColor: colors.brandPrimary, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', paddingBottom: spacing.xl },
  brandLogo: { color: '#FFF', fontSize: 28, fontWeight: '900', letterSpacing: 2 },
  brandSubtitle: { color: '#FFF', fontSize: 10, opacity: 0.8, marginTop: 2 },
  userContainer: { alignItems: 'center' },
  avatarCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FFF' },
  avatarText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  onlineIndicator: { position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.success, borderWidth: 2, borderColor: colors.brandPrimary },
  onlineStatusText: { color: colors.success, fontSize: 8, fontWeight: '900', marginTop: 4 },
  container: { padding: spacing.md },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 12, borderRadius: 8, marginTop: -15, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
  searchInput: { flex: 1, height: 44, color: colors.onSurface, fontSize: 14 },
  chipsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  chip: { borderWidth: 2, borderColor: colors.borderStrong, paddingHorizontal: spacing.md, paddingVertical: 6, flexShrink: 0, backgroundColor: '#FFF' },
  chipActive: { backgroundColor: colors.brandPrimary },
  chipText: { fontWeight: '900', fontSize: 11, color: colors.onSurface, letterSpacing: 1 },
  chipTextActive: { color: colors.onBrandPrimary },
  sectionTitle: { fontSize: 11, fontWeight: '900', color: colors.onSurface, letterSpacing: 1, marginBottom: spacing.md, marginLeft: 4, marginTop: spacing.xl },
  activityCard: { backgroundColor: '#FFF', borderRadius: 12, padding: spacing.md, marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', elevation: 1 },
  cardTitleText: { fontSize: 16, fontWeight: '900', color: colors.onSurface },
  cardSubText: { fontSize: 13, color: colors.muted, marginTop: 2 },
  cardMetaText: { fontSize: 10, color: colors.muted, marginTop: 4 },
  statusBadge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: 4 },
  statusBadgeText: { color: '#FFF', fontWeight: '900', fontSize: 10, letterSpacing: 1 },
  pendingChip: { backgroundColor: colors.info, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: 4, marginBottom: 4 },
  pendingChipText: { color: '#FFF', fontWeight: '900', fontSize: 9, letterSpacing: 1 },
  emptyBox: { alignItems: 'center', padding: spacing.xxxl, marginTop: spacing.xl },
  emptyText: { fontWeight: '700', color: colors.muted, marginTop: spacing.md },
});

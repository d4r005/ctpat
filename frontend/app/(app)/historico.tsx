import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useInspections } from '@/src/context/InspectionContext';
import { colors, spacing, typography } from '@/src/constants/theme';

type Filter = 'todos' | 'bueno' | 'malo';

export default function Historico() {
  const router = useRouter();
  const { t } = useTranslation();
  const { inspections, refresh, loading } = useInspections();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('todos');

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

  return (
    <SafeAreaView style={styles.safe} edges={['top']} testID="historico-screen">
      <View style={styles.header}>
        <Text style={styles.title}>{t('historico')}</Text>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            testID="historico-search-input"
            style={styles.searchInput}
            placeholder={t('buscar_placeholder')}
            placeholderTextColor={colors.muted}
            value={query}
            onChangeText={setQuery}
          />
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
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.brandPrimary} />}
        ListEmptyComponent={
          <View style={styles.empty} testID="historico-empty">
            <Ionicons name="clipboard-outline" size={48} color={colors.muted} />
            <Text style={styles.emptyText}>{t('sin_resultados_inspecciones')}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            testID={`historico-item-${item.id}`}
            style={styles.item}
            onPress={() => router.push(`/inspection/${item.id}`)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{item.placas_unidad || t('sin_placas')}</Text>
              <Text style={styles.itemSub}>{item.compania_transportista}</Text>
              <Text style={styles.itemMeta}>
                {t('trailer')}: {item.numero_trailer} · {t('precinto')}: {item.numero_precinto}
              </Text>
              <Text style={styles.itemDate}>{new Date(item.created_at).toLocaleString()}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              {item._pending && (
                <View style={styles.pendingChip}>
                  <Text style={styles.pendingChipText}>{t('pend')}</Text>
                </View>
              )}
              <View style={[styles.statusChip, { backgroundColor: item.status_general === 'bueno' ? colors.success : colors.error }]}>
                <Text style={styles.statusChipText}>{item.status_general === 'bueno' ? t('bueno') : t('falla')}</Text>
              </View>
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { padding: spacing.lg, borderBottomWidth: 2, borderBottomColor: colors.borderStrong, backgroundColor: colors.surfaceSecondary },
  title: { fontSize: typography.sizes.xxl, fontWeight: '900', color: colors.onSurface, marginBottom: spacing.md },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderWidth: 2, borderColor: colors.borderStrong, paddingHorizontal: spacing.md, gap: spacing.sm,
  },
  searchInput: { flex: 1, padding: spacing.sm, fontSize: typography.sizes.base, color: colors.onSurface, height: 44 },
  chipsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  chip: { borderWidth: 2, borderColor: colors.borderStrong, paddingHorizontal: spacing.md, paddingVertical: 6, flexShrink: 0 },
  chipActive: { backgroundColor: colors.brandPrimary },
  chipText: { fontWeight: '900', fontSize: 11, color: colors.onSurface, letterSpacing: 1 },
  chipTextActive: { color: colors.onBrandPrimary },
  empty: { alignItems: 'center', padding: spacing.xxxl, marginTop: spacing.xl },
  emptyText: { color: colors.muted, marginTop: spacing.md },
  item: {
    backgroundColor: colors.surfaceSecondary, borderWidth: 2, borderColor: colors.borderStrong,
    padding: spacing.md, marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center',
  },
  itemTitle: { fontWeight: '900', fontSize: typography.sizes.lg, color: colors.onSurface },
  itemSub: { color: colors.muted, fontSize: typography.sizes.sm, marginTop: 2 },
  itemMeta: { color: colors.onSurfaceTertiary, fontSize: typography.sizes.sm, marginTop: 2 },
  itemDate: { color: colors.muted, fontSize: typography.sizes.sm, marginTop: 4 },
  statusChip: { paddingHorizontal: spacing.sm, paddingVertical: 4, marginTop: 4 },
  statusChipText: { color: '#FFF', fontWeight: '900', fontSize: 10, letterSpacing: 1 },
  pendingChip: { backgroundColor: colors.info, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  pendingChipText: { color: colors.onInfo, fontWeight: '900', fontSize: 9, letterSpacing: 1 },
});

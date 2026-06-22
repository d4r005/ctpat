import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput, RefreshControl, Platform,
  useWindowDimensions, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { useInspections } from '@/src/context/InspectionContext';
import { useAuth } from '@/src/context/AuthContext';
import { colors, spacing, typography } from '@/src/constants/theme';

type FilterApprov = 'todos' | 'pendiente' | 'aprobada' | 'rechazada';

export default function Supervisor() {
  const { user, token } = useAuth();
  const router = useRouter();
  const { allInspections, refreshAll, loading, exportCsvUrl } = useInspections();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterApprov>('todos');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const { width } = useWindowDimensions();
  const isWide = width >= 900;

  const filtered = useMemo(() => {
    return allInspections.filter((i) => {
      if (filter !== 'todos' && (i.approval_status || 'pendiente') !== filter) return false;
      if (dateFrom && i.created_at < dateFrom) return false;
      if (dateTo && i.created_at > dateTo + 'T23:59:59') return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        i.placas_unidad?.toLowerCase().includes(q) ||
        i.compania_transportista?.toLowerCase().includes(q) ||
        i.numero_trailer?.toLowerCase().includes(q) ||
        i.inspector_nombre?.toLowerCase().includes(q) ||
        i.inspector_email?.toLowerCase().includes(q)
      );
    });
  }, [allInspections, query, filter, dateFrom, dateTo]);

  const stats = useMemo(() => ({
    total: allInspections.length,
    pendientes: allInspections.filter((i) => (i.approval_status || 'pendiente') === 'pendiente').length,
    aprobadas: allInspections.filter((i) => i.approval_status === 'aprobada').length,
    rechazadas: allInspections.filter((i) => i.approval_status === 'rechazada').length,
  }), [allInspections]);

  const downloadCsv = async (mode: 'summary' | 'detailed') => {
    let url = exportCsvUrl(mode, 'all');
    const params: string[] = [];
    if (dateFrom) params.push(`date_from=${dateFrom}`);
    if (dateTo) params.push(`date_to=${dateTo}`);
    if (params.length) url += '&' + params.join('&');
    if (Platform.OS === 'web') {
      // Use fetch to attach Authorization header, then trigger download
      try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const blob = await res.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `naf_inspecciones_${mode}.csv`;
        link.click();
      } catch (e: any) {
        alert(e.message || 'Error al exportar');
      }
      return;
    }
    // Native: download then share
    try {
      const target = `${FileSystem.cacheDirectory}naf_inspecciones_${mode}.csv`;
      const dl = await FileSystem.downloadAsync(url, target, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(dl.uri, { mimeType: 'text/csv', dialogTitle: 'Exportar CSV NAF' });
      }
    } catch (e: any) {
      alert(e.message || 'Error al exportar CSV');
    }
  };

  if (user?.role !== 'supervisor') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Ionicons name="lock-closed" size={48} color={colors.muted} />
          <Text style={styles.lockText}>Acceso restringido a supervisores</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']} testID="supervisor-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Panel Supervisor</Text>

        <View style={styles.statsRow}>
          <StatBlock label="TOTAL" value={stats.total} />
          <StatBlock label="PEND" value={stats.pendientes} color={colors.warning} />
          <StatBlock label="APROB" value={stats.aprobadas} color={colors.success} />
          <StatBlock label="RECH" value={stats.rechazadas} color={colors.error} />
        </View>

        <View style={styles.exportRow}>
          <Pressable testID="supervisor-export-summary" style={styles.exportBtn} onPress={() => downloadCsv('summary')}>
            <Ionicons name="download" size={16} color={colors.onBrandPrimary} />
            <Text style={styles.exportText}>CSV RESUMEN</Text>
          </Pressable>
          <Pressable testID="supervisor-export-detailed" style={styles.exportBtn} onPress={() => downloadCsv('detailed')}>
            <Ionicons name="download" size={16} color={colors.onBrandPrimary} />
            <Text style={styles.exportText}>CSV DETALLADO</Text>
          </Pressable>
          <Pressable testID="supervisor-analitica-btn" style={[styles.exportBtn, { backgroundColor: colors.success }]} onPress={() => router.push('/(app)/analitica')}>
            <Ionicons name="stats-chart" size={16} color={colors.onSuccess} />
            <Text style={[styles.exportText, { color: colors.onSuccess }]}>ANALÍTICA</Text>
          </Pressable>
          <Pressable testID="supervisor-users-btn" style={[styles.exportBtn, { backgroundColor: colors.brandSecondary }]} onPress={() => router.push('/(app)/usuarios')}>
            <Ionicons name="people" size={16} color={colors.onBrandSecondary} />
            <Text style={[styles.exportText, { color: colors.onBrandSecondary }]}>USUARIOS</Text>
          </Pressable>
        </View>

        <View style={styles.dateRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.dateLabel}>DESDE</Text>
            <TextInput testID="supervisor-date-from" style={styles.dateInput} value={dateFrom} onChangeText={setDateFrom} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.dateLabel}>HASTA</Text>
            <TextInput testID="supervisor-date-to" style={styles.dateInput} value={dateTo} onChangeText={setDateTo} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} />
          </View>
          {(dateFrom || dateTo) && (
            <Pressable testID="supervisor-date-clear" style={styles.clearBtn} onPress={() => { setDateFrom(''); setDateTo(''); }}>
              <Ionicons name="close" size={16} color={colors.onError} />
            </Pressable>
          )}
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            testID="supervisor-search"
            style={styles.searchInput}
            placeholder="Placas, inspector, compañía..."
            placeholderTextColor={colors.muted}
            value={query}
            onChangeText={setQuery}
          />
        </View>

        <View style={styles.chipsRow}>
          {(['todos', 'pendiente', 'aprobada', 'rechazada'] as FilterApprov[]).map((f) => (
            <Pressable
              key={f}
              testID={`supervisor-filter-${f}`}
              onPress={() => setFilter(f)}
              style={[styles.chip, filter === f && styles.chipActive]}
            >
              <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>{f.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refreshAll} tintColor={colors.brandPrimary} />}
        ListEmptyComponent={
          <View style={styles.empty}><Text style={styles.emptyText}>Sin inspecciones para mostrar</Text></View>
        }
        renderItem={({ item }) => {
          const status = item.approval_status || 'pendiente';
          const statusColor = status === 'aprobada' ? colors.success : status === 'rechazada' ? colors.error : colors.warning;
          return (
            <Pressable
              testID={`supervisor-item-${item.id}`}
              style={[styles.row, isWide && styles.rowWide]}
              onPress={() => router.push(`/inspection/${item.id}`)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.placas_unidad}  ·  {item.numero_trailer}</Text>
                <Text style={styles.rowSub}>{item.compania_transportista}</Text>
                <Text style={styles.rowInspector}>Inspector: {item.inspector_nombre} ({item.inspector_email})</Text>
                <Text style={styles.rowDate}>{new Date(item.created_at).toLocaleString('es-MX')}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <View style={[styles.statusChip, { backgroundColor: item.status_general === 'bueno' ? colors.success : colors.error }]}>
                  <Text style={styles.statusChipText}>{item.status_general === 'bueno' ? 'BUENO' : 'FALLA'}</Text>
                </View>
                <View style={[styles.statusChip, { backgroundColor: statusColor }]}>
                  <Text style={styles.statusChipText}>{status.toUpperCase()}</Text>
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

function StatBlock({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <View style={styles.statBlock}>
      <Text style={[styles.statValue, color && { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  lockText: { color: colors.muted, marginTop: spacing.md, fontWeight: '700' },
  header: { padding: spacing.lg, borderBottomWidth: 2, borderBottomColor: colors.borderStrong, backgroundColor: colors.surfaceSecondary },
  title: { fontSize: typography.sizes.xxl, fontWeight: '900', color: colors.onSurface, marginBottom: spacing.md },
  statsRow: { flexDirection: 'row', borderWidth: 2, borderColor: colors.borderStrong, marginBottom: spacing.md },
  statBlock: { flex: 1, padding: spacing.sm, alignItems: 'center', borderLeftWidth: 1, borderLeftColor: colors.borderStrong },
  statValue: { fontSize: 22, fontWeight: '900', color: colors.onSurface },
  statLabel: { fontSize: 10, fontWeight: '900', color: colors.muted, letterSpacing: 1, marginTop: 2 },
  exportRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, flexWrap: 'wrap' },
  dateRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end', marginBottom: spacing.md },
  dateLabel: { fontSize: 10, fontWeight: '900', color: colors.muted, letterSpacing: 1, marginBottom: 4 },
  dateInput: { borderWidth: 2, borderColor: colors.borderStrong, padding: spacing.sm, backgroundColor: colors.surface, color: colors.onSurface, height: 40 },
  clearBtn: { backgroundColor: colors.error, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  exportBtn: {
    backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  exportText: { color: colors.onBrandPrimary, fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderWidth: 2, borderColor: colors.borderStrong, paddingHorizontal: spacing.md, marginBottom: spacing.md,
  },
  searchInput: { flex: 1, padding: spacing.sm, fontSize: typography.sizes.base, color: colors.onSurface, height: 44, marginLeft: spacing.sm },
  chipsRow: { flexDirection: 'row', gap: spacing.sm },
  chip: { borderWidth: 2, borderColor: colors.borderStrong, paddingHorizontal: spacing.md, paddingVertical: 6, flexShrink: 0 },
  chipActive: { backgroundColor: colors.brandPrimary },
  chipText: { fontWeight: '900', fontSize: 10, color: colors.onSurface, letterSpacing: 1 },
  chipTextActive: { color: colors.onBrandPrimary },
  empty: { alignItems: 'center', padding: spacing.xxxl },
  emptyText: { color: colors.muted },
  row: {
    backgroundColor: colors.surfaceSecondary, borderWidth: 2, borderColor: colors.borderStrong,
    padding: spacing.md, marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center',
  },
  rowWide: { maxWidth: 1000, alignSelf: 'stretch' },
  rowTitle: { fontWeight: '900', fontSize: typography.sizes.lg, color: colors.onSurface },
  rowSub: { color: colors.muted, fontSize: typography.sizes.sm, marginTop: 2 },
  rowInspector: { color: colors.onSurfaceTertiary, fontSize: typography.sizes.sm, marginTop: 4 },
  rowDate: { color: colors.muted, fontSize: typography.sizes.sm, marginTop: 4 },
  statusChip: { paddingHorizontal: spacing.sm, paddingVertical: 4 },
  statusChipText: { color: '#FFF', fontWeight: '900', fontSize: 9, letterSpacing: 1 },
});

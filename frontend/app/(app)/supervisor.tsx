import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput, RefreshControl, Platform,
  useWindowDimensions, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import { useTranslation } from 'react-i18next';
import { useInspections, Inspection } from '@/src/context/InspectionContext';
import { useAuth } from '@/src/context/AuthContext';
import { apiCall } from '@/src/api/client';
import { colors, spacing, typography } from '@/src/constants/theme';
import { generateConsolidatedReportHtml } from '@/src/utils/reportGenerator';

type FilterApprov = 'todos' | 'pendiente' | 'aprobada' | 'rechazada';

export default function Supervisor() {
  const { user, token } = useAuth();
  const isAdmin = user?.role === 'admin' || ['d.trujillo@brancoindustries.com', 'd4r005@gmail.com'].includes(user?.email || '');
  const isSupervisor = user?.role === 'supervisor' || isAdmin;
  const router = useRouter();
  const { allInspections, refreshAll, loading, exportCsvUrl, sendManualReport } = useInspections();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterApprov>('todos');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [reportLoading, setReportLoading] = useState<string | null>(null);
  const [emailLoading, setEmailLoading] = useState<string | null>(null);
  const [allRecords, setAllRecords] = useState<any[]>([]);
  const [allTickets, setAllTickets] = useState<any[]>([]);

  const fetchExtraData = async () => {
    if (!token || !isSupervisor) return;
    try {
      const [r, t] = await Promise.all([
        apiCall<any[]>('/vehicle-records', { token }),
        apiCall<any[]>('/shipping-tickets', { token })
      ]);
      setAllRecords(r);
      setAllTickets(t);
    } catch (e) { console.error("Error fetching extra data", e); }
  };

  useEffect(() => {
    if (isSupervisor) fetchExtraData();
  }, [token, isSupervisor]);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('naf_supervisor_filter');
        if (raw) {
          const f = JSON.parse(raw);
          if (f.query) setQuery(f.query);
          if (f.filter) setFilter(f.filter);
          if (f.dateFrom) setDateFrom(f.dateFrom);
          if (f.dateTo) setDateTo(f.dateTo);
        }
      } catch {}
    })();
  }, []);

  const { width } = useWindowDimensions();
  const isWide = width >= 900;

  useEffect(() => {
    AsyncStorage.setItem('naf_supervisor_filter', JSON.stringify({ query, filter, dateFrom, dateTo }));
  }, [query, filter, dateFrom, dateTo]);

  const applyDatePreset = (days: number) => {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - days);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    setDateFrom(fmt(from));
    setDateTo(fmt(to));
  };

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
      try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const blob = await res.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `naf_inspecciones_${mode}.csv`;
        link.click();
      } catch (e: any) { alert(e.message || 'Error al exportar'); }
      return;
    }
    try {
      const target = `${FileSystem.cacheDirectory}naf_inspecciones_${mode}.csv`;
      const dl = await FileSystem.downloadAsync(url, target, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(dl.uri, { mimeType: 'text/csv', dialogTitle: 'Exportar CSV NAF' });
      }
    } catch (e: any) { alert(e.message || 'Error al exportar CSV'); }
  };

  const generateReport = async (inspection: Inspection, lang: 'es' | 'zh') => {
    setReportLoading(inspection.id);
    try {
      // Optimizamos: Buscar solo registros relacionados en lugar de traer todo si es posible
      // Por ahora mantenemos la lógica pero con mejor manejo de errores
      const [records, tickets] = await Promise.all([
        apiCall<any[]>('/vehicle-records', { token }),
        apiCall<any[]>('/shipping-tickets', { token })
      ]);

      const caseta = records.find(r => r.inspection_id === inspection.id || (r.entry.placas_unidad === inspection.placas_unidad && Math.abs(new Date(r.created_at).getTime() - new Date(inspection.created_at).getTime()) < 86400000));
      const embarque = tickets.find(t => t.placas_unidad === inspection.placas_unidad && Math.abs(new Date(t.created_at).getTime() - new Date(inspection.created_at).getTime()) < 86400000);

      const html = generateConsolidatedReportHtml({ inspection, caseta, embarque }, lang);
      const { uri } = await Print.printToFileAsync({ html, base64: false });

      if (Platform.OS === 'web') {
          // En web, Print.printToFileAsync puede no funcionar igual, pero en Expo suele disparar la impresión
          alert('Reporte generado. Use la función de impresión del navegador para guardar como PDF.');
      } else {
          await Sharing.shareAsync(uri, {
            mimeType: 'application/pdf',
            dialogTitle: lang === 'zh' ? '分享报告' : 'Compartir Reporte NAF'
          });
      }
    } catch (e: any) {
      console.error(e);
      alert(e.message || 'Error al generar reporte');
    } finally {
      setReportLoading(null);
    }
  };

  const handleSendEmail = async (inspectionId: string) => {
    setEmailLoading(inspectionId);
    try {
      // El backend ahora espera un objeto opcional con recipient
      await apiCall(`/inspections/${inspectionId}/send-report`, {
        method: 'POST',
        token,
        body: { recipient: 'd.trujillo@brancoindustries.com' } // Destinatario oficial solicitado
      });
      alert('Reporte consolidado enviado por correo exitosamente');
    } catch (e: any) {
      alert(e.message || 'Error al enviar correo');
    } finally {
      setEmailLoading(null);
    }
  };

  if (user?.role !== 'supervisor') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Ionicons name="lock-closed" size={48} color={colors.muted} />
          <Text style={styles.lockText}>{t('acceso_restringido')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']} testID="supervisor-screen">
      <View style={styles.header}>
        <Text style={styles.title}>{isAdmin ? 'PANEL MAESTRO (ADMIN)' : t('panel_supervisor')}</Text>

        <View style={styles.statsRow}>
          <StatBlock label={t('total')} value={stats.total} />
          <StatBlock label={t('pend')} value={stats.pendientes} color={colors.warning} />
          <StatBlock label={t('aprob')} value={stats.aprobadas} color={colors.success} />
          <StatBlock label={t('rech')} value={stats.rechazadas} color={colors.error} />
        </View>

        <View style={styles.exportRow}>
          <Pressable testID="supervisor-export-summary" style={styles.exportBtn} onPress={() => downloadCsv('summary')}>
            <Ionicons name="download" size={16} color={colors.onBrandPrimary} />
            <Text style={styles.exportText}>{t('csv_resumen')}</Text>
          </Pressable>
          <Pressable testID="supervisor-export-detailed" style={styles.exportBtn} onPress={() => downloadCsv('detailed')}>
            <Ionicons name="download" size={16} color={colors.onBrandPrimary} />
            <Text style={styles.exportText}>{t('csv_detallado')}</Text>
          </Pressable>

          {isSupervisor && (
            <>
              <Pressable testID="supervisor-analitica-btn" style={[styles.exportBtn, { backgroundColor: colors.success }]} onPress={() => router.push('/analitica')}>
                <Ionicons name="stats-chart" size={16} color={colors.onSuccess} />
                <Text style={[styles.exportText, { color: colors.onSuccess }]}>{t('kpis')}</Text>
              </Pressable>
              <Pressable testID="supervisor-users-btn" style={[styles.exportBtn, { backgroundColor: colors.brandSecondary }]} onPress={() => router.push('/usuarios')}>
                <Ionicons name="people" size={16} color={colors.onBrandSecondary} />
                <Text style={[styles.exportText, { color: colors.onBrandSecondary }]}>{t('usuarios_caps')}</Text>
              </Pressable>
            </>
          )}
        </View>

        {isSupervisor && (
          <View style={styles.masterPanel}>
            <Text style={styles.masterTitle}>PANEL MAESTRO (ADMIN)</Text>
            <View style={styles.masterActions}>
              <Pressable style={styles.masterBtn} onPress={() => router.push('/caseta/nuevo')}>
                <Ionicons name="car" size={14} color={colors.onSurface} />
                <Text style={styles.masterBtnText}>NUEVA ENTRADA</Text>
              </Pressable>
              <Pressable style={styles.masterBtn} onPress={() => router.push('/nueva')}>
                <Ionicons name="clipboard" size={14} color={colors.onSurface} />
                <Text style={styles.masterBtnText}>INSPECCIÓN 19P</Text>
              </Pressable>
              <Pressable style={styles.masterBtn} onPress={() => router.push('/nueva?type=9_puntos_contenedor')}>
                <Ionicons name="cube" size={14} color={colors.onSurface} />
                <Text style={styles.masterBtnText}>INSPECCIÓN 9P</Text>
              </Pressable>
              <Pressable style={styles.masterBtn} onPress={() => router.push('/embarque/nuevo')}>
                <Ionicons name="document-text" size={14} color={colors.onSurface} />
                <Text style={styles.masterBtnText}>TICKET EMBARQUE</Text>
              </Pressable>
              <Pressable style={[styles.masterBtn, { backgroundColor: colors.success + '22' }]} onPress={() => router.push('/caseta')}>
                <Ionicons name="exit" size={14} color={colors.success} />
                <Text style={[styles.masterBtnText, { color: colors.success }]}>REGISTRAR SALIDA</Text>
              </Pressable>
            </View>
          </View>
        )}

        <View style={styles.dateRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.dateLabel}>{t('desde')}</Text>
            <TextInput testID="supervisor-date-from" style={styles.dateInput} value={dateFrom} onChangeText={setDateFrom} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.dateLabel}>{t('hasta')}</Text>
            <TextInput testID="supervisor-date-to" style={styles.dateInput} value={dateTo} onChangeText={setDateTo} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} />
          </View>
          {(dateFrom || dateTo) && (
            <Pressable testID="supervisor-date-clear" style={styles.clearBtn} onPress={() => { setDateFrom(''); setDateTo(''); }}>
              <Ionicons name="close" size={16} color={colors.onError} />
            </Pressable>
          )}
        </View>

        <View style={styles.presetRowSup}>
          <Pressable testID="supervisor-preset-7" style={styles.presetChipSup} onPress={() => applyDatePreset(7)}><Text style={styles.presetTextSup}>7D</Text></Pressable>
          <Pressable testID="supervisor-preset-30" style={styles.presetChipSup} onPress={() => applyDatePreset(30)}><Text style={styles.presetTextSup}>30D</Text></Pressable>
          <Pressable testID="supervisor-preset-90" style={styles.presetChipSup} onPress={() => applyDatePreset(90)}><Text style={styles.presetTextSup}>90D</Text></Pressable>
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            testID="supervisor-search"
            style={styles.searchInput}
            placeholder={t('buscar_placeholder')}
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
              <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>{t(f).toUpperCase()}</Text>
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
          <View style={styles.empty}><Text style={styles.emptyText}>{t('sin_inspecciones')}</Text></View>
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
                <Text style={styles.rowInspector}>{t('inspector')}: {item.inspector_nombre}</Text>
                <Text style={styles.rowDate}>{new Date(item.created_at).toLocaleString()}</Text>

                <View style={styles.reportButtons}>
                  <Pressable
                    style={[styles.reportBtn, reportLoading === item.id && { opacity: 0.5 }]}
                    onPress={() => generateReport(item, 'es')}
                    disabled={!!reportLoading}
                  >
                    <Ionicons name="mail" size={14} color={colors.onBrandSecondary} />
                    <Text style={styles.reportBtnText}>{t('espanol_caps')}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.reportBtn, { backgroundColor: colors.info }, reportLoading === item.id && { opacity: 0.5 }]}
                    onPress={() => generateReport(item, 'zh')}
                    disabled={!!reportLoading}
                  >
                    <Ionicons name="mail" size={14} color={colors.onInfo} />
                    <Text style={[styles.reportBtnText, { color: colors.onInfo }]}>{t('chino_caps')} (REPORT)</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.reportBtn, { backgroundColor: colors.success }, emailLoading === item.id && { opacity: 0.5 }]}
                    onPress={() => handleSendEmail(item.id)}
                    disabled={!!emailLoading}
                  >
                    {emailLoading === item.id ? (
                      <ActivityIndicator size={12} color={colors.onSuccess} />
                    ) : (
                      <>
                        <Ionicons name="send" size={14} color={colors.onSuccess} />
                        <Text style={[styles.reportBtnText, { color: colors.onSuccess }]}>ENVIAR EMAIL</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 8 }}>
                {isSupervisor && (
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {/* Botón para editar Entrada/Salida relacionada */}
                    {allRecords.find(r => r.inspection_id === item.id || r.entry.placas_unidad === item.placas_unidad) && (
                      <Pressable
                        onPress={() => {
                          const r = allRecords.find(rec => rec.inspection_id === item.id || rec.entry.placas_unidad === item.placas_unidad);
                          if (r) router.push(`/caseta/${r.id}`);
                        }}
                        style={{ padding: 4 }}
                      >
                        <Ionicons name="car-sport-outline" size={20} color={colors.info} />
                      </Pressable>
                    )}

                    {/* Botón para editar Ticket de Embarque relacionado */}
                    {allTickets.find(t => t.placas_unidad === item.placas_unidad) && (
                      <Pressable
                        onPress={() => {
                          const t = allTickets.find(tick => tick.placas_unidad === item.placas_unidad);
                          if (t) router.push(`/embarque/${t.id}`);
                        }}
                        style={{ padding: 4 }}
                      >
                        <Ionicons name="cube-outline" size={20} color={colors.brandSecondary} />
                      </Pressable>
                    )}

                    <Pressable
                      onPress={() => router.push(`/inspection/${item.id}?edit=true`)}
                      style={{ padding: 4 }}
                    >
                      <Ionicons name="create-outline" size={20} color={colors.brandPrimary} />
                    </Pressable>
                  </View>
                )}
                <View style={[styles.statusChip, { backgroundColor: item.status_general === 'bueno' ? colors.success : colors.error }]}>
                  <Text style={styles.statusChipText}>{item.status_general === 'bueno' ? t('bueno') : t('falla')}</Text>
                </View>
                <View style={[styles.statusChip, { backgroundColor: statusColor }]}>
                  <Text style={styles.statusChipText}>{t(status).toUpperCase()}</Text>
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
  presetRowSup: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  presetChipSup: { borderWidth: 2, borderColor: colors.borderStrong, backgroundColor: colors.surface, paddingHorizontal: spacing.md, paddingVertical: 6, flexShrink: 0 },
  presetTextSup: { fontWeight: '900', fontSize: 11, color: colors.onSurface, letterSpacing: 1 },
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
  reportButtons: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  reportBtn: {
    backgroundColor: colors.brandSecondary,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 2
  },
  reportBtnText: { color: colors.onBrandSecondary, fontWeight: '900', fontSize: 10, letterSpacing: 0.5 },
  statusChip: { paddingHorizontal: spacing.sm, paddingVertical: 4 },
  statusChipText: { color: '#FFF', fontWeight: '900', fontSize: 9, letterSpacing: 1 },
  masterPanel: { marginTop: spacing.md, padding: spacing.md, backgroundColor: colors.brandTertiary, borderWidth: 2, borderColor: colors.brandPrimary },
  masterTitle: { fontSize: 10, fontWeight: '900', color: colors.onBrandTertiary, letterSpacing: 1, marginBottom: spacing.sm },
  masterActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  masterBtn: { backgroundColor: colors.surface, paddingHorizontal: spacing.sm, paddingVertical: 6, borderWidth: 1, borderColor: colors.borderStrong, flexDirection: 'row', alignItems: 'center', gap: 4 },
  masterBtnText: { fontSize: 9, fontWeight: '900', color: colors.onSurface },
});

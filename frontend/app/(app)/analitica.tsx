import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TextInput, Pressable, RefreshControl, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { supabase } from '@/src/api/supabase';
import { useAuth } from '@/src/context/AuthContext';
import { useTranslation } from 'react-i18next';
import { colors, spacing, radius, shadows } from '@/src/constants/theme';
import MainHeader from '@/src/components/MainHeader';

interface Analytics {
  total: number;
  approval_breakdown: { pendiente: number; aprobada: number; rechazada: number };
  status_breakdown: { bueno: number; malo: number };
  approval_rate_pct: number;
  by_inspector: { name: string; total: number; fallas: number; aprobadas: number; rechazadas: number }[];
  top_failed_points: { name: string; count: number }[];
}

export default function Analitica({ nested = false }: { nested?: boolean }) {
  const { user, token } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      let query = supabase.from('inspections').select('*');
      if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00`);
      if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59`);
      const { data: inspections, error } = await query;
      if (error) throw error;
      if (!inspections) { setData(null); return; }

      const total = inspections.length;
      const approval_breakdown = {
        pendiente: inspections.filter(i => i.approval_status === 'pendiente').length,
        aprobada: inspections.filter(i => i.approval_status === 'aprobada').length,
        rechazada: inspections.filter(i => i.approval_status === 'rechazada').length,
      };
      const status_breakdown = {
        bueno: inspections.filter(i => i.status_general === 'bueno').length,
        malo: inspections.filter(i => i.status_general === 'malo').length,
      };
      const approval_rate_pct = total > 0 ? Math.round((approval_breakdown.aprobada / total) * 100) : 0;

      const inspectorMap: Record<string, any> = {};
      inspections.forEach(i => {
        const name = i.data?.inspector_nombre || 'Desconocido';
        if (!inspectorMap[name]) inspectorMap[name] = { name, total: 0, fallas: 0, aprobadas: 0, rechazadas: 0 };
        inspectorMap[name].total++;
        if (i.status_general === 'malo') inspectorMap[name].fallas++;
        if (i.approval_status === 'aprobada') inspectorMap[name].aprobadas++;
        if (i.approval_status === 'rechazada') inspectorMap[name].rechazadas++;
      });
      const by_inspector = Object.values(inspectorMap).sort((a, b) => b.total - a.total);

      const failedPointsMap: Record<string, number> = {};
      inspections.forEach(i => {
        const points = i.data?.points || [];
        points.forEach((p: any) => {
          if (p.estado === 'malo') failedPointsMap[p.name] = (failedPointsMap[p.name] || 0) + 1;
        });
      });
      const top_failed_points = Object.entries(failedPointsMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      setData({ total, approval_breakdown, status_breakdown, approval_rate_pct, by_inspector, top_failed_points });
    } catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  };

  const isSupervisorOrAdmin = user?.role === 'supervisor' || user?.role === 'admin';
  useEffect(() => { if (isSupervisorOrAdmin) load(); }, [token]);

  const applyPreset = (days: number) => {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - days);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    setDateFrom(fmt(from));
    setDateTo(fmt(to));
    setTimeout(load, 50);
  };

  const exportPdf = async () => {
    if (!data) return;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="font-family:Arial,sans-serif;padding:20px;color:#09090B;">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;border-bottom:3px solid #0A2540;padding-bottom:10px;">
    <div style="display:flex;flex-direction:column;">
      <div style="background-color:#0A2540;color:white;padding:8px 15px;display:inline-block;font-weight:900;font-size:24px;letter-spacing:1.5px;">NAF</div>
      <div style="color:#0A2540;font-size:12px;font-weight:bold;margin-top:5px;letter-spacing:0.5px;">North America Flooring</div>
    </div>
    <div style="text-align:right;">
      <h1 style="margin:0;font-size:20px;color:#0A2540;">${t('reporte_analitica').toUpperCase()}</h1>
      <p style="margin:5px 0 0 0;font-size:10px;color:#666;">${t('generado')}: ${new Date().toLocaleString()}${dateFrom || dateTo ? ` · Periodo: ${dateFrom || '...'} → ${dateTo || '...'}` : ''}</p>
    </div>
  </div>
<table style="width:100%;border-collapse:collapse;margin:20px 0;">
  <tr><td style="padding:10px;border:1px solid #999;background:#F4F4F5;width:50%;"><b>${t('total_inspecciones')}</b></td><td style="padding:10px;border:1px solid #999;font-size:24px;font-weight:bold;">${data.total}</td></tr>
  <tr><td style="padding:10px;border:1px solid #999;background:#F4F4F5;"><b>${t('porcentaje_aprobacion')}</b></td><td style="padding:10px;border:1px solid #999;font-size:24px;font-weight:bold;color:#16A34A;">${data.approval_rate_pct}%</td></tr>
  <tr><td style="padding:10px;border:1px solid #999;background:#F4F4F5;"><b>${t('pendientes')}</b></td><td style="padding:10px;border:1px solid #999;font-size:18px;color:#F59E0B;">${data.approval_breakdown.pendiente}</td></tr>
  <tr><td style="padding:10px;border:1px solid #999;background:#F4F4F5;"><b>${t('con_fallas_label')}</b></td><td style="padding:10px;border:1px solid #999;font-size:18px;color:#DC2626;">${data.status_breakdown.malo}</td></tr>
</table>
<h2 style="background:#0A2540;color:#fff;padding:8px;">${t('inspecciones_por_inspector')}</h2>
<table style="width:100%;border-collapse:collapse;">
<tr style="background:#E4E4E7;font-weight:bold;"><td style="padding:8px;border:1px solid #999;">${t('inspector')}</td><td style="padding:8px;border:1px solid #999;">${t('total').toUpperCase()}</td><td style="padding:8px;border:1px solid #999;">${t('aprob').toUpperCase()}</td><td style="padding:8px;border:1px solid #999;">${t('rech').toUpperCase()}</td><td style="padding:8px;border:1px solid #999;">${t('fallas').toUpperCase()}</td></tr>
${data.by_inspector.map((i) => `<tr><td style="padding:8px;border:1px solid #999;">${i.name}</td><td style="padding:8px;border:1px solid #999;font-weight:bold;">${i.total}</td><td style="padding:8px;border:1px solid #999;color:#16A34A;">${i.aprobadas}</td><td style="padding:8px;border:1px solid #999;color:#DC2626;">${i.rechazadas}</td><td style="padding:8px;border:1px solid #999;">${i.fallas}</td></tr>`).join('')}
</table>
<h2 style="background:#0A2540;color:#fff;padding:8px;margin-top:20px;">${t('top_10_fallas')}</h2>
<table style="width:100%;border-collapse:collapse;">
${data.top_failed_points.length ? data.top_failed_points.map((p) => `<tr><td style="padding:8px;border:1px solid #999;">${p.name}</td><td style="padding:8px;border:1px solid #999;font-weight:bold;color:#DC2626;text-align:right;">${p.count}</td></tr>`).join('') : `<tr><td style="padding:8px;border:1px solid #999;color:#666;font-style:italic;">${t('sin_fallas_registradas')}</td></tr>`}
</table>
</body></html>`;
    try {
      const result = await Print.printToFileAsync({ html, base64: false });
      if (result && result.uri && await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, { mimeType: 'application/pdf', dialogTitle: t('reporte_analitica_naf') });
      }
    } catch (e: any) { alert(e.message); }
  };

  const exportCsv = async () => {
    if (!data) return;
    try {
      setLoading(true);
      let query = supabase.from('inspections').select('*');
      if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00`);
      if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59`);
      const { data: inspections, error } = await query;
      if (error) throw error;
      const headers = ['ID', 'Fecha', 'Placas', 'Inspector', 'Compañia', 'Trailer', 'Estado General', 'Aprobación'];
      const rows = (inspections || []).map(i => [
        i.id, new Date(i.created_at).toISOString(), i.plates,
        i.data?.inspector_nombre || '', i.data?.compania_transportista || '',
        i.data?.numero_trailer || '', i.status_general, i.approval_status
      ]);
      const csvContent = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
      if (Platform.OS === 'web') {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `Analitica_NAF_${dateFrom || 'report'}.csv`;
        document.body.appendChild(a); a.click();
        window.URL.revokeObjectURL(url); document.body.removeChild(a);
      } else {
        const filename = `${FileSystem.documentDirectory}reporte_naf.csv`;
        await FileSystem.writeAsStringAsync(filename, csvContent, { encoding: FileSystem.EncodingType.UTF8 });
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(filename, { mimeType: 'text/csv', dialogTitle: t('csv_detallado') });
      }
    } catch (e: any) { alert('Error al exportar CSV: ' + e.message); }
    finally { setLoading(false); }
  };

  if (!isSupervisorOrAdmin) {
    return (
      <View style={styles.center}>
        <View style={styles.lockIconWrap}>
          <Ionicons name="lock-closed" size={32} color={colors.mutedLight} />
        </View>
        <Text style={styles.lockText}>{t('acceso_restringido')}</Text>
      </View>
    );
  }

  const maxInsp = Math.max(1, ...(data?.by_inspector || []).map((i) => i.total));
  const maxPoint = Math.max(1, ...(data?.top_failed_points || []).map((p) => p.count));

  const Content = (
    <View style={{ flex: 1 }}>
      {!nested && <MainHeader title="NAF" subtitle={t('panel_supervisor')} />}

      {nested && (
        <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: colors.onSurface }}>{t('reporte_analitica').toUpperCase()}</Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ padding: nested ? 12 : 24, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brandPrimary} />}
      >
        {/* ── Date filters ── */}
        <View style={styles.dateBox}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{t('desde')}</Text>
            <View style={styles.dateInputWrap}>
              <Ionicons name="calendar-outline" size={14} color={colors.mutedLight} />
              <TextInput testID="analitica-date-from" style={styles.dateInput} value={dateFrom} onChangeText={setDateFrom} placeholder="2026-01-01" placeholderTextColor={colors.mutedLight} />
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{t('hasta')}</Text>
            <View style={styles.dateInputWrap}>
              <Ionicons name="calendar-outline" size={14} color={colors.mutedLight} />
              <TextInput testID="analitica-date-to" style={styles.dateInput} value={dateTo} onChangeText={setDateTo} placeholder="2026-12-31" placeholderTextColor={colors.mutedLight} />
            </View>
          </View>
          <Pressable testID="analitica-apply" style={styles.applyBtn} onPress={load}>
            <Ionicons name="filter" size={16} color="#FFFFFF" />
            <Text style={styles.applyBtnText}>{t('aplicar') || 'APLICAR'}</Text>
          </Pressable>
        </View>

        <View style={styles.presetRow}>
          <Pressable testID="analitica-preset-7" style={styles.presetChip} onPress={() => applyPreset(7)}>
            <Text style={styles.presetText}>7D</Text>
          </Pressable>
          <Pressable testID="analitica-preset-30" style={styles.presetChip} onPress={() => applyPreset(30)}>
            <Text style={styles.presetText}>30D</Text>
          </Pressable>
          {data && (
            <Pressable testID="analitica-pdf-btn" style={[styles.exportBtn, { backgroundColor: colors.brandSecondary }]} onPress={exportPdf}>
              <Ionicons name="document-text" size={14} color="#FFFFFF" />
              <Text style={styles.exportBtnText}>PDF</Text>
            </Pressable>
          )}
          {data && (
            <Pressable testID="analitica-csv-btn" style={[styles.exportBtn, { backgroundColor: colors.success }]} onPress={exportCsv}>
              <Ionicons name="download" size={14} color="#FFFFFF" />
              <Text style={styles.exportBtnText}>CSV</Text>
            </Pressable>
          )}
        </View>

        {loading && !data ? (
          <View style={styles.loadingWrap}><ActivityIndicator size="large" color={colors.brandPrimary} /></View>
        ) : data ? (
          <>
            {/* ── KPI cards ── */}
            <View style={styles.kpiGrid}>
              {[
                { label: t('total').toUpperCase(), value: data.total, color: colors.brandPrimary, surface: colors.brandTertiary },
                { label: '% APROB.', value: `${data.approval_rate_pct}%`, color: colors.success, surface: colors.successSurface },
                { label: t('pendientes').toUpperCase(), value: data.approval_breakdown.pendiente, color: colors.warning, surface: colors.warningSurface },
                { label: t('con_fallas').toUpperCase(), value: data.status_breakdown.malo, color: colors.error, surface: colors.errorSurface },
              ].map((kpi, i) => (
                <View key={i} style={styles.kpiCard}>
                  <View style={[styles.kpiIconWrap, { backgroundColor: kpi.surface }]}>
                    <Text style={[styles.kpiValue, { color: kpi.color }]}>{kpi.value}</Text>
                  </View>
                  <Text style={styles.kpiLabel}>{kpi.label}</Text>
                </View>
              ))}
            </View>

            {/* ── Status section ── */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('estado').toUpperCase()}</Text>
              <View style={styles.sectionBody}>
                {[
                  { label: t('aprobada'), value: data.approval_breakdown.aprobada, total: data.total, color: colors.success },
                  { label: t('pendiente'), value: data.approval_breakdown.pendiente, total: data.total, color: colors.warning },
                  { label: t('rechazada'), value: data.approval_breakdown.rechazada, total: data.total, color: colors.error },
                ].map((d, i) => {
                  const pct = d.total > 0 ? Math.round((d.value / d.total) * 100) : 0;
                  return (
                    <View key={i} style={styles.distRow}>
                      <Text style={styles.distLabel}>{d.label}</Text>
                      <View style={styles.barWrap}>
                        <View style={[styles.bar, { width: `${pct}%`, backgroundColor: d.color, borderRadius: 4 }]} />
                        <Text style={styles.barValue}>{d.value} ({pct}%)</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* ── Inspector section ── */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('inspecciones_por_inspector').toUpperCase()}</Text>
              <View style={styles.sectionBody}>
                {data.by_inspector.length === 0 ? (
                  <Text style={styles.emptyText}>{t('no_hay_actividad')}</Text>
                ) : data.by_inspector.map((i) => (
                  <View key={i.name} style={styles.inspectorRow} testID={`analitica-inspector-${i.name}`}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inspectorName}>{i.name}</Text>
                      <Text style={styles.inspectorMeta}>{i.aprobadas} {t('aprob').toLowerCase()} · {i.rechazadas} {t('rech').toLowerCase()}</Text>
                    </View>
                    <View style={[styles.barWrap, { flex: 1.2 }]}>
                      <View style={[styles.bar, { width: `${(i.total / maxInsp) * 100}%`, backgroundColor: colors.brandPrimary, borderRadius: 4 }]} />
                      <Text style={styles.barValue}>{i.total}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>

            {/* ── Failed points section ── */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('top_10_fallas').toUpperCase()}</Text>
              <View style={styles.sectionBody}>
                {data.top_failed_points.length === 0 ? (
                  <Text style={styles.emptyText}>{t('no_hay_actividad')}</Text>
                ) : data.top_failed_points.map((p) => (
                  <View key={p.name} style={styles.failRow}>
                    <Text style={styles.failLabel} numberOfLines={2}>{p.name}</Text>
                    <View style={[styles.barWrap, { flex: 1.2 }]}>
                      <View style={[styles.bar, { width: `${(p.count / maxPoint) * 100}%`, backgroundColor: colors.error, borderRadius: 4 }]} />
                      <Text style={styles.barValue}>{p.count}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );

  if (nested) return Content;

  return (
    <SafeAreaView style={styles.safe} edges={['top']} testID="analitica-screen">
      {Content}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lockIconWrap: { width: 64, height: 64, borderRadius: 16, backgroundColor: colors.surfaceTertiary, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  lockText: { color: colors.muted, fontSize: 14, fontWeight: '600' },

  dateBox: { flexDirection: 'row', gap: 10, alignItems: 'flex-end', marginBottom: 16, flexWrap: 'wrap' },
  label: { fontSize: 10, fontWeight: '800', color: colors.mutedDark, letterSpacing: 0.8, marginBottom: 6 },
  dateInputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, paddingHorizontal: 12, height: 40, backgroundColor: '#FFFFFF',
  },
  dateInput: { flex: 1, color: colors.onSurface, fontSize: 13, fontWeight: '500' },
  applyBtn: {
    backgroundColor: colors.brandPrimary, paddingHorizontal: 16, height: 40,
    flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, ...shadows.sm,
  },
  applyBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12, letterSpacing: 0.5 },

  presetRow: { flexDirection: 'row', gap: 8, marginBottom: 20, flexWrap: 'wrap' },
  presetChip: {
    borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: '#FFFFFF',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, flexDirection: 'row', alignItems: 'center',
  },
  presetText: { fontWeight: '700', color: colors.mutedDark, fontSize: 12 },
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 999, ...shadows.sm,
  },
  exportBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },

  loadingWrap: { alignItems: 'center', paddingVertical: 48 },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  kpiCard: {
    flexGrow: 1, flexBasis: '47%', backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 20, alignItems: 'center', ...shadows.sm,
  },
  kpiIconWrap: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  kpiValue: { fontSize: 22, fontWeight: '800' },
  kpiLabel: { fontSize: 10, fontWeight: '700', color: colors.muted, letterSpacing: 0.5, marginTop: 6 },

  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 11, fontWeight: '800', color: colors.mutedDark, letterSpacing: 1.5,
    marginBottom: 8, textTransform: 'uppercase',
  },
  sectionBody: {
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, padding: 16, ...shadows.sm,
  },
  distRow: { paddingVertical: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: colors.divider },
  distLabel: { fontSize: 13, fontWeight: '600', color: colors.onSurface },
  barWrap: { flex: 1, height: 24, backgroundColor: colors.surfaceTertiary, position: 'relative', justifyContent: 'center', borderRadius: 6 },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  barValue: { position: 'absolute', right: 8, color: colors.onSurface, fontWeight: '700', fontSize: 11 },
  inspectorRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12, borderBottomWidth: 1, borderBottomColor: colors.divider },
  inspectorName: { color: colors.onSurface, fontWeight: '700', fontSize: 13 },
  inspectorMeta: { color: colors.muted, fontSize: 11, marginTop: 2 },
  failRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12, borderBottomWidth: 1, borderBottomColor: colors.divider },
  failLabel: { color: colors.onSurface, fontWeight: '600', fontSize: 11, flex: 1 },
  emptyText: { color: colors.muted, fontStyle: 'italic', fontSize: 13, paddingVertical: 8 },
});

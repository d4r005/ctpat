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
import { colors, spacing, typography } from '@/src/constants/theme';

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
      let query = supabase
        .from('inspections')
        .select('*');

      if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00`);
      if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59`);

      const { data: inspections, error } = await query;
      if (error) throw error;

      if (!inspections) {
        setData(null);
        return;
      }

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

      // Group by inspector
      const inspectorMap: Record<string, any> = {};
      inspections.forEach(i => {
        const name = i.data?.inspector_nombre || 'Desconocido';
        if (!inspectorMap[name]) {
          inspectorMap[name] = { name, total: 0, fallas: 0, aprobadas: 0, rechazadas: 0 };
        }
        inspectorMap[name].total++;
        if (i.status_general === 'malo') inspectorMap[name].fallas++;
        if (i.approval_status === 'aprobada') inspectorMap[name].aprobadas++;
        if (i.approval_status === 'rechazada') inspectorMap[name].rechazadas++;
      });
      const by_inspector = Object.values(inspectorMap).sort((a, b) => b.total - a.total);

      // Top failed points
      const failedPointsMap: Record<string, number> = {};
      inspections.forEach(i => {
        const points = i.data?.points || [];
        points.forEach((p: any) => {
          if (p.estado === 'malo') {
            failedPointsMap[p.name] = (failedPointsMap[p.name] || 0) + 1;
          }
        });
      });
      const top_failed_points = Object.entries(failedPointsMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      setData({
        total,
        approval_breakdown,
        status_breakdown,
        approval_rate_pct,
        by_inspector,
        top_failed_points
      });
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
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

      // Generate CSV content
      const headers = ['ID', 'Fecha', 'Placas', 'Inspector', 'Compañia', 'Trailer', 'Estado General', 'Aprobación'];
      const rows = (inspections || []).map(i => [
        i.id,
        new Date(i.created_at).toISOString(),
        i.plates,
        i.data?.inspector_nombre || '',
        i.data?.compania_transportista || '',
        i.data?.numero_trailer || '',
        i.status_general,
        i.approval_status
      ]);

      const csvContent = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');

      if (Platform.OS === 'web') {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Analitica_NAF_${dateFrom || 'report'}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        const filename = `${FileSystem.documentDirectory}reporte_naf.csv`;
        await FileSystem.writeAsStringAsync(filename, csvContent, { encoding: FileSystem.EncodingType.UTF8 });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(filename, { mimeType: 'text/csv', dialogTitle: t('csv_detallado') });
        }
      }
    } catch (e: any) {
      alert('Error al exportar CSV: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isSupervisorOrAdmin) {
    return (
      <View style={styles.center}>
        <Ionicons name="lock-closed" size={48} color={colors.muted} />
        <Text style={{ color: colors.muted, marginTop: spacing.md }}>{t('acceso_restringido')}</Text>
      </View>
    );
  }

  const maxInsp = Math.max(1, ...(data?.by_inspector || []).map((i) => i.total));
  const maxPoint = Math.max(1, ...(data?.top_failed_points || []).map((p) => p.count));

  const Content = (
    <View style={{ flex: 1 }}>
      {!nested && (
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} testID="analitica-back"><Ionicons name="arrow-back" size={24} color={colors.onSurface} /></Pressable>
          <Text style={styles.headerTitle}>{t('panel_supervisor')}</Text>
          <View style={{ width: 24 }} />
        </View>
      )}

      {nested && (
        <View style={{ padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
          <Text style={[styles.headerTitle, { fontSize: 14 }]}>{t('reporte_analitica').toUpperCase()}</Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ padding: nested ? spacing.md : spacing.lg, paddingBottom: spacing.xxxl }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brandPrimary} />}
      >
        <View style={styles.dateBox}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{t('desde')} (YYYY-MM-DD)</Text>
            <TextInput testID="analitica-date-from" style={styles.dateInput} value={dateFrom} onChangeText={setDateFrom} placeholder="2026-01-01" placeholderTextColor={colors.muted} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{t('hasta')} (YYYY-MM-DD)</Text>
            <TextInput testID="analitica-date-to" style={styles.dateInput} value={dateTo} onChangeText={setDateTo} placeholder="2026-12-31" placeholderTextColor={colors.muted} />
          </View>
          <Pressable testID="analitica-apply" style={styles.applyBtn} onPress={load}>
            <Ionicons name="filter" size={16} color={colors.onBrandPrimary} />
            <Text style={styles.applyBtnText}>{t('sincronizar_ahora').toUpperCase()}</Text>
          </Pressable>
        </View>

        <View style={styles.presetRow}>
          <Pressable testID="analitica-preset-7" style={styles.presetChip} onPress={() => applyPreset(7)}>
            <Text style={styles.presetText}>7 {t('hoy').toUpperCase()}</Text>
          </Pressable>
          <Pressable testID="analitica-preset-30" style={styles.presetChip} onPress={() => applyPreset(30)}>
            <Text style={styles.presetText}>30 {t('hoy').toUpperCase()}</Text>
          </Pressable>
          {data && (
            <Pressable testID="analitica-pdf-btn" style={[styles.presetChip, { backgroundColor: colors.brandSecondary, flex: 1 }]} onPress={exportPdf}>
              <Ionicons name="document-text" size={14} color={colors.onBrandSecondary} />
              <Text style={[styles.presetText, { color: colors.onBrandSecondary, marginLeft: 4 }]}>PDF</Text>
            </Pressable>
          )}
          {data && (
            <Pressable testID="analitica-csv-btn" style={[styles.presetChip, { backgroundColor: colors.success, flex: 1 }]} onPress={exportCsv}>
              <Ionicons name="download" size={14} color="#FFF" />
              <Text style={[styles.presetText, { color: '#FFF', marginLeft: 4 }]}>CSV</Text>
            </Pressable>
          )}
        </View>

        {loading && !data ? (
          <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} />
        ) : !data ? null : (
          <>
            <View style={styles.kpiGrid}>
              <Kpi label={t('total').toUpperCase()} value={data.total} color={colors.brandPrimary} />
              <Kpi label="% APROB." value={`${data.approval_rate_pct}%`} color={colors.success} />
              <Kpi label={t('pendientes').toUpperCase()} value={data.approval_breakdown.pendiente} color={colors.warning} />
              <Kpi label={t('con_fallas').toUpperCase()} value={data.status_breakdown.malo} color={colors.error} />
            </View>

            <Section title={t('estado').toUpperCase()}>
              <DistBar label={t('aprobada')} value={data.approval_breakdown.aprobada} total={data.total} color={colors.success} />
              <DistBar label={t('pendiente')} value={data.approval_breakdown.pendiente} total={data.total} color={colors.warning} />
              <DistBar label={t('rechazada')} value={data.approval_breakdown.rechazada} total={data.total} color={colors.error} />
            </Section>

            <Section title={t('inspecciones_por_inspector').toUpperCase()}>
              {data.by_inspector.length === 0 ? <Text style={styles.emptyText}>{t('no_hay_actividad')}</Text> : data.by_inspector.map((i) => (
                <View key={i.name} style={styles.row} testID={`analitica-inspector-${i.name}`}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowLabel}>{i.name}</Text>
                    <Text style={styles.rowMeta}>{i.aprobadas} {t('aprob').toLowerCase()} · {i.rechazadas} {t('rech').toLowerCase()}</Text>
                  </View>
                  <View style={styles.barWrap}>
                    <View style={[styles.bar, { width: `${(i.total / maxInsp) * 100}%`, backgroundColor: colors.brandPrimary }]} />
                    <Text style={styles.barValue}>{i.total}</Text>
                  </View>
                </View>
              ))}
            </Section>

            <Section title={t('top_10_fallas').toUpperCase()}>
              {data.top_failed_points.length === 0 ? <Text style={styles.emptyText}>{t('no_hay_actividad')}</Text> : data.top_failed_points.map((p) => (
                <View key={p.name} style={styles.row}>
                  <Text style={[styles.rowLabel, { flex: 1, fontSize: 10 }]} numberOfLines={2}>{p.name}</Text>
                  <View style={styles.barWrap}>
                    <View style={[styles.bar, { width: `${(p.count / maxPoint) * 100}%`, backgroundColor: colors.error }]} />
                    <Text style={styles.barValue}>{p.count}</Text>
                  </View>
                </View>
              ))}
            </Section>
          </>
        )}
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

function Kpi({ label, value, color }: { label: string; value: any; color: string }) {
  return (
    <View style={[styles.kpi, { borderColor: color }]}>
      <Text style={[styles.kpiValue, { color }]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}
function DistBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <View style={styles.distRow}>
      <Text style={styles.distLabel}>{label}</Text>
      <View style={styles.barWrap}>
        <View style={[styles.bar, { width: `${pct}%`, backgroundColor: color }]} />
        <Text style={styles.barValue}>{value} ({pct}%)</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { padding: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surfaceSecondary, borderBottomWidth: 2, borderBottomColor: colors.borderStrong },
  headerTitle: { fontSize: typography.sizes.lg, fontWeight: '900', color: colors.onSurface, letterSpacing: 1 },
  dateBox: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end', marginBottom: spacing.lg, flexWrap: 'wrap' },
  label: { fontSize: 10, fontWeight: '900', color: colors.muted, letterSpacing: 1, marginBottom: 4 },
  dateInput: { borderWidth: 2, borderColor: colors.borderStrong, padding: spacing.sm, backgroundColor: colors.surfaceSecondary, color: colors.onSurface, height: 40 },
  applyBtn: { backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.md, height: 40, flexDirection: 'row', alignItems: 'center', gap: 6 },
  applyBtnText: { color: colors.onBrandPrimary, fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  presetRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg, flexWrap: 'wrap' },
  presetChip: { borderWidth: 2, borderColor: colors.borderStrong, backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.md, paddingVertical: 8, flexShrink: 0, flexDirection: 'row', alignItems: 'center' },
  presetText: { fontWeight: '900', color: colors.onSurface, fontSize: 11, letterSpacing: 1 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  kpi: { flexGrow: 1, flexBasis: '47%', borderWidth: 2, padding: spacing.md, backgroundColor: colors.surfaceSecondary, alignItems: 'center' },
  kpiValue: { fontSize: 28, fontWeight: '900' },
  kpiLabel: { fontSize: 10, fontWeight: '900', color: colors.muted, letterSpacing: 1, marginTop: 2 },
  section: { marginBottom: spacing.lg },
  sectionTitle: { backgroundColor: colors.brandPrimary, color: colors.onBrandPrimary, padding: spacing.sm, fontWeight: '900', letterSpacing: 1, fontSize: 12 },
  sectionBody: { borderWidth: 2, borderColor: colors.borderStrong, borderTopWidth: 0, backgroundColor: colors.surfaceSecondary, padding: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowLabel: { color: colors.onSurface, fontWeight: '700', fontSize: typography.sizes.sm },
  rowMeta: { color: colors.muted, fontSize: 11, marginTop: 2 },
  barWrap: { flex: 1.2, height: 22, backgroundColor: colors.surfaceTertiary, position: 'relative', justifyContent: 'center' },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  barValue: { position: 'absolute', right: 6, color: colors.onSurface, fontWeight: '900', fontSize: 11 },
  distRow: { paddingVertical: spacing.sm, gap: 4 },
  distLabel: { color: colors.onSurface, fontWeight: '700', fontSize: typography.sizes.sm },
  emptyText: { color: colors.muted, fontStyle: 'italic' },
});

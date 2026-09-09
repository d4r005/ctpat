import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  ActivityIndicator, Image, Alert, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useAuth } from '@/src/context/AuthContext';
import { supabase } from '@/src/api/supabase';
import { colors, spacing, radius } from '@/src/constants/theme';
import MainHeader from '@/src/components/MainHeader';
import BoxDamageMap, { DamageMap, countDamages, DAMAGE_SURFACES } from '@/src/components/BoxDamageMap';
import {
  ChecklistState, countNoCumple,
  CHECKLIST_FISICO_MECANICO, CHECKLIST_CUIDADO_MERCANCIA, CHECKLIST_ASEGURAMIENTO_CARGA,
} from '@/src/components/WarehouseChecklist';
import { generateWarehouseReportHtml, WarehouseReportData } from '@/src/utils/warehouseReport';
import RoleGate from '@/src/components/RoleGate';
import { canAccessWarehouse } from '@/src/utils/permissions';

function AlmacenDetalle() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();

  const [rec, setRec] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    setNotFound(false);
    try {
      const { data, error } = await supabase
        .from('warehouse_records')
        .select('*')
        .eq('id', id)
        .single();
      if (error) {
        if (error.code === 'PGRST116') setNotFound(true);
        else throw error;
        return;
      }
      setRec({ ...data.data, id: data.id, plates: data.plates, created_at: data.created_at, record_id: data.record_id });
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo cargar el registro.');
    } finally { setLoading(false); }
  }, [token, id]);

  React.useEffect(() => { load(); }, [load]);

  const handlePdf = async () => {
    if (!rec) return;
    setReportLoading(true);
    try {
      const html = generateWarehouseReportHtml(rec as WarehouseReportData);
      if (Platform.OS === 'web') {
        const win = window.open('', '_blank');
        win?.document.write(html);
        win?.document.close();
        setTimeout(() => win?.print(), 500);
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        await Sharing.shareAsync(uri);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setReportLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <MainHeader title="ALMACÉN" showBack subtitle="Almacén: Detalle de registro" />
        <View style={styles.centerWrap}>
          <ActivityIndicator color={colors.brandSecondary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (notFound || !rec) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <MainHeader title="ALMACÉN" showBack subtitle="Almacén: Detalle de registro" />
        <View style={styles.centerWrap}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.mutedLight} />
          <Text style={styles.emptyTitle}>REGISTRO NO ENCONTRADO</Text>
          <Pressable style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryText}>REINTENTAR</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const danos = countDamages(rec.damage_map);
  const materiales: any[] = Array.isArray(rec.materiales) ? rec.materiales : [];
  const noCumpleTotal = countNoCumple(rec.checklist_fisico_mecanico) + countNoCumple(rec.checklist_cuidado_mercancia) + countNoCumple(rec.checklist_aseguramiento_carga);
  const validImg = (src?: string) => !!src && (src.startsWith('data:image') || src.startsWith('http'));
  const fmtDate = (d: any) => {
    if (!d) return '';
    try { return new Date(d).toLocaleString('es-MX', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }); } catch { return ''; }
  };

  const photo = (src: string | undefined, label: string) => (
    <View style={styles.photoCard}>
      <Text style={styles.photoLabel}>{label}</Text>
      {validImg(src) ? (
        <Image source={{ uri: src }} style={styles.photoImg} />
      ) : (
        <View style={[styles.photoImg, styles.photoEmpty]}><Text style={styles.photoEmptyText}>SIN FOTO</Text></View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <MainHeader
        title="ALMACÉN"
        subtitle={`Almacén: ${rec.plates || rec.placas_unidad || ''}`}
        showBack
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Resumen */}
        <View style={styles.summaryRow}>
          <SummaryBox label="DAÑOS" value={danos > 0 ? `${danos}` : '0'} bad={danos > 0} />
          <SummaryBox label="NO CUMPLE" value={`${noCumpleTotal}`} bad={noCumpleTotal > 0} />
          <SummaryBox label="MATERIALES" value={`${materiales.length}`} />
          <SummaryBox label="ALMACENISTA" value={(rec.almacenista || '—').split(' ')[0] || '—'} small />
        </View>

        <Section title="DATOS DE UNIDAD Y ALMACÉN">
          <Row label="PLACAS" value={rec.plates || rec.placas_unidad} />
          <Row label="NO. CAJA" value={rec.numero_caja} />
          <Row label="PLACAS CAJA" value={rec.placas_caja} />
          <Row label="OPERADOR" value={rec.operador} />
          <Row label="LÍNEA TRANSPORTE" value={rec.linea_transporte} />
          <Row label="CLIENTE" value={rec.cliente} />
          <Row label="ALMACENISTA" value={rec.almacenista} />
          <Row label="ÁREA" value={rec.area} />
          <Row label="HORA INICIO" value={rec.hora_inicio} />
          <Row label="HORA FIN" value={rec.hora_fin} />
          <Row label="FECHA" value={fmtDate(rec.created_at)} />
        </Section>

        <Section title="FOTOGRAFÍAS DE LA CAJA">
          <View style={styles.photoGrid}>
            {photo(rec.foto_techo, 'TECHO')}
            {photo(rec.foto_piso, 'PISO')}
            {photo(rec.foto_pared_izq, 'PARED IZQUIERDA')}
            {photo(rec.foto_pared_der, 'PARED DERECHA')}
          </View>
        </Section>

        <Section title={`MAPA DE DAÑOS ${danos > 0 ? `— ${danos} ZONA(S) DAÑADA(S)` : '— SIN DAÑOS'}`}>
          <BoxDamageMap value={(rec.damage_map as DamageMap) || {}} readOnly />
          {DAMAGE_SURFACES.some(s => (rec.damage_notes?.[s.key] || '').trim()) && (
            <View style={{ marginTop: spacing.md }}>
              {DAMAGE_SURFACES.filter(s => (rec.damage_notes?.[s.key] || '').trim()).map(s => (
                <View key={s.key} style={styles.noteRow}>
                  <Text style={styles.noteRowLabel}>{s.label}</Text>
                  <Text style={styles.noteRowValue}>{rec.damage_notes[s.key]}</Text>
                </View>
              ))}
            </View>
          )}
        </Section>

        <ChecklistReadonly title="1. INSPECCIÓN FÍSICO-MECÁNICA CONTENEDOR/CAJA" items={CHECKLIST_FISICO_MECANICO} state={rec.checklist_fisico_mecanico} />
        <ChecklistReadonly title="2. VERIFICACIÓN DEL CUIDADO DE LA MERCANCÍA" items={CHECKLIST_CUIDADO_MERCANCIA} state={rec.checklist_cuidado_mercancia} />
        <ChecklistReadonly title="3. ASEGURAMIENTO Y SUJECIÓN DE LA CARGA" items={CHECKLIST_ASEGURAMIENTO_CARGA} state={rec.checklist_aseguramiento_carga} />
        {!!rec.sello_numero && (
          <Section title="SELLO DE SEGURIDAD">
            <Row label="NÚMERO DE SELLO" value={rec.sello_numero} />
          </Section>
        )}

        <Section title="LISTA DE VERIFICACIÓN DE MATERIAL CARGADO">
          {materiales.length === 0 ? (
            <Text style={styles.emptyMaterials}>SIN MATERIALES REGISTRADOS</Text>
          ) : (
            materiales.map((m: any, idx: number) => (
              <View key={idx} style={styles.materialCard}>
                <View style={styles.materialHeader}>
                  <Text style={styles.materialIdx}>#{idx + 1} · {(m.tipo || '—')}</Text>
                  {!!m.cantidad && <Text style={styles.materialQty}>CANT. {m.cantidad}</Text>}
                </View>
                <Text style={styles.materialDesc}>{(m.descripcion || '—').toUpperCase()}</Text>
                {!!m.observaciones && <Text style={styles.materialObs}>{m.observaciones.toUpperCase()}</Text>}
                {Array.isArray(m.fotos) && m.fotos.length > 0 && (
                  <View style={styles.materialPhotoGrid}>
                    {m.fotos.map((foto: string, pIdx: number) => (
                      validImg(foto) ? <Image key={pIdx} source={{ uri: foto }} style={styles.materialPhotoThumb} /> : null
                    ))}
                  </View>
                )}
              </View>
            ))
          )}
        </Section>

        <Section title="OBSERVACIONES GENERALES">
          <Text style={styles.obsText}>{(rec.observaciones || 'SIN OBSERVACIONES').toUpperCase()}</Text>
        </Section>

        <Section title="FIRMAS">
          <View style={styles.sigRow}>
            <SigBox src={rec.firma_almacenista} label="ALMACENISTA" name={rec.almacenista} />
            <SigBox src={rec.firma_supervisor} label="SUPERVISOR" name={rec.supervisor_nombre} />
          </View>
        </Section>

        <Pressable style={[styles.pdfBtn, reportLoading && { opacity: 0.6 }]} onPress={handlePdf} disabled={reportLoading}>
          {reportLoading
            ? <ActivityIndicator color="#FFF" />
            : <><Ionicons name="document-text" size={22} color={colors.onBrandPrimary} /><Text style={styles.pdfBtnText}>GENERAR REPORTE CONSOLIDADO DE ALMACÉN</Text></>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: any) {
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={styles.secTitle}>{title}</Text>
      <View style={styles.secBody}>{children}</View>
    </View>
  );
}

function Row({ label, value }: any) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value || '—'}</Text>
    </View>
  );
}

function ChecklistReadonly({ title, items, state }: { title: string; items: { key: string; label: string }[]; state?: ChecklistState }) {
  return (
    <Section title={title}>
      {items.map((it) => {
        const entry = (state && state[it.key]) || { valor: '', nota: '' };
        const valor = entry.valor || '—';
        const badgeStyle = valor === 'CUMPLE' ? styles.checklistBadgeSuccess
          : valor === 'NO_CUMPLE' ? styles.checklistBadgeError
          : styles.checklistBadgeNeutral;
        return (
          <View key={it.key} style={styles.checklistRow}>
            <Text style={styles.checklistLabel}>{it.label}</Text>
            <View style={[styles.checklistBadge, badgeStyle]}>
              <Text style={styles.checklistBadgeText}>{valor === 'NO_CUMPLE' ? 'NO CUMPLE' : valor}</Text>
            </View>
            {!!entry.nota && <Text style={styles.checklistNota}>{entry.nota}</Text>}
          </View>
        );
      })}
    </Section>
  );
}

function SummaryBox({ label, value, bad, small }: { label: string; value: string; bad?: boolean; small?: boolean }) {
  return (
    <View style={[styles.summaryBox, bad && styles.summaryBoxBad]}>
      <Text style={[styles.summaryValue, small && { fontSize: 12 }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function SigBox({ src, label, name }: { src?: string; label: string; name?: string }) {
  const valid = !!src && (src.startsWith('data:image') || src.startsWith('http'));
  return (
    <View style={styles.sigBox}>
      <View style={styles.sigCanvas}>
        {valid ? <Image source={{ uri: src }} style={{ width: '100%', height: '100%', resizeMode: 'contain' }} />
          : <Text style={styles.sigEmpty}>SIN FIRMA</Text>}
      </View>
      <Text style={styles.sigLabel}>{label}</Text>
      {!!name && <Text style={styles.sigName}>{name}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyTitle: { fontWeight: '900', color: colors.muted, letterSpacing: 1, fontSize: 12 },
  retryBtn: { marginTop: 8, borderWidth: 1, borderColor: colors.borderStrong, paddingVertical: 10, paddingHorizontal: 20, borderRadius: radius.xs },
  retryText: { fontWeight: '900', letterSpacing: 1, fontSize: 11, color: colors.onSurface },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  summaryRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  summaryBox: { flex: 1, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  summaryBoxBad: { borderColor: colors.error, backgroundColor: colors.errorSurface },
  summaryValue: { fontSize: 18, fontWeight: '900', color: colors.onSurface },
  summaryLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1, color: colors.mutedLight, marginTop: 2 },
  secTitle: { backgroundColor: colors.brandPrimary, color: colors.onBrandPrimary, padding: spacing.sm, fontWeight: '900', letterSpacing: 1, fontSize: 12 },
  secBody: { borderWidth: 1, borderColor: colors.borderStrong, borderTopWidth: 0, padding: spacing.md, backgroundColor: colors.surfaceSecondary },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  rowLabel: { fontSize: 10, fontWeight: '900', color: colors.mutedLight, letterSpacing: 1 },
  rowValue: { fontSize: 12, color: colors.onSurface, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photoCard: { width: '48%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xs, overflow: 'hidden' },
  photoLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1, color: colors.mutedDark, backgroundColor: colors.surfaceTertiary, paddingVertical: 4, textAlign: 'center' },
  photoImg: { width: '100%', height: 120, resizeMode: 'cover' },
  photoEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceTertiary },
  photoEmptyText: { fontSize: 10, color: colors.mutedLight, fontWeight: '700' },
  noteRow: { flexDirection: 'row', borderWidth: 1, borderColor: colors.warning, backgroundColor: colors.warningSurface, padding: spacing.sm, marginBottom: 6, gap: spacing.sm, borderRadius: radius.xs },
  noteRowLabel: { fontSize: 10, fontWeight: '900', color: colors.onWarning, width: 100 },
  noteRowValue: { flex: 1, fontSize: 11, color: colors.onSurface },
  emptyMaterials: { fontSize: 11, color: colors.mutedLight, fontWeight: '700', textAlign: 'center', paddingVertical: spacing.lg, letterSpacing: 1 },
  materialCard: { borderWidth: 1, borderColor: colors.borderStrong, padding: spacing.md, marginBottom: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.xs },
  materialHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  materialIdx: { fontSize: 10, fontWeight: '900', color: colors.brandSecondary, letterSpacing: 1 },
  materialQty: { fontSize: 10, fontWeight: '900', color: colors.mutedDark },
  materialDesc: { fontSize: 12, fontWeight: '800', color: colors.onSurface },
  materialObs: { fontSize: 10, color: colors.muted, marginTop: 2 },
  obsText: { fontSize: 12, color: colors.onSurface },
  sigRow: { flexDirection: 'row', gap: spacing.md, justifyContent: 'space-around' },
  sigBox: { flex: 1, alignItems: 'center', maxWidth: 200 },
  sigCanvas: { width: '100%', height: 80, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'flex-end', borderBottomWidth: 2, borderBottomColor: colors.brandPrimary },
  sigEmpty: { fontSize: 9, color: colors.mutedLight, padding: 8 },
  sigLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1, color: colors.mutedDark, marginTop: 4 },
  sigName: { fontSize: 9, color: colors.muted, marginTop: 1 },
  pdfBtn: { backgroundColor: colors.brandPrimary, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, minHeight: 60, borderRadius: radius.sm },
  pdfBtnText: { color: colors.onBrandPrimary, fontWeight: '900', letterSpacing: 1, fontSize: 12 },
  checklistRow: { borderBottomWidth: 1, borderBottomColor: colors.divider, paddingVertical: spacing.sm },
  checklistLabel: { fontSize: 11, color: colors.onSurface, fontWeight: '600', marginBottom: 6, lineHeight: 15 },
  checklistBadge: { alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.xs },
  checklistBadgeSuccess: { backgroundColor: colors.success },
  checklistBadgeError: { backgroundColor: colors.error },
  checklistBadgeNeutral: { backgroundColor: colors.mutedLight },
  checklistBadgeText: { fontSize: 9, fontWeight: '900', color: '#FFF', letterSpacing: 0.5 },
  checklistNota: { fontSize: 10, color: colors.error, marginTop: 4, fontStyle: 'italic' },
  materialPhotoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  materialPhotoThumb: { width: 56, height: 56, borderRadius: radius.xs, borderWidth: 1, borderColor: colors.border },
});


// Guarda de acceso por rol: canAccessWarehouse
export default () => (
  <RoleGate allow={canAccessWarehouse}>
    <AlmacenDetalle />
  </RoleGate>
);

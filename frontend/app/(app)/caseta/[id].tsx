import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Signature from '@/src/components/SignaturePad';
import { apiCall } from '@/src/api/client';
import { useAuth } from '@/src/context/AuthContext';
import { useInspections } from '@/src/context/InspectionContext';
import { colors, spacing, typography } from '@/src/constants/theme';

import { useTranslation } from 'react-i18next';

export default function CasetaDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const { patchVehicleExit, updateVehicleRecord } = useInspections();
  const [rec, setRec] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Exit form
  const [showExit, setShowExit] = useState(false);
  const [exitData, setExitData] = useState<any>({
    hora_apertura_cortina: '', hora_cierre_cortina: '', cortina_salida: '',
    sello_salida: '', sello_salida_2: '', condicion_salida: '', destino: '',
    numero_tractor_salida: '', numero_caja_salida: '', numero_caja_salida_2: '',
    escolta: { presente: false, compania: '', unidad: '', placas: '' },
    pallets: '', cajas: '', bultos: '',
    sello_vvtt_estado: '', sello_vvtt_foto: '',
    sello_vvtt_estado_2: '', sello_vvtt_foto_2: '',
    guardia_salida_nombre: '',
  });
  const [saving, setSaving] = useState(false);
  const [ticket, setTicket] = useState<any>(null);

  const [editEntry, setEditEntry] = useState(false);
  const [entryForm, setEntryForm] = useState<any>({});

  const [showSigModal, setShowSigModal] = useState(false);
  const [sigModalConfig, setSigModalConfig] = useState<any>({ title: '', onSave: () => {} });

  const isAdmin = user?.role === 'admin' || ['d.trujillo@brancoindustries.com', 'd4r005@gmail.com'].includes(user?.email || '');

  const pickPhoto = async (type: 'entry' | 'exit', field: string) => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { alert(t('acceso_restringido')); return; }

      let r;
      if (Platform.OS === 'web') {
        r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.5, base64: true });
      } else {
        r = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.5, base64: true });
      }

      if (!r.canceled && r.assets[0]?.base64) {
        const dataUrl = `data:image/jpeg;base64,${r.assets[0].base64}`;
        if (type === 'entry') setEntryForm((prev: any) => ({ ...prev, [field]: dataUrl }));
        else setExitData((prev: any) => ({ ...prev, [field]: dataUrl }));
      }
    } catch (e: any) { alert(e.message || 'Error al obtener foto'); }
  };

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiCall<any>(`/vehicle-records/${id}`, { token });
      if (data) {
        setRec(data);
        setEntryForm(data.entry || {});
        if (data.exit) {
          setExitData(data.exit);
        }

        try {
          const tickets = await apiCall<any[]>('/shipping-tickets', { token });
          const myTicket = tickets.find(t =>
            t.placas_unidad === data.entry.placas_unidad &&
            new Date(t.created_at).getTime() >= new Date(data.created_at).getTime()
          );
          if (myTicket) setTicket(myTicket);
        } catch {}
      }
    } catch (e: any) {
      console.error(e);
      alert(t('error_cargar_datos'));
    } finally { setLoading(false); }
  };

  const openExitForm = () => {
    setExitData({
      ...exitData,
      numero_tractor_salida: rec.entry.numero_tractor || '',
      numero_caja_salida: rec.entry.numero_caja || '',
      numero_caja_salida_2: rec.entry.numero_caja_2 || '',
      destino: rec.entry.destino || ticket?.observaciones?.replace('Destino: ', '') || '',
      pallets: ticket?.numero_pallets || '',
      sello_salida: ticket?.numero_sello || '',
      condicion_salida: rec.entry.condicion_carga === 'descarga' ? 'vacio' : 'carga_cliente',
      guardia_salida_nombre: user?.name || '',
      hora_apertura_cortina: ticket?.hora_apertura_cortina || '',
      hora_cierre_cortina: ticket?.hora_cierre_cortina || '',
      cortina_salida: ticket?.area || '',
    });
    setShowExit(true);
  };

  const handleRemoveExitPhoto = async (field: string) => {
    if (!confirm(t('quitar_foto_salida'))) return;
    setSaving(true);
    try {
      const updatedExit = { ...exitData, [field]: '' };
      await apiCall(`/vehicle-records/${id}`, { method: 'PUT', body: { exit: updatedExit }, token });
      await load();
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  };

  const confirm = (msg: string) => {
    if (Platform.OS === 'web') return window.confirm(msg);
    return true;
  };

  const handleUpdateEntry = async () => {
    setSaving(true);
    try {
      const body: any = { entry: entryForm };
      if (rec.exit) body.exit = exitData;
      await apiCall(`/vehicle-records/${id}`, { method: 'PUT', body, token });
      setEditEntry(false);
      await load();
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  };

  useEffect(() => { if (id) load(); }, [id, token]);

  const goInspeccion = (trailerNum?: string, selloNum?: string) => {
    if (!rec) return;
    const params = new URLSearchParams({
      record_id: rec.id,
      compania: rec.entry.compania_transporte || '',
      placas: rec.entry.placas_unidad || '',
      trailer: trailerNum || rec.entry.numero_caja || '',
      sello: selloNum || rec.entry.sello_entrada || '',
    });
    router.push(`/(app)/nueva?${params.toString()}`);
  };

  const saveExit = async () => {
    const isFull = rec.entry.tipo_unidad === 'full';
    const isDescarga = rec.entry.condicion_carga === 'descarga';
    const basicCheck = exitData.guardia_salida_nombre?.trim() && exitData.condicion_salida;
    let validationPassed = basicCheck;
    if (!isDescarga) {
      const sealCheck = exitData.sello_vvtt_estado && exitData.sello_salida;
      const fullCheck = !isFull || (exitData.sello_vvtt_estado_2 && exitData.sello_salida_2);
      validationPassed = basicCheck && sealCheck && fullCheck;
    }
    if (!validationPassed) { alert(t('completar_datos_salida')); return; }
    setSaving(true);
    try {
      await patchVehicleExit(id as string, exitData);
      setShowExit(false);
      await load();
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  };

  if (loading) return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View></SafeAreaView>;
  const e = rec?.entry || {};
  const x = rec?.exit;
  const STATUS_COLOR: any = { entrada: colors.warning, inspeccionado: colors.info, salida: colors.success };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']} testID="caseta-detail">
      <View style={styles.topBar}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/(app)/supervisor')} style={{ padding: 10, marginLeft: -10 }}>
          <Ionicons name="arrow-back" size={28} color={colors.onBrandPrimary} />
        </Pressable>
        <Text style={styles.topTitle}>{t('registro')} {e.placas_unidad}</Text>
        <Pressable onPress={() => router.push({ pathname: '/(app)/chat', params: { room: `PLATES_${e.placas_unidad}`, title: `${t('chat_unidad')} ${e.placas_unidad}` } })} style={{ marginRight: 10 }}>
          <Ionicons name="chatbubbles-outline" size={26} color="#FFF" />
        </Pressable>
        <View style={[styles.statusChip, { backgroundColor: STATUS_COLOR[rec.status] }]}>
          <Text style={styles.statusChipText}>{t(rec.status).toUpperCase()}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
          <Text style={[styles.secTitle, { flex: 1, marginBottom: 0 }]}>{t('entrada_datos_unidad')}</Text>
          {isAdmin && (
            <Pressable onPress={() => editEntry ? handleUpdateEntry() : setEditEntry(true)} style={{ backgroundColor: editEntry ? colors.success : colors.brandSecondary, paddingHorizontal: 12, paddingVertical: 6, marginLeft: 8 }}>
              <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 10 }}>{editEntry ? t('guardar').toUpperCase() : t('editar').toUpperCase()}</Text>
            </Pressable>
          )}
        </View>

        <Section>
          {editEntry ? (
            <View style={{ padding: spacing.sm }}>
              <EditField label={t('placas_unidad_caps')} v={entryForm.placas_unidad} on={(t: string) => setEntryForm({...entryForm, placas_unidad: t})} />
              <EditField label={t('nombre_chofer').toUpperCase() || "CHOFER"} v={entryForm.chofer_nombre} on={(t: string) => setEntryForm({...entryForm, chofer_nombre: t})} />
              <EditField label={t('compania_transportista_caps')} v={entryForm.compania_transporte} on={(t: string) => setEntryForm({...entryForm, compania_transporte: t})} />
              <EditField label={t('numero_caja_caps')} v={entryForm.numero_caja} on={(t: string) => setEntryForm({...entryForm, numero_caja: t})} />
              <EditField label={t('sello').toUpperCase() || "SELLO"} v={entryForm.sello_entrada} on={(t: string) => setEntryForm({...entryForm, sello_entrada: t})} />
            </View>
          ) : (
            <>
              <Row label={t('placas')} value={e.placas_unidad} />
              <Row label={t('nombre_chofer') || "Chofer"} value={e.chofer_nombre} />
              <Row label={t('licencia')} value={e.licencia_conductor} />
              <Row label={t('compania')} value={e.compania_transporte} />
              <Row label={t('numero_tractor_caps') || "# Tractor"} value={e.numero_tractor} />
              <Row label={t('numero_caja_caps') || "Número Caja"} value={e.numero_caja} />
              <Row label={t('sello_entrada') || "Sello entrada"} value={e.sello_entrada} />
              {e.tipo_unidad === 'full' && (
                <>
                  <Row label={t('caja_2_caps')} value={e.numero_caja_2} />
                  <Row label={t('sello_entrada') + " 2"} value={e.sello_entrada_2} />
                </>
              )}
              <Row label={t('guardia_caseta')} value={e.guardia_caseta_nombre} />
              <Row label={t('fecha_entrada')} value={new Date(e.fecha_entrada).toLocaleString()} />
            </>
          )}
        </Section>

        {(rec.status === 'entrada' || rec.status === 'inspeccionado') && (
          <Pressable style={styles.bigBtn} onPress={() => goInspeccion(e.numero_caja, e.sello_entrada)}>
            <Ionicons name="clipboard" size={24} color={colors.onBrandPrimary} />
            <Text style={styles.bigBtnText}>{t('iniciar_inspeccion_19')}</Text>
          </Pressable>
        )}

        {(rec.inspection_ids && rec.inspection_ids.length > 0) && rec.inspection_ids.map((inspId: string, idx: number) => (
          <Pressable key={inspId} style={[styles.bigBtn, { backgroundColor: colors.info, marginTop: -spacing.sm }]} onPress={() => router.push(`/inspection/${inspId}`)}>
            <Ionicons name="document-text" size={24} color={colors.onInfo} />
            <Text style={styles.bigBtnText}>{t('ver_inspeccion_vinculada')} {idx+1}</Text>
          </Pressable>
        ))}

        {x ? (
          <Section title={t('salida')}>
             <Row label={t('fecha_salida')} value={new Date(x.fecha_salida).toLocaleString()} />
             <Row label={t('guardia_salida')} value={x.guardia_salida_nombre} />
          </Section>
        ) : (
          <Pressable style={[styles.bigBtn, { backgroundColor: colors.success }]} onPress={openExitForm}>
            <Ionicons name="exit" size={24} color={colors.onSuccess} />
            <Text style={styles.bigBtnText}>{t('registrar_salida')}</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: any) {
  return <View style={{ marginBottom: spacing.lg }}>{title && <Text style={styles.secTitle}>{title}</Text>}<View style={styles.secBody}>{children}</View></View>;
}
function Row({ label, value }: { label: string; value: any }) {
  return <View style={styles.row}><Text style={styles.rowLabel}>{label}</Text><Text style={styles.rowValue}>{value || '-'}</Text></View>;
}
function EditField({ label, v, on }: any) {
  return <View style={{ marginBottom: spacing.sm }}><Text style={styles.label}>{label}</Text><TextInput style={styles.exitInput} value={v} onChangeText={on} autoCapitalize="characters" /></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { backgroundColor: colors.brandPrimary, padding: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topTitle: { color: colors.onBrandPrimary, fontWeight: '900', fontSize: typography.sizes.base, flex: 1, marginHorizontal: spacing.md },
  statusChip: { paddingHorizontal: spacing.sm, paddingVertical: 4 },
  statusChipText: { color: '#FFF', fontWeight: '900', fontSize: 10 },
  secTitle: { backgroundColor: colors.brandPrimary, color: colors.onBrandPrimary, padding: spacing.sm, fontWeight: '900', fontSize: 12 },
  secBody: { backgroundColor: colors.surfaceSecondary, borderWidth: 2, borderColor: colors.borderStrong, borderTopWidth: 0 },
  row: { flexDirection: 'row', padding: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowLabel: { width: 130, fontWeight: '700', color: colors.onSurfaceTertiary, fontSize: typography.sizes.sm },
  rowValue: { flex: 1, color: colors.onSurface, fontSize: typography.sizes.sm, fontWeight: '700' },
  bigBtn: { backgroundColor: colors.brandPrimary, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.md },
  bigBtnText: { color: colors.onBrandPrimary, fontWeight: '900', fontSize: typography.sizes.base },
  label: { fontSize: 11, fontWeight: '900', color: colors.muted, marginTop: spacing.sm, marginBottom: 4 },
  exitInput: { borderWidth: 2, borderColor: colors.borderStrong, padding: spacing.sm, backgroundColor: colors.surfaceSecondary, color: colors.onSurface },
});

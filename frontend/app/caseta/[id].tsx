import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { apiCall } from '@/src/api/client';
import { useAuth } from '@/src/context/AuthContext';
import { colors, spacing, typography } from '@/src/constants/theme';

export default function CasetaDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { token } = useAuth();
  const [rec, setRec] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Exit form
  const [showExit, setShowExit] = useState(false);
  const [exitData, setExitData] = useState<any>({
    hora_apertura_cortina: '', hora_cierre_cortina: '', cortina_salida: '',
    sello_salida: '', condicion_salida: '', destino: '',
    numero_tractor_salida: '', numero_caja_salida: '',
    escolta: { presente: false, compania: '', unidad: '', placas: '' },
    pallets: '', cajas: '', bultos: '',
    sello_vvtt_estado: '', sello_vvtt_foto: '',
    guardia_salida_nombre: '',
  });
  const [saving, setSaving] = useState(false);

  const pickPhoto = async (type: 'entry' | 'exit', field: string) => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { alert('Se necesita acceso a la cámara'); return; }
      const r = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.5, base64: true });
      if (!r.canceled && r.assets[0]?.base64) {
        const dataUrl = `data:image/jpeg;base64,${r.assets[0].base64}`;
        if (type === 'entry') setEntryForm({ ...entryForm, [field]: dataUrl });
        else setExitData({ ...exitData, [field]: dataUrl });
      }
    } catch (e: any) { alert(e.message || 'Error al obtener foto'); }
  };

  const [editEntry, setEditEntry] = useState(false);
  const [entryForm, setEntryForm] = useState<any>(null);

  const isAdmin = ['d.trujillo@brancoindustries.com', 'd4r005@gmail.com'].includes(useAuth().user?.email || '');

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiCall<any>(`/vehicle-records/${id}`, { token });
      setRec(data);
      setEntryForm(data.entry);
      if (data.exit) setExitData(data.exit);
    } catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  };

  const handleRemoveExitPhoto = async (field: string) => {
    if (!confirm('¿Quitar esta foto del registro de salida?')) return;
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
      await apiCall(`/vehicle-records/${id}`, { method: 'PUT', body: { entry: entryForm }, token });
      setEditEntry(false);
      await load();
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  };

  useEffect(() => { if (id) load(); }, [id, token]);

  const goInspeccion = () => {
    if (!rec) return;
    const params = new URLSearchParams({
      record_id: rec.id,
      compania: rec.entry.compania_transporte || '',
      placas: rec.entry.placas_unidad || '',
      trailer: rec.entry.numero_caja || '',
      sello: rec.entry.sello_entrada || '',
    });
    router.push(`/(app)/nueva?${params.toString()}`);
  };

  const saveExit = async () => {
    if (!exitData.guardia_salida_nombre?.trim() || !exitData.condicion_salida || !exitData.sello_vvtt_estado) {
      alert('Completa guardia, condición de salida e inspección de sello VVTT'); return;
    }
    setSaving(true);
    try {
      await apiCall(`/vehicle-records/${id}/exit`, { method: 'PATCH', body: exitData, token });
      setShowExit(false);
      await load();
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  };

  if (loading || !rec) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
      </SafeAreaView>
    );
  }

  const e = rec.entry;
  const x = rec.exit;
  const STATUS_COLOR: any = { entrada: colors.warning, inspeccionado: colors.info, salida: colors.success };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']} testID="caseta-detail">
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(app)/supervisor')}
          style={{ padding: 10, marginLeft: -10 }}
        >
          <Ionicons name="arrow-back" size={28} color={colors.onBrandPrimary} />
        </Pressable>
        <Text style={styles.topTitle}>Registro {e.placas_unidad}</Text>
        <View style={[styles.statusChip, { backgroundColor: STATUS_COLOR[rec.status] }]}>
          <Text style={styles.statusChipText}>{rec.status.toUpperCase()}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
          <Text style={[styles.secTitle, { flex: 1, marginBottom: 0 }]}>ENTRADA — DATOS DEL VEHÍCULO</Text>
          {isAdmin && !rec.exit && (
            <Pressable
              onPress={() => editEntry ? handleUpdateEntry() : setEditEntry(true)}
              style={{ backgroundColor: editEntry ? colors.success : colors.brandSecondary, paddingHorizontal: 12, paddingVertical: 6, marginLeft: 8 }}
            >
              <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 10 }}>{editEntry ? 'GUARDAR' : 'EDITAR'}</Text>
            </Pressable>
          )}
        </View>

        <Section>
          {editEntry ? (
            <View style={{ padding: spacing.sm }}>
              <EditField label="PLACAS" v={entryForm.placas_unidad} on={(t: string) => setEntryForm({...entryForm, placas_unidad: t})} />
              <EditField label="CHOFER" v={entryForm.chofer_nombre} on={(t: string) => setEntryForm({...entryForm, chofer_nombre: t})} />
              <EditField label="COMPAÑÍA" v={entryForm.compania_transporte} on={(t: string) => setEntryForm({...entryForm, compania_transporte: t})} />
              <EditField label="TRAILER" v={entryForm.numero_caja} on={(t: string) => setEntryForm({...entryForm, numero_caja: t})} />
              <EditField label="SELLO" v={entryForm.sello_entrada} on={(t: string) => setEntryForm({...entryForm, sello_entrada: t})} />
              <EditField label="CORTINA" v={entryForm.cortina_asignada} on={(t: string) => setEntryForm({...entryForm, cortina_asignada: t})} />
            </View>
          ) : (
            <>
              <Row label="Placas" value={e.placas_unidad} />
              <Row label="Chofer" value={e.chofer_nombre} />
              <Row label="Licencia" value={e.licencia_conductor} />
              <Row label="Compañía" value={e.compania_transporte} />
              <Row label="# Tractor" value={e.numero_tractor} />
              <Row label="Caja / Tráiler" value={`${e.compania_caja} · ${e.numero_caja}`} />
              <Row label="Sello entrada" value={e.sello_entrada} />
              <Row label="Cortina" value={e.cortina_asignada} />
              <Row label="Guardia caseta" value={e.guardia_caseta_nombre} />
              <Row label="Fecha entrada" value={new Date(e.fecha_entrada).toLocaleString('es-MX')} />
            </>
          )}
        </Section>

        <Section title="CARGA">
          <Row label="Condición" value={(e.condicion_carga || '').toUpperCase()} />
          <Row label="Descripción" value={e.descripcion_carga || '-'} />
          <Row label="# Guía" value={e.numero_guia || '-'} />
          <Row label="# Requerimiento" value={e.numero_requerimiento || '-'} />
          <Row label="Orden compra" value={e.orden_compra ? (e.numero_orden_compra || 'SÍ') : 'NO'} />
          <Row label="Destino" value={e.destino || '-'} />
        </Section>

        {e.escolta?.presente && (
          <Section title="ESCOLTA ENTRADA">
            <Row label="Compañía" value={e.escolta.compania} />
            <Row label="# Unidad" value={e.escolta.unidad} />
            <Row label="Placas" value={e.escolta.placas} />
          </Section>
        )}

        <Section title="FOTOGRAFÍAS DE ENTRADA">
          <View style={styles.photoGrid}>
            <PhotoBox
              label="FRENTE UNIDAD"
              uri={entryForm?.foto_frente_unidad}
              onPress={() => editEntry && pickPhoto('entry', 'foto_frente_unidad')}
              onRemove={() => editEntry && setEntryForm({...entryForm, foto_frente_unidad: ''})}
              isEdit={editEntry}
            />
            <PhotoBox
              label="ATRÁS CAJA"
              uri={entryForm?.foto_atras_caja}
              onPress={() => editEntry && pickPhoto('entry', 'foto_atras_caja')}
              onRemove={() => editEntry && setEntryForm({...entryForm, foto_atras_caja: ''})}
              isEdit={editEntry}
            />
            <PhotoBox
              label="ID CHOFER"
              uri={entryForm?.foto_id_chofer}
              onPress={() => editEntry && pickPhoto('entry', 'foto_id_chofer')}
              onRemove={() => editEntry && setEntryForm({...entryForm, foto_id_chofer: ''})}
              isEdit={editEntry}
            />
          </View>
        </Section>

        {rec.status === 'entrada' && (
          <Pressable testID="caseta-go-inspeccion" style={styles.bigBtn} onPress={goInspeccion}>
            <Ionicons name="clipboard" size={24} color={colors.onBrandPrimary} />
            <Text style={styles.bigBtnText}>INICIAR INSPECCIÓN 19 PUNTOS</Text>
          </Pressable>
        )}
        {rec.inspection_id && (
          <Pressable testID="caseta-view-inspeccion" style={[styles.bigBtn, { backgroundColor: colors.info }]} onPress={() => router.push(`/inspection/${rec.inspection_id}`)}>
            <Ionicons name="document-text" size={24} color={colors.onInfo} />
            <Text style={styles.bigBtnText}>VER INSPECCIÓN VINCULADA</Text>
          </Pressable>
        )}

        {x ? (
          <Section title="SALIDA">
            <Row label="Fecha salida" value={new Date(x.fecha_salida).toLocaleString('es-MX')} />
            <Row label="Cortina salida" value={x.cortina_salida} />
            <Row label="Hora apertura" value={x.hora_apertura_cortina} />
            <Row label="Hora cierre" value={x.hora_cierre_cortina} />
            <Row label="Sello salida" value={x.sello_salida} />
            <Row label="Condición" value={(x.condicion_salida || '').toUpperCase().replace('_', ' ')} />
            <Row label="Destino" value={x.destino} />
            <Row label="# Tractor salida" value={x.numero_tractor_salida || '-'} />
            <Row label="# Caja salida" value={x.numero_caja_salida || '-'} />
            <Row label="Pallets / Cajas / Bultos" value={`${x.pallets || 0} / ${x.cajas || 0} / ${x.bultos || 0}`} />
            <Row label="Sello VVTT" value={(x.sello_vvtt_estado || '-').toUpperCase()} />
            <View style={styles.photoGrid}>
              <PhotoBox
                label="SELLO VVTT"
                uri={x.sello_vvtt_foto}
                onPress={() => isAdmin && pickPhoto('exit', 'sello_vvtt_foto')}
                onRemove={() => isAdmin && handleRemoveExitPhoto('sello_vvtt_foto')}
                isEdit={isAdmin}
              />
            </View>
            <Row label="Guardia salida" value={x.guardia_salida_nombre} />
          </Section>
        ) : (
          <Pressable testID="caseta-open-exit" style={[styles.bigBtn, { backgroundColor: colors.success }]} onPress={() => setShowExit(true)}>
            <Ionicons name="exit" size={24} color={colors.onSuccess} />
            <Text style={styles.bigBtnText}>REGISTRAR SALIDA</Text>
          </Pressable>
        )}
      </ScrollView>

      {showExit && (
        <View style={styles.modalOverlay}>
          <SafeAreaView style={styles.modalSheet} edges={['top', 'bottom']}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Registrar Salida</Text>
              <Pressable onPress={() => setShowExit(false)}><Ionicons name="close" size={28} color={colors.onSurface} /></Pressable>
            </View>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
                <ExitField label="HORA APERTURA CORTINA" v={exitData.hora_apertura_cortina} on={(t: string) => setExitData({ ...exitData, hora_apertura_cortina: t })} tid="exit-apertura" />
                <ExitField label="HORA CIERRE CORTINA" v={exitData.hora_cierre_cortina} on={(t: string) => setExitData({ ...exitData, hora_cierre_cortina: t })} tid="exit-cierre" />
                <ExitField label="CORTINA #" v={exitData.cortina_salida} on={(t: string) => setExitData({ ...exitData, cortina_salida: t })} tid="exit-cortina" />
                <ExitField label="# SELLO SALIDA" v={exitData.sello_salida} on={(t: string) => setExitData({ ...exitData, sello_salida: t })} tid="exit-sello" />
                <Text style={styles.label}>CONDICIÓN DE SALIDA *</Text>
                <View style={styles.optRow}>
                  {(['vacio', 'carga_cliente', 'consolidado'] as const).map((c) => (
                    <Pressable key={c} testID={`exit-cond-${c}`} onPress={() => setExitData({ ...exitData, condicion_salida: c })} style={[styles.optChip, exitData.condicion_salida === c && styles.optChipOn]}>
                      <Text style={[styles.optText, exitData.condicion_salida === c && styles.optTextOn]}>{c.replace('_', ' ').toUpperCase()}</Text>
                    </Pressable>
                  ))}
                </View>
                <ExitField label="DESTINO" v={exitData.destino} on={(t: string) => setExitData({ ...exitData, destino: t })} tid="exit-destino" />
                <ExitField label="# TRACTOR SALIDA (si distinto)" v={exitData.numero_tractor_salida} on={(t: string) => setExitData({ ...exitData, numero_tractor_salida: t })} tid="exit-tractor" />
                <ExitField label="# CAJA SALIDA (si distinto)" v={exitData.numero_caja_salida} on={(t: string) => setExitData({ ...exitData, numero_caja_salida: t })} tid="exit-caja" />
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <View style={{ flex: 1 }}><ExitField label="PALLETS" v={exitData.pallets} on={(t: string) => setExitData({ ...exitData, pallets: t })} tid="exit-pallets" kb="numeric" /></View>
                  <View style={{ flex: 1 }}><ExitField label="CAJAS" v={exitData.cajas} on={(t: string) => setExitData({ ...exitData, cajas: t })} tid="exit-cajas" kb="numeric" /></View>
                  <View style={{ flex: 1 }}><ExitField label="BULTOS" v={exitData.bultos} on={(t: string) => setExitData({ ...exitData, bultos: t })} tid="exit-bultos" kb="numeric" /></View>
                </View>

                <Text style={styles.label}>INSPECCIÓN SELLOS VVTT *</Text>
                <View style={styles.optRow}>
                  {(['bueno', 'malo'] as const).map((s) => (
                    <Pressable key={s} onPress={() => setExitData({ ...exitData, sello_vvtt_estado: s })} style={[styles.optChip, { flex: 1 }, exitData.sello_vvtt_estado === s && (s === 'bueno' ? { backgroundColor: colors.success, borderColor: colors.success } : { backgroundColor: colors.error, borderColor: colors.error })]}>
                      <Text style={[styles.optText, exitData.sello_vvtt_estado === s && { color: '#FFF' }]}>{s.toUpperCase()}</Text>
                    </Pressable>
                  ))}
                </View>

                {exitData.sello_vvtt_foto ? (
                  <View style={{ marginTop: spacing.sm }}>
                    <Image source={{ uri: exitData.sello_vvtt_foto }} style={{ width: '100%', height: 150, resizeMode: 'cover', borderWidth: 2, borderColor: colors.borderStrong }} />
                    <Pressable onPress={() => setExitData({ ...exitData, sello_vvtt_foto: '' })} style={{ position: 'absolute', top: 5, right: 5, backgroundColor: '#FFF', borderRadius: 15 }}><Ionicons name="close-circle" size={30} color={colors.error} /></Pressable>
                  </View>
                ) : (
                  <Pressable onPress={pickExitPhoto} style={{ borderWidth: 2, borderColor: colors.borderStrong, borderStyle: 'dashed', padding: spacing.md, alignItems: 'center', marginTop: spacing.sm, backgroundColor: colors.surfaceSecondary }}>
                    <Ionicons name="camera" size={32} color={colors.brandPrimary} />
                    <Text style={{ fontWeight: '900', color: colors.brandPrimary, marginTop: 4 }}>FOTO DEL SELLO VVTT</Text>
                  </Pressable>
                )}

                <ExitField label="NOMBRE GUARDIA SALIDA *" v={exitData.guardia_salida_nombre} on={(t: string) => setExitData({ ...exitData, guardia_salida_nombre: t })} tid="exit-guardia" />
              </ScrollView>
              <View style={styles.modalFooter}>
                <Pressable style={[styles.bigBtn, { backgroundColor: colors.success, margin: 0 }]} onPress={saveExit} testID="exit-save" disabled={saving}>
                  {saving ? <ActivityIndicator color="#FFF" /> : <><Ionicons name="checkmark" size={24} color={colors.onSuccess} /><Text style={styles.bigBtnText}>GUARDAR SALIDA</Text></>}
                </Pressable>
              </View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </View>
      )}
    </SafeAreaView>
  );
}

function Section({ title, children }: any) {
  return (
    <View style={{ marginBottom: spacing.lg }}>
      {title && <Text style={styles.secTitle}>{title}</Text>}
      <View style={styles.secBody}>{children}</View>
    </View>
  );
}
function Row({ label, value }: { label: string; value: any }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value || '-'}</Text>
    </View>
  );
}

function PhotoBox({ label, uri, onPress, onRemove, isEdit }: any) {
  return (
    <View style={styles.photoItem}>
      <Text style={styles.photoLabel}>{label}</Text>
      {uri ? (
        <View>
          <Image source={{ uri }} style={styles.photoImg} />
          {isEdit && (
            <Pressable onPress={onRemove} style={{ position: 'absolute', top: 5, right: 5, backgroundColor: '#FFF', borderRadius: 12 }}>
              <Ionicons name="close-circle" size={24} color={colors.error} />
            </Pressable>
          )}
        </View>
      ) : (
        <Pressable
          onPress={onPress}
          style={[styles.photoImg, { borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }]}
          disabled={!isEdit}
        >
          <Ionicons name="camera" size={32} color={isEdit ? colors.brandPrimary : colors.border} />
          <Text style={{ fontSize: 9, color: isEdit ? colors.brandPrimary : colors.border, fontWeight: '900', marginTop: 4 }}>
            {isEdit ? 'AGREGAR FOTO' : 'SIN FOTO'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
function EditField({ label, v, on, tid, kb }: any) {
  return (
    <View style={{ marginBottom: spacing.sm }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput testID={tid} style={styles.exitInput} value={v} onChangeText={on} keyboardType={kb || 'default'} placeholderTextColor={colors.muted} />
    </View>
  );
}
function ExitField({ label, v, on, tid, kb }: any) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput testID={tid} style={styles.exitInput} value={v} onChangeText={on} keyboardType={kb || 'default'} placeholderTextColor={colors.muted} />
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { backgroundColor: colors.brandPrimary, padding: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topTitle: { color: colors.onBrandPrimary, fontWeight: '900', fontSize: typography.sizes.base, letterSpacing: 1, flex: 1, marginHorizontal: spacing.md },
  statusChip: { paddingHorizontal: spacing.sm, paddingVertical: 4 },
  statusChipText: { color: '#FFF', fontWeight: '900', fontSize: 10, letterSpacing: 1 },
  secTitle: { backgroundColor: colors.brandPrimary, color: colors.onBrandPrimary, padding: spacing.sm, fontWeight: '900', letterSpacing: 1, fontSize: 12 },
  secBody: { backgroundColor: colors.surfaceSecondary, borderWidth: 2, borderColor: colors.borderStrong, borderTopWidth: 0 },
  row: { flexDirection: 'row', padding: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowLabel: { width: 130, fontWeight: '700', color: colors.onSurfaceTertiary, fontSize: typography.sizes.sm },
  rowValue: { flex: 1, color: colors.onSurface, fontSize: typography.sizes.sm, fontWeight: '700' },
  bigBtn: { backgroundColor: colors.brandPrimary, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.md, minHeight: 64 },
  bigBtnText: { color: colors.onBrandPrimary, fontWeight: '900', letterSpacing: 1, fontSize: typography.sizes.base },
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(9,9,11,0.85)', zIndex: 100 },
  modalSheet: { flex: 1, backgroundColor: colors.surface, marginTop: 40 },
  modalHeader: { padding: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surfaceSecondary, borderBottomWidth: 2, borderBottomColor: colors.borderStrong },
  modalTitle: { fontWeight: '900', fontSize: typography.sizes.lg, color: colors.onSurface, letterSpacing: 1 },
  modalFooter: { padding: spacing.md, borderTopWidth: 2, borderTopColor: colors.borderStrong, backgroundColor: colors.surfaceSecondary },
  label: { fontSize: 11, fontWeight: '900', color: colors.muted, letterSpacing: 1, marginTop: spacing.sm, marginBottom: 4 },
  exitInput: { borderWidth: 2, borderColor: colors.borderStrong, padding: spacing.sm, backgroundColor: colors.surfaceSecondary, color: colors.onSurface, fontSize: typography.sizes.base },
  optRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  optChip: { borderWidth: 2, borderColor: colors.borderStrong, paddingHorizontal: spacing.md, paddingVertical: 8, flexShrink: 0 },
  optChipOn: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  optText: { fontWeight: '900', fontSize: 11, color: colors.onSurface, letterSpacing: 1 },
  optTextOn: { color: colors.onBrandPrimary },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: spacing.sm, gap: spacing.sm, justifyContent: 'space-between' },
  photoItem: { width: '48%', marginBottom: spacing.sm },
  photoLabel: { fontSize: 10, fontWeight: '900', color: colors.muted, marginBottom: 4, letterSpacing: 0.5 },
  photoImg: { width: '100%', height: 120, resizeMode: 'cover', borderWidth: 2, borderColor: colors.borderStrong },
  noPhoto: { fontSize: 10, color: colors.muted, fontStyle: 'italic' },
});

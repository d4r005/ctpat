import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Signature from '@/src/components/SignaturePad';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/src/api/supabase';
import { useInspections } from '@/src/context/InspectionContext';
import { useAuth } from '@/src/context/AuthContext';
import { colors, spacing, typography } from '@/src/constants/theme';
import { sanitizePlate } from '@/src/utils/text';
import { compressImage } from '@/src/utils/image';
import BoxDamageMap, { DamageMap, emptyDamageMap, countDamages, DAMAGE_SURFACES } from '@/src/components/BoxDamageMap';

export default function AlmacenNuevo() {
  const router = useRouter();
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const { saveWarehouseRecord } = useInspections();
  const params = useLocalSearchParams<{
    record_id?: string;
    placas?: string;
    operador?: string;
    compania?: string;
    trailer?: string;
    cliente?: string;
  }>();

  const [saving, setSaving] = useState(false);
  const sigRef = React.useRef<any>(null);
  const [sigTarget, setSigTarget] = useState<'almacenista' | 'supervisor' | null>(null);

  const [form, setForm] = useState({
    almacenista: '', area: '', cliente: params.cliente || '',
    operador: params.operador || '', linea_transporte: params.compania || '',
    placas_unidad: params.placas || '', placas_caja: '', numero_caja: params.trailer || '',
    hora_inicio: '', hora_fin: '', observaciones: '',
    foto_techo: '', foto_piso: '', foto_pared_izq: '', foto_pared_der: '',
    firma_almacenista: '', firma_supervisor: '', supervisor_nombre: '',
    cliente_otro: '',
  });

  const [almacenistaOpcion, setAlmacenistaOpcion] = useState<'CARLOS CANIZALES' | 'CYNTHIA SAUCEDA' | 'OTRO' | ''>('');
  const [damageMap, setDamageMap] = useState<DamageMap>(emptyDamageMap());
  const [damageNotes, setDamageNotes] = useState<Record<string, string>>({});
  const [noteTarget, setNoteTarget] = useState<string | null>(null);
  const [materiales, setMateriales] = useState<Array<{ descripcion: string; tipo: string; cantidad: string; observaciones: string }>>([]);

  const set = (k: string, v: any) => setForm({ ...form, [k]: v });

  // Pre-llenar desde el registro de caseta si viene por vínculo
  useEffect(() => {
    const fetchRecord = async () => {
      if (params.record_id && !form.placas_unidad) {
        try {
          const { data: rec, error } = await supabase
            .from('vehicle_records')
            .select('*')
            .eq('id', params.record_id)
            .single();
          if (error) throw error;
          if (rec && rec.entry_data) {
            const entry = rec.entry_data;
            setForm(prev => ({
              ...prev,
              operador: entry.chofer_nombre || prev.operador,
              linea_transporte: entry.compania_transporte || prev.linea_transporte,
              placas_unidad: entry.placas_unidad || prev.placas_unidad,
              numero_caja: entry.numero_caja || prev.numero_caja,
              placas_caja: entry.placas_caja || prev.placas_caja || '',
            }));
          }
        } catch (e) {
          console.error('Error cargando record para almacén:', e);
        }
      }
    };
    fetchRecord();
  }, [params.record_id, token]);

  const pickPhoto = async (field: string) => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { alert(t('acceso_restringido')); return; }
      const r = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.2, base64: true });
      if (!r.canceled && r.assets[0]?.base64) {
        const b64 = await compressImage(`data:image/jpeg;base64,${r.assets[0].base64}`);
        set(field, b64);
      }
    } catch (e: any) { alert(e.message || 'Error'); }
  };

  const pickFromGallery = async (field: string) => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { alert(t('acceso_restringido')); return; }
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.2, base64: true });
      if (!r.canceled && r.assets[0]?.base64) {
        const b64 = await compressImage(`data:image/jpeg;base64,${r.assets[0].base64}`);
        set(field, b64);
      }
    } catch (e: any) { alert(e.message || 'Error'); }
  };

  const addMaterial = () => setMateriales([...materiales, { descripcion: '', tipo: 'PALLET', cantidad: '', observaciones: '' }]);
  const setMaterial = (idx: number, k: string, v: string) => {
    const next = [...materiales];
    next[idx] = { ...next[idx], [k]: v };
    setMateriales(next);
  };
  const removeMaterial = (idx: number) => setMateriales(materiales.filter((_, i) => i !== idx));

  const save = async () => {
    const finalCliente = form.cliente === 'OTRO' ? form.cliente_otro : form.cliente;
    const finalAlmacenista = (almacenistaOpcion && almacenistaOpcion !== 'OTRO') ? almacenistaOpcion : form.almacenista.trim();
    if (!finalAlmacenista || !finalCliente.trim() || !form.placas_unidad.trim()) {
      alert('Almacenista, cliente y placas de unidad son obligatorios.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        almacenista: finalAlmacenista,
        cliente: finalCliente,
        record_id: params.record_id || '',
        damage_map: damageMap,
        damage_notes: damageNotes,
        materiales,
      };
      const created = await saveWarehouseRecord(payload);
      Alert.alert('Guardado', 'Registro de almacén guardado correctamente.', [
        { text: 'OK', onPress: () => router.replace(`/almacen/${created.id}`) }
      ]);
    } catch (e: any) {
      console.error('Error saving warehouse record:', e);
      let errorMsg = e.message || 'Error desconocido';
      if (errorMsg === 'Failed to fetch') errorMsg = 'Error de conexión. Verifica tu internet e intenta de nuevo.';
      alert(`Ocurrió un problema: ${errorMsg}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.onBrandPrimary} /></Pressable>
        <Text style={styles.topTitle}>NUEVO REGISTRO DE ALMACÉN</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Section title="DATOS DE ALMACÉN">
            <Text style={styles.label}>ALMACENISTA *</Text>
            <View style={[styles.optionsRow, { marginBottom: spacing.md }]}>
              {(['CARLOS CANIZALES', 'CYNTHIA SAUCEDA', 'OTRO'] as const).map((o) => (
                <Pressable
                  key={o}
                  onPress={() => {
                    setAlmacenistaOpcion(o);
                    if (o !== 'OTRO') set('almacenista', o); else set('almacenista', '');
                  }}
                  style={[styles.optionChip, almacenistaOpcion === o && styles.optionChipActive]}
                >
                  <Text style={[styles.optionText, almacenistaOpcion === o && styles.optionTextActive]}>{o}</Text>
                </Pressable>
              ))}
            </View>
            {(almacenistaOpcion === 'OTRO' || almacenistaOpcion === '') && (
              <F label="NOMBRE COMPLETO" v={form.almacenista} on={(v: string) => set('almacenista', v)} placeholder="Nombre completo del almacenista" />
            )}
            <F label="ÁREA" v={form.area} on={(v: string) => set('area', v)} />
          </Section>

          <Section title="DATOS DE UNIDAD">
            <Text style={styles.label}>CLIENTE *</Text>
            <View style={[styles.optionsRow, { marginBottom: spacing.md }]}>
              {['FD', 'EVF', 'LALUR', 'OTRO'].map(c => (
                <Pressable
                  key={c}
                  style={[styles.optionChip, (form.cliente === c || (c === 'OTRO' && !['FD', 'EVF', 'LALUR'].includes(form.cliente) && form.cliente !== '')) && styles.optionChipActive]}
                  onPress={() => set('cliente', c)}
                >
                  <Text style={[styles.optionText, (form.cliente === c || (c === 'OTRO' && !['FD', 'EVF', 'LALUR'].includes(form.cliente) && form.cliente !== '')) && styles.optionTextActive]}>{c}</Text>
                </Pressable>
              ))}
            </View>
            {form.cliente === 'OTRO' && (
              <F label="ESPECIFIQUE CLIENTE" v={form.cliente_otro} on={(v: string) => set('cliente_otro', v)} />
            )}
            <F label="OPERADOR" v={form.operador} on={(v: string) => set('operador', v)} />
            <F label="LÍNEA DE TRANSPORTE" v={form.linea_transporte} on={(v: string) => set('linea_transporte', v)} />
            <F label="PLACAS UNIDAD *" v={form.placas_unidad} on={(v: string) => set('placas_unidad', sanitizePlate(v))} />
            <F label="NO. CAJA" v={form.numero_caja} on={(v: string) => set('numero_caja', v)} />
            <F label="PLACAS CAJA" v={form.placas_caja} on={(v: string) => set('placas_caja', sanitizePlate(v))} />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}><F label="HORA INICIO" v={form.hora_inicio} on={(v: string) => set('hora_inicio', v)} placeholder="HH:MM" /></View>
              <View style={{ flex: 1 }}><F label="HORA FIN" v={form.hora_fin} on={(v: string) => set('hora_fin', v)} placeholder="HH:MM" /></View>
            </View>
          </Section>

          <Section title="FOTOGRAFÍAS DE LA CAJA">
            <Text style={styles.label}>FOTO DEL TECHO</Text>
            <PhotoBox field="foto_techo" form={form} onCamera={pickPhoto} onGallery={pickFromGallery} onRemove={() => set('foto_techo', '')} />
            <Text style={styles.label}>FOTO DEL PISO</Text>
            <PhotoBox field="foto_piso" form={form} onCamera={pickPhoto} onGallery={pickFromGallery} onRemove={() => set('foto_piso', '')} />
            <Text style={styles.label}>FOTO PARED IZQUIERDA</Text>
            <PhotoBox field="foto_pared_izq" form={form} onCamera={pickPhoto} onGallery={pickFromGallery} onRemove={() => set('foto_pared_izq', '')} />
            <Text style={styles.label}>FOTO PARED DERECHA</Text>
            <PhotoBox field="foto_pared_der" form={form} onCamera={pickPhoto} onGallery={pickFromGallery} onRemove={() => set('foto_pared_der', '')} />
          </Section>

          <Section title="MAPA DE DAÑOS DE LA CAJA">
            <BoxDamageMap value={damageMap} onChange={setDamageMap} />
            <Text style={[styles.label, { marginTop: spacing.md }]}>NOTAS POR SUPERFICIE</Text>
            {DAMAGE_SURFACES.map(s => (
              <Pressable
                key={s.key}
                style={[styles.noteRow, damageNotes[s.key] ? styles.noteRowFilled : null]}
                onPress={() => setNoteTarget(s.key)}
              >
                <Text style={styles.noteRowLabel}>{s.label}</Text>
                <Text style={styles.noteRowValue} numberOfLines={1}>{damageNotes[s.key] || 'Agregar nota…'}</Text>
              </Pressable>
            ))}
          </Section>

          <Section title="LISTA DE VERIFICACIÓN DE MATERIAL CARGADO">
            {materiales.map((m, idx) => (
              <View key={idx} style={styles.materialCard}>
                <View style={styles.materialHeader}>
                  <Text style={styles.materialIdx}>MATERIAL {idx + 1}</Text>
                  <Pressable onPress={() => removeMaterial(idx)} hitSlop={8}>
                    <Ionicons name="trash" size={18} color={colors.error} />
                  </Pressable>
                </View>
                <F label="DESCRIPCIÓN" v={m.descripcion} on={(v: string) => setMaterial(idx, 'descripcion', v)} />
                <Text style={styles.label}>TIPO</Text>
                <View style={[styles.optionsRow, { marginBottom: spacing.xs }]}>
                  {['PALLET', 'CAJA', 'BULTO', 'OTRO'].map(tp => (
                    <Pressable
                      key={tp}
                      style={[styles.optionChip, m.tipo === tp && styles.optionChipActive]}
                      onPress={() => setMaterial(idx, 'tipo', tp)}
                    >
                      <Text style={[styles.optionText, m.tipo === tp && styles.optionTextActive]}>{tp}</Text>
                    </Pressable>
                  ))}
                </View>
                <F label="CANTIDAD" v={m.cantidad} on={(v: string) => setMaterial(idx, 'cantidad', v)} kb="number-pad" />
                <F label="OBSERVACIONES" v={m.observaciones} on={(v: string) => setMaterial(idx, 'observaciones', v)} />
              </View>
            ))}
            <Pressable style={styles.addMaterialBtn} onPress={addMaterial}>
              <Ionicons name="add" size={20} color={colors.onBrandPrimary} />
              <Text style={styles.addMaterialText}>AGREGAR MATERIAL</Text>
            </Pressable>
          </Section>

          <Section title="OBSERVACIONES GENERALES">
            <F label="OBSERVACIONES" v={form.observaciones} on={(v: string) => set('observaciones', v)} multiline />
          </Section>

          <Section title="FIRMAS">
            <Pressable style={styles.signatureBox} onPress={() => setSigTarget('almacenista')}>
              {form.firma_almacenista ? (
                <>
                  <Image source={{ uri: form.firma_almacenista }} style={{ width: '100%', height: 50, resizeMode: 'contain' }} />
                  <Pressable style={styles.removeBtnSig} onPress={() => set('firma_almacenista', '')}>
                    <Ionicons name="trash" size={16} color={colors.error} />
                  </Pressable>
                </>
              ) : (
                <Text style={styles.firmaCta}>FIRMA ALMACENISTA</Text>
              )}
            </Pressable>
            <F label="NOMBRE DEL SUPERVISOR (OPCIONAL)" v={form.supervisor_nombre} on={(v: string) => set('supervisor_nombre', v)} />
            <Pressable style={styles.signatureBox} onPress={() => setSigTarget('supervisor')}>
              {form.firma_supervisor ? (
                <>
                  <Image source={{ uri: form.firma_supervisor }} style={{ width: '100%', height: 50, resizeMode: 'contain' }} />
                  <Pressable style={styles.removeBtnSig} onPress={() => set('firma_supervisor', '')}>
                    <Ionicons name="trash" size={16} color={colors.error} />
                  </Pressable>
                </>
              ) : (
                <Text style={styles.firmaCta}>FIRMA SUPERVISOR (OPCIONAL)</Text>
              )}
            </Pressable>
          </Section>

          <Pressable style={[styles.bigBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="#FFF" /> : <><Ionicons name="checkmark" size={24} color={colors.onBrandPrimary} /><Text style={styles.bigBtnText}>GUARDAR REGISTRO DE ALMACÉN</Text></>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Modal de firma */}
      {sigTarget && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Firma {sigTarget === 'almacenista' ? 'almacenista' : 'supervisor'}</Text>
            <View style={{ height: 280 }}>
              <Signature
                ref={sigRef}
                onOK={(sig: string) => { set(sigTarget === 'almacenista' ? 'firma_almacenista' : 'firma_supervisor', sig); setSigTarget(null); }}
                onEmpty={() => alert('La firma está vacía')}
                webStyle={`.m-signature-pad--footer{display:none;}`}
                descriptionText="Firme dentro del recuadro"
                clearText="Borrar"
                confirmText="Guardar"
              />
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <Pressable style={[styles.secBtn, { flex: 1 }]} onPress={() => { setSigTarget(null); }}>
                <Text style={styles.secBtnText}>CANCELAR</Text>
              </Pressable>
              <Pressable style={[styles.bigBtn, { flex: 1, padding: spacing.md, minHeight: 52 }]} onPress={() => sigRef.current?.readSignature()}>
                <Text style={[styles.bigBtnText, { fontSize: 12 }]}>GUARDAR FIRMA</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* Modal de nota por superficie */}
      {noteTarget && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>NOTA — {DAMAGE_SURFACES.find(s => s.key === noteTarget)?.label}</Text>
            <TextInput
              style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]}
              multiline
              value={damageNotes[noteTarget] || ''}
              onChangeText={(v) => setDamageNotes({ ...damageNotes, [noteTarget]: v })}
              placeholder="Describe el daño o condición de la superficie…"
              placeholderTextColor={colors.muted}
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <Pressable style={[styles.secBtn, { flex: 1 }]} onPress={() => { setDamageNotes({ ...damageNotes, [noteTarget]: '' }); setNoteTarget(null); }}>
                <Text style={styles.secBtnText}>BORRAR NOTA</Text>
              </Pressable>
              <Pressable style={[styles.bigBtn, { flex: 1, padding: spacing.md, minHeight: 52 }]} onPress={() => setNoteTarget(null)}>
                <Text style={[styles.bigBtnText, { fontSize: 12 }]}>GUARDAR</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
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

function F({ label, v, on, tid, multiline, kb, placeholder }: any) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        testID={tid}
        autoCorrect={false}
        spellCheck={false}
        autoCapitalize="characters"
        style={[styles.input, multiline && { minHeight: 70, textAlignVertical: 'top' }]}
        value={v}
        onChangeText={(text) => {
          const upper = text.toUpperCase();
          if (upper !== v) on(upper);
        }}
        multiline={!!multiline}
        keyboardType={kb || 'default'}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
      />
    </>
  );
}

function PhotoBox({ field, form, onCamera, onGallery, onRemove }: any) {
  const value = form[field];
  return (
    <View style={{ marginBottom: spacing.md }}>
      <View style={styles.photoActionRow}>
        <Pressable style={styles.photoBtn} onPress={() => onCamera(field)}>
          <Ionicons name="camera" size={16} color={colors.onBrandPrimary} />
          <Text style={styles.photoBtnText}>CÁMARA</Text>
        </Pressable>
        <Pressable style={styles.photoBtn} onPress={() => onGallery(field)}>
          <Ionicons name="images" size={16} color={colors.onBrandPrimary} />
          <Text style={styles.photoBtnText}>GALERÍA</Text>
        </Pressable>
      </View>
      {value ? (
        <View style={styles.photoWrap}>
          <Image source={{ uri: value }} style={styles.photoImg} />
          <Pressable style={styles.photoRemove} onPress={onRemove}>
            <Ionicons name="close-circle" size={24} color={colors.error} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  topBar: { backgroundColor: colors.brandPrimary, padding: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topTitle: { color: colors.onBrandPrimary, fontWeight: '900', fontSize: typography.sizes.base, letterSpacing: 1, flex: 1, textAlign: 'center' },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  secTitle: { backgroundColor: colors.brandPrimary, color: colors.onBrandPrimary, padding: spacing.sm, fontWeight: '900', letterSpacing: 1, fontSize: 12 },
  secBody: { borderWidth: 1, borderColor: colors.borderStrong, borderTopWidth: 0, padding: spacing.md, backgroundColor: colors.surfaceSecondary },
  label: { fontSize: 11, fontWeight: '900', color: colors.muted, letterSpacing: 1, marginTop: spacing.sm, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: colors.borderStrong, padding: spacing.sm, backgroundColor: colors.surface, color: colors.onSurface, fontSize: typography.sizes.base },
  signatureBox: { borderWidth: 1, borderColor: colors.borderStrong, padding: spacing.md, backgroundColor: colors.surface, alignItems: 'center', marginTop: spacing.sm, minHeight: 56, justifyContent: 'center' },
  firmaCta: { color: colors.muted, fontWeight: '700', letterSpacing: 1 },
  bigBtn: { backgroundColor: colors.brandPrimary, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, minHeight: 64 },
  bigBtnText: { color: colors.onBrandPrimary, fontWeight: '900', letterSpacing: 1, fontSize: typography.sizes.base },
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(9,9,11,0.85)', justifyContent: 'center', padding: spacing.lg, zIndex: 100 },
  modalCard: { backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderStrong },
  modalTitle: { fontWeight: '900', fontSize: typography.sizes.lg, color: colors.onSurface, marginBottom: spacing.md, letterSpacing: 1 },
  secBtn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong, padding: spacing.md, alignItems: 'center', justifyContent: 'center' },
  secBtnText: { color: colors.onSurface, fontWeight: '900', letterSpacing: 1 },
  photoBtn: { backgroundColor: colors.brandPrimary, padding: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4, flex: 1 },
  photoBtnText: { color: colors.onBrandPrimary, fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  photoWrap: { position: 'relative', marginTop: 4, borderWidth: 1, borderColor: colors.borderStrong },
  photoImg: { width: '100%', height: 200, resizeMode: 'cover' },
  photoRemove: { position: 'absolute', top: 8, right: 8, backgroundColor: '#FFF', borderRadius: 12 },
  photoActionRow: { flexDirection: 'row', gap: spacing.sm },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  optionChip: { borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: spacing.md, paddingVertical: 8, flexShrink: 0, backgroundColor: '#FFF' },
  optionChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  optionText: { fontWeight: '900', fontSize: 11, color: colors.onSurface, letterSpacing: 1 },
  optionTextActive: { color: colors.onBrandPrimary },
  removeBtnSig: { position: 'absolute', top: 5, right: 5, padding: 5, backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 15 },
  noteRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, padding: spacing.sm, marginBottom: 6, gap: spacing.sm },
  noteRowFilled: { borderColor: colors.warning, backgroundColor: colors.warningSurface },
  noteRowLabel: { fontSize: 10, fontWeight: '900', color: colors.mutedDark, width: 100, letterSpacing: 0.5 },
  noteRowValue: { flex: 1, fontSize: 11, color: colors.onSurface },
  materialCard: { borderWidth: 1, borderColor: colors.borderStrong, padding: spacing.md, marginBottom: spacing.md, backgroundColor: colors.surface },
  materialHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  materialIdx: { fontSize: 11, fontWeight: '900', letterSpacing: 1, color: colors.brandSecondary },
  addMaterialBtn: { backgroundColor: colors.brandPrimary, padding: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  addMaterialText: { color: colors.onBrandPrimary, fontWeight: '900', letterSpacing: 1, fontSize: 12 },
});

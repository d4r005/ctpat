import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Image, Alert, Modal, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Signature from '@/src/components/SignaturePad';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/src/api/supabase';
import { useInspections } from '@/src/context/InspectionContext';
import { useAuth } from '@/src/context/AuthContext';
import { colors, spacing, typography, radius } from '@/src/constants/theme';
import { sanitizePlate } from '@/src/utils/text';
import { compressImage } from '@/src/utils/image';
import BoxDamageMap, { DamageMap, emptyDamageMap, countDamages, DAMAGE_SURFACES } from '@/src/components/BoxDamageMap';
import RoleGate from '@/src/components/RoleGate';
import { canAccessWarehouse } from '@/src/utils/permissions';
import WarehouseChecklist, {
  ChecklistState, buildChecklistState,
  CHECKLIST_FISICO_MECANICO, CHECKLIST_CUIDADO_MERCANCIA, CHECKLIST_ASEGURAMIENTO_CARGA,
} from '@/src/components/WarehouseChecklist';

function AlmacenNuevo() {
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

  // --- Vínculo con registro de caseta (precarga entre módulos) ---
  const [recordId, setRecordId] = useState<string>(params.record_id || '');
  const [unitPickerVisible, setUnitPickerVisible] = useState(false);
  const [patioUnits, setPatioUnits] = useState<any[]>([]);
  const [loadingPatio, setLoadingPatio] = useState(false);

  const [form, setForm] = useState({
    almacenista: '', area: '', cliente: params.cliente || '',
    operador: params.operador || '', linea_transporte: params.compania || '',
    placas_unidad: params.placas || '', placas_caja: '', numero_caja: params.trailer || '',
    hora_inicio: '', hora_fin: '', observaciones: '',
    foto_techo: '', foto_piso: '', foto_pared_izq: '', foto_pared_der: '',
    firma_almacenista: '', firma_supervisor: '', supervisor_nombre: '',
    cliente_otro: '', sello_numero: '',
  });

  const [almacenistaOpcion, setAlmacenistaOpcion] = useState<'CARLOS CANIZALES' | 'CYNTHIA SAUCEDA' | 'OTRO' | ''>('');
  const [damageMap, setDamageMap] = useState<DamageMap>(emptyDamageMap());
  const [damageNotes, setDamageNotes] = useState<Record<string, string>>({});
  const [noteTarget, setNoteTarget] = useState<string | null>(null);
  const [materiales, setMateriales] = useState<Array<{ descripcion: string; tipo: string; cantidad: string; observaciones: string; fotos: string[] }>>([]);
  const [checklistFisico, setChecklistFisico] = useState<ChecklistState>(buildChecklistState(CHECKLIST_FISICO_MECANICO));
  const [checklistMercancia, setChecklistMercancia] = useState<ChecklistState>(buildChecklistState(CHECKLIST_CUIDADO_MERCANCIA));
  const [checklistCarga, setChecklistCarga] = useState<ChecklistState>(buildChecklistState(CHECKLIST_ASEGURAMIENTO_CARGA));

  const set = (k: string, v: any) => setForm({ ...form, [k]: v });

  // Precarga desde otros módulos: registro de entrada (caseta) + ticket de embarque
  const applyRecordPrefill = useCallback(async (rid: string) => {
    try {
      const { data: rec, error } = await supabase
        .from('vehicle_records')
        .select('*')
        .eq('id', rid)
        .single();
      if (error) throw error;
      if (rec && rec.entry_data) {
        const entry = rec.entry_data;
        setForm(prev => ({
          ...prev,
          operador: entry.chofer_nombre || prev.operador,
          linea_transporte: entry.compania_transporte || prev.linea_transporte,
          placas_unidad: sanitizePlate(entry.placas_unidad || '') || prev.placas_unidad,
          numero_caja: entry.numero_caja || prev.numero_caja,
          placas_caja: entry.placas_caja || prev.placas_caja || '',
        }));

        // Ticket de embarque vinculado → cliente y sello
        try {
          const { data: tickets } = await supabase
            .from('shipping_tickets')
            .select('data')
            .eq('record_id', rid)
            .limit(1);
          if (tickets && tickets.length > 0) {
            const td = tickets[0].data || {};
            setForm(prev => ({
              ...prev,
              cliente: prev.cliente || td.cliente || '',
              sello_numero: prev.sello_numero || td.numero_sello || '',
            }));
          }
        } catch (e) {
          // sin ticket: seguir sin precargar cliente/sello
        }
      }
    } catch (e) {
      console.error('Error cargando record para almacén:', e);
    }
  }, []);

  useEffect(() => {
    if (recordId) applyRecordPrefill(recordId);
  }, [recordId, token, applyRecordPrefill]);

  // Cargar unidades en patio para el selector (cuando no hay vínculo)
  const loadPatioUnits = useCallback(async () => {
    if (!token) return;
    setLoadingPatio(true);
    try {
      const { data, error } = await supabase
        .from('vehicle_records')
        .select('id, plates, entry_data, exit_data, created_at')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      setPatioUnits((data || []).filter((r: any) => !r.exit_data));
    } catch (e) {
      console.error('Error cargando unidades en patio:', e);
    } finally {
      setLoadingPatio(false);
    }
  }, [token]);

  const openUnitPicker = () => {
    loadPatioUnits();
    setUnitPickerVisible(true);
  };

  const pickUnit = (u: any) => {
    setRecordId(u.id);
    setUnitPickerVisible(false);
  };

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

  const addMaterial = () => setMateriales([...materiales, { descripcion: '', tipo: 'PALLET', cantidad: '', observaciones: '', fotos: [] }]);
  const setMaterial = (idx: number, k: string, v: string) => {
    const next = [...materiales];
    next[idx] = { ...next[idx], [k]: v };
    setMateriales(next);
  };
  const removeMaterial = (idx: number) => setMateriales(materiales.filter((_, i) => i !== idx));

  const addMaterialPhoto = async (idx: number, source: 'camera' | 'gallery') => {
    try {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { alert(t('acceso_restringido')); return; }
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { alert(t('acceso_restringido')); return; }
      }
      const r = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.2, base64: true })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.2, base64: true });
      if (!r.canceled && r.assets[0]?.base64) {
        const b64 = await compressImage(`data:image/jpeg;base64,${r.assets[0].base64}`);
        const next = [...materiales];
        next[idx] = { ...next[idx], fotos: [...(next[idx].fotos || []), b64] };
        setMateriales(next);
      }
    } catch (e: any) { alert(e.message || 'Error'); }
  };

  const promptAddMaterialPhoto = (idx: number) => {
    Alert.alert('Agregar fotografía', 'Foto del PO / material cargado', [
      { text: 'Cámara', onPress: () => addMaterialPhoto(idx, 'camera') },
      { text: 'Galería', onPress: () => addMaterialPhoto(idx, 'gallery') },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const removeMaterialPhoto = (idx: number, photoIdx: number) => {
    const next = [...materiales];
    next[idx] = { ...next[idx], fotos: (next[idx].fotos || []).filter((_, i) => i !== photoIdx) };
    setMateriales(next);
  };

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
        record_id: recordId || '',
        damage_map: damageMap,
        damage_notes: damageNotes,
        materiales,
        checklist_fisico_mecanico: checklistFisico,
        checklist_cuidado_mercancia: checklistMercancia,
        checklist_aseguramiento_carga: checklistCarga,
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
            {!recordId ? (
              <Pressable style={styles.prefillBtn} onPress={openUnitPicker}>
                <Ionicons name="download" size={18} color="#FFF" />
                <Text style={styles.prefillBtnText}>CARGAR DATOS DE UNIDAD EN PATIO</Text>
              </Pressable>
            ) : (
              <View style={styles.prefillBadge}>
                <Ionicons name="link" size={16} color={colors.success} />
                <Text style={styles.prefillBadgeText}>Registro vinculado a la unidad de caseta</Text>
              </View>
            )}
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

          <Section title="1. INSPECCIÓN FÍSICO-MECÁNICA CONTENEDOR/CAJA">
            <WarehouseChecklist items={CHECKLIST_FISICO_MECANICO} state={checklistFisico} onChange={setChecklistFisico} />
          </Section>

          <Section title="2. VERIFICACIÓN DEL CUIDADO DE LA MERCANCÍA">
            <WarehouseChecklist items={CHECKLIST_CUIDADO_MERCANCIA} state={checklistMercancia} onChange={setChecklistMercancia} />
          </Section>

          <Section title="3. ASEGURAMIENTO Y SUJECIÓN DE LA CARGA">
            <WarehouseChecklist items={CHECKLIST_ASEGURAMIENTO_CARGA} state={checklistCarga} onChange={setChecklistCarga} />
            <F label="NÚMERO DE SELLO DE SEGURIDAD" v={form.sello_numero} on={(v: string) => set('sello_numero', v)} placeholder="Ej. SL-0012345" />
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
                <Text style={styles.label}>FOTOGRAFÍAS DEL PO / MATERIAL CARGADO</Text>
                <View style={styles.materialPhotosRow}>
                  {(m.fotos || []).map((foto: string, pIdx: number) => (
                    <View key={pIdx} style={styles.materialPhotoThumb}>
                      <Image source={{ uri: foto }} style={styles.materialPhotoImg} />
                      <Pressable style={styles.materialPhotoRemove} onPress={() => removeMaterialPhoto(idx, pIdx)}>
                        <Ionicons name="close-circle" size={18} color={colors.error} />
                      </Pressable>
                    </View>
                  ))}
                  <Pressable style={styles.materialPhotoAdd} onPress={() => promptAddMaterialPhoto(idx)}>
                    <Ionicons name="camera" size={20} color={colors.brandPrimary} />
                    <Text style={styles.materialPhotoAddText}>AGREGAR</Text>
                  </Pressable>
                </View>
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

      {/* Modal selector de unidad en patio (precarga) */}
      <Modal visible={unitPickerVisible} transparent animationType="slide" onRequestClose={() => setUnitPickerVisible(false)}>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerCard}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>SELECCIONA LA UNIDAD</Text>
              <Pressable onPress={() => setUnitPickerVisible(false)} hitSlop={8}>
                <Ionicons name="close" size={24} color={colors.muted} />
              </Pressable>
            </View>
            <FlatList
              data={patioUnits}
              keyExtractor={(u: any) => u.id}
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: spacing.md }}
              renderItem={({ item: u }: any) => (
                <Pressable style={styles.pickerItem} onPress={() => pickUnit(u)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerItemTitle}>{u.plates || u.entry_data?.placas_unidad || '—'}</Text>
                    <Text style={styles.pickerItemSub}>
                      {u.entry_data?.chofer_nombre || ''} · {u.entry_data?.compania_transporte || ''}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                </Pressable>
              )}
              ListEmptyComponent={
                loadingPatio ? (
                  <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 24 }} />
                ) : (
                  <Text style={styles.pickerEmpty}>No hay unidades en patio.</Text>
                )
              }
            />
          </View>
        </View>
      </Modal>

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
  materialPhotosRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 4 },
  materialPhotoThumb: { position: 'relative', width: 72, height: 72, borderWidth: 1, borderColor: colors.borderStrong },
  materialPhotoImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  materialPhotoRemove: { position: 'absolute', top: -6, right: -6, backgroundColor: '#FFF', borderRadius: 10 },
  materialPhotoAdd: { width: 72, height: 72, borderWidth: 1, borderColor: colors.borderStrong, borderStyle: 'dashed', backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 2 },
  materialPhotoAddText: { fontSize: 8, fontWeight: '900', color: colors.brandPrimary, letterSpacing: 0.3 },

  // Precarga entre módulos
  prefillBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.brandPrimary, borderRadius: radius.md, paddingVertical: 14,
    marginBottom: spacing.md,
  },
  prefillBtnText: { color: colors.onBrandPrimary, fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  prefillBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.successSurface, borderRadius: radius.md, padding: 12,
    marginBottom: spacing.md,
  },
  prefillBadgeText: { color: colors.onSuccess, fontSize: 11, fontWeight: '700', flex: 1 },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  pickerCard: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '75%' },
  pickerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.md + 4, borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  pickerTitle: { fontSize: 13, fontWeight: '900', color: colors.onSurface, letterSpacing: 1 },
  pickerItem: {
    flexDirection: 'row', alignItems: 'center', padding: 14, marginBottom: 8,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  pickerItemTitle: { fontSize: 15, fontWeight: '900', color: colors.onSurface },
  pickerItemSub: { fontSize: 11, color: colors.muted, marginTop: 2 },
  pickerEmpty: { textAlign: 'center', color: colors.muted, marginTop: 24, fontSize: 13 },
});


// Guarda de acceso por rol: canAccessWarehouse
export default () => (
  <RoleGate allow={canAccessWarehouse}>
    <AlmacenNuevo />
  </RoleGate>
);

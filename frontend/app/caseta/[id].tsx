import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Signature from '@/src/components/SignaturePad';
import { apiCall } from '@/src/api/client';
import { useAuth } from '@/src/context/AuthContext';
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

      // En web launchCameraAsync puede fallar, usamos launchImageLibraryAsync como fallback
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

        // Buscar ticket de embarque para prellenado
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
    // Prellenado de datos extendido desde Ticket de Embarque
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

    // Si es descarga, no validamos sellos VVTT ni sellos de salida
    let validationPassed = basicCheck;

    if (!isDescarga) {
      const sealCheck = exitData.sello_vvtt_estado && exitData.sello_salida;
      const fullCheck = !isFull || (exitData.sello_vvtt_estado_2 && exitData.sello_salida_2);
      validationPassed = basicCheck && sealCheck && fullCheck;
    }

    if (!validationPassed) {
      alert(t('completar_datos_salida')); return;
    }
    setSaving(true);
    try {
      await patchVehicleExit(id as string, exitData);
      setShowExit(false);
      await load();
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
      </SafeAreaView>
    );
  }

  const e = rec?.entry || {};
  const x = rec?.exit;
  const STATUS_COLOR: any = { entrada: colors.warning, inspeccionado: colors.info, salida: colors.success };

  if (!rec || !rec.entry) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><Text style={{ color: colors.muted }}>{t('error_cargar_datos')}</Text></View>
      </SafeAreaView>
    );
  }

  const isFull = e?.tipo_unidad === 'full';
  const isDescarga = e?.condicion_carga === 'descarga';
  const needsShipping = !isFull && !isDescarga;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']} testID="caseta-detail">
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(app)/supervisor')}
          style={{ padding: 10, marginLeft: -10 }}
        >
          <Ionicons name="arrow-back" size={28} color={colors.onBrandPrimary} />
        </Pressable>
        <Text style={styles.topTitle}>{t('registro')} {e.placas_unidad}</Text>

        <Pressable
          onPress={() => router.push({ pathname: '/(app)/chat', params: { room: `PLATES_${e.placas_unidad}`, title: `${t('chat_unidad')} ${e.placas_unidad}` } })}
          style={{ marginRight: 10 }}
        >
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
            <Pressable
              onPress={() => editEntry ? handleUpdateEntry() : setEditEntry(true)}
              style={{ backgroundColor: editEntry ? colors.success : colors.brandSecondary, paddingHorizontal: 12, paddingVertical: 6, marginLeft: 8 }}
            >
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
              <EditField label={t('cortina_asignada_caps')} v={entryForm.cortina_asignada} on={(t: string) => setEntryForm({...entryForm, cortina_asignada: t})} />
            </View>
          ) : (
            <>
              <Row label={t('placas')} value={e.placas_unidad} />
              <Row label={t('nombre_chofer') || "Chofer"} value={e.chofer_nombre} />
              <Row label={t('licencia')} value={e.licencia_conductor} />
              <Row label={t('compania')} value={e.compania_transporte} />
              <Row label={t('numero_tractor_caps') || "# Tractor"} value={e.numero_tractor} />

              <Text style={[styles.declTitle, { marginTop: spacing.md, marginBottom: spacing.xs, backgroundColor: colors.info, color: '#FFF' }]}>
                {t('caja_1_caps') || "CAJA 1"}
              </Text>
              <Row label={t('compania')} value={e.compania_caja} />
              <Row label={t('numero_caja_caps') || "Número Caja"} value={e.numero_caja} />
              <Row label={t('sello_entrada') || "Sello entrada"} value={e.sello_entrada} />

              {e.tipo_unidad === 'full' && (
                <>
                  <Text style={[styles.declTitle, { marginTop: spacing.md, marginBottom: spacing.xs, backgroundColor: colors.info, color: '#FFF' }]}>
                    {t('caja_2_caps') || "CAJA 2"}
                  </Text>
                  <Row label={t('compania')} value={e.compania_caja_2} />
                  <Row label={t('numero_caja_caps') || "Número Caja"} value={e.numero_caja_2} />
                  <Row label={t('sello_entrada') || "Sello entrada"} value={e.sello_entrada_2} />
                </>
              )}

              <Row label={t('cortina')} value={e.cortina_asignada} />
              <Row label={t('guardia_caseta') || "Guardia caseta"} value={e.guardia_caseta_nombre} />
              <Row label={t('fecha_entrada') || "Fecha entrada"} value={new Date(e.fecha_entrada).toLocaleString()} />
            </>
          )}
        </Section>

        <Section title={t('carga').toUpperCase()}>
          <Row label={t('condicion').toUpperCase()} value={(e.condicion_carga || '').toUpperCase()} />
          <Row label={t('observaciones').toUpperCase()} value={(e.descripcion_carga || '-').toUpperCase()} />
          <Row label={t('guia_caps')} value={e.numero_guia || '-'} />
          <Row label={t('requerimiento_caps')} value={e.numero_requerimiento || '-'} />
          <Row label={t('orden_compra').toUpperCase()} value={e.orden_compra ? (e.numero_orden_compra || t('si')) : t('no')} />
          <Row label={t('destino').toUpperCase()} value={(e.destino || '-').toUpperCase()} />
        </Section>

        {e.escolta?.presente && (
          <Section title={t('escolta_entrada')}>
            <Row label={t('compania')} value={e.escolta.compania} />
            <Row label={t('numero_economico_unidad') || "# Unidad"} value={e.escolta.unidad} />
            <Row label={t('placas')} value={e.escolta.placas} />
          </Section>
        )}

        <Section title={t('fotografias_entrada')}>
          <View style={styles.photoGrid}>
            <PhotoBox
              label={t('frente_unidad')}
              uri={entryForm?.foto_frente_unidad}
              onPress={() => editEntry && pickPhoto('entry', 'foto_frente_unidad')}
              onRemove={() => {
                if (confirm(t('borrar_foto_pregunta'))) {
                  setEntryForm({...entryForm, foto_frente_unidad: ''});
                }
              }}
              isEdit={editEntry}
              t={t}
            />
            <PhotoBox
              label={t('atras_caja') + " (1)"}
              uri={entryForm?.foto_atras_caja}
              onPress={() => editEntry && pickPhoto('entry', 'foto_atras_caja')}
              onRemove={() => {
                if (confirm(t('borrar_foto_pregunta'))) {
                  setEntryForm({...entryForm, foto_atras_caja: ''});
                }
              }}
              isEdit={editEntry}
              t={t}
            />
            {e.tipo_unidad === 'full' && (
              <PhotoBox
                label={t('atras_caja') + " (2)"}
                uri={entryForm?.foto_atras_caja_2}
                onPress={() => editEntry && pickPhoto('entry', 'foto_atras_caja_2')}
                onRemove={() => {
                  if (confirm(t('borrar_foto_pregunta'))) {
                    setEntryForm({...entryForm, foto_atras_caja_2: ''});
                  }
                }}
                isEdit={editEntry}
                t={t}
              />
            )}
            <PhotoBox
              label={t('id_chofer_caps')}
              uri={entryForm?.foto_id_chofer}
              onPress={() => editEntry && pickPhoto('entry', 'foto_id_chofer')}
              onRemove={() => {
                if (confirm(t('borrar_foto_pregunta'))) {
                  setEntryForm({...entryForm, foto_id_chofer: ''});
                }
              }}
              isEdit={editEntry}
              t={t}
            />
          </View>
        </Section>

        <Section title={t('firma_operador').toUpperCase()}>
           <View style={{ padding: spacing.md, alignItems: 'center' }}>
             {(editEntry ? (entryForm.firma_operador || e.firma_operador) : e.firma_operador) ? (
               <Image
                 source={{ uri: editEntry ? (entryForm.firma_operador || e.firma_operador) : e.firma_operador }}
                 style={{ width: '80%', height: 100, resizeMode: 'contain', backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border }}
               />
             ) : (
               <Text style={{ color: colors.muted, fontStyle: 'italic' }}>{t('sin_firma_capturada')}</Text>
             )}

             {editEntry && (
               <Pressable
                 style={[styles.bigBtn, { height: 48, minHeight: 48, padding: 0, marginTop: 10, width: '100%' }]}
                 onPress={() => {
                   setSigModalConfig({
                     title: t('editar_firma_operador'),
                     onSave: (sig) => setEntryForm({ ...entryForm, firma_operador: sig })
                   });
                   setShowSigModal(true);
                 }}
               >
                 <Text style={[styles.bigBtnText, { fontSize: 12 }]}>{t('cambiar_firma_operador')}</Text>
               </Pressable>
             )}
           </View>
        </Section>

        {(rec.status === 'entrada' || rec.status === 'inspeccionado') && (
          <View>
            <Pressable testID="caseta-go-inspeccion" style={styles.bigBtn} onPress={() => goInspeccion(e.numero_caja, e.sello_entrada)}>
              <Ionicons name="clipboard" size={24} color={colors.onBrandPrimary} />
              <Text style={styles.bigBtnText}>
                {e.tipo_unidad === 'full' ? `${t('iniciar_inspeccion_19')} (CAJA 1)` : t('iniciar_inspeccion_19')}
              </Text>
            </Pressable>

            {e.tipo_unidad === 'full' && (
              <Pressable testID="caseta-go-inspeccion-2" style={[styles.bigBtn, { marginTop: -spacing.sm }]} onPress={() => goInspeccion(e.numero_caja_2, e.sello_entrada_2)}>
                <Ionicons name="clipboard" size={24} color={colors.onBrandPrimary} />
                <Text style={styles.bigBtnText}>{t('iniciar_inspeccion_19')} (CAJA 2)</Text>
              </Pressable>
            )}
          </View>
        )}

        {(rec.inspection_ids && rec.inspection_ids.length > 0) ? (
          rec.inspection_ids.map((inspId: string, idx: number) => (
            <Pressable
              key={inspId}
              testID={`caseta-view-inspeccion-${idx}`}
              style={[styles.bigBtn, { backgroundColor: colors.info, marginTop: idx === 0 ? 0 : -spacing.sm }]}
              onPress={() => router.push(`/inspection/${inspId}`)}
            >
              <Ionicons name="document-text" size={24} color={colors.onInfo} />
              <Text style={styles.bigBtnText}>{t('ver_inspeccion_vinculada')} {e.tipo_unidad === 'full' ? `(${idx+1})` : ''}</Text>
            </Pressable>
          ))
        ) : (
          rec.inspection_id && (
            <Pressable testID="caseta-view-inspeccion" style={[styles.bigBtn, { backgroundColor: colors.info }]} onPress={() => router.push(`/inspection/${rec.inspection_id}`)}>
              <Ionicons name="document-text" size={24} color={colors.onInfo} />
              <Text style={styles.bigBtnText}>{t('ver_inspeccion_vinculada')}</Text>
            </Pressable>
          )
        )}

        {x ? (
          <Section title={t('salida')}>
            <Row label={t('fecha_salida') || "Fecha salida"} value={new Date(x.fecha_salida).toLocaleString()} />
            <Row label={t('cortina_salida') || "Cortina salida"} value={x.cortina_salida} />
            <Row label={t('hora_apertura')} value={x.hora_apertura_cortina} />
            <Row label={t('hora_cierre')} value={x.hora_cierre_cortina} />
            <Row label={t('destino')} value={x.destino} />
            <Row label={t('numero_tractor_salida')} value={x.numero_tractor_salida || '-'} />

            <Text style={[styles.declTitle, { marginTop: spacing.md, marginBottom: spacing.xs, backgroundColor: colors.success, color: '#FFF' }]}>
              {t('caja_1_caps') || "CAJA 1"}
            </Text>
            <Row label={t('numero_caja_salida')} value={x.numero_caja_salida || '-'} />
            <Row label={t('sello_salida_caps') || "Sello salida"} value={x.sello_salida} />
            <Row label={t('sello_vvtt')} value={(x.sello_vvtt_estado || '-').toUpperCase()} />

            {e.tipo_unidad === 'full' && (
              <>
                <Text style={[styles.declTitle, { marginTop: spacing.md, marginBottom: spacing.xs, backgroundColor: colors.success, color: '#FFF' }]}>
                  {t('caja_2_caps') || "CAJA 2"}
                </Text>
                <Row label={t('numero_caja_salida')} value={x.numero_caja_salida_2 || '-'} />
                <Row label={t('sello_salida_caps') || "Sello salida"} value={x.sello_salida_2} />
                <Row label={t('sello_vvtt')} value={(x.sello_vvtt_estado_2 || '-').toUpperCase()} />
              </>
            )}

            <Row label={t('condicion')} value={(x.condicion_salida || '').toUpperCase().replace('_', ' ')} />
            <Row label={t('pallets_cajas_bultos')} value={`${x.pallets || 0} / ${x.cajas || 0} / ${x.bultos || 0}`} />

            <View style={styles.photoGrid}>
              <PhotoBox
                label={t('sello_vvtt') + " (1)"}
                uri={x.sello_vvtt_foto}
                onPress={() => isAdmin && pickPhoto('exit', 'sello_vvtt_foto')}
                onRemove={() => isAdmin && handleRemoveExitPhoto('sello_vvtt_foto')}
                isEdit={isAdmin}
                t={t}
              />
              {e.tipo_unidad === 'full' && (
                <PhotoBox
                  label={t('sello_vvtt') + " (2)"}
                  uri={x.sello_vvtt_foto_2}
                  onPress={() => isAdmin && pickPhoto('exit', 'sello_vvtt_foto_2')}
                  onRemove={() => isAdmin && handleRemoveExitPhoto('sello_vvtt_foto_2')}
                  isEdit={isAdmin}
                  t={t}
                />
              )}
            </View>
            <Row label={t('guardia_salida')} value={x.guardia_salida_nombre} />
          </Section>
        ) : (
          <Pressable testID="caseta-open-exit" style={[styles.bigBtn, { backgroundColor: colors.success }]} onPress={openExitForm}>
            <Ionicons name="exit" size={24} color={colors.onSuccess} />
            <Text style={styles.bigBtnText}>{t('registrar_salida')}</Text>
          </Pressable>
        )}
      </ScrollView>

      {showSigModal && (
        <SignatureModal
          onClose={() => setShowSigModal(false)}
          onSave={(sig) => { sigModalConfig.onSave(sig); setShowSigModal(false); }}
          title={sigModalConfig.title}
          t={t}
        />
      )}

      {showExit && (
        <View style={styles.modalOverlay}>
          <SafeAreaView style={styles.modalSheet} edges={['top', 'bottom']}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('registrar_salida')}</Text>
              <Pressable onPress={() => setShowExit(false)}><Ionicons name="close" size={28} color={colors.onSurface} /></Pressable>
            </View>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
                <ExitField label={t('hora_apertura_cortina_label')} v={exitData.hora_apertura_cortina} on={(t: string) => setExitData({ ...exitData, hora_apertura_cortina: t })} tid="exit-apertura" />
                <ExitField label={t('hora_cierre_cortina_label')} v={exitData.hora_cierre_cortina} on={(t: string) => setExitData({ ...exitData, hora_cierre_cortina: t })} tid="exit-cierre" />
                <ExitField label={t('cortina_num')} v={exitData.cortina_salida} on={(t: string) => setExitData({ ...exitData, cortina_salida: t })} tid="exit-cortina" />
                <ExitField label={t('destino_caps')} v={exitData.destino} on={(t: string) => setExitData({ ...exitData, destino: t })} tid="exit-destino" />
                <ExitField label={t('tractor_salida_si_distinto')} v={exitData.numero_tractor_salida} on={(t: string) => setExitData({ ...exitData, numero_tractor_salida: t })} tid="exit-tractor" />

                <Text style={[styles.declTitle, { marginTop: spacing.md, backgroundColor: colors.info, color: '#FFF' }]}>{t('caja_1_caps') || "CAJA 1"}</Text>
                <ExitField label={t('caja_salida_si_distinto')} v={exitData.numero_caja_salida} on={(t: string) => setExitData({ ...exitData, numero_caja_salida: t })} tid="exit-caja" />

                {rec.entry.condicion_carga !== 'descarga' && (
                  <>
                    <ExitField label={t('sello_salida_label')} v={exitData.sello_salida} on={(t: string) => setExitData({ ...exitData, sello_salida: t })} tid="exit-sello" />
                    <Text style={styles.label}>{t('inspeccion_sellos_vvtt')} (1) *</Text>
                    <View style={styles.optRow}>
                      {(['bueno', 'malo'] as const).map((s) => (
                        <Pressable key={s} onPress={() => setExitData({ ...exitData, sello_vvtt_estado: s })} style={[styles.optChip, { flex: 1 }, exitData.sello_vvtt_estado === s && (s === 'bueno' ? { backgroundColor: colors.success, borderColor: colors.success } : { backgroundColor: colors.error, borderColor: colors.error })]}>
                          <Text style={[styles.optText, exitData.sello_vvtt_estado === s && { color: '#FFF' }]}>{t(s).toUpperCase()}</Text>
                        </Pressable>
                      ))}
                    </View>
                    {exitData.sello_vvtt_foto ? (
                      <View style={{ marginTop: spacing.sm }}>
                        <Image source={{ uri: exitData.sello_vvtt_foto }} style={{ width: '100%', height: 150, resizeMode: 'cover', borderWidth: 2, borderColor: colors.borderStrong }} />
                        <Pressable onPress={() => setExitData({ ...exitData, sello_vvtt_foto: '' })} style={{ position: 'absolute', top: 5, right: 5, backgroundColor: '#FFF', borderRadius: 15 }}><Ionicons name="close-circle" size={30} color={colors.error} /></Pressable>
                      </View>
                    ) : (
                      <Pressable onPress={() => pickPhoto('exit', 'sello_vvtt_foto')} style={styles.photoUploadBtn}>
                        <Ionicons name="camera" size={32} color={colors.brandPrimary} />
                        <Text style={styles.photoUploadText}>{t('foto_sello_vvtt')} (1)</Text>
                      </Pressable>
                    )}
                  </>
                )}

                {rec.entry.tipo_unidad === 'full' && (
                  <>
                    <Text style={[styles.declTitle, { marginTop: spacing.xl, backgroundColor: colors.info, color: '#FFF' }]}>{t('caja_2_caps') || "CAJA 2"}</Text>
                    <ExitField label={t('caja_salida_si_distinto')} v={exitData.numero_caja_salida_2} on={(t: string) => setExitData({ ...exitData, numero_caja_salida_2: t })} tid="exit-caja-2" />

                    {rec.entry.condicion_carga !== 'descarga' && (
                      <>
                        <ExitField label={t('sello_salida_label')} v={exitData.sello_salida_2} on={(t: string) => setExitData({ ...exitData, sello_salida_2: t })} tid="exit-sello-2" />
                        <Text style={styles.label}>{t('inspeccion_sellos_vvtt')} (2) *</Text>
                        <View style={styles.optRow}>
                          {(['bueno', 'malo'] as const).map((s) => (
                            <Pressable key={s} onPress={() => setExitData({ ...exitData, sello_vvtt_estado_2: s })} style={[styles.optChip, { flex: 1 }, exitData.sello_vvtt_estado_2 === s && (s === 'bueno' ? { backgroundColor: colors.success, borderColor: colors.success } : { backgroundColor: colors.error, borderColor: colors.error })]}>
                              <Text style={[styles.optText, exitData.sello_vvtt_estado_2 === s && { color: '#FFF' }]}>{t(s).toUpperCase()}</Text>
                            </Pressable>
                          ))}
                        </View>
                        {exitData.sello_vvtt_foto_2 ? (
                          <View style={{ marginTop: spacing.sm }}>
                            <Image source={{ uri: exitData.sello_vvtt_foto_2 }} style={{ width: '100%', height: 150, resizeMode: 'cover', borderWidth: 2, borderColor: colors.borderStrong }} />
                            <Pressable onPress={() => setExitData({ ...exitData, sello_vvtt_foto_2: '' })} style={{ position: 'absolute', top: 5, right: 5, backgroundColor: '#FFF', borderRadius: 15 }}><Ionicons name="close-circle" size={30} color={colors.error} /></Pressable>
                          </View>
                        ) : (
                          <Pressable onPress={() => pickPhoto('exit', 'sello_vvtt_foto_2')} style={styles.photoUploadBtn}>
                            <Ionicons name="camera" size={32} color={colors.brandPrimary} />
                            <Text style={styles.photoUploadText}>{t('foto_sello_vvtt')} (2)</Text>
                          </Pressable>
                        )}
                      </>
                    )}
                  </>
                )}

                <Text style={styles.label}>{t('condicion_salida_label')} *</Text>
                <View style={styles.optRow}>
                  {(['vacio', 'carga_cliente', 'consolidado'] as const).map((c) => (
                    <Pressable key={c} testID={`exit-cond-${c}`} onPress={() => setExitData({ ...exitData, condicion_salida: c })} style={[styles.optChip, exitData.condicion_salida === c && styles.optChipOn]}>
                      <Text style={[styles.optText, exitData.condicion_salida === c && styles.optTextOn]}>{t(c).toUpperCase()}</Text>
                    </Pressable>
                  ))}
                </View>

                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <View style={{ flex: 1 }}><ExitField label={t('pallets').toUpperCase()} v={exitData.pallets} on={(t: string) => setExitData({ ...exitData, pallets: t })} tid="exit-pallets" kb="numeric" /></View>
                  <View style={{ flex: 1 }}><ExitField label={t('caja').toUpperCase()} v={exitData.cajas} on={(t: string) => setExitData({ ...exitData, cajas: t })} tid="exit-cajas" kb="numeric" /></View>
                  <View style={{ flex: 1 }}><ExitField label={t('bultos').toUpperCase() || "BULTOS"} v={exitData.bultos} on={(t: string) => setExitData({ ...exitData, bultos: t })} tid="exit-bultos" kb="numeric" /></View>
                </View>

                <ExitField label={`${t('nombre_guardia_salida') || "NOMBRE GUARDIA SALIDA"} *`} v={exitData.guardia_salida_nombre} on={(t: string) => setExitData({ ...exitData, guardia_salida_nombre: t })} tid="exit-guardia" />
              </ScrollView>
              <View style={styles.modalFooter}>
                <Pressable style={[styles.bigBtn, { backgroundColor: colors.success, margin: 0 }]} onPress={saveExit} testID="exit-save" disabled={saving}>
                  {saving ? <ActivityIndicator color="#FFF" /> : <><Ionicons name="checkmark" size={24} color={colors.onSuccess} /><Text style={styles.bigBtnText}>{t('guardar_salida')}</Text></>}
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

function PhotoBox({ label, uri, onPress, onRemove, isEdit, t }: any) {
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
            {isEdit ? t('agregar_foto') : t('sin_foto')}
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
      <TextInput
        testID={tid}
        autoCapitalize="characters"
        style={styles.exitInput}
        value={v}
        onChangeText={(text) => on(text.toUpperCase())}
        keyboardType={kb || 'default'}
        placeholderTextColor={colors.muted}
      />
    </View>
  );
}
function ExitField({ label, v, on, tid, kb }: any) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        testID={tid}
        autoCapitalize="characters"
        style={styles.exitInput}
        value={v}
        onChangeText={(text) => on(text.toUpperCase())}
        keyboardType={kb || 'default'}
        placeholderTextColor={colors.muted}
      />
    </>
  );
}

function SignatureModal({ onClose, onSave, title, t }: { onClose: () => void; onSave: (sig: string) => void; title: string; t: any }) {
  const sigRef = React.useRef<any>(null);
  const handleOK = (signature: string) => onSave(signature);
  const style = `.m-signature-pad--footer {display: none; margin: 0px;}
                 .m-signature-pad {box-shadow: none; border: 2px solid #09090B;}
                 body,html { background-color: #FFF; height: 100%; }`;
  return (
    <View style={styles.modalOverlay} testID="signature-modal">
      <View style={styles.modalCard}>
        <Text style={styles.modalTitle}>{title}</Text>
        <View style={styles.signatureCanvas}>
          <Signature
            ref={sigRef}
            onOK={handleOK}
            descriptionText={t('firme_dentro_desc')}
            clearText={t('borrar')}
            confirmText={t('guardar')}
            webStyle={style}
            autoClear={false}
            imageType="image/jpeg"
          />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
          <Pressable style={[styles.secondaryBtn, { flex: 1 }]} onPress={onClose}>
            <Text style={styles.secondaryBtnText}>{t('cancelar_caps')}</Text>
          </Pressable>
          <Pressable
            style={[styles.primaryBtn, { flex: 1 }]}
            onPress={() => sigRef.current?.readSignature()}
          >
            <Text style={styles.primaryBtnText}>{t('guardar_firma_caps')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
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
  declTitle: { fontWeight: '900', fontSize: 11, color: colors.onBrandPrimary, backgroundColor: colors.brandPrimary, padding: 6, letterSpacing: 1 },
  photoUploadBtn: { borderWidth: 2, borderColor: colors.borderStrong, borderStyle: 'dashed', padding: spacing.md, alignItems: 'center', marginTop: spacing.sm, backgroundColor: colors.surfaceSecondary },
  photoUploadText: { fontWeight: '900', color: colors.brandPrimary, marginTop: 4, fontSize: 11 },

  // Signature Modal styles
  modalCard: { backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderWidth: 2, borderColor: colors.borderStrong, width: '100%' },
  signatureCanvas: { height: 300, marginBottom: spacing.md },
  primaryBtn: { flex: 1, backgroundColor: colors.brandPrimary, padding: spacing.md, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  primaryBtnText: { color: colors.onBrandPrimary, fontWeight: '900', letterSpacing: 1 },
  secondaryBtn: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.borderStrong, padding: spacing.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  secondaryBtnText: { color: colors.onSurface, fontWeight: '900', letterSpacing: 1 },
});

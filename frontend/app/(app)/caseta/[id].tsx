import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  ActivityIndicator, KeyboardAvoidingView, Platform, Image, Alert, TouchableOpacity
} from 'react-native';
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
  const { patchVehicleExit } = useInspections();

  const [rec, setRec] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showExit, setShowExit] = useState(false);
  const [editEntry, setEditEntry] = useState(false);
  const [showSig, setShowSig] = useState(false);
  const sigRef = React.useRef<any>(null);

  const isAdmin = user?.role === 'admin' || user?.role === 'supervisor' || ['d.trujillo@brancoindustries.com', 'd4r005@gmail.com'].includes(user?.email || '');

  const [entryForm, setEntryForm] = useState<any>(null);
  const [exitData, setExitData] = useState<any>({
    hora_apertura_cortina: '',
    hora_cierre_cortina: '',
    cortina_salida: '',
    sello_salida: '',
    sello_salida_2: '',
    condicion_salida: '',
    destino: '',
    numero_tractor_salida: '',
    numero_caja_salida: '',
    numero_caja_salida_2: '',
    pallets: '',
    cajas: '',
    bultos: '',
    sello_vvtt_estado: '',
    sello_vvtt_foto: '',
    sello_vvtt_estado_2: '',
    sello_vvtt_foto_2: '',
    guardia_salida_nombre: '',
  });

  const load = async () => {
    if (!token || !id) return;
    setLoading(true);
    try {
      const data = await apiCall<any>(`/vehicle-records/${id}`, { token });
      if (data) {
        setRec(data);
        setEntryForm(JSON.parse(JSON.stringify(data.entry)));
        if (data.exit) {
          setExitData({ ...exitData, ...data.exit });
          setShowExit(true);
        }
      }
    } catch (e: any) {
      Alert.alert(t('error'), t('error_cargar_datos'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id, token]);

  const handleUpdateEntry = async () => {
    setSaving(true);
    try {
      await apiCall(`/vehicle-records/${id}`, { method: 'PUT', body: { entry: entryForm }, token });
      setEditEntry(false);
      load();
      Alert.alert(t('exito'), t('registro_actualizado'));
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveExit = async () => {
    if (!exitData.guardia_salida_nombre || !exitData.condicion_salida) {
      Alert.alert(t('error'), t('completar_datos_salida'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...exitData,
        fecha_salida: exitData.fecha_salida || new Date().toISOString(),
      };
      await patchVehicleExit(id as string, payload);
      Alert.alert(t('exito'), t('salida_registrada'));
      load();
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    } finally {
      setSaving(false);
    }
  };

  const pickPhoto = async (section: 'entry' | 'exit', field: string) => {
    Alert.alert(
      t('seleccionar_origen'),
      t('seleccionar_origen_desc'),
      [
        {
          text: t('camara'),
          onPress: async () => {
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              quality: 0.3,
              base64: true,
            });
            if (!result.canceled && result.assets[0].base64) {
              const b64 = `data:image/jpeg;base64,${result.assets[0].base64}`;
              if (section === 'entry') setEntryForm({ ...entryForm, [field]: b64 });
              else setExitData({ ...exitData, [field]: b64 });
            }
          }
        },
        {
          text: t('galeria'),
          onPress: async () => {
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              quality: 0.3,
              base64: true,
            });
            if (!result.canceled && result.assets[0].base64) {
              const b64 = `data:image/jpeg;base64,${result.assets[0].base64}`;
              if (section === 'entry') setEntryForm({ ...entryForm, [field]: b64 });
              else setExitData({ ...exitData, [field]: b64 });
            }
          }
        },
        {
          text: "URL (DRIVE/WEB)",
          onPress: () => {
            Alert.prompt(
              "Ingresar URL",
              "Pega el enlace directo de la imagen o Google Drive",
              [
                { text: t('cancelar'), style: 'cancel' },
                {
                  text: t('agregar'),
                  onPress: (url) => {
                    if (url) {
                      if (section === 'entry') setEntryForm({ ...entryForm, [field]: url });
                      else setExitData({ ...exitData, [field]: url });
                    }
                  }
                }
              ]
            );
          }
        },
        { text: t('cancelar'), style: 'cancel' }
      ]
    );
  };

  const removePhoto = (section: 'entry' | 'exit', field: string) => {
    if (section === 'entry') {
      setEntryForm({ ...entryForm, [field]: '' });
    } else {
      setExitData({ ...exitData, [field]: '' });
    }
  };

  if (loading) return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>
    </SafeAreaView>
  );

  if (!rec) return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}><Text>{t('no_hay_registros')}</Text></View>
    </SafeAreaView>
  );

  const isFull = rec.entry?.tipo_unidad === 'full';
  const inspectionsDone = Array.isArray(rec.inspection_ids) ? rec.inspection_ids.length : (rec.inspection_id ? 1 : 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </Pressable>
        <Text style={styles.topTitle}>{t('registro').toUpperCase()}: {rec.entry.placas_unidad}</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* SECCIÓN ENTRADA */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="log-in" size={20} color="#FFF" />
              <Text style={styles.sectionTitle}>{t('entrada_datos_unidad').toUpperCase()}</Text>
              {isAdmin && (
                <TouchableOpacity onPress={() => editEntry ? handleUpdateEntry() : setEditEntry(true)} style={styles.headerAction}>
                  <Text style={styles.headerActionText}>{editEntry ? t('guardar').toUpperCase() : t('editar').toUpperCase()}</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.sectionBody}>
              <View style={styles.grid}>
                <EditableItem label={t('placas')} value={entryForm.placas_unidad} onEdit={editEntry ? (v:any)=>setEntryForm({...entryForm, placas_unidad: v}) : null} />
                <EditableItem label={t('chofer')} value={entryForm.chofer_nombre} onEdit={editEntry ? (v:any)=>setEntryForm({...entryForm, chofer_nombre: v}) : null} />
                <EditableItem label={t('compania')} value={entryForm.compania_transporte} onEdit={editEntry ? (v:any)=>setEntryForm({...entryForm, compania_transporte: v}) : null} />
                <EditableItem label={t('tractor')} value={entryForm.numero_tractor} onEdit={editEntry ? (v:any)=>setEntryForm({...entryForm, numero_tractor: v}) : null} />
              </View>

              <View style={styles.subSection}>
                <Text style={styles.subTitle}>CAJA</Text>
                <View style={styles.grid}>
                  <EditableItem label="NUMERO CAJA" value={entryForm.numero_caja} onEdit={editEntry ? (v:any)=>setEntryForm({...entryForm, numero_caja: v}) : null} />
                  <EditableItem label="SELLO" value={entryForm.sello_entrada} onEdit={editEntry ? (v:any)=>setEntryForm({...entryForm, sello_entrada: v}) : null} />
                </View>
              </View>

              {isFull && (
                <View style={styles.subSection}>
                  <Text style={styles.subTitle}>CAJA</Text>
                  <View style={styles.grid}>
                    <EditableItem label="NUMERO CAJA" value={entryForm.numero_caja_2} onEdit={editEntry ? (v:any)=>setEntryForm({...entryForm, numero_caja_2: v}) : null} />
                    <EditableItem label="SELLO" value={entryForm.sello_entrada_2} onEdit={editEntry ? (v:any)=>setEntryForm({...entryForm, sello_entrada_2: v}) : null} />
                  </View>
                </View>
              )}

              {/* FOTOS ENTRADA */}
              <View style={styles.subSection}>
                <Text style={styles.subTitle}>{t('evidencia_fotografica').toUpperCase()}</Text>
                <View style={styles.photoGrid}>
                   <PhotoThumbnail label={t('frente')} uri={entryForm.foto_frente_unidad} onPick={editEntry ? ()=>pickPhoto('entry', 'foto_frente_unidad') : null} onRemove={editEntry ? ()=>removePhoto('entry', 'foto_frente_unidad') : null} />
                   <PhotoThumbnail label={t('atras')} uri={entryForm.foto_atras_caja} onPick={editEntry ? ()=>pickPhoto('entry', 'foto_atras_caja') : null} onRemove={editEntry ? ()=>removePhoto('entry', 'foto_atras_caja') : null} />
                   <PhotoThumbnail label={t('id_chofer')} uri={entryForm.foto_id_chofer} onPick={editEntry ? ()=>pickPhoto('entry', 'foto_id_chofer') : null} onRemove={editEntry ? ()=>removePhoto('entry', 'foto_id_chofer') : null} />
                </View>
              </View>

              <View style={styles.subSection}>
                <Text style={styles.subTitle}>{t('firmas').toUpperCase()}</Text>
                <View style={styles.grid}>
                   <View style={{ flex: 1 }}>
                     <Text style={styles.infoLabel}>{t('firma_operador')}</Text>
                     <Pressable style={styles.sigBoxSmall} onPress={editEntry ? () => setShowSig(true) : undefined}>
                        {entryForm.firma_operador ? (
                          <>
                            <Image source={{ uri: entryForm.firma_operador }} style={{ width: '100%', height: 60, resizeMode: 'contain' }} />
                            {editEntry && (
                              <Pressable style={styles.removeBtnSig} onPress={() => setEntryForm({...entryForm, firma_operador: ''})}>
                                <Ionicons name="trash" size={16} color={colors.error} />
                              </Pressable>
                            )}
                          </>
                        ) : (
                          <Text style={styles.sigPlaceholderSmall}>{t('toca_para_firmar')}</Text>
                        )}
                     </Pressable>
                   </View>
                </View>
              </View>

              <View style={styles.metaRow}>
                <Text style={styles.metaText}>{t('fecha')}: {new Date(rec.entry.fecha_entrada || rec.created_at).toLocaleString()}</Text>
                <Text style={styles.metaText}>{t('guardia')}: {rec.entry.guardia_caseta_nombre}</Text>
              </View>
            </View>
          </View>

          {/* SECCIÓN INSPECCIONES */}
          <View style={styles.section}>
            <View style={[styles.sectionHeader, { backgroundColor: colors.info }]}>
              <Ionicons name="clipboard" size={20} color="#FFF" />
              <Text style={styles.sectionTitle}>{t('inspeccion').toUpperCase()}</Text>
            </View>
            <View style={styles.sectionBody}>
              <Text style={styles.infoText}>
                {isFull ? t('unidad_full_inspecciones_msg', { count: inspectionsDone }) : t('inspecciones_realizadas', { count: inspectionsDone })}
              </Text>

              {rec.inspection_ids?.length > 0 && (
                <View style={{ marginBottom: 15 }}>
                  {rec.inspection_ids.map((iid: string, idx: number) => (
                    <Pressable key={iid} style={styles.inspectionLink} onPress={() => router.push(`/inspection/${iid}`)}>
                      <Ionicons name="document-text" size={16} color={colors.info} />
                      <Text style={styles.inspectionLinkText}>{t('ver_inspeccion')} {idx + 1}</Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.muted} style={{ marginLeft: 'auto' }} />
                    </Pressable>
                  ))}
                </View>
              )}

              <View style={styles.btnRow}>
                <Pressable
                  style={[styles.actionBtn, { backgroundColor: colors.brandPrimary }]}
                  onPress={() => router.push(`/(app)/nueva?record_id=${rec.id}&placas=${rec.entry.placas_unidad}&trailer=${rec.entry.numero_caja}&sello=${rec.entry.sello_entrada}`)}
                >
                  <Ionicons name="add-circle" size={20} color="#FFF" />
                  <Text style={styles.actionBtnText}>{t('inspeccionar').toUpperCase()} {isFull ? '1' : ''}</Text>
                </Pressable>

                {isFull && (
                  <Pressable
                    style={[styles.actionBtn, { backgroundColor: colors.brandSecondary }]}
                    onPress={() => router.push(`/(app)/nueva?record_id=${rec.id}&placas=${rec.entry.placas_unidad}&trailer=${rec.entry.numero_caja_2}&sello=${rec.entry.sello_entrada_2}`)}
                  >
                    <Ionicons name="add-circle" size={20} color="#FFF" />
                    <Text style={styles.actionBtnText}>{t('inspeccionar').toUpperCase()} 2</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>

          {/* SECCIÓN SALIDA */}
          <View style={styles.section}>
            <Pressable
              style={[styles.sectionHeader, { backgroundColor: rec.status === 'salida' ? colors.success : colors.warning }]}
              onPress={() => setShowExit(!showExit)}
            >
              <Ionicons name="log-out" size={20} color="#FFF" />
              <Text style={styles.sectionTitle}>{t('registrador_salida').toUpperCase()}</Text>
              <Ionicons name={showExit ? "chevron-up" : "chevron-down"} size={20} color="#FFF" style={{ marginLeft: 'auto' }} />
            </Pressable>

            {showExit && (
              <View style={styles.sectionBody}>
                <Text style={styles.fieldLabel}>{t('nombre_guardia_caseta')} *</Text>
                <TextInput
                  style={styles.input}
                  value={exitData.guardia_salida_nombre}
                  onChangeText={(v) => setExitData({ ...exitData, guardia_salida_nombre: v.toUpperCase() })}
                  placeholder="NOMBRE DEL GUARDIA"
                />

                <Text style={styles.fieldLabel}>{t('condicion_salida_label')} *</Text>
                <View style={styles.optionsRow}>
                  {['VACIA', 'CARGADA', 'CONSOLIDADO', 'OTRO'].map(opt => (
                    <Pressable
                      key={opt}
                      style={[styles.optionChip, exitData.condicion_salida === opt && styles.optionChipActive]}
                      onPress={() => setExitData({ ...exitData, condicion_salida: opt })}
                    >
                      <Text style={[styles.optionText, exitData.condicion_salida === opt && styles.optionTextActive]}>{opt}</Text>
                    </Pressable>
                  ))}
                </View>

                <View style={styles.grid}>
                   <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>{t('sello_salida_label')} 1</Text>
                      <TextInput
                        style={styles.input}
                        value={exitData.sello_salida}
                        onChangeText={(v) => setExitData({ ...exitData, sello_salida: v.toUpperCase() })}
                      />
                   </View>
                   {isFull && (
                     <View style={{ flex: 1 }}>
                        <Text style={styles.fieldLabel}>{t('sello_salida_label')} 2</Text>
                        <TextInput
                          style={styles.input}
                          value={exitData.sello_salida_2}
                          onChangeText={(v) => setExitData({ ...exitData, sello_salida_2: v.toUpperCase() })}
                        />
                     </View>
                   )}
                </View>

                <Text style={styles.fieldLabel}>{t('inspeccion_sellos_vvtt')}</Text>
                <View style={styles.photoGrid}>
                  <PhotoThumbnail label={t('foto_sello_vvtt')+" 1"} uri={exitData.sello_vvtt_foto} onPick={()=>pickPhoto('exit', 'sello_vvtt_foto')} onRemove={()=>removePhoto('exit', 'sello_vvtt_foto')} />
                  {isFull && <PhotoThumbnail label={t('foto_sello_vvtt')+" 2"} uri={exitData.sello_vvtt_foto_2} onPick={()=>pickPhoto('exit', 'sello_vvtt_foto_2')} onRemove={()=>removePhoto('exit', 'sello_vvtt_foto_2')} />}
                </View>

                <Text style={styles.fieldLabel}>{t('firma_guardia')}</Text>
                <Pressable style={styles.sigBox} onPress={() => setShowSig(true)}>
                  {exitData.firma_guardia ? (
                    <>
                      <Image source={{ uri: exitData.firma_guardia }} style={{ width: '100%', height: 100, resizeMode: 'contain' }} />
                      <Pressable style={styles.removeBtnSig} onPress={() => setExitData({...exitData, firma_guardia: ''})}>
                        <Ionicons name="trash" size={24} color={colors.error} />
                      </Pressable>
                    </>
                  ) : (
                    <Text style={styles.sigPlaceholder}>{t('toca_para_firmar')}</Text>
                  )}
                </Pressable>

                <Pressable
                  style={[styles.saveBtn, (saving || (rec.status === 'salida' && !isAdmin)) && { opacity: 0.5 }]}
                  onPress={handleSaveExit}
                  disabled={saving || (rec.status === 'salida' && !isAdmin)}
                >
                  {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>{t('guardar_salida').toUpperCase()}</Text>}
                </Pressable>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {showSig && (
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>FIRMA</Text>
            <View style={styles.sigContainer}>
              <Signature
                ref={sigRef}
                onOK={(sig) => {
                  if (showExit) setExitData({ ...exitData, firma_guardia: sig });
                  else setEntryForm({ ...entryForm, firma_operador: sig });
                  setShowSig(false);
                }}
                webStyle={`.m-signature-pad--footer{display:none;}`}
              />
            </View>
            <View style={styles.modalBtns}>
              <Pressable style={styles.modalBtn} onPress={() => setShowSig(false)}><Text>{t('cancelar')}</Text></Pressable>
              <Pressable style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={() => sigRef.current?.readSignature()}>
                <Text style={{ color: '#FFF' }}>{t('guardar')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

function EditableItem({ label, value, onEdit }: any) {
  return (
    <View style={styles.infoItem}>
      <Text style={styles.infoLabel}>{label}</Text>
      {onEdit ? (
        <TextInput style={styles.editInput} value={value} onChangeText={onEdit} />
      ) : (
        <Text style={styles.infoValue}>{value || '-'}</Text>
      )}
    </View>
  );
}

function PhotoThumbnail({ label, uri, onPick, onRemove }: any) {
  return (
    <View style={styles.thumbWrapper}>
      <Text style={styles.thumbLabel}>{label}</Text>
      <Pressable style={styles.thumbBox} onPress={onPick} disabled={!onPick}>
        {uri ? (
          <>
            <Image source={{ uri }} style={styles.thumbImg} />
            {onRemove && (
              <Pressable style={styles.removeBtn} onPress={onRemove}>
                <Ionicons name="close-circle" size={24} color={colors.error} />
              </Pressable>
            )}
          </>
        ) : (
          <View style={styles.thumbPlaceholder}>
            <Ionicons name="camera" size={24} color={colors.muted} />
            <Text style={styles.thumbPlaceholderText}>N/A</Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: { backgroundColor: colors.brandPrimary, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 15 },
  backBtn: { padding: 5 },
  topTitle: { color: '#FFF', fontWeight: '900', fontSize: 16, letterSpacing: 1 },
  scroll: { padding: spacing.md, gap: spacing.md, paddingBottom: 100 },
  section: { backgroundColor: '#FFF', borderWidth: 2, borderColor: colors.borderStrong, overflow: 'hidden' },
  sectionHeader: { backgroundColor: colors.brandPrimary, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionTitle: { color: '#FFF', fontWeight: '900', fontSize: 12, letterSpacing: 1, flex: 1 },
  sectionBody: { padding: spacing.md },
  headerAction: { backgroundColor: colors.brandSecondary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 2 },
  headerActionText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  infoItem: { flex: 1, minWidth: '45%' },
  infoLabel: { fontSize: 10, color: colors.muted, fontWeight: '700' },
  infoValue: { fontSize: 13, fontWeight: '900', color: colors.onSurface },
  editInput: { borderWidth: 1, borderColor: '#DDD', padding: 5, fontSize: 12, backgroundColor: '#F9F9F9', marginTop: 2 },
  subSection: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#EEE' },
  subTitle: { fontSize: 11, fontWeight: '900', color: colors.brandPrimary, marginBottom: 10 },
  photoGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  thumbWrapper: { width: '30%', minWidth: 90 },
  thumbLabel: { fontSize: 8, fontWeight: '900', color: colors.muted, marginBottom: 4, textAlign: 'center' },
  thumbBox: { height: 90, borderWidth: 1, borderColor: '#DDD', borderRadius: 4, overflow: 'hidden', backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center' },
  thumbImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  thumbPlaceholder: { alignItems: 'center' },
  thumbPlaceholderText: { fontSize: 9, color: colors.muted, fontWeight: '900', marginTop: 2 },
  removeBtn: { position: 'absolute', top: -5, right: -5, backgroundColor: '#FFF', borderRadius: 12 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, borderTopWidth: 1, borderTopColor: '#EEE', paddingTop: 10 },
  metaText: { fontSize: 10, color: colors.muted },
  infoText: { fontSize: 12, color: colors.onSurface, marginBottom: 15, fontWeight: '700' },
  inspectionLink: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, backgroundColor: '#F0F9FF', borderWidth: 1, borderColor: '#BAE6FD', marginBottom: 5 },
  inspectionLinkText: { fontSize: 12, fontWeight: '900', color: colors.info },
  btnRow: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 4 },
  actionBtnText: { color: '#FFF', fontWeight: '900', fontSize: 12 },
  fieldLabel: { fontSize: 11, fontWeight: '900', color: colors.onSurface, marginTop: 15, marginBottom: 5 },
  input: { borderWidth: 2, borderColor: colors.borderStrong, padding: 10, fontSize: 14, backgroundColor: '#F9F9F9' },
  optionsRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  optionChip: { paddingHorizontal: 15, paddingVertical: 8, borderWidth: 2, borderColor: colors.borderStrong, backgroundColor: '#FFF' },
  optionChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  optionText: { fontWeight: '900', fontSize: 11, color: colors.muted },
  optionTextActive: { color: '#FFF' },
  sigBox: { height: 100, borderWidth: 2, borderColor: colors.borderStrong, marginTop: 5, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF' },
  sigPlaceholder: { color: colors.muted, fontWeight: '700' },
  sigBoxSmall: { height: 60, borderWidth: 1, borderColor: colors.border, marginTop: 5, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9F9F9' },
  sigPlaceholderSmall: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  removeBtnSig: { position: 'absolute', top: 5, right: 5, padding: 5, backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 15 },
  saveBtn: { backgroundColor: colors.success, padding: 15, alignItems: 'center', marginTop: 25, borderRadius: 4 },
  saveBtnText: { color: '#FFF', fontWeight: '900', letterSpacing: 1 },
  modal: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20, zIndex: 100 },
  modalContent: { backgroundColor: '#FFF', padding: 20, borderRadius: 8 },
  modalTitle: { fontWeight: '900', fontSize: 16, marginBottom: 15 },
  sigContainer: { height: 300, borderWidth: 1, borderColor: '#DDD', marginBottom: 15 },
  modalBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  modalBtn: { padding: 10, paddingHorizontal: 20 },
  modalBtnPrimary: { backgroundColor: colors.brandPrimary, borderRadius: 4 },
});

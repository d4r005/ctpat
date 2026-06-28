import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  ActivityIndicator, KeyboardAvoidingView, Platform, Image, Alert
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
  const { patchVehicleExit, updateVehicleRecord } = useInspections();

  const [rec, setRec] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showExit, setShowExit] = useState(false);
  const [showSig, setShowSig] = useState(false);
  const sigRef = React.useRef<any>(null);

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
    firma_operador_salida: ''
  });

  const load = async () => {
    if (!token || !id) return;
    setLoading(true);
    try {
      const data = await apiCall<any>(`/vehicle-records/${id}`, { token });
      if (data) {
        setRec(data);
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

  const handleSaveExit = async () => {
    if (!exitData.guardia_salida_nombre || !exitData.condicion_salida) {
      Alert.alert(t('error'), t('completar_datos_salida'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...exitData,
        fecha_salida: new Date().toISOString(),
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

  const pickPhoto = async (field: string) => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      quality: 0.3,
      base64: true,
    });
    if (!result.canceled && result.assets[0].base64) {
      setExitData({ ...exitData, [field]: `data:image/jpeg;base64,${result.assets[0].base64}` });
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
            </View>
            <View style={styles.sectionBody}>
              <View style={styles.grid}>
                <InfoItem label={t('placas')} value={rec.entry.placas_unidad} />
                <InfoItem label={t('chofer')} value={rec.entry.chofer_nombre} />
                <InfoItem label={t('compania')} value={rec.entry.compania_transporte} />
                <InfoItem label={t('tractor')} value={rec.entry.numero_tractor} />
              </View>

              <View style={styles.subSection}>
                <Text style={styles.subTitle}>{t('caja_1_caps')}</Text>
                <View style={styles.grid}>
                  <InfoItem label={t('numero_caja_caps')} value={rec.entry.numero_caja} />
                  <InfoItem label={t('sello')} value={rec.entry.sello_entrada} />
                </View>
              </View>

              {isFull && (
                <View style={styles.subSection}>
                  <Text style={styles.subTitle}>{t('caja_2_caps')}</Text>
                  <View style={styles.grid}>
                    <InfoItem label={t('numero_caja_caps')} value={rec.entry.numero_caja_2} />
                    <InfoItem label={t('sello')} value={rec.entry.sello_entrada_2} />
                  </View>
                </View>
              )}

              <View style={styles.metaRow}>
                <Text style={styles.metaText}>{t('fecha')}: {new Date(rec.entry.fecha_entrada).toLocaleString()}</Text>
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

                <Text style={styles.fieldLabel}>{t('inspeccion_sellos_vvtt')} (1)</Text>
                <PhotoBox
                  value={exitData.sello_vvtt_foto}
                  onPress={() => pickPhoto('sello_vvtt_foto')}
                  label={t('foto_sello_vvtt')}
                  t={t}
                />

                {isFull && (
                  <>
                    <Text style={styles.fieldLabel}>{t('inspeccion_sellos_vvtt')} (2)</Text>
                    <PhotoBox
                      value={exitData.sello_vvtt_foto_2}
                      onPress={() => pickPhoto('sello_vvtt_foto_2')}
                      label={t('foto_sello_vvtt')}
                      t={t}
                    />
                  </>
                )}

                <Text style={styles.fieldLabel}>{t('firma_operador')}</Text>
                <Pressable style={styles.sigBox} onPress={() => setShowSig(true)}>
                  {exitData.firma_operador_salida ? (
                    <Image source={{ uri: exitData.firma_operador_salida }} style={{ width: '100%', height: 100, resizeMode: 'contain' }} />
                  ) : (
                    <Text style={styles.sigPlaceholder}>{t('toca_para_firmar')}</Text>
                  )}
                </Pressable>

                <Pressable
                  style={[styles.saveBtn, saving && { opacity: 0.7 }]}
                  onPress={handleSaveExit}
                  disabled={saving || rec.status === 'salida' && !isAdmin}
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
            <Text style={styles.modalTitle}>{t('firma_operador')}</Text>
            <View style={styles.sigContainer}>
              <Signature
                ref={sigRef}
                onOK={(sig) => {
                  setExitData({ ...exitData, firma_operador_salida: sig });
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

function InfoItem({ label, value }: any) {
  return (
    <View style={styles.infoItem}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || '-'}</Text>
    </View>
  );
}

function PhotoBox({ value, onPress, label, t }: any) {
  return (
    <Pressable style={styles.photoBox} onPress={onPress}>
      {value ? (
        <Image source={{ uri: value }} style={styles.photo} />
      ) : (
        <View style={styles.photoPlaceholder}>
          <Ionicons name="camera" size={32} color={colors.muted} />
          <Text style={styles.photoText}>{label}</Text>
        </View>
      )}
    </Pressable>
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
  sectionTitle: { color: '#FFF', fontWeight: '900', fontSize: 12, letterSpacing: 1 },
  sectionBody: { padding: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  infoItem: { flex: 1, minWidth: '45%' },
  infoLabel: { fontSize: 10, color: colors.muted, fontWeight: '700' },
  infoValue: { fontSize: 13, fontWeight: '900', color: colors.onSurface },
  subSection: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#EEE' },
  subTitle: { fontSize: 11, fontWeight: '900', color: colors.brandPrimary, marginBottom: 5 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, borderTopWidth: 1, borderTopColor: '#EEE', paddingTop: 10 },
  metaText: { fontSize: 10, color: colors.muted },
  infoText: { fontSize: 12, color: colors.onSurface, marginBottom: 15, fontWeight: '700' },
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
  photoBox: { width: '100%', height: 180, borderWidth: 2, borderColor: colors.borderStrong, borderStyle: 'dashed', marginTop: 5, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F5F5' },
  photo: { width: '100%', height: '100%', resizeMode: 'cover' },
  photoPlaceholder: { alignItems: 'center' },
  photoText: { fontSize: 10, color: colors.muted, marginTop: 5, fontWeight: '900' },
  sigBox: { height: 120, borderWidth: 2, borderColor: colors.borderStrong, marginTop: 5, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF' },
  sigPlaceholder: { color: colors.muted, fontWeight: '700' },
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

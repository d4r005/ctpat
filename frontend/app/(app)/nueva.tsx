import React, { useState, useMemo } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Signature from '@/src/components/SignaturePad';
import { useTranslation } from 'react-i18next';
import { useInspections, InspectionPoint } from '@/src/context/InspectionContext';
import { useAuth } from '@/src/context/AuthContext';
import { getInspectionPoints } from '@/src/constants/inspectionPoints';
import { colors, spacing, typography } from '@/src/constants/theme';
import BarcodeScanner from '@/src/components/BarcodeScanner';
import { apiCall } from '@/src/api/client';
import MainHeader from '@/src/components/MainHeader';

const TOTAL_STEPS = 4;

export default function Nueva() {
  const router = useRouter();
  const { user, token } = useAuth();
  const { saveInspection } = useInspections();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    record_id?: string;
    compania?: string;
    placas?: string;
    trailer?: string;
    sello?: string;
    type?: string;
    chofer?: string; // Recibir chofer
  }>();

  const [showTypeSelector, setShowTypeSelector] = useState(!params.type);
  const [selectedType, setSelectedType] = useState<any>(params.type || null);
  const [pendingInYard, setPendingInYard] = useState<any[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);

  const fetchPending = async () => {
    if (!token) return;
    setLoadingPending(true);
    try {
      // Filtrar por status=entrada en el backend para mayor velocidad
      const data = await apiCall<any[]>('/vehicle-records?status=entrada', { token });
      // Registros que no tienen inspección vinculada
      setPendingInYard(data.filter(r => !r.inspection_id));
    } catch {} finally { setLoadingPending(false); }
  };

  React.useEffect(() => {
    if (showTypeSelector && token) fetchPending();
  }, [showTypeSelector, token]);

  const inspectionType = (selectedType === '9_puntos_contenedor' ? '9_puntos_contenedor' : '19_puntos') as '19_puntos' | '9_puntos_contenedor';
  const pointsDef = getInspectionPoints(inspectionType);
  const totalPoints = pointsDef.length;

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // General — prefill from caseta record if query params present
  const [compania, setCompania] = useState(params.compania || '');
  const [placas, setPlacas] = useState(params.placas || '');
  const [trailer, setTrailer] = useState(params.trailer || '');
  const [precinto, setPrecinto] = useState('');
  const [precintoNA, setPrecintoNA] = useState(false);
  const [selloAlta, setSelloAlta] = useState(params.sello || '');
  const [selloVerificado, setSelloVerificado] = useState(false);

  // points (dynamic based on type)
  const [points, setPoints] = useState<InspectionPoint[]>([]);

  React.useEffect(() => {
    if (selectedType) {
      const def = getInspectionPoints(selectedType);
      setPoints(def.map((p) => ({ number: p.number, name: p.name, estado: '', comentarios: '', photo: '' })));
    }
  }, [selectedType]);

  const pickPhoto = async (idx: number, fromCamera: boolean) => {
    try {
      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { alert(t('acceso_restringido')); return; }
        const r = await ImagePicker.launchCameraAsync({
          mediaTypes: 'images',
          quality: 0.3, // Optimizado (antes 0.5)
          base64: true,
          allowsEditing: false,
        });
        if (!r.canceled && r.assets[0]?.base64) {
          updatePoint(idx, { photo: `data:image/jpeg;base64,${r.assets[0].base64}` });
        }
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { alert(t('acceso_restringido')); return; }
        const r = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: 'images',
          quality: 0.3, // Optimizado (antes 0.5)
          base64: true,
          allowsEditing: false,
        });
        if (!r.canceled && r.assets[0]?.base64) {
          updatePoint(idx, { photo: `data:image/jpeg;base64,${r.assets[0].base64}` });
        }
      }
    } catch (e: any) { alert(e.message || 'Error'); }
  };

  // Suspicious + signatures
  const [actSospechosa, setActSospechosa] = useState('');
  const [inspectorNombre, setInspectorNombre] = useState(user?.name || '');
  const [inspectorFirma, setInspectorFirma] = useState('');
  const [showSigInspector, setShowSigInspector] = useState(false);

  // Efecto para prellenar datos cuando cambian los params (especialmente útil al venir de caseta)
  React.useEffect(() => {
    if (params.compania) setCompania(params.compania);
    if (params.placas) setPlacas(params.placas);
    if (params.trailer) setTrailer(params.trailer);
    if (params.sello) setSelloAlta(params.sello);
  }, [params.record_id]);
  const [scanning, setScanning] = useState<null | 'placas' | 'trailer' | 'precinto'>(null);

  const handleScan = (value: string) => {
    const cleaned = value.trim();
    if (scanning === 'placas') setPlacas(cleaned.toUpperCase());
    else if (scanning === 'trailer') setTrailer(cleaned);
    else if (scanning === 'precinto') setPrecinto(cleaned);
    setScanning(null);
  };

  const progress = useMemo(() => ((step + 1) / TOTAL_STEPS) * 100, [step]);
  const completedPoints = points.filter((p) => p.estado !== '').length;

  const updatePoint = (idx: number, patch: Partial<InspectionPoint>) => {
    setPoints((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  const canNext = () => {
    if (step === 0) return compania.trim() && placas.trim() && trailer.trim() && (precintoNA || precinto.trim());
    if (step === 1) {
      // Todos los puntos deben tener estado
      // Si el estado es "malo", la foto es OBLIGATORIA
      return points.every((p) => {
        if (p.estado === '') return false;
        if (p.estado === 'malo' && !p.photo) return false;
        return true;
      });
    }
    if (step === 2) return true;
    if (step === 3) return inspectorNombre.trim() && inspectorFirma;
    return false;
  };

  // also expose inspectionType to UI
  const typeLabel = inspectionType === '9_puntos_contenedor' ? t('inspeccion_9_puntos') : t('inspeccion_19_puntos');

  const handleSave = async () => {
    setSaving(true);
    try {
      const created = await saveInspection({
        compania_transportista: compania.trim(),
        placas_unidad: placas.trim().toUpperCase(),
        numero_trailer: trailer.trim(),
        numero_precinto: precintoNA ? 'N/A' : precinto.trim(),
        sello_alta_seguridad: selloAlta.trim(),
        sello_verificado: selloVerificado,
        points,
        actividad_sospechosa: actSospechosa.trim(),
        inspector_nombre: inspectorNombre.trim(),
        inspector_firma: inspectorFirma,
        fecha_hora: new Date().toISOString(),
        client_uuid: '',
        inspection_type: inspectionType,
        record_id: params.record_id || '', // Enviar record_id para vínculo atómico
      } as any);

      if (Platform.OS === 'web') {
        const proceed = window.confirm(`${t('inspeccion_guardada')}. ${t('desea_generar_ticket')}`);
        if (proceed) {
          const queryParams = new URLSearchParams({
            record_id: params.record_id || '',
            inspection_id: created.id,
            compania: compania,
            placas: placas,
            trailer: trailer,
            sello: precinto !== 'N/A' ? precinto : '',
            operador: params.chofer || inspectorNombre // Usar nombre del chofer si viene de caseta
          });
          router.replace(`/embarque/nuevo?${queryParams.toString()}`);
        } else {
          // Regresar al panel de Histórico en lugar de quedarse en el detalle
          router.replace('/(app)/historico');
        }
        return;
      }

      Alert.alert(
        t('inspeccion_guardada'),
        t('desea_generar_ticket'),
        [
          {
            text: t('regresar_panel_caps'),
            onPress: () => router.replace('/(app)/historico')
          },
          {
            text: t('si_generar_ticket_caps'),
            onPress: () => {
              const queryParams = new URLSearchParams({
                record_id: params.record_id || '',
                inspection_id: created.id,
                compania: compania,
                placas: placas,
                trailer: trailer,
                sello: precinto !== 'N/A' ? precinto : '',
                operador: params.chofer || inspectorNombre
              });
              router.replace(`/embarque/nuevo?${queryParams.toString()}`);
            }
          }
        ]
      );
    } catch (e: any) {
      console.error('Error saving inspection:', e);
      let errorMsg = e.message || t('error_general', 'Error');
      if (errorMsg === 'Failed to fetch') {
        errorMsg = 'Error de conexión con el servidor. Las fotos podrían ser muy pesadas. Intenta de nuevo.';
      }
      alert(`Ocurrió un problema: ${errorMsg}`);
    } finally {
      setSaving(false);
    }
  };

  if (showTypeSelector) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <MainHeader showBack title="NAF" subtitle={t('nueva_inspeccion').toUpperCase()} />

        <ScrollView contentContainerStyle={styles.selectorContent} keyboardShouldPersistTaps="handled">
          {pendingInYard.length > 0 && (
            <View style={{ marginBottom: spacing.xl }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.md }}>
                <Ionicons name="time-outline" size={20} color={colors.warning} />
                <Text style={[styles.selectorLabel, { marginBottom: 0, textAlign: 'left' }]}>{t('pendientes_patio').toUpperCase()} ({pendingInYard.length})</Text>
              </View>
              {pendingInYard.map((r) => (
                <Pressable
                  key={r.id}
                  style={styles.pendingCard}
                  onPress={() => {
                    setCompania(r.entry.compania_transporte || '');
                    setPlacas(r.entry.placas_unidad || '');
                    setTrailer(r.entry.numero_caja || '');
                    setSelloAlta(r.entry.sello_entrada || '');
                    router.setParams({ record_id: r.id });

                    if (Platform.OS === 'web') {
                      const is9p = window.confirm(t('pregunta_tipo_inspeccion') + " (OK = 9 pts / Cancel = 19 pts)");
                      setSelectedType(is9p ? '9_puntos_contenedor' : '19_puntos');
                      setShowTypeSelector(false);
                    } else {
                      Alert.alert(
                        t('iniciar_inspeccion'),
                        `${t('pregunta_tipo_inspeccion')} ${r.entry.placas_unidad}?`,
                        [
                          { text: "19 PUNTOS", onPress: () => { setSelectedType('19_puntos'); setShowTypeSelector(false); } },
                          { text: "9 PUNTOS", onPress: () => { setSelectedType('9_puntos_contenedor'); setShowTypeSelector(false); } },
                          { text: t('cancelar'), style: 'cancel' }
                        ]
                      );
                    }
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pendingPlates}>{r.entry.placas_unidad}</Text>
                    <Text style={styles.pendingSub}>{r.entry.chofer_nombre} · {r.entry.compania_transporte}</Text>
                    <View style={{ marginTop: 4 }}>
                      <ProcessTracker steps={{ entry: true, inspection: false, shipping: !!r.has_shipping_ticket, exit: false }} compact />
                    </View>
                  </View>
                  <Ionicons name="arrow-forward" size={20} color={colors.brandPrimary} />
                </Pressable>
              ))}
            </View>
          )}

          <Text style={styles.selectorLabel}>{t('selecciona_tipo')}</Text>

          <Pressable
            style={[styles.typeCard, { backgroundColor: colors.brandPrimary }]}
            onPress={() => { setSelectedType('19_puntos'); setShowTypeSelector(false); }}
          >
            <View style={styles.iconCircle}>
              <Ionicons name="car-sport" size={32} color="#FFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.typeTitle}>{t('inspeccion_19_puntos').toUpperCase()}</Text>
              <Text style={styles.typeSub}>{t('tractor_camion').toUpperCase()}</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#FFF" />
          </Pressable>

          <Pressable
            style={[styles.typeCard, { backgroundColor: colors.info }]}
            onPress={() => { setSelectedType('9_puntos_contenedor'); setShowTypeSelector(false); }}
          >
            <View style={styles.iconCircle}>
              <Ionicons name="cube" size={32} color="#FFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.typeTitle}>{t('inspeccion_9_puntos').toUpperCase()}</Text>
              <Text style={styles.typeSub}>{t('contenedor_maritimo').toUpperCase()}</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#FFF" />
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']} testID="nueva-screen">
      {/* Progress header */}
      <View style={styles.progressHeader}>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
        </View>
        <Text style={styles.progressText}>
          {t('paso')} {step + 1} {t('de')} {TOTAL_STEPS} · {typeLabel} · {[t('datos_generales'), `${totalPoints} ${t('puntos')}`, t('observaciones'), t('firmas')][step]}
        </Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {step === 0 && (
            <View>
              <Text style={styles.stepTitle}>{t('datos_unidad')}</Text>
              <Field label={t('compania_transportista_caps')} value={compania} onChange={setCompania} testID="nueva-compania-input" />
              <Field label={t('placas_unidad_caps')} value={placas} onChange={setPlacas} testID="nueva-placas-input" onScan={() => setScanning('placas')} scanTestID="nueva-placas-scan" />
              <Field label={t('numero_trailer_caps')} value={trailer} onChange={setTrailer} testID="nueva-trailer-input" onScan={() => setScanning('trailer')} scanTestID="nueva-trailer-scan" />

              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Field label={t('numero_precinto_caps')} value={precinto} onChange={setPrecinto} testID="nueva-precinto-input" onScan={precintoNA ? undefined : () => setScanning('precinto')} scanTestID="nueva-precinto-scan" disabled={precintoNA} />
                </View>
                <Pressable onPress={() => setPrecintoNA(!precintoNA)} style={styles.naBox}>
                  <View style={[styles.naCheck, precintoNA && styles.naCheckOn]}>
                    {precintoNA && <Ionicons name="checkmark" size={14} color="#FFF" />}
                  </View>
                  <Text style={styles.naText}>N/A</Text>
                </Pressable>
              </View>

              <Field label={t('sello_alta_seguridad_caps')} value={selloAlta} onChange={setSelloAlta} testID="nueva-sello-input" />
              <Pressable
                testID="nueva-sello-verificado"
                style={styles.checkRow}
                onPress={() => setSelloVerificado(!selloVerificado)}
              >
                <View style={[styles.checkbox, selloVerificado && styles.checkboxOn]}>
                  {selloVerificado && <Ionicons name="checkmark" size={18} color={colors.onSuccess} />}
                </View>
                <Text style={styles.checkLabel}>{t('sello_verificado_msg')}</Text>
              </Pressable>
            </View>
          )}

          {step === 1 && (
            <View>
              <Text style={styles.stepTitle}>
                {t('inspeccion')} {totalPoints} {t('puntos')} {inspectionType === '9_puntos_contenedor' ? `(${t('contenedor_maritimo')})` : ''} <Text style={styles.counter}>({completedPoints}/{totalPoints})</Text>
              </Text>
              {points.map((p, idx) => (
                <View key={p.number} style={styles.pointBlock} testID={`nueva-point-${p.number}`}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.pointTitle}>{p.number}. {p.name}</Text>
                    {p.number === 16 && (
                      <Pressable
                        onPress={() => updatePoint(idx, { estado: p.estado === 'na' ? '' : 'na', comentarios: '', photo: '' })}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingBottom: 8 }}
                      >
                        <View style={[styles.naCheck, p.estado === 'na' && styles.naCheckOn]}>
                          {p.estado === 'na' && <Ionicons name="checkmark" size={14} color="#FFF" />}
                        </View>
                        <Text style={styles.naText}>N/A</Text>
                      </Pressable>
                    )}
                  </View>
                  <View style={styles.toggleRow}>
                    <Pressable
                      testID={`nueva-point-${p.number}-bueno`}
                      style={[styles.toggleBtn, p.estado === 'bueno' && styles.toggleBuenoOn, p.estado === 'na' && { opacity: 0.3 }]}
                      onPress={() => p.estado !== 'na' && updatePoint(idx, { estado: 'bueno', comentarios: '', photo: '' })}
                      disabled={p.estado === 'na'}
                    >
                      <Ionicons name="checkmark-circle" size={20} color={p.estado === 'bueno' ? colors.onSuccess : colors.muted} />
                      <Text style={[styles.toggleText, p.estado === 'bueno' && { color: colors.onSuccess }]}>{t('bueno')}</Text>
                    </Pressable>
                    <Pressable
                      testID={`nueva-point-${p.number}-malo`}
                      style={[styles.toggleBtn, p.estado === 'malo' && styles.toggleMaloOn, p.estado === 'na' && { opacity: 0.3 }]}
                      onPress={() => p.estado !== 'na' && updatePoint(idx, { estado: 'malo' })}
                      disabled={p.estado === 'na'}
                    >
                      <Ionicons name="close-circle" size={20} color={p.estado === 'malo' ? colors.onError : colors.muted} />
                      <Text style={[styles.toggleText, p.estado === 'malo' && { color: colors.onError }]}>{t('malo')}</Text>
                    </Pressable>
                  </View>
                  {p.estado === 'na' && (
                    <View style={{ marginTop: spacing.sm, padding: spacing.sm, backgroundColor: colors.surfaceTertiary, alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, fontWeight: '900', color: colors.muted }}>{t('punto_no_aplica_msg')}</Text>
                    </View>
                  )}
                  {p.estado === 'malo' && (
                    <>
                      <TextInput
                        testID={`nueva-point-${p.number}-comentarios`}
                        autoCapitalize="characters"
                        style={styles.commentInput}
                        value={p.comentarios}
                        onChangeText={(t) => updatePoint(idx, { comentarios: t.toUpperCase() })}
                        placeholder={t('describir_falla_placeholder')}
                        placeholderTextColor={colors.muted}
                        multiline
                      />
                      {!p.photo && (
                        <View style={{ backgroundColor: colors.error + '11', padding: 8, marginTop: 8, borderWidth: 1, borderColor: colors.error }}>
                          <Text style={{ color: colors.error, fontSize: 10, fontWeight: '900', textAlign: 'center' }}>
                            {t('foto_obligatoria_falla')}
                          </Text>
                        </View>
                      )}
                      <View style={styles.photoRow}>
                        {p.photo ? (
                          <View style={styles.photoPreviewWrap}>
                            <Image source={{ uri: p.photo }} style={styles.photoPreview} />
                            <Pressable testID={`nueva-point-${p.number}-remove-photo`} style={styles.photoRemove} onPress={() => updatePoint(idx, { photo: '' })}>
                              <Ionicons name="close-circle" size={24} color={colors.error} />
                            </Pressable>
                          </View>
                        ) : (
                          <>
                            <Pressable testID={`nueva-point-${p.number}-camera`} style={styles.photoBtn} onPress={() => pickPhoto(idx, true)}>
                              <Ionicons name="camera" size={20} color={colors.onBrandPrimary} />
                              <Text style={styles.photoBtnText}>{t('foto_caps')}</Text>
                            </Pressable>
                            <Pressable testID={`nueva-point-${p.number}-gallery`} style={[styles.photoBtn, { backgroundColor: colors.brandSecondary }]} onPress={() => pickPhoto(idx, false)}>
                              <Ionicons name="images" size={20} color={colors.onBrandSecondary} />
                              <Text style={[styles.photoBtnText, { color: colors.onBrandSecondary }]}>{t('galeria_caps')}</Text>
                            </Pressable>
                          </>
                        )}
                      </View>
                    </>
                  )}
                </View>
              ))}
            </View>
          )}

          {step === 2 && (
            <View>
              <Text style={styles.stepTitle}>{t('observaciones')}</Text>
              <Text style={styles.label}>{t('informe_actividad_sospechosa_caps')}</Text>
              <TextInput
                testID="nueva-actividad-input"
                autoCapitalize="characters"
                style={[styles.input, { minHeight: 140, textAlignVertical: 'top' }]}
                value={actSospechosa}
                onChangeText={(t) => setActSospechosa(t.toUpperCase())}
                multiline
                placeholder={t('detallar_actividad_placeholder')}
                placeholderTextColor={colors.muted}
              />
            </View>
          )}

          {step === 3 && (
            <View>
              <Text style={styles.stepTitle}>{t('firmas')}</Text>

              <Text style={styles.label}>{t('nombre_inspector_caps')}</Text>
              <TextInput
                testID="nueva-inspector-nombre"
                autoCapitalize="characters"
                style={styles.input}
                value={inspectorNombre}
                onChangeText={(t) => setInspectorNombre(t.toUpperCase())}
                placeholder={t('nombre_completo_placeholder')}
                placeholderTextColor={colors.muted}
              />
              <Pressable testID="nueva-inspector-firma-btn" style={styles.signatureBox} onPress={() => setShowSigInspector(true)}>
                {inspectorFirma ? (
                  <Text style={styles.signatureDone}>{t('firma_capturada_msg')}</Text>
                ) : (
                  <Text style={styles.signatureCta}>{t('toca_para_firmar')}</Text>
                )}
              </Pressable>
            </View>
          )}
        </ScrollView>

        {/* Footer nav */}
        <View style={styles.footer}>
          {step > 0 && (
            <Pressable testID="nueva-prev-btn" style={styles.secondaryBtn} onPress={() => setStep(step - 1)}>
              <Text style={styles.secondaryBtnText}>{t('atras')}</Text>
            </Pressable>
          )}
          {step < TOTAL_STEPS - 1 ? (
            <Pressable
              testID="nueva-next-btn"
              style={[styles.primaryBtn, !canNext() && styles.btnDisabled]}
              onPress={() => canNext() && setStep(step + 1)}
              disabled={!canNext()}
            >
              <Text style={styles.primaryBtnText}>{t('siguiente')}</Text>
            </Pressable>
          ) : (
            <Pressable
              testID="nueva-save-btn"
              style={[styles.primaryBtn, (!canNext() || saving) && styles.btnDisabled]}
              onPress={handleSave}
              disabled={!canNext() || saving}
            >
              {saving ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.primaryBtnText}>{t('guardar_inspeccion_caps')}</Text>}
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Scanner */}
      <BarcodeScanner
        visible={scanning !== null}
        title={`${t('escanear_title')} ${scanning === 'placas' ? t('placas_unidad_caps') : scanning === 'trailer' ? t('numero_trailer_caps') : t('numero_precinto_caps')}`}
        onClose={() => setScanning(null)}
        onScan={handleScan}
      />

      {/* Signature modals */}
      {showSigInspector && (
        <SignatureModal
          onClose={() => setShowSigInspector(false)}
          onSave={(sig) => { setInspectorFirma(sig); setShowSigInspector(false); }}
          title={t('firma_inspector')}
          t={t}
        />
      )}
    </SafeAreaView>
  );
}

function Field({ label, value, onChange, testID, onScan, scanTestID, disabled }: { label: string; value: string; onChange: (v: string) => void; testID: string; onScan?: () => void; scanTestID?: string; disabled?: boolean }) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          testID={testID}
          autoCapitalize="characters"
          style={[
            styles.input,
            { flex: 1 },
            disabled && { backgroundColor: colors.border, opacity: 0.6 }
          ]}
          value={disabled ? 'N/A' : value}
          onChangeText={(text) => onChange(text.toUpperCase())}
          placeholderTextColor={colors.muted}
          editable={!disabled}
        />
        {onScan && (
          <Pressable testID={scanTestID} onPress={onScan} style={[styles.scanBtn, disabled && { opacity: 0.5 }]} disabled={disabled}>
            <Ionicons name="barcode" size={24} color={colors.onBrandPrimary} />
          </Pressable>
        )}
      </View>
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
          <Pressable style={[styles.secondaryBtn, { flex: 1 }]} onPress={onClose} testID="signature-cancel">
            <Text style={styles.secondaryBtnText}>{t('cancelar_caps')}</Text>
          </Pressable>
          <Pressable
            style={[styles.primaryBtn, { flex: 1 }]}
            onPress={() => sigRef.current?.readSignature()}
            testID="signature-save"
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
  progressHeader: { backgroundColor: colors.brandPrimary, padding: spacing.md },
  progressBarBg: { height: 6, backgroundColor: '#1E3A5F', overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: colors.brandSecondary },
  progressText: { color: colors.onBrandPrimary, fontWeight: '900', fontSize: 11, letterSpacing: 1, marginTop: spacing.sm },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  stepTitle: { fontSize: typography.sizes.xl, fontWeight: '900', color: colors.onSurface, marginBottom: spacing.lg },
  counter: { color: colors.muted, fontSize: typography.sizes.base },
  label: { fontSize: 11, fontWeight: '900', color: colors.onSurfaceTertiary, letterSpacing: 1, marginBottom: spacing.sm, marginTop: spacing.md },
  input: {
    borderWidth: 2, borderColor: colors.borderStrong, backgroundColor: colors.surfaceSecondary,
    padding: spacing.md, fontSize: typography.sizes.lg, color: colors.onSurface,
  },
  naBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceSecondary, borderWidth: 2, borderColor: colors.borderStrong, height: 56, paddingHorizontal: spacing.sm, gap: 4, marginTop: 25 },
  naCheck: { width: 20, height: 20, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  naCheckOn: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  naText: { fontSize: 10, fontWeight: '900', color: colors.onSurface },
  scanBtn: {
    width: 56, backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center',
  },
  checkRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg, gap: spacing.sm },
  checkbox: { width: 28, height: 28, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: colors.success, borderColor: colors.success },
  checkLabel: { color: colors.onSurface, fontWeight: '700' },
  pointBlock: {
    backgroundColor: colors.surfaceSecondary, borderWidth: 2, borderColor: colors.borderStrong,
    padding: spacing.md, marginBottom: spacing.md,
  },
  pointTitle: { fontWeight: '900', color: colors.onSurface, fontSize: typography.sizes.base, marginBottom: spacing.sm },
  toggleRow: { flexDirection: 'row', gap: spacing.sm },
  toggleBtn: {
    flex: 1, borderWidth: 2, borderColor: colors.borderStrong, padding: spacing.md,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, minHeight: 52,
  },
  toggleBuenoOn: { backgroundColor: colors.success, borderColor: colors.success },
  toggleMaloOn: { backgroundColor: colors.error, borderColor: colors.error },
  toggleText: { fontWeight: '900', color: colors.muted, letterSpacing: 1 },
  commentInput: {
    borderWidth: 2, borderColor: colors.error, padding: spacing.sm, marginTop: spacing.sm,
    minHeight: 80, textAlignVertical: 'top', color: colors.onSurface, backgroundColor: '#FEF2F2',
  },
  photoRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  photoBtn: { flex: 1, backgroundColor: colors.brandPrimary, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44 },
  photoBtnText: { color: colors.onBrandPrimary, fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  photoPreviewWrap: { position: 'relative', width: '100%' },
  photoPreview: { width: '100%', height: 180, backgroundColor: '#000', resizeMode: 'cover', borderWidth: 2, borderColor: colors.error },
  photoRemove: { position: 'absolute', top: 8, right: 8, backgroundColor: '#FFF', borderRadius: 16 },
  signatureBox: {
    borderWidth: 2, borderColor: colors.borderStrong, padding: spacing.lg,
    backgroundColor: colors.surfaceSecondary, alignItems: 'center', marginTop: spacing.sm, minHeight: 72, justifyContent: 'center',
  },
  signatureCta: { color: colors.muted, fontWeight: '700', letterSpacing: 1 },
  signatureDone: { color: colors.success, fontWeight: '900', letterSpacing: 1 },
  footer: {
    flexDirection: 'row', padding: spacing.md, gap: spacing.sm,
    borderTopWidth: 2, borderTopColor: colors.borderStrong, backgroundColor: colors.surfaceSecondary,
  },
  primaryBtn: { flex: 1, backgroundColor: colors.brandPrimary, padding: spacing.md, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  primaryBtnText: { color: colors.onBrandPrimary, fontWeight: '900', letterSpacing: 1 },
  secondaryBtn: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.borderStrong, padding: spacing.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  secondaryBtnText: { color: colors.onSurface, fontWeight: '900', letterSpacing: 1 },
  btnDisabled: { opacity: 0.4 },

  modalOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(9,9,11,0.85)', justifyContent: 'center', padding: spacing.lg, zIndex: 100,
  },
  modalCard: { backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderWidth: 2, borderColor: colors.borderStrong },
  modalTitle: { fontWeight: '900', fontSize: typography.sizes.lg, color: colors.onSurface, marginBottom: spacing.md, letterSpacing: 1 },
  signatureCanvas: { height: 280 },

  selectorHeader: { backgroundColor: colors.brandPrimary, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  selectorTitle: { color: '#FFF', fontWeight: '900', fontSize: 18, letterSpacing: 1 },
  backBtn: { padding: 4 },
  selectorContent: { padding: spacing.xl, gap: spacing.lg },
  selectorLabel: { fontWeight: '900', color: colors.muted, fontSize: 12, letterSpacing: 1.5, textAlign: 'center', marginBottom: spacing.md },
  pendingCard: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 2,
    borderColor: colors.warning,
    padding: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md
  },
  pendingPlates: { fontWeight: '900', fontSize: typography.sizes.lg, color: colors.onSurface },
  pendingSub: { fontSize: 11, color: colors.muted, marginTop: 2 },
  typeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.lg,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    marginBottom: spacing.md,
    minHeight: 100,
  },
  iconCircle: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  typeTitle: { color: '#FFF', fontWeight: '900', fontSize: 18, letterSpacing: 1 },
  typeSub: { color: '#FFF', opacity: 0.8, fontSize: 12, marginTop: 2 },
});

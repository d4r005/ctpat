import React, { useState, useMemo } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, KeyboardAvoidingView,
  Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Signature from 'react-native-signature-canvas';
import { useInspections, InspectionPoint } from '@/src/context/InspectionContext';
import { useAuth } from '@/src/context/AuthContext';
import { INSPECTION_POINTS } from '@/src/constants/inspectionPoints';
import { colors, spacing, typography } from '@/src/constants/theme';
import BarcodeScanner from '@/src/components/BarcodeScanner';

const TOTAL_STEPS = 4;

export default function Nueva() {
  const router = useRouter();
  const { user } = useAuth();
  const { saveInspection } = useInspections();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // General
  const [compania, setCompania] = useState('');
  const [placas, setPlacas] = useState('');
  const [trailer, setTrailer] = useState('');
  const [precinto, setPrecinto] = useState('');
  const [selloAlta, setSelloAlta] = useState('');
  const [selloVerificado, setSelloVerificado] = useState(false);

  // 19 points
  const [points, setPoints] = useState<InspectionPoint[]>(
    INSPECTION_POINTS.map((p) => ({ number: p.number, name: p.name, estado: '', comentarios: '' }))
  );

  // Suspicious + signatures
  const [actSospechosa, setActSospechosa] = useState('');
  const [inspectorNombre, setInspectorNombre] = useState(user?.name || '');
  const [verificadorNombre, setVerificadorNombre] = useState('');
  const [inspectorFirma, setInspectorFirma] = useState('');
  const [verificadorFirma, setVerificadorFirma] = useState('');
  const [showSigInspector, setShowSigInspector] = useState(false);
  const [showSigVerificador, setShowSigVerificador] = useState(false);
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
    if (step === 0) return compania.trim() && placas.trim() && trailer.trim() && precinto.trim();
    if (step === 1) return points.every((p) => p.estado !== '');
    if (step === 2) return true;
    if (step === 3) return inspectorNombre.trim() && inspectorFirma;
    return false;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const created = await saveInspection({
        compania_transportista: compania.trim(),
        placas_unidad: placas.trim().toUpperCase(),
        numero_trailer: trailer.trim(),
        numero_precinto: precinto.trim(),
        sello_alta_seguridad: selloAlta.trim(),
        sello_verificado: selloVerificado,
        points,
        actividad_sospechosa: actSospechosa.trim(),
        inspector_nombre: inspectorNombre.trim(),
        inspector_firma: inspectorFirma,
        verificador_nombre: verificadorNombre.trim(),
        verificador_firma: verificadorFirma,
        fecha_hora: new Date().toISOString(),
        client_uuid: '',
      });
      router.replace(`/inspection/${created.id}`);
    } catch (e: any) {
      alert(e.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']} testID="nueva-screen">
      {/* Progress header */}
      <View style={styles.progressHeader}>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
        </View>
        <Text style={styles.progressText}>
          PASO {step + 1} DE {TOTAL_STEPS}: {['DATOS GENERALES', '19 PUNTOS', 'OBSERVACIONES', 'FIRMAS'][step]}
        </Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {step === 0 && (
            <View>
              <Text style={styles.stepTitle}>Datos de la unidad</Text>
              <Field label="COMPAÑÍA TRANSPORTISTA" value={compania} onChange={setCompania} testID="nueva-compania-input" />
              <Field label="PLACAS DE LA UNIDAD" value={placas} onChange={setPlacas} testID="nueva-placas-input" onScan={() => setScanning('placas')} scanTestID="nueva-placas-scan" />
              <Field label="NÚMERO DE TRÁILER/CONTENEDOR" value={trailer} onChange={setTrailer} testID="nueva-trailer-input" onScan={() => setScanning('trailer')} scanTestID="nueva-trailer-scan" />
              <Field label="NÚMERO DE PRECINTO" value={precinto} onChange={setPrecinto} testID="nueva-precinto-input" onScan={() => setScanning('precinto')} scanTestID="nueva-precinto-scan" />
              <Field label="SELLO DE ALTA SEGURIDAD" value={selloAlta} onChange={setSelloAlta} testID="nueva-sello-input" />
              <Pressable
                testID="nueva-sello-verificado"
                style={styles.checkRow}
                onPress={() => setSelloVerificado(!selloVerificado)}
              >
                <View style={[styles.checkbox, selloVerificado && styles.checkboxOn]}>
                  {selloVerificado && <Ionicons name="checkmark" size={18} color={colors.onSuccess} />}
                </View>
                <Text style={styles.checkLabel}>Sello debidamente verificado</Text>
              </Pressable>
            </View>
          )}

          {step === 1 && (
            <View>
              <Text style={styles.stepTitle}>
                Inspección 19 Puntos <Text style={styles.counter}>({completedPoints}/19)</Text>
              </Text>
              {points.map((p, idx) => (
                <View key={p.number} style={styles.pointBlock} testID={`nueva-point-${p.number}`}>
                  <Text style={styles.pointTitle}>{p.number}. {p.name}</Text>
                  <View style={styles.toggleRow}>
                    <Pressable
                      testID={`nueva-point-${p.number}-bueno`}
                      style={[styles.toggleBtn, p.estado === 'bueno' && styles.toggleBuenoOn]}
                      onPress={() => updatePoint(idx, { estado: 'bueno' })}
                    >
                      <Ionicons name="checkmark-circle" size={20} color={p.estado === 'bueno' ? colors.onSuccess : colors.muted} />
                      <Text style={[styles.toggleText, p.estado === 'bueno' && { color: colors.onSuccess }]}>BUENO</Text>
                    </Pressable>
                    <Pressable
                      testID={`nueva-point-${p.number}-malo`}
                      style={[styles.toggleBtn, p.estado === 'malo' && styles.toggleMaloOn]}
                      onPress={() => updatePoint(idx, { estado: 'malo' })}
                    >
                      <Ionicons name="close-circle" size={20} color={p.estado === 'malo' ? colors.onError : colors.muted} />
                      <Text style={[styles.toggleText, p.estado === 'malo' && { color: colors.onError }]}>MALO</Text>
                    </Pressable>
                  </View>
                  {p.estado === 'malo' && (
                    <TextInput
                      testID={`nueva-point-${p.number}-comentarios`}
                      style={styles.commentInput}
                      value={p.comentarios}
                      onChangeText={(t) => updatePoint(idx, { comentarios: t })}
                      placeholder="Describir falla, daño o observación..."
                      placeholderTextColor={colors.muted}
                      multiline
                    />
                  )}
                </View>
              ))}
            </View>
          )}

          {step === 2 && (
            <View>
              <Text style={styles.stepTitle}>Observaciones</Text>
              <Text style={styles.label}>INFORME ACTIVIDAD SOSPECHOSA A SEGURIDAD NAF</Text>
              <TextInput
                testID="nueva-actividad-input"
                style={[styles.input, { minHeight: 140, textAlignVertical: 'top' }]}
                value={actSospechosa}
                onChangeText={setActSospechosa}
                multiline
                placeholder="Detallar cualquier actividad o hallazgo sospechoso (opcional)"
                placeholderTextColor={colors.muted}
              />
            </View>
          )}

          {step === 3 && (
            <View>
              <Text style={styles.stepTitle}>Firmas</Text>

              <Text style={styles.label}>NOMBRE DEL INSPECTOR</Text>
              <TextInput
                testID="nueva-inspector-nombre"
                style={styles.input}
                value={inspectorNombre}
                onChangeText={setInspectorNombre}
                placeholder="Nombre completo"
                placeholderTextColor={colors.muted}
              />
              <Pressable testID="nueva-inspector-firma-btn" style={styles.signatureBox} onPress={() => setShowSigInspector(true)}>
                {inspectorFirma ? (
                  <Text style={styles.signatureDone}>FIRMA CAPTURADA ✓ (Tocar para volver a firmar)</Text>
                ) : (
                  <Text style={styles.signatureCta}>Toca para firmar</Text>
                )}
              </Pressable>

              <Text style={[styles.label, { marginTop: spacing.lg }]}>NOMBRE DEL VERIFICADOR (Opcional)</Text>
              <TextInput
                testID="nueva-verificador-nombre"
                style={styles.input}
                value={verificadorNombre}
                onChangeText={setVerificadorNombre}
                placeholder="Nombre completo"
                placeholderTextColor={colors.muted}
              />
              <Pressable testID="nueva-verificador-firma-btn" style={styles.signatureBox} onPress={() => setShowSigVerificador(true)}>
                {verificadorFirma ? (
                  <Text style={styles.signatureDone}>FIRMA CAPTURADA ✓</Text>
                ) : (
                  <Text style={styles.signatureCta}>Toca para firmar (opcional)</Text>
                )}
              </Pressable>
            </View>
          )}
        </ScrollView>

        {/* Footer nav */}
        <View style={styles.footer}>
          {step > 0 && (
            <Pressable testID="nueva-prev-btn" style={styles.secondaryBtn} onPress={() => setStep(step - 1)}>
              <Text style={styles.secondaryBtnText}>ATRÁS</Text>
            </Pressable>
          )}
          {step < TOTAL_STEPS - 1 ? (
            <Pressable
              testID="nueva-next-btn"
              style={[styles.primaryBtn, !canNext() && styles.btnDisabled]}
              onPress={() => canNext() && setStep(step + 1)}
              disabled={!canNext()}
            >
              <Text style={styles.primaryBtnText}>SIGUIENTE</Text>
            </Pressable>
          ) : (
            <Pressable
              testID="nueva-save-btn"
              style={[styles.primaryBtn, (!canNext() || saving) && styles.btnDisabled]}
              onPress={handleSave}
              disabled={!canNext() || saving}
            >
              {saving ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.primaryBtnText}>GUARDAR INSPECCIÓN</Text>}
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Scanner */}
      <BarcodeScanner
        visible={scanning !== null}
        title={`Escanear ${scanning === 'placas' ? 'PLACAS' : scanning === 'trailer' ? 'TRÁILER' : 'PRECINTO'}`}
        onClose={() => setScanning(null)}
        onScan={handleScan}
      />

      {/* Signature modals */}
      {showSigInspector && (
        <SignatureModal
          onClose={() => setShowSigInspector(false)}
          onSave={(sig) => { setInspectorFirma(sig); setShowSigInspector(false); }}
          title="Firma del Inspector"
        />
      )}
      {showSigVerificador && (
        <SignatureModal
          onClose={() => setShowSigVerificador(false)}
          onSave={(sig) => { setVerificadorFirma(sig); setShowSigVerificador(false); }}
          title="Firma del Verificador"
        />
      )}
    </SafeAreaView>
  );
}

function Field({ label, value, onChange, testID, onScan, scanTestID }: { label: string; value: string; onChange: (v: string) => void; testID: string; onScan?: () => void; scanTestID?: string }) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          testID={testID}
          style={[styles.input, { flex: 1 }]}
          value={value}
          onChangeText={onChange}
          placeholderTextColor={colors.muted}
        />
        {onScan && (
          <Pressable testID={scanTestID} onPress={onScan} style={styles.scanBtn}>
            <Ionicons name="barcode" size={24} color={colors.onBrandPrimary} />
          </Pressable>
        )}
      </View>
    </>
  );
}

function SignatureModal({ onClose, onSave, title }: { onClose: () => void; onSave: (sig: string) => void; title: string }) {
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
            onOK={handleOK}
            descriptionText="Firme dentro del recuadro"
            clearText="Borrar"
            confirmText="Guardar"
            webStyle={style}
            autoClear={false}
            imageType="image/png"
          />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
          <Pressable style={[styles.secondaryBtn, { flex: 1 }]} onPress={onClose} testID="signature-cancel">
            <Text style={styles.secondaryBtnText}>CANCELAR</Text>
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
});

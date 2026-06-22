import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, KeyboardAvoidingView,
  Platform, ActivityIndicator, ScrollView as _SV,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Signature from 'react-native-signature-canvas';
import { apiCall } from '@/src/api/client';
import { useAuth } from '@/src/context/AuthContext';
import { colors, spacing, typography } from '@/src/constants/theme';

const TOTAL_STEPS = 3;

const REGLAS = [
  '1. No romper el sello hasta que la cortina asignada esté abierta y el almacenista responsable esté presente.',
  '2. No pasar materiales/equipos ajenos a NAF por la cortina.',
  '3. Prohibido brincar rampas y entrar al almacén sin autorización.',
  '4. Prohibidos drogas, armas, agentes biológicos, aerosoles, cámaras de video/foto, pornografía y bebidas alcohólicas.',
  '5. Prohibido dar propinas, premios o incentivos al personal de seguridad/almacén NAF.',
  '6. No menores de edad ni personal ajeno a NAF en el patio de maniobras.',
  '7. Prohibido tirar basura en el patio de maniobras.',
  '8. Velocidad máxima 10 km/h.',
  '9. Vehículos escoltados: entrega de documentación en presencia de la escolta.',
  '10. NAF no se responsabiliza por daños a conductores o vehículos causados por terceros.',
  '11. NAF se reserva el derecho de cobrar daños causados por el conductor o vehículo.',
  '12. Las llaves del tractor se entregan a seguridad durante carga/descarga.',
  '13. Instalar cuñas de seguridad si la sucursal lo requiere.',
  '14. Instalar patines de seguridad si la sucursal lo requiere.',
  '15. No maniobrar dollies al entrar cajas/contenedores a rampas.',
  '16. Usar EPP requerido en el patio de maniobras.',
];

const DECLARACIONES = [
  '1. Declaro NO transportar drogas, agentes biológicos, bioterrorismo, municiones, armas, contrabando ni personas indocumentadas.',
  '2. Declaro estar en condición física adecuada y buen estado de salud.',
  '3. Declaro NO haber consumido alcohol o drogas recientemente y NO estar bajo su influencia.',
  '4. Declaro que al estar en instalaciones NAF he leído, entendido y aceptado plenamente estas instrucciones.',
  '5. Declaro que toda la información proporcionada es verídica y no hay anomalías con el transporte ni conmigo.',
];

export default function CasetaNuevo() {
  const router = useRouter();
  const { token } = useAuth();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 1 — Datos del vehículo
  const [sucursal, setSucursal] = useState('');
  const [direccion, setDireccion] = useState('');
  const [licencia, setLicencia] = useState('');
  const [placas, setPlacas] = useState('');
  const [chofer, setChofer] = useState('');
  const [compania, setCompania] = useState('');
  const [tractor, setTractor] = useState('');
  const [companiaCaja, setCompaniaCaja] = useState('');
  const [numeroCaja, setNumeroCaja] = useState('');
  const [selloEntrada, setSelloEntrada] = useState('');
  const [escoltaPresente, setEscoltaPresente] = useState(false);
  const [escoltaCompania, setEscoltaCompania] = useState('');
  const [escoltaUnidad, setEscoltaUnidad] = useState('');
  const [escoltaPlacas, setEscoltaPlacas] = useState('');

  // Step 2 — Carga y operación
  const [cortina, setCortina] = useState('');
  const [guardiaCaseta, setGuardiaCaseta] = useState('');
  const [condicionCarga, setCondicionCarga] = useState<'vacia' | 'consolidada' | 'otra' | 'descarga' | ''>('');
  const [descripcionCarga, setDescripcionCarga] = useState('');
  const [numGuia, setNumGuia] = useState('');
  const [numReq, setNumReq] = useState('');
  const [ordenCompra, setOrdenCompra] = useState(false);
  const [cliente, setCliente] = useState('');
  const [destino, setDestino] = useState('');

  // Step 3 — Declaraciones + firma
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const [firmaOperador, setFirmaOperador] = useState('');
  const [showSig, setShowSig] = useState(false);

  const progress = ((step + 1) / TOTAL_STEPS) * 100;

  const canNext = () => {
    if (step === 0) return placas.trim() && chofer.trim();
    if (step === 1) return guardiaCaseta.trim() && condicionCarga;
    if (step === 2) return aceptaTerminos && firmaOperador;
    return false;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = {
        sucursal, direccion, licencia_conductor: licencia,
        placas_unidad: placas.trim().toUpperCase(), chofer_nombre: chofer.trim(),
        compania_transporte: compania, numero_tractor: tractor,
        compania_caja: companiaCaja, numero_caja: numeroCaja,
        sello_entrada: selloEntrada,
        escolta: { presente: escoltaPresente, compania: escoltaCompania, unidad: escoltaUnidad, placas: escoltaPlacas },
        cortina_asignada: cortina, guardia_caseta_nombre: guardiaCaseta,
        condicion_carga: condicionCarga, descripcion_carga: descripcionCarga,
        numero_guia: numGuia, numero_requerimiento: numReq, orden_compra: ordenCompra,
        cliente, destino,
        firma_operador: firmaOperador, declaraciones_aceptadas: aceptaTerminos,
      };
      const created = await apiCall<any>('/vehicle-records', { method: 'POST', body, token });
      router.replace(`/caseta/${created.id}`);
    } catch (e: any) { alert(e.message || 'Error al guardar'); }
    finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']} testID="caseta-nuevo-screen">
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.onBrandPrimary} /></Pressable>
        <Text style={styles.topTitle}>Registro Entrada</Text>
        <View style={{ width: 24 }} />
      </View>
      <View style={styles.progressBg}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
      <Text style={styles.stepLabel}>PASO {step + 1} DE {TOTAL_STEPS}: {['VEHÍCULO', 'CARGA Y OPERACIÓN', 'REGLAS Y FIRMA'][step]}</Text>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {step === 0 && (
            <View>
              <Field label="SUCURSAL" value={sucursal} onChange={setSucursal} testID="caseta-sucursal" />
              <Field label="DIRECCIÓN" value={direccion} onChange={setDireccion} testID="caseta-direccion" />
              <Field label="LICENCIA DEL CONDUCTOR" value={licencia} onChange={setLicencia} testID="caseta-licencia" />
              <Field label="PLACAS DEL VEHÍCULO *" value={placas} onChange={setPlacas} testID="caseta-placas" />
              <Field label="NOMBRE DEL CHOFER *" value={chofer} onChange={setChofer} testID="caseta-chofer" />
              <Field label="COMPAÑÍA DE TRANSPORTE" value={compania} onChange={setCompania} testID="caseta-compania" />
              <Field label="# TRACTOR" value={tractor} onChange={setTractor} testID="caseta-tractor" />
              <Field label="COMPAÑÍA CAJA" value={companiaCaja} onChange={setCompaniaCaja} testID="caseta-compania-caja" />
              <Field label="# CAJA / TRÁILER" value={numeroCaja} onChange={setNumeroCaja} testID="caseta-numero-caja" />
              <Field label="# SELLO DE ENTRADA" value={selloEntrada} onChange={setSelloEntrada} testID="caseta-sello-entrada" />

              <ToggleRow label="¿ESCOLTA?" value={escoltaPresente} onChange={setEscoltaPresente} testID="caseta-escolta-toggle" />
              {escoltaPresente && (
                <>
                  <Field label="COMPAÑÍA ESCOLTA" value={escoltaCompania} onChange={setEscoltaCompania} testID="caseta-escolta-compania" />
                  <Field label="# UNIDAD ESCOLTA" value={escoltaUnidad} onChange={setEscoltaUnidad} testID="caseta-escolta-unidad" />
                  <Field label="PLACAS ESCOLTA" value={escoltaPlacas} onChange={setEscoltaPlacas} testID="caseta-escolta-placas" />
                </>
              )}
            </View>
          )}

          {step === 1 && (
            <View>
              <Field label="CORTINA ASIGNADA" value={cortina} onChange={setCortina} testID="caseta-cortina" />
              <Field label="NOMBRE GUARDIA CASETA *" value={guardiaCaseta} onChange={setGuardiaCaseta} testID="caseta-guardia" />

              <Text style={styles.fieldLabel}>CONDICIÓN DE CARGA *</Text>
              <View style={styles.optionsRow}>
                {(['vacia', 'consolidada', 'otra', 'descarga'] as const).map((c) => (
                  <Pressable key={c} testID={`caseta-condicion-${c}`} onPress={() => setCondicionCarga(c)} style={[styles.optionChip, condicionCarga === c && styles.optionChipActive]}>
                    <Text style={[styles.optionText, condicionCarga === c && styles.optionTextActive]}>{c.toUpperCase()}</Text>
                  </Pressable>
                ))}
              </View>

              <Field label="DESCRIPCIÓN DE CARGA" value={descripcionCarga} onChange={setDescripcionCarga} testID="caseta-desc-carga" multiline />
              <Field label="# GUÍA" value={numGuia} onChange={setNumGuia} testID="caseta-guia" />
              <Field label="# REQUERIMIENTO" value={numReq} onChange={setNumReq} testID="caseta-requerimiento" />
              <ToggleRow label="¿ORDEN DE COMPRA?" value={ordenCompra} onChange={setOrdenCompra} testID="caseta-orden-compra" />
              <Field label="CLIENTE" value={cliente} onChange={setCliente} testID="caseta-cliente" />
              <Field label="DESTINO" value={destino} onChange={setDestino} testID="caseta-destino" />
            </View>
          )}

          {step === 2 && (
            <View>
              <Text style={styles.declTitle}>INSTRUCCIONES DE SEGURIDAD</Text>
              <View style={styles.rulesBox}>
                {REGLAS.map((r) => <Text key={r} style={styles.ruleItem}>{r}</Text>)}
              </View>

              <Text style={styles.declTitle}>DECLARACIONES DEL CONDUCTOR</Text>
              <View style={styles.rulesBox}>
                {DECLARACIONES.map((d) => <Text key={d} style={styles.ruleItem}>{d}</Text>)}
              </View>

              <Pressable testID="caseta-acepta" style={styles.checkRow} onPress={() => setAceptaTerminos(!aceptaTerminos)}>
                <View style={[styles.checkbox, aceptaTerminos && styles.checkboxOn]}>
                  {aceptaTerminos && <Ionicons name="checkmark" size={18} color={colors.onSuccess} />}
                </View>
                <Text style={styles.checkLabel}>El conductor ha leído, entendido y ACEPTA las instrucciones y declaraciones</Text>
              </Pressable>

              <Pressable testID="caseta-firma-btn" style={styles.signatureBox} onPress={() => setShowSig(true)}>
                {firmaOperador ? (
                  <Text style={styles.firmaDone}>FIRMA CAPTURADA ✓ (Tocar para volver a firmar)</Text>
                ) : (
                  <Text style={styles.firmaCta}>Toca para firma del operador</Text>
                )}
              </Pressable>
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {step > 0 && (
            <Pressable testID="caseta-prev" style={styles.secBtn} onPress={() => setStep(step - 1)}>
              <Text style={styles.secBtnText}>ATRÁS</Text>
            </Pressable>
          )}
          {step < TOTAL_STEPS - 1 ? (
            <Pressable testID="caseta-next" style={[styles.priBtn, !canNext() && { opacity: 0.4 }]} onPress={() => canNext() && setStep(step + 1)} disabled={!canNext()}>
              <Text style={styles.priBtnText}>SIGUIENTE</Text>
            </Pressable>
          ) : (
            <Pressable testID="caseta-save" style={[styles.priBtn, (!canNext() || saving) && { opacity: 0.4 }]} onPress={handleSave} disabled={!canNext() || saving}>
              {saving ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.priBtnText}>REGISTRAR ENTRADA</Text>}
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>

      {showSig && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Firma del Operador</Text>
            <View style={{ height: 280 }}>
              <Signature
                onOK={(sig) => { setFirmaOperador(sig); setShowSig(false); }}
                webStyle={`.m-signature-pad--footer{display:none;}.m-signature-pad{box-shadow:none;border:2px solid #09090B;}body,html{background:#FFF;height:100%;}`}
                autoClear={false}
                imageType="image/png"
              />
            </View>
            <Pressable style={[styles.secBtn, { marginTop: spacing.md }]} onPress={() => setShowSig(false)} testID="caseta-firma-cancel">
              <Text style={styles.secBtnText}>CANCELAR</Text>
            </Pressable>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

function Field({ label, value, onChange, testID, multiline }: any) {
  return (
    <>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput testID={testID} style={[styles.input, multiline && { minHeight: 80, textAlignVertical: 'top' }]} value={value} onChangeText={onChange} multiline={!!multiline} placeholderTextColor={colors.muted} />
    </>
  );
}
function ToggleRow({ label, value, onChange, testID }: any) {
  return (
    <Pressable testID={testID} style={styles.toggleRow} onPress={() => onChange(!value)}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <View style={[styles.toggleSwitch, value && styles.toggleSwitchOn]}>
        <View style={[styles.toggleKnob, value && { right: 2 }, !value && { left: 2 }]} />
      </View>
      <Text style={[styles.toggleValue, value && { color: colors.success }]}>{value ? 'SÍ' : 'NO'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  topBar: { backgroundColor: colors.brandPrimary, padding: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topTitle: { color: colors.onBrandPrimary, fontWeight: '900', fontSize: typography.sizes.lg, letterSpacing: 1 },
  progressBg: { height: 6, backgroundColor: '#1E3A5F', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.brandSecondary },
  stepLabel: { padding: spacing.sm, backgroundColor: colors.brandPrimary, color: colors.onBrandPrimary, fontWeight: '900', fontSize: 11, letterSpacing: 1, textAlign: 'center' },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  fieldLabel: { fontSize: 11, fontWeight: '900', color: colors.onSurfaceTertiary, letterSpacing: 1, marginTop: spacing.md, marginBottom: spacing.sm },
  input: { borderWidth: 2, borderColor: colors.borderStrong, backgroundColor: colors.surfaceSecondary, padding: spacing.md, fontSize: typography.sizes.base, color: colors.onSurface },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  optionChip: { borderWidth: 2, borderColor: colors.borderStrong, paddingHorizontal: spacing.md, paddingVertical: 8, flexShrink: 0 },
  optionChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  optionText: { fontWeight: '900', fontSize: 11, color: colors.onSurface, letterSpacing: 1 },
  optionTextActive: { color: colors.onBrandPrimary },
  toggleRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderWidth: 2, borderColor: colors.borderStrong, gap: spacing.md },
  toggleLabel: { fontWeight: '900', flex: 1, color: colors.onSurface, fontSize: 12, letterSpacing: 0.5 },
  toggleSwitch: { width: 48, height: 26, backgroundColor: colors.borderStrong, justifyContent: 'center' },
  toggleSwitchOn: { backgroundColor: colors.success },
  toggleKnob: { position: 'absolute', width: 22, height: 22, backgroundColor: '#FFF' },
  toggleValue: { fontWeight: '900', color: colors.muted, fontSize: 11, letterSpacing: 1 },
  declTitle: { fontWeight: '900', fontSize: 12, color: colors.onBrandPrimary, backgroundColor: colors.brandPrimary, padding: spacing.sm, letterSpacing: 1, marginTop: spacing.lg },
  rulesBox: { borderWidth: 2, borderColor: colors.borderStrong, borderTopWidth: 0, padding: spacing.md, backgroundColor: colors.surfaceSecondary },
  ruleItem: { fontSize: typography.sizes.sm, color: colors.onSurface, marginBottom: 6, lineHeight: 20 },
  checkRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg, gap: spacing.sm, padding: spacing.md, backgroundColor: colors.brandTertiary, borderWidth: 2, borderColor: colors.brandPrimary },
  checkbox: { width: 28, height: 28, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  checkboxOn: { backgroundColor: colors.success, borderColor: colors.success },
  checkLabel: { flex: 1, color: colors.onBrandTertiary, fontWeight: '700', fontSize: typography.sizes.sm },
  signatureBox: { borderWidth: 2, borderColor: colors.borderStrong, padding: spacing.lg, backgroundColor: colors.surfaceSecondary, alignItems: 'center', marginTop: spacing.lg, minHeight: 72, justifyContent: 'center' },
  firmaCta: { color: colors.muted, fontWeight: '700', letterSpacing: 1 },
  firmaDone: { color: colors.success, fontWeight: '900', letterSpacing: 1 },
  footer: { flexDirection: 'row', padding: spacing.md, gap: spacing.sm, borderTopWidth: 2, borderTopColor: colors.borderStrong, backgroundColor: colors.surfaceSecondary },
  priBtn: { flex: 1, backgroundColor: colors.brandPrimary, padding: spacing.md, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  priBtnText: { color: colors.onBrandPrimary, fontWeight: '900', letterSpacing: 1 },
  secBtn: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.borderStrong, padding: spacing.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  secBtnText: { color: colors.onSurface, fontWeight: '900', letterSpacing: 1 },
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(9,9,11,0.85)', justifyContent: 'center', padding: spacing.lg, zIndex: 100 },
  modalCard: { backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderWidth: 2, borderColor: colors.borderStrong },
  modalTitle: { fontWeight: '900', fontSize: typography.sizes.lg, color: colors.onSurface, marginBottom: spacing.md, letterSpacing: 1 },
});

import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Signature from '@/src/components/SignaturePad';
import { apiCall } from '@/src/api/client';
import { useInspections } from '@/src/context/InspectionContext';
import { useAuth } from '@/src/context/AuthContext';
import { colors, spacing, typography } from '@/src/constants/theme';
import { sanitizePlate } from '@/src/utils/text';

import { useTranslation } from 'react-i18next';

const TOTAL_STEPS = 4;

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
  const { saveVehicleRecord } = useInspections();
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const sigRef = React.useRef<any>(null);

  // Unit Type
  const [tipoUnidad, setTipoUnidad] = useState<'sencillo' | 'full'>('sencillo');

  // Step 1 — Datos del vehículo
  const [sucursal, setSucursal] = useState('Escobedo');
  const [direccion, setDireccion] = useState('Av. Expansion #350');
  const [licencia, setLicencia] = useState('');
  const [placas, setPlacas] = useState('');
  const [chofer, setChofer] = useState('');
  const [compania, setCompania] = useState('');
  const [tractor, setTractor] = useState('');

  // Caja 1
  const [companiaCaja, setCompaniaCaja] = useState('');
  const [numeroCaja, setNumeroCaja] = useState('');
  const [placasCaja, setPlacasCaja] = useState('');
  const [selloEntrada, setSelloEntrada] = useState('');
  const [selloEntradaNA, setSelloEntradaNA] = useState(false);

  // Caja 2 (Full)
  const [companiaCaja2, setCompaniaCaja2] = useState('');
  const [numeroCaja2, setNumeroCaja2] = useState('');
  const [selloEntrada2, setSelloEntrada2] = useState('');
  const [selloEntradaNA2, setSelloEntradaNA2] = useState(false);

  const [escoltaPresente, setEscoltaPresente] = useState(false);
  const [escoltaCompania, setEscoltaCompania] = useState('');
  const [escoltaUnidad, setEscoltaUnidad] = useState('');
  const [escoltaPlacas, setEscoltaPlacas] = useState('');

  // Step 1 — Fotografías
  const [fotoFrente, setFotoFrente] = useState('');
  const [fotoAtras, setFotoAtras] = useState('');
  const [fotoAtras2, setFotoAtras2] = useState('');
  const [fotoId, setFotoId] = useState('');

  // Step 2 — Carga y operación
  const [cortina, setCortina] = useState('');
  const [guardiaCaseta, setGuardiaCaseta] = useState('');
  const [guardiaOpcion, setGuardiaOpcion] = useState<'MARIO AGUILAR' | 'ADELAIDO SAENZ' | 'OTRO' | ''>('');
  const [condicionCarga, setCondicionCarga] = useState<'vacia' | 'consolidada' | 'otra' | 'descarga' | ''>('');
  const [descripcionCarga, setDescripcionCarga] = useState('');
  const [numGuia, setNumGuia] = useState('');
  const [numGuiaNA, setNumGuiaNA] = useState(false);
  const [numReq, setNumReq] = useState('');
  const [numReqNA, setNumReqNA] = useState(false);
  const [ordenCompra, setOrdenCompra] = useState(false);
  const [numOrdenCompra, setNumOrdenCompra] = useState('');
  const [destino, setDestino] = useState('');

  // Step 3 — Declaraciones + firma
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const [firmaOperador, setFirmaOperador] = useState('');
  const [showSig, setShowSig] = useState(false);

  // AI OCR state
  const [isScanning, setIsScanning] = useState(false);

  const handleScanIA = async () => {
    try {
      // Se solicita el permiso de cámara explícitamente antes de abrir el
      // picker. En web (navegador) launchCameraAsync NO solicita el permiso
      // por sí solo de forma confiable, así que sin este chequeo el picker
      // podía fallar en silencio (canceled) sin mostrar ningún error.
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permiso requerido', 'Se necesita acceso a la cámara para escanear con IA.');
        return;
      }
      const r = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.4,
        base64: true,
      });

      if (!r.canceled && r.assets[0]?.base64) {
        setIsScanning(true);
        const res = await apiCall('/ocr/analyze', {
          method: 'POST',
          token,
          body: { image_b64: r.assets[0].base64, mime_type: r.assets[0].mimeType || 'image/jpeg', context: 'entry' }
        });

        if (res.error) {
          if (res.error === 'AI_NOT_CONFIGURED') Alert.alert('IA no configurada', 'Por favor agrega la GEMINI_API_KEY al backend.');
          else if (res.error === 'UNSUPPORTED_FORMAT_HEIC') Alert.alert('Formato no soportado', 'La foto se guardó en formato HEIC (típico de iPhone). Cambia el ajuste de tu cámara a "Más compatible" (JPEG) en Configuración > Cámara > Formatos, o intenta de nuevo.');
          else Alert.alert('Error', 'No se pudo leer el documento. Intenta de nuevo.');
        } else {
          if (res.placas_unidad) setPlacas(sanitizePlate(res.placas_unidad));
          if (res.chofer_nombre) setChofer(res.chofer_nombre.toUpperCase());
          if (res.compania_transporte) setCompania(res.compania_transporte.toUpperCase());
          if (res.numero_tractor) setTractor(res.numero_tractor.toUpperCase());
          if (res.numero_caja) setNumeroCaja(res.numero_caja.toUpperCase());
          if (res.sello_entrada) setSelloEntrada(res.sello_entrada.toUpperCase());
          if (res.destino) setDestino(res.destino.toUpperCase());
          Alert.alert('Éxito', 'Información extraída correctamente.');
        }
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setIsScanning(false);
    }
  };

  const progress = ((step + 1) / TOTAL_STEPS) * 100;

  const canNext = () => {
    if (step === 0) {
      const basic = placas.trim() && chofer.trim() && numeroCaja.trim();
      if (tipoUnidad === 'full') return basic && numeroCaja2.trim();
      return basic;
    }
    if (step === 1) {
      const basic = fotoFrente && fotoAtras && fotoId;
      if (tipoUnidad === 'full') return basic && fotoAtras2;
      return basic;
    }
    if (step === 2) return guardiaCaseta.trim() && condicionCarga;
    if (step === 3) return aceptaTerminos && firmaOperador;
    return false;
  };

  const pickPhoto = async (setter: (v: string) => void, mode: 'camera' | 'gallery' | 'url') => {
    try {
      if (mode === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { alert(t('acceso_restringido')); return; }
        const r = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.2, base64: true });
        if (!r.canceled && r.assets[0]?.base64) setter(`data:image/jpeg;base64,${r.assets[0].base64}`);
      } else if (mode === 'gallery') {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { alert(t('acceso_restringido')); return; }
        const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.2, base64: true });
        if (!r.canceled && r.assets[0]?.base64) setter(`data:image/jpeg;base64,${r.assets[0].base64}`);
      } else {
        Alert.prompt(
          "Ingresar URL",
          "Pega el enlace de Google Drive o Imagen Web",
          [
            { text: t('cancelar'), style: 'cancel' },
            { text: t('agregar'), onPress: (url) => { if (url) setter(url); } }
          ]
        );
      }
    } catch (e: any) { alert(e.message || 'Error'); }
  };

  const handleSave = async () => {
    if (saving) return; // Evitar doble clic
    setSaving(true);
    try {
      // Validaciones básicas antes de enviar
      if (!placas.trim() || !chofer.trim() || !guardiaCaseta.trim()) {
        throw new Error('Por favor completa todos los campos obligatorios (*)');
      }

      const body = {
        tipo_unidad: tipoUnidad,
        sucursal, direccion, licencia_conductor: licencia,
        placas_unidad: placas.trim().toUpperCase(), chofer_nombre: chofer.trim().toUpperCase(),
        compania_transporte: compania.trim().toUpperCase(), numero_tractor: tractor.trim().toUpperCase(),
        compania_caja: companiaCaja.trim().toUpperCase(), numero_caja: numeroCaja.trim().toUpperCase(),
        placas_caja: placasCaja.trim().toUpperCase(),
        sello_entrada: selloEntradaNA ? 'N/A' : selloEntrada.trim().toUpperCase(),
        // Support for FULL (2nd trailer)
        compania_caja_2: tipoUnidad === 'full' ? companiaCaja2.trim().toUpperCase() : '',
        numero_caja_2: tipoUnidad === 'full' ? numeroCaja2.trim().toUpperCase() : '',
        sello_entrada_2: tipoUnidad === 'full' ? (selloEntradaNA2 ? 'N/A' : selloEntrada2.trim().toUpperCase()) : '',
        escolta: {
          presente: escoltaPresente,
          compania: escoltaCompania.trim().toUpperCase(),
          unidad: escoltaUnidad.trim().toUpperCase(),
          placas: escoltaPlacas.trim().toUpperCase()
        },
        foto_frente_unidad: fotoFrente,
        foto_atras_caja: fotoAtras,
        foto_atras_caja_2: tipoUnidad === 'full' ? fotoAtras2 : '',
        foto_id_chofer: fotoId,
        cortina_asignada: cortina.trim().toUpperCase(), guardia_caseta_nombre: guardiaCaseta.trim().toUpperCase(),
        condicion_carga: condicionCarga, descripcion_carga: descripcionCarga.trim().toUpperCase(),
        numero_guia: numGuiaNA ? 'N/A' : numGuia.trim().toUpperCase(),
        numero_requerimiento: numReqNA ? 'N/A' : numReq.trim().toUpperCase(),
        orden_compra: ordenCompra,
        numero_orden_compra: ordenCompra ? numOrdenCompra.trim().toUpperCase() : '',
        destino: destino.trim().toUpperCase(),
        firma_operador: firmaOperador, declaraciones_aceptadas: aceptaTerminos,
      };

      console.log('Enviando registro de caseta...');
      const created = await saveVehicleRecord(body);
      console.log('Registro procesado:', created.id);

      const nextParams = new URLSearchParams({
        record_id: created.id,
        compania: body.compania_transporte,
        placas: body.placas_unidad,
        trailer: body.numero_caja,
        sello: body.sello_entrada,
        chofer: body.chofer_nombre // Añadido para prellenado
      }).toString();

      if (Platform.OS === 'web') {
        const proceed = window.confirm(t('registro_caseta_guardado') + " \n\n" + t('desea_iniciar_inspeccion'));
        if (proceed) {
          router.replace(`/(app)/nueva?${nextParams}`);
        } else {
          // Regresar al panel de Caseta en lugar de quedarse en el detalle
          router.replace('/(app)/caseta');
        }
      } else {
        Alert.alert(
          t('registro_caseta_guardado'),
          t('desea_iniciar_inspeccion'),
          [
            { text: t('atras'), onPress: () => router.replace('/(app)/caseta') },
            { text: t('si_iniciar_inspeccion_caps'), onPress: () => router.replace(`/(app)/nueva?${nextParams}`) }
          ]
        );
      }
    } catch (e: any) {
      console.error('Error saving vehicle record:', e);
      let errorMsg = e.message || t('error_desconocido');
      if (errorMsg === 'Failed to fetch') {
        errorMsg = t('error_conexion_fotos_pesadas');
      }
      alert(`${t('ocurrio_un_problema')}: ${errorMsg}`);
    }
    finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']} testID="caseta-nuevo-screen">
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.onBrandPrimary} /></Pressable>
        <Text style={styles.topTitle}>{t('nuevo_registro_entrada').toUpperCase()}</Text>
        <Pressable onPress={handleScanIA} disabled={isScanning}>
           {isScanning ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="scan-circle" size={28} color={colors.brandSecondary} />}
        </Pressable>
      </View>
      <View style={styles.progressBg}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
      <Text style={styles.stepLabel}>{t('paso').toUpperCase()} {step + 1} {t('de').toUpperCase()} {TOTAL_STEPS}</Text>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {step === 0 && (
            <View>
              <Text style={styles.fieldLabel}>{t('tipo_unidad_caps') || "TIPO DE UNIDAD"} *</Text>
              <View style={[styles.optionsRow, { marginBottom: spacing.md }]}>
                {(['sencillo', 'full'] as const).map((u) => (
                  <Pressable key={u} onPress={() => setTipoUnidad(u)} style={[styles.optionChip, tipoUnidad === u && styles.optionChipActive]}>
                    <Text style={[styles.optionText, tipoUnidad === u && styles.optionTextActive]}>{u.toUpperCase()}</Text>
                  </Pressable>
                ))}
              </View>

              <Field label={t('sucursal').toUpperCase()} value={sucursal} onChange={setSucursal} testID="caseta-sucursal" />
              <Field label={t('direccion').toUpperCase()} value={direccion} onChange={setDireccion} testID="caseta-direccion" />
              <Field label={t('licencia').toUpperCase()} value={licencia} onChange={setLicencia} testID="caseta-licencia" />
              <Field label={t('placas_unidad_caps').toUpperCase()} value={placas} onChange={(v: string) => setPlacas(sanitizePlate(v))} testID="caseta-placas" />
              <Field label={t('nombre_chofer').toUpperCase()} value={chofer} onChange={setChofer} testID="caseta-chofer" />
              <Field label={t('compania_transportista_caps').toUpperCase()} value={compania} onChange={setCompania} testID="caseta-compania" />
              <Field label={t('numero_tractor_caps').toUpperCase()} value={tractor} onChange={setTractor} testID="caseta-tractor" />

              <Text style={[styles.declTitle, { marginTop: spacing.lg, marginBottom: spacing.sm }]}>{t('caja').toUpperCase()}</Text>
              <Field label={t('compania_caja').toUpperCase()} value={companiaCaja} onChange={setCompaniaCaja} testID="caseta-compania-caja" />
              <Field label={t('numero_caja_caps').toUpperCase()} value={numeroCaja} onChange={setNumeroCaja} testID="caseta-numero-caja" />
              <Field label={t('placas_caja_caps').toUpperCase()} value={placasCaja} onChange={(v: string) => setPlacasCaja(sanitizePlate(v))} testID="caseta-placas-caja" />

              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Field label={t('numero_precinto_caps').toUpperCase()} value={selloEntrada} onChange={setSelloEntrada} testID="caseta-sello-entrada" disabled={selloEntradaNA} />
                </View>
                <Pressable onPress={() => setSelloEntradaNA(!selloEntradaNA)} style={styles.naBox}>
                  <View style={[styles.naCheck, selloEntradaNA && styles.naCheckOn]}>
                    {selloEntradaNA && <Ionicons name="checkmark" size={14} color="#FFF" />}
                  </View>
                  <Text style={styles.naText}>N/A</Text>
                </Pressable>
              </View>

              {tipoUnidad === 'full' && (
                <>
                  <Text style={[styles.declTitle, { marginTop: spacing.xl, marginBottom: spacing.sm }]}>CAJA 2 (FULL)</Text>
                  <Field label={`${t('compania_caja').toUpperCase()} 2`} value={companiaCaja2} onChange={setCompaniaCaja2} testID="caseta-compania-caja-2" />
                  <Field label={`${t('numero_caja_caps').toUpperCase()} 2`} value={numeroCaja2} onChange={setNumeroCaja2} testID="caseta-numero-caja-2" />

                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
                    <View style={{ flex: 1 }}>
                      <Field label={`${t('numero_precinto_caps').toUpperCase()} 2`} value={selloEntrada2} onChange={setSelloEntrada2} testID="caseta-sello-entrada-2" disabled={selloEntradaNA2} />
                    </View>
                    <Pressable onPress={() => setSelloEntradaNA2(!selloEntradaNA2)} style={styles.naBox}>
                      <View style={[styles.naCheck, selloEntradaNA2 && styles.naCheckOn]}>
                        {selloEntradaNA2 && <Ionicons name="checkmark" size={14} color="#FFF" />}
                      </View>
                      <Text style={styles.naText}>N/A</Text>
                    </Pressable>
                  </View>
                </>
              )}

              <ToggleRow label={t('usa_escolta').toUpperCase() || "¿ESCOLTA?"} value={escoltaPresente} onChange={setEscoltaPresente} testID="caseta-escolta-toggle" t={t} />
              {escoltaPresente && (
                <>
                  <Field label={t('compania_escolta').toUpperCase()} value={escoltaCompania} onChange={setEscoltaCompania} testID="caseta-escolta-compania" />
                  <Field label={t('unidad_escolta').toUpperCase()} value={escoltaUnidad} onChange={setEscoltaUnidad} testID="caseta-escolta-unidad" />
                  <Field label={t('placas_escolta').toUpperCase()} value={escoltaPlacas} onChange={(v: string) => setEscoltaPlacas(sanitizePlate(v))} testID="caseta-escolta-placas" />
                </>
              )}
            </View>
          )}

          {step === 1 && (
            <View>
              <Text style={styles.stepTitle}>{t('registro_fotografico')}</Text>

              <PhotoBox
                label={t('unidad_frente')}
                value={fotoFrente}
                onCamera={() => pickPhoto(setFotoFrente, 'camera')}
                onGallery={() => pickPhoto(setFotoFrente, 'gallery')}
                onUrl={() => pickPhoto(setFotoFrente, 'url')}
                onRemove={() => setFotoFrente('')}
                t={t}
              />

              <PhotoBox
                label={t('caja_atras') + " (1)"}
                value={fotoAtras}
                onCamera={() => pickPhoto(setFotoAtras, 'camera')}
                onGallery={() => pickPhoto(setFotoAtras, 'gallery')}
                onUrl={() => pickPhoto(setFotoAtras, 'url')}
                onRemove={() => setFotoAtras('')}
                t={t}
              />

              {tipoUnidad === 'full' && (
                <PhotoBox
                  label={t('caja_atras') + " (2)"}
                  value={fotoAtras2}
                  onCamera={() => pickPhoto(setFotoAtras2, 'camera')}
                  onGallery={() => pickPhoto(setFotoAtras2, 'gallery')}
                  onUrl={() => pickPhoto(setFotoAtras2, 'url')}
                  onRemove={() => setFotoAtras2('')}
                  t={t}
                />
              )}

              <PhotoBox
                label={t('id_chofer')}
                value={fotoId}
                onCamera={() => pickPhoto(setFotoId, 'camera')}
                onGallery={() => pickPhoto(setFotoId, 'gallery')}
                onUrl={() => pickPhoto(setFotoId, 'url')}
                onRemove={() => setFotoId('')}
                t={t}
              />
            </View>
          )}

          {step === 2 && (
            <View>
              <Field label={t('cortina_asignada_caps')} value={cortina} onChange={setCortina} testID="caseta-cortina" />

              <Text style={styles.fieldLabel}>{t('nombre_guardia_caseta')} *</Text>
              <View style={[styles.optionsRow, { marginBottom: spacing.md }]}>
                {(['MARIO AGUILAR', 'ADELAIDO SAENZ', 'OTRO'] as const).map((o) => (
                  <Pressable
                    key={o}
                    onPress={() => {
                      setGuardiaOpcion(o);
                      if (o !== 'OTRO') setGuardiaCaseta(o);
                      else setGuardiaCaseta('');
                    }}
                    style={[styles.optionChip, guardiaOpcion === o && styles.optionChipActive]}
                  >
                    <Text style={[styles.optionText, guardiaOpcion === o && styles.optionTextActive]}>{o}</Text>
                  </Pressable>
                ))}
              </View>

              {(guardiaOpcion === 'OTRO' || !guardiaOpcion) && (
                <Field
                  label={t('nombre_completo').toUpperCase()}
                  value={guardiaCaseta}
                  onChange={setGuardiaCaseta}
                  testID="caseta-guardia"
                  placeholder={t('nombre_completo_placeholder')}
                />
              )}

              <Text style={styles.fieldLabel}>{t('condicion_carga_caps')} *</Text>
              <View style={styles.optionsRow}>
                {(['vacia', 'consolidada', 'otra', 'descarga'] as const).map((c) => (
                  <Pressable
                    key={c}
                    testID={`caseta-condicion-${c}`}
                    onPress={() => {
                      setCondicionCarga(c);
                      if (c === 'vacia') setDescripcionCarga('LOCETAS VINILICAS');
                    }}
                    style={[styles.optionChip, condicionCarga === c && styles.optionChipActive]}
                  >
                    <Text style={[styles.optionText, condicionCarga === c && styles.optionTextActive]}>{t(c).toUpperCase()}</Text>
                  </Pressable>
                ))}
              </View>

              <Field label={t('descripcion_carga').toUpperCase()} value={descripcionCarga} onChange={setDescripcionCarga} testID="caseta-desc-carga" multiline />

              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Field label={t('guia_caps').toUpperCase()} value={numGuia} onChange={setNumGuia} testID="caseta-guia" disabled={numGuiaNA} />
                </View>
                <Pressable onPress={() => setNumGuiaNA(!numGuiaNA)} style={styles.naBox}>
                  <View style={[styles.naCheck, numGuiaNA && styles.naCheckOn]}>
                    {numGuiaNA && <Ionicons name="checkmark" size={14} color="#FFF" />}
                  </View>
                  <Text style={styles.naText}>N/A</Text>
                </Pressable>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Field label={t('requerimiento_caps').toUpperCase()} value={numReq} onChange={setNumReq} testID="caseta-requerimiento" disabled={numReqNA} />
                </View>
                <Pressable onPress={() => setNumReqNA(!numReqNA)} style={styles.naBox}>
                  <View style={[styles.naCheck, numReqNA && styles.naCheckOn]}>
                    {numReqNA && <Ionicons name="checkmark" size={14} color="#FFF" />}
                  </View>
                  <Text style={styles.naText}>N/A</Text>
                </Pressable>
              </View>

              <ToggleRow label={t('orden_compra_pregunta')} value={ordenCompra} onChange={setOrdenCompra} testID="caseta-orden-compra" t={t} />
              {ordenCompra && (
                <Field label={`# ${t('orden_compra').toUpperCase()}`} value={numOrdenCompra} onChange={setNumOrdenCompra} testID="caseta-num-orden-compra" />
              )}

              <Field label={t('destino_caps').toUpperCase()} value={destino} onChange={setDestino} testID="caseta-destino" />
            </View>
          )}

          {step === 3 && (
            <View>
              <Text style={styles.declTitle}>{t('instrucciones_seguridad')}</Text>
              <View style={styles.rulesBox}>
                {REGLAS.map((r, idx) => <Text key={idx} style={styles.ruleItem}>{r}</Text>)}
              </View>

              <Text style={styles.declTitle}>{t('declaraciones_conductor')}</Text>
              <View style={styles.rulesBox}>
                {DECLARACIONES.map((d, idx) => <Text key={idx} style={styles.ruleItem}>{d}</Text>)}
              </View>

              <Pressable testID="caseta-acepta" style={styles.checkRow} onPress={() => setAceptaTerminos(!aceptaTerminos)}>
                <View style={[styles.checkbox, aceptaTerminos && styles.checkboxOn]}>
                  {aceptaTerminos && <Ionicons name="checkmark" size={18} color={colors.onSuccess} />}
                </View>
                <Text style={styles.checkLabel}>{t('conductor_acepta')}</Text>
              </Pressable>

              <Pressable testID="caseta-firma-btn" style={styles.signatureBox} onPress={() => setShowSig(true)}>
                {firmaOperador ? (
                  <Text style={styles.firmaDone}>{t('firma_capturada_msg')}</Text>
                ) : (
                  <Text style={styles.firmaCta}>{t('toca_firma_operador')}</Text>
                )}
              </Pressable>
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {step > 0 && (
            <Pressable testID="caseta-prev" style={styles.secBtn} onPress={() => setStep(step - 1)}>
              <Text style={styles.secBtnText}>{t('atras')}</Text>
            </Pressable>
          )}
          {step < TOTAL_STEPS - 1 ? (
            <Pressable testID="caseta-next" style={[styles.priBtn, !canNext() && { opacity: 0.4 }]} onPress={() => canNext() && setStep(step + 1)} disabled={!canNext()}>
              <Text style={styles.priBtnText}>{t('siguiente')}</Text>
            </Pressable>
          ) : (
            <Pressable testID="caseta-save" style={[styles.priBtn, (!canNext() || saving) && { opacity: 0.4 }]} onPress={handleSave} disabled={!canNext() || saving}>
              {saving ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.priBtnText}>{t('registrar_entrada')}</Text>}
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>

      {showSig && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('firma_operador')}</Text>
            <View style={{ height: 280, justifyContent: 'center', alignItems: 'center', backgroundColor: '#EEE', borderWidth: 2, borderColor: colors.borderStrong }}>
              <Signature
                ref={sigRef}
                onOK={(sig) => { setFirmaOperador(sig); setShowSig(false); }}
                onEmpty={() => alert(t('firma_vacia'))}
                webStyle={`.m-signature-pad--footer{display:none;}.m-signature-pad{box-shadow:none;border:2px solid #09090B;}body,html{background:#FFF;height:100%;}`}
                autoClear={false}
                imageType="image/jpeg"
              />
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <Pressable style={[styles.secBtn, { flex: 1 }]} onPress={() => setShowSig(false)} testID="caseta-firma-cancel">
                <Text style={styles.secBtnText}>{t('cancelar_caps')}</Text>
              </Pressable>
              <Pressable
                style={[styles.priBtn, { flex: 1 }]}
                onPress={() => sigRef.current?.readSignature()}
                testID="caseta-firma-save"
              >
                <Text style={styles.priBtnText}>{t('guardar_firma_caps')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

function Field({ label, value, onChange, testID, multiline, disabled, placeholder }: any) {
  return (
    <>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        testID={testID}
        autoCorrect={false}
        spellCheck={false}
        style={[
          styles.input,
          multiline && { minHeight: 80, textAlignVertical: 'top' },
          disabled && { backgroundColor: colors.border, opacity: 0.6 }
        ]}
        value={disabled ? 'N/A' : value}
        onChangeText={(text) => onChange(text.toUpperCase())}
        multiline={!!multiline}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        editable={!disabled}
      />
    </>
  );
}
function ToggleRow({ label, value, onChange, testID, t }: any) {
  return (
    <Pressable testID={testID} style={styles.toggleRow} onPress={() => onChange(!value)}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <View style={[styles.toggleSwitch, value && styles.toggleSwitchOn]}>
        <View style={[styles.toggleKnob, value && { right: 2 }, !value && { left: 2 }]} />
      </View>
      <Text style={[styles.toggleValue, value && { color: colors.success }]}>{value ? (t('si') || 'SÍ') : (t('no') || 'NO')}</Text>
    </Pressable>
  );
}

function PhotoBox({ label, value, onCamera, onGallery, onUrl, onRemove, t }: any) {
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={styles.fieldLabel}>{label} *</Text>
      {value ? (
        <View style={styles.photoContainer}>
          <Image source={{ uri: value }} style={styles.photoPreview} />
          <Pressable style={styles.photoRemove} onPress={onRemove}>
            <Ionicons name="close-circle" size={24} color={colors.error} />
          </Pressable>
        </View>
      ) : (
        <View style={{ gap: spacing.xs }}>
          <View style={styles.photoActionRow}>
            <Pressable onPress={onCamera} style={styles.photoActionBtn}>
              <Ionicons name="camera" size={20} color={colors.onBrandPrimary} />
              <Text style={styles.photoActionText}>{t('foto_caps')}</Text>
            </Pressable>
            <Pressable onPress={onGallery} style={[styles.photoActionBtn, { backgroundColor: colors.brandSecondary }]}>
              <Ionicons name="images" size={20} color={colors.onBrandSecondary} />
              <Text style={[styles.photoActionText, { color: colors.onBrandSecondary }]}>{t('galeria_caps')}</Text>
            </Pressable>
          </View>
          <Pressable onPress={onUrl} style={[styles.photoActionBtn, { backgroundColor: colors.info, width: '100%' }]}>
            <Ionicons name="link" size={20} color="#FFF" />
            <Text style={[styles.photoActionText, { color: '#FFF' }]}>{t('url_drive_web').toUpperCase()}</Text>
          </Pressable>
        </View>
      )}
    </View>
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
  naBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceSecondary, borderWidth: 2, borderColor: colors.borderStrong, height: 52, paddingHorizontal: spacing.sm, gap: 4 },
  naCheck: { width: 20, height: 20, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  naCheckOn: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  naText: { fontSize: 10, fontWeight: '900', color: colors.onSurface },
  stepTitle: { fontSize: typography.sizes.xl, fontWeight: '900', color: colors.onSurface, marginBottom: spacing.md },
  photoBox: { borderWidth: 2, borderColor: colors.borderStrong, height: 200, backgroundColor: colors.surfaceSecondary, borderStyle: 'dashed', overflow: 'hidden' },
  photoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  photoText: { fontWeight: '900', color: colors.brandPrimary, fontSize: 11, marginTop: 8 },
  photoContainer: { position: 'relative', width: '100%', height: 200, borderWidth: 2, borderColor: colors.borderStrong },
  photoPreview: { flex: 1, resizeMode: 'cover' },
  photoRemove: { position: 'absolute', top: 8, right: 8, backgroundColor: '#FFF', borderRadius: 12 },
  photoActionRow: { flexDirection: 'row', gap: spacing.sm },
  photoActionBtn: { flex: 1, backgroundColor: colors.brandPrimary, padding: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  photoActionText: { color: colors.onBrandPrimary, fontWeight: '900', fontSize: 11, letterSpacing: 1 },
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

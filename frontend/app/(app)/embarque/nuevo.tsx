import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Signature from '@/src/components/SignaturePad';
import { useTranslation } from 'react-i18next';
import { apiCall } from '@/src/api/client';
import { useInspections } from '@/src/context/InspectionContext';
import { useAuth } from '@/src/context/AuthContext';
import { colors, spacing, typography } from '@/src/constants/theme';
import { sanitizePlate } from '@/src/utils/text';

export default function EmbarqueNuevo() {
  const router = useRouter();
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const { saveShippingTicket } = useInspections();
  const params = useLocalSearchParams<{
    inspection_id?: string;
    record_id?: string;
    compania?: string;
    placas?: string;
    trailer?: string;
    sello?: string;
    operador?: string;
    destino?: string;
    economico?: string;
    hora_llegada?: string;
  }>();

  const [saving, setSaving] = useState(false);
  const sigRef = React.useRef<any>(null);
  const [form, setForm] = useState({
    almacenista: '', area: '', sellos: '', cliente: '', operador: params.operador || '',
    linea_transporte: params.compania || '', numero_economico: params.economico || '', placas_unidad: params.placas || '',
    numero_caja: params.trailer || '', placas_caja: '',
    hora_llegada: params.hora_llegada || '', hora_apertura_cortina: '', hora_cierre_cortina: '', hora_salida: '',
    numero_pallets: '', numero_sello: params.sello || '', observaciones: params.destino ? `${t('destino_caps')}: ${params.destino}` : '', daño_caja: '',
    nombre_guardia: '', firma_almacenista: '', firma_guardia: '',
    foto_inicio_carga: '', foto_media_carga: '', foto_final_carga: '',
    inspection_id: params.inspection_id || '',
    cliente_otro: '',
  });

  useEffect(() => {
    // If params change, we could update form, but usually initial state is enough for 'nuevo'
  }, [params]);
  const [sigTarget, setSigTarget] = useState<'almacenista' | 'guardia' | null>(null);
  const [almacenistaOpcion, setAlmacenistaOpcion] = useState<'CARLOS CANIZALES' | 'CYNTHIA SAUCEDA' | 'OTRO' | ''>('');

  const set = (k: string, v: any) => setForm({ ...form, [k]: v });

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
          body: { image_b64: r.assets[0].base64, mime_type: r.assets[0].mimeType || 'image/jpeg', context: 'ticket' }
        });

        if (res.error) {
          if (res.error === 'UNSUPPORTED_FORMAT_HEIC') Alert.alert('Formato no soportado', 'La foto se guardó en formato HEIC (típico de iPhone). Cambia el ajuste de tu cámara a "Más compatible" (JPEG) en Configuración > Cámara > Formatos, o intenta de nuevo.');
          else Alert.alert('Error', 'No se pudo procesar el ticket físico.');
        } else {
          setForm(prev => ({
            ...prev,
            placas_unidad: sanitizePlate(res.placas_unidad || prev.placas_unidad),
            cliente: (res.cliente || prev.cliente).toUpperCase(),
            operador: (res.operador || prev.operador).toUpperCase(),
            numero_caja: (res.numero_caja || prev.numero_caja).toUpperCase(),
            numero_pallets: (res.numero_pallets || prev.numero_pallets).toString(),
            numero_sello: (res.numero_sello || prev.numero_sello).toUpperCase(),
          }));
          Alert.alert('Éxito', 'Datos del ticket recuperados.');
        }
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setIsScanning(false);
    }
  };

  const pickPhoto = async (field: string, mode: 'camera' | 'gallery' | 'url') => {
    try {
      if (mode === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { alert(t('acceso_restringido')); return; }
        const r = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.2, base64: true });
        if (!r.canceled && r.assets[0]?.base64) set(field, `data:image/jpeg;base64,${r.assets[0].base64}`);
      } else if (mode === 'gallery') {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { alert(t('acceso_restringido')); return; }
        const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.2, base64: true });
        if (!r.canceled && r.assets[0]?.base64) set(field, `data:image/jpeg;base64,${r.assets[0].base64}`);
      } else {
        Alert.prompt(
          "Ingresar URL",
          "Pega el enlace de Google Drive o Imagen Web",
          [
            { text: t('cancelar'), style: 'cancel' },
            { text: t('agregar'), onPress: (url) => { if (url) set(field, url); } }
          ]
        );
      }
    } catch (e: any) { alert(e.message || 'Error'); }
  };

  const save = async () => {
    const finalCliente = form.cliente === 'OTRO' ? form.cliente_otro : form.cliente;
    if (!form.almacenista.trim() || !finalCliente.trim()) {
      alert(t('obligatorios_msg'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        cliente: finalCliente,
        record_id: params.record_id || '' // Enviar record_id para vínculo atómico
      };
      const created = await saveShippingTicket(payload);

      const nextStep = () => {
        if (params.record_id) {
          router.replace(`/caseta/${params.record_id}`);
        } else {
          router.replace(`/embarque/${created.id}`);
        }
      };

      if (Platform.OS === 'web') {
        const proceed = window.confirm(t('ticket_guardado_msg') + ". " + t('proceder_salida_msg'));
        if (proceed) nextStep();
        else router.replace('/(app)/embarque'); // Regresar al panel de embarque
        return;
      }

      Alert.alert(
        t('ticket_guardado_msg'),
        t('proceder_salida_msg'),
        [
          { text: t('regresar_panel'), onPress: () => router.replace('/(app)/embarque') },
          { text: t('registrar_salida_btn'), onPress: nextStep }
        ]
      );
    } catch (e: any) {
      console.error('Error saving shipping ticket:', e);
      let errorMsg = e.message || t('error_desconocido');
      if (errorMsg === 'Failed to fetch') {
        errorMsg = t('error_conexion_fotos_pesadas');
      }
      alert(`${t('ocurrio_un_problema')}: ${errorMsg}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']} testID="embarque-nuevo-screen">
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.onBrandPrimary} /></Pressable>
        <Text style={styles.topTitle}>{t('nuevo_ticket_embarque')}</Text>
        <Pressable onPress={handleScanIA} disabled={isScanning}>
           {isScanning ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="scan-circle" size={28} color={colors.brandSecondary} />}
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Section title={t('almacen').toUpperCase()}>
            <Text style={styles.label}>{`${t('almacenista_caps').toUpperCase()} *`}</Text>
            <View style={[styles.optionsRow, { marginBottom: spacing.md }]}>
              {(['CARLOS CANIZALES', 'CYNTHIA SAUCEDA', 'OTRO'] as const).map((o) => (
                <Pressable
                  key={o}
                  onPress={() => {
                    setAlmacenistaOpcion(o);
                    if (o !== 'OTRO') set('almacenista', o);
                    else set('almacenista', '');
                  }}
                  style={[styles.optionChip, almacenistaOpcion === o && styles.optionChipActive]}
                >
                  <Text style={[styles.optionText, almacenistaOpcion === o && styles.optionTextActive]}>{o}</Text>
                </Pressable>
              ))}
            </View>
            {(almacenistaOpcion === 'OTRO' || !almacenistaOpcion) && (
              <F label={t('nombre_completo').toUpperCase()} v={form.almacenista} on={(t: string) => set('almacenista', t)} tid="emb-almacenista" placeholder={t('nombre_completo_placeholder')} />
            )}
            <F label={t('area').toUpperCase()} v={form.area} on={(t: string) => set('area', t)} tid="emb-area" />
            <F label={t('sellos').toUpperCase()} v={form.sellos} on={(t: string) => set('sellos', t)} tid="emb-sellos" />
          </Section>

          <Section title={t('material_a_carga').toUpperCase()}>
            <Text style={styles.label}>{t('cliente').toUpperCase()} *</Text>
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
              <F label={t('especifique_cliente').toUpperCase()} v={form.cliente_otro} on={(t: string) => set('cliente_otro', t)} tid="emb-cliente-otro" />
            )}

            <F label={t('operador').toUpperCase()} v={form.operador} on={(t: string) => set('operador', t)} tid="emb-operador" />
            <F label={t('linea_transporte_caps').toUpperCase()} v={form.linea_transporte} on={(t: string) => set('linea_transporte', t)} tid="emb-linea" />
            <F label={t('numero_economico_unidad').toUpperCase()} v={form.numero_economico} on={(t: string) => set('numero_economico', t)} tid="emb-economico" />
            <F label={t('placas_unidad_caps').toUpperCase()} v={form.placas_unidad} on={(v: string) => set('placas_unidad', sanitizePlate(v))} tid="emb-placas-unidad" />
            <F label={t('numero_caja_caps').toUpperCase()} v={form.numero_caja} on={(t: string) => set('numero_caja', t)} tid="emb-caja" />
            <F label={t('placas_caja_caps').toUpperCase()} v={form.placas_caja} on={(v: string) => set('placas_caja', sanitizePlate(v))} tid="emb-placas-caja" />
          </Section>

          <Section title={t('tiempos_y_carga').toUpperCase()}>
            <F label={t('hora_llegada_caseta').toUpperCase()} v={form.hora_llegada} on={(t: string) => set('hora_llegada', t)} tid="emb-hora-llegada" placeholder="HH:MM" />
            <F label={t('hora_apertura_cortina_caps').toUpperCase()} v={form.hora_apertura_cortina} on={(t: string) => set('hora_apertura_cortina', t)} tid="emb-hora-apertura" placeholder="HH:MM" />
            <F label={t('hora_cierre_cortina_caps').toUpperCase()} v={form.hora_cierre_cortina} on={(t: string) => set('hora_cierre_cortina', t)} tid="emb-hora-cierre" placeholder="HH:MM" />
            <F label={t('hora_salida_desenrampe').toUpperCase()} v={form.hora_salida} on={(t: string) => set('hora_salida', t)} tid="emb-hora-salida" placeholder="HH:MM" />
            <F label={t('numero_pallets_caps').toUpperCase()} v={form.numero_pallets} on={(t: string) => set('numero_pallets', t)} tid="emb-pallets" kb="numeric" />
            <F label={t('numero_sello_caps').toUpperCase()} v={form.numero_sello} on={(t: string) => set('numero_sello', t)} tid="emb-sello" />
          </Section>

          <Section title={t('observaciones_y_danos').toUpperCase()}>
            <F label={t('observaciones').toUpperCase()} v={form.observaciones} on={(t: string) => set('observaciones', t)} tid="emb-obs" multiline />
            <F label={t('danos_caja_desc').toUpperCase()} v={form.daño_caja} on={(t: string) => set('daño_caja', t)} tid="emb-dano" multiline />
          </Section>

          <Section title={t('evidencia_carga').toUpperCase()}>
            <PhotoField
              label={t('foto_inicio_carga').toUpperCase()}
              value={form.foto_inicio_carga}
              onCamera={() => pickPhoto('foto_inicio_carga', 'camera')}
              onGallery={() => pickPhoto('foto_inicio_carga', 'gallery')}
              onUrl={() => pickPhoto('foto_inicio_carga', 'url')}
              onRemove={() => set('foto_inicio_carga', '')}
              t={t}
            />
            <PhotoField
              label={t('foto_media_carga')}
              value={form.foto_media_carga}
              onCamera={() => pickPhoto('foto_media_carga', 'camera')}
              onGallery={() => pickPhoto('foto_media_carga', 'gallery')}
              onUrl={() => pickPhoto('foto_media_carga', 'url')}
              onRemove={() => set('foto_media_carga', '')}
              t={t}
            />
            <PhotoField
              label={t('foto_final_carga')}
              value={form.foto_final_carga}
              onCamera={() => pickPhoto('foto_final_carga', 'camera')}
              onGallery={() => pickPhoto('foto_final_carga', 'gallery')}
              onUrl={() => pickPhoto('foto_final_carga', 'url')}
              onRemove={() => set('foto_final_carga', '')}
              t={t}
            />
          </Section>

          <Section title={t('firmas').toUpperCase()}>
            <F label={t('nombre_guardia_seguridad').toUpperCase()} v={form.nombre_guardia} on={(t: string) => set('nombre_guardia', t)} tid="emb-guardia" />
            <Pressable testID="emb-firma-almacenista" style={styles.signatureBox} onPress={() => setSigTarget('almacenista')}>
              {form.firma_almacenista ? (
                <>
                  <Image source={{ uri: form.firma_almacenista }} style={{ width: '100%', height: 50, resizeMode: 'contain' }} />
                  <Pressable style={styles.removeBtnSig} onPress={() => set('firma_almacenista', '')}>
                    <Ionicons name="trash" size={16} color={colors.error} />
                  </Pressable>
                </>
              ) : (
                <Text style={styles.firmaCta}>{t('firma_almacenista').toUpperCase()}</Text>
              )}
            </Pressable>
            <Pressable testID="emb-firma-guardia" style={styles.signatureBox} onPress={() => setSigTarget('guardia')}>
              {form.firma_guardia ? (
                <>
                  <Image source={{ uri: form.firma_guardia }} style={{ width: '100%', height: 50, resizeMode: 'contain' }} />
                  <Pressable style={styles.removeBtnSig} onPress={() => set('firma_guardia', '')}>
                    <Ionicons name="trash" size={16} color={colors.error} />
                  </Pressable>
                </>
              ) : (
                <Text style={styles.firmaCta}>{t('firma_guardia').toUpperCase()}</Text>
              )}
            </Pressable>
          </Section>

          <Pressable testID="emb-save" style={[styles.bigBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="#FFF" /> : <><Ionicons name="checkmark" size={24} color={colors.onBrandPrimary} /><Text style={styles.bigBtnText}>{t('guardar_ticket_caps')}</Text></>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {sigTarget && (
        <SignatureModal
          sigTarget={sigTarget}
          onClose={() => setSigTarget(null)}
          sigRef={sigRef}
          onOK={(sig: string) => { set(sigTarget === 'almacenista' ? 'firma_almacenista' : 'firma_guardia', sig); setSigTarget(null); }}
          t={t}
        />
      )}
    </SafeAreaView>
  );
}

function F({ label, v, on, tid, multiline, kb, placeholder }: any) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        testID={tid}
        autoCapitalize="characters"
        style={[styles.input, multiline && { minHeight: 70, textAlignVertical: 'top' }]}
        value={v}
        onChangeText={(text) => on(text.toUpperCase())}
        multiline={!!multiline}
        keyboardType={kb || 'default'}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
      />
    </>
  );
}

function SignatureModal({ sigTarget, onClose, sigRef, onOK, t }: any) {
  return (
    <View style={styles.modalOverlay}>
      <View style={styles.modalCard}>
        <Text style={styles.modalTitle}>{t('firma')} {sigTarget === 'almacenista' ? t('almacenista') : t('guardia')}</Text>
        <View style={{ height: 280 }}>
          <Signature
            ref={sigRef}
            onOK={onOK}
            onEmpty={() => alert(t('firma_vacia'))}
            webStyle={`.m-signature-pad--footer{display:none;}.m-signature-pad{box-shadow:none;border:2px solid #09090B;}body,html{background:#FFF;height:100%;}`}
            autoClear={false}
            imageType="image/jpeg"
            descriptionText={t('firme_dentro_desc')}
            clearText={t('borrar')}
            confirmText={t('guardar')}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
          <Pressable style={[styles.secBtn, { flex: 1 }]} onPress={onClose}>
            <Text style={styles.secBtnText}>{t('cancelar_caps')}</Text>
          </Pressable>
          <Pressable
            style={[styles.bigBtn, { flex: 1, padding: spacing.md, minHeight: 52 }]}
            onPress={() => sigRef.current?.readSignature()}
          >
            <Text style={[styles.bigBtnText, { fontSize: 12 }]}>{t('guardar_firma_caps')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function PhotoField({ label, value, onCamera, onGallery, onUrl, onRemove, t }: any) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      {value ? (
        <View style={styles.photoWrap}>
          <Image source={{ uri: value }} style={styles.photoImg} />
          <Pressable style={styles.photoRemove} onPress={onRemove}>
            <Ionicons name="close-circle" size={24} color={colors.error} />
          </Pressable>
        </View>
      ) : (
        <View style={{ gap: spacing.xs }}>
          <View style={styles.photoActionRow}>
            <Pressable style={styles.photoBtn} onPress={onCamera}>
              <Ionicons name="camera" size={20} color={colors.onBrandPrimary} />
              <Text style={styles.photoBtnText}>{t('foto_caps')}</Text>
            </Pressable>
            <Pressable style={[styles.photoBtn, { backgroundColor: colors.brandSecondary }]} onPress={onGallery}>
              <Ionicons name="images" size={20} color={colors.onBrandSecondary} />
              <Text style={[styles.photoBtnText, { color: colors.onBrandSecondary }]}>{t('galeria_caps')}</Text>
            </Pressable>
          </View>
          <Pressable onPress={onUrl} style={[styles.photoBtn, { backgroundColor: colors.info, width: '100%', marginTop: 0 }]}>
            <Ionicons name="link" size={20} color="#FFF" />
            <Text style={[styles.photoBtnText, { color: '#FFF' }]}>{t('url_drive_web').toUpperCase()}</Text>
          </Pressable>
        </View>
      )}
    </View>
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  topBar: { backgroundColor: colors.brandPrimary, padding: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topTitle: { color: colors.onBrandPrimary, fontWeight: '900', fontSize: typography.sizes.base, letterSpacing: 1, flex: 1, textAlign: 'center' },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  secTitle: { backgroundColor: colors.brandPrimary, color: colors.onBrandPrimary, padding: spacing.sm, fontWeight: '900', letterSpacing: 1, fontSize: 12 },
  secBody: { borderWidth: 2, borderColor: colors.borderStrong, borderTopWidth: 0, padding: spacing.md, backgroundColor: colors.surfaceSecondary },
  label: { fontSize: 11, fontWeight: '900', color: colors.muted, letterSpacing: 1, marginTop: spacing.sm, marginBottom: 4 },
  input: { borderWidth: 2, borderColor: colors.borderStrong, padding: spacing.sm, backgroundColor: colors.surface, color: colors.onSurface, fontSize: typography.sizes.base },
  signatureBox: { borderWidth: 2, borderColor: colors.borderStrong, padding: spacing.md, backgroundColor: colors.surface, alignItems: 'center', marginTop: spacing.sm, minHeight: 56, justifyContent: 'center' },
  firmaCta: { color: colors.muted, fontWeight: '700', letterSpacing: 1 },
  firmaDone: { color: colors.success, fontWeight: '900', letterSpacing: 1 },
  bigBtn: { backgroundColor: colors.brandPrimary, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, minHeight: 64 },
  bigBtnText: { color: colors.onBrandPrimary, fontWeight: '900', letterSpacing: 1, fontSize: typography.sizes.base },
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(9,9,11,0.85)', justifyContent: 'center', padding: spacing.lg, zIndex: 100 },
  modalCard: { backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderWidth: 2, borderColor: colors.borderStrong },
  modalTitle: { fontWeight: '900', fontSize: typography.sizes.lg, color: colors.onSurface, marginBottom: spacing.md, letterSpacing: 1 },
  secBtn: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.borderStrong, padding: spacing.md, alignItems: 'center', justifyContent: 'center' },
  secBtnText: { color: colors.onSurface, fontWeight: '900', letterSpacing: 1 },
  photoBtn: { backgroundColor: colors.brandPrimary, padding: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4, flex: 1 },
  photoBtnText: { color: colors.onBrandPrimary, fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  photoWrap: { position: 'relative', marginTop: 4, borderWidth: 2, borderColor: colors.borderStrong },
  photoImg: { width: '100%', height: 200, resizeMode: 'cover' },
  photoRemove: { position: 'absolute', top: 8, right: 8, backgroundColor: '#FFF', borderRadius: 12 },
  photoActionRow: { flexDirection: 'row', gap: spacing.sm },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  optionChip: { borderWidth: 2, borderColor: colors.borderStrong, paddingHorizontal: spacing.md, paddingVertical: 8, flexShrink: 0, backgroundColor: '#FFF' },
  optionChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  optionText: { fontWeight: '900', fontSize: 11, color: colors.onSurface, letterSpacing: 1 },
  optionTextActive: { color: colors.onBrandPrimary },
  removeBtnSig: { position: 'absolute', top: 5, right: 5, padding: 5, backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 15 },
});

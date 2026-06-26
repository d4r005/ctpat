import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Signature from '@/src/components/SignaturePad';
import { useTranslation } from 'react-i18next';
import { apiCall } from '@/src/api/client';
import { useAuth } from '@/src/context/AuthContext';
import { colors, spacing, typography } from '@/src/constants/theme';

export default function EmbarqueNuevo() {
  const router = useRouter();
  const { t } = useTranslation();
  const { token, user } = useAuth();
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
    numero_pallets: '', numero_sello: params.sello || '', observaciones: params.destino ? `Destino: ${params.destino}` : '', daño_caja: '',
    nombre_guardia: '', firma_almacenista: '', firma_guardia: '',
    foto_inicio_carga: '', foto_media_carga: '', foto_final_carga: '',
    inspection_id: params.inspection_id || '',
  });

  useEffect(() => {
    // If params change, we could update form, but usually initial state is enough for 'nuevo'
  }, [params]);
  const [sigTarget, setSigTarget] = useState<'almacenista' | 'guardia' | null>(null);

  const set = (k: string, v: any) => setForm({ ...form, [k]: v });

  const pickPhoto = async (field: string, fromCamera: boolean) => {
    try {
      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { alert('Se necesita acceso a la cámara'); return; }
        const r = await ImagePicker.launchCameraAsync({
          mediaTypes: 'images',
          quality: 0.3, // Optimizado (antes 0.5)
          base64: true,
          allowsEditing: false,
          width: 800
        });
        if (!r.canceled && r.assets[0]?.base64) {
          set(field, `data:image/jpeg;base64,${r.assets[0].base64}`);
        }
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { alert('Se necesita acceso a la galería'); return; }
        const r = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: 'images',
          quality: 0.3, // Optimizado (antes 0.5)
          base64: true,
          allowsEditing: false,
          width: 800
        });
        if (!r.canceled && r.assets[0]?.base64) {
          set(field, `data:image/jpeg;base64,${r.assets[0].base64}`);
        }
      }
    } catch (e: any) { alert(e.message || 'Error al obtener foto'); }
  };

  const save = async () => {
    if (!form.almacenista.trim() || !form.cliente.trim()) {
      alert('Almacenista y Cliente son obligatorios');
      return;
    }
    setSaving(true);
    try {
      const created = await apiCall<any>('/shipping-tickets', { method: 'POST', body: form, token });

      const nextStep = () => {
        if (params.record_id) {
          router.replace(`/caseta/${params.record_id}`);
        } else {
          router.replace(`/embarque/${created.id}`);
        }
      };

      if (Platform.OS === 'web') {
        const proceed = window.confirm("Ticket de Embarque Guardado. ¿Desea proceder a registrar la SALIDA de la unidad?");
        if (proceed) nextStep();
        else router.replace('/(app)/embarque'); // Regresar al panel de embarque
        return;
      }

      Alert.alert(
        "Ticket Guardado",
        "¿Desea proceder a registrar la SALIDA de la unidad ahora?",
        [
          { text: "REGRESAR AL PANEL", onPress: () => router.replace('/(app)/embarque') },
          { text: "SÍ, REGISTRAR SALIDA", onPress: nextStep }
        ]
      );
    } catch (e: any) {
      console.error('Error saving shipping ticket:', e);
      let errorMsg = e.message || 'Error desconocido';
      if (errorMsg === 'Failed to fetch') {
        errorMsg = 'Error de conexión con el servidor. Posiblemente las fotos son muy pesadas. Intenta de nuevo.';
      }
      alert(`Ocurrió un problema: ${errorMsg}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']} testID="embarque-nuevo-screen">
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.onBrandPrimary} /></Pressable>
        <Text style={styles.topTitle}>{t('nuevo_ticket_embarque')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Section title={t('almacen', 'ALMACÉN')}>
            <F label={`${t('almacenista', 'ALMACENISTA')} *`} v={form.almacenista} on={(t: string) => set('almacenista', t)} tid="emb-almacenista" />
            <F label={t('area', 'ÁREA')} v={form.area} on={(t: string) => set('area', t)} tid="emb-area" />
            <F label={t('sellos', 'SELLO(S)')} v={form.sellos} on={(t: string) => set('sellos', t)} tid="emb-sellos" />
          </Section>

          <Section title={t('material_a_carga', 'MATERIAL A CARGA (Llenado por Seguridad)')}>
            <F label={`${t('cliente', 'CLIENTE')} *`} v={form.cliente} on={(t: string) => set('cliente', t)} tid="emb-cliente" />
            <F label={t('operador_nombre', 'NOMBRE DEL OPERADOR')} v={form.operador} on={(t: string) => set('operador', t)} tid="emb-operador" />
            <F label={t('linea_transporte', 'LÍNEA DE TRANSPORTE')} v={form.linea_transporte} on={(t: string) => set('linea_transporte', t)} tid="emb-linea" />
            <F label={t('numero_economico_unidad', '# ECONÓMICO UNIDAD')} v={form.numero_economico} on={(t: string) => set('numero_economico', t)} tid="emb-economico" />
            <F label={t('placas_unidad_caps', 'PLACAS DE UNIDAD')} v={form.placas_unidad} on={(t: string) => set('placas_unidad', t)} tid="emb-placas-unidad" />
            <F label={t('numero_caja_caps', '# CAJA / CONTENEDOR')} v={form.numero_caja} on={(t: string) => set('numero_caja', t)} tid="emb-caja" />
            <F label={t('placas_caja_caps', 'PLACAS CAJA / CONTENEDOR')} v={form.placas_caja} on={(t: string) => set('placas_caja', t)} tid="emb-placas-caja" />
          </Section>

          <Section title={t('tiempos_y_carga', 'TIEMPOS Y CARGA')}>
            <F label={t('hora_llegada_caseta', 'HORA DE LLEGADA (CASETA)')} v={form.hora_llegada} on={(t: string) => set('hora_llegada', t)} tid="emb-hora-llegada" placeholder="HH:MM" />
            <F label={t('hora_apertura_cortina', 'HORA APERTURA CORTINA')} v={form.hora_apertura_cortina} on={(t: string) => set('hora_apertura_cortina', t)} tid="emb-hora-apertura" placeholder="HH:MM" />
            <F label={t('hora_cierre_cortina', 'HORA CIERRE CORTINA')} v={form.hora_cierre_cortina} on={(t: string) => set('hora_cierre_cortina', t)} tid="emb-hora-cierre" placeholder="HH:MM" />
            <F label={t('hora_salida_desenrampe', 'HORA DE SALIDA (DESENRAMPE)')} v={form.hora_salida} on={(t: string) => set('hora_salida', t)} tid="emb-hora-salida" placeholder="HH:MM" />
            <F label={t('numero_pallets', 'NÚMERO DE PALLETS')} v={form.numero_pallets} on={(t: string) => set('numero_pallets', t)} tid="emb-pallets" kb="numeric" />
            <F label={t('numero_sello', 'NÚMERO DE SELLO')} v={form.numero_sello} on={(t: string) => set('numero_sello', t)} tid="emb-sello" />
          </Section>

          <Section title={t('observaciones_y_danos', 'OBSERVACIONES Y DAÑOS')}>
            <F label={t('observaciones', 'OBSERVACIONES')} v={form.observaciones} on={(t: string) => set('observaciones', t)} tid="emb-obs" multiline />
            <F label={t('danos_caja_desc', 'SEÑALA EL DAÑO EN LA CAJA (descripción)')} v={form.daño_caja} on={(t: string) => set('daño_caja', t)} tid="emb-dano" multiline />
          </Section>

          <Section title={t('evidencia_carga', 'EVIDENCIA DE CARGA')}>
            <PhotoField
              label={t('foto_inicio_carga', 'FOTO INICIO DE CARGA')}
              value={form.foto_inicio_carga}
              onCamera={() => pickPhoto('foto_inicio_carga', true)}
              onGallery={() => pickPhoto('foto_inicio_carga', false)}
              onRemove={() => set('foto_inicio_carga', '')}
              t={t}
            />
            <PhotoField
              label={t('foto_media_carga', 'FOTO MEDIA CARGA')}
              value={form.foto_media_carga}
              onCamera={() => pickPhoto('foto_media_carga', true)}
              onGallery={() => pickPhoto('foto_media_carga', false)}
              onRemove={() => set('foto_media_carga', '')}
              t={t}
            />
            <PhotoField
              label={t('foto_final_carga', 'FOTO FINALIZACIÓN DE CARGA')}
              value={form.foto_final_carga}
              onCamera={() => pickPhoto('foto_final_carga', true)}
              onGallery={() => pickPhoto('foto_final_carga', false)}
              onRemove={() => set('foto_final_carga', '')}
              t={t}
            />
          </Section>

          <Section title={t('firmas', 'FIRMAS')}>
            <F label={t('nombre_guardia_seguridad', 'NOMBRE DEL GUARDIA DE SEGURIDAD')} v={form.nombre_guardia} on={(t: string) => set('nombre_guardia', t)} tid="emb-guardia" />
            <Pressable testID="emb-firma-almacenista" style={styles.signatureBox} onPress={() => setSigTarget('almacenista')}>
              <Text style={form.firma_almacenista ? styles.firmaDone : styles.firmaCta}>
                {form.firma_almacenista ? t('firma_almacenista_caps', 'FIRMA ALMACENISTA ✓') : t('firma_almacenista', 'Firma del Almacenista')}
              </Text>
            </Pressable>
            <Pressable testID="emb-firma-guardia" style={styles.signatureBox} onPress={() => setSigTarget('guardia')}>
              <Text style={form.firma_guardia ? styles.firmaDone : styles.firmaCta}>
                {form.firma_guardia ? t('firma_guardia_caps', 'FIRMA GUARDIA ✓') : t('firma_guardia', 'Firma del Guardia')}
              </Text>
            </Pressable>
          </Section>

          <Pressable testID="emb-save" style={[styles.bigBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="#FFF" /> : <><Ionicons name="checkmark" size={24} color={colors.onBrandPrimary} /><Text style={styles.bigBtnText}>{t('guardar_ticket', 'GUARDAR TICKET')}</Text></>}
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

function PhotoField({ label, value, onCamera, onGallery, onRemove, t }: any) {
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
});

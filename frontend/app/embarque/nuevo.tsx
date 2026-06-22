import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Signature from 'react-native-signature-canvas';
import { apiCall } from '@/src/api/client';
import { useAuth } from '@/src/context/AuthContext';
import { colors, spacing, typography } from '@/src/constants/theme';

export default function EmbarqueNuevo() {
  const router = useRouter();
  const { token, user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    almacenista: user?.name || '', area: '', sellos: '', cliente: '', operador: '',
    linea_transporte: '', numero_economico: '', placas_unidad: '', numero_caja: '', placas_caja: '',
    hora_llegada: '', hora_apertura_cortina: '', hora_cierre_cortina: '', hora_salida: '',
    numero_pallets: '', numero_sello: '', observaciones: '', daño_caja: '',
    nombre_guardia: '', firma_almacenista: '', firma_guardia: '',
  });
  const [sigTarget, setSigTarget] = useState<'almacenista' | 'guardia' | null>(null);

  const set = (k: string, v: any) => setForm({ ...form, [k]: v });

  const save = async () => {
    if (!form.almacenista.trim() || !form.cliente.trim()) {
      alert('Almacenista y Cliente son obligatorios');
      return;
    }
    setSaving(true);
    try {
      const created = await apiCall<any>('/shipping-tickets', { method: 'POST', body: form, token });
      router.replace(`/embarque/${created.id}`);
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']} testID="embarque-nuevo-screen">
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.onBrandPrimary} /></Pressable>
        <Text style={styles.topTitle}>Nuevo Ticket de Embarque</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Section title="ALMACÉN">
            <F label="ALMACENISTA *" v={form.almacenista} on={(t: string) => set('almacenista', t)} tid="emb-almacenista" />
            <F label="ÁREA" v={form.area} on={(t: string) => set('area', t)} tid="emb-area" />
            <F label="SELLO(S)" v={form.sellos} on={(t: string) => set('sellos', t)} tid="emb-sellos" />
          </Section>

          <Section title="MATERIAL A CARGA (Llenado por Seguridad)">
            <F label="CLIENTE *" v={form.cliente} on={(t: string) => set('cliente', t)} tid="emb-cliente" />
            <F label="NOMBRE DEL OPERADOR" v={form.operador} on={(t: string) => set('operador', t)} tid="emb-operador" />
            <F label="LÍNEA DE TRANSPORTE" v={form.linea_transporte} on={(t: string) => set('linea_transporte', t)} tid="emb-linea" />
            <F label="# ECONÓMICO UNIDAD" v={form.numero_economico} on={(t: string) => set('numero_economico', t)} tid="emb-economico" />
            <F label="PLACAS DE UNIDAD" v={form.placas_unidad} on={(t: string) => set('placas_unidad', t)} tid="emb-placas-unidad" />
            <F label="# CAJA / CONTENEDOR" v={form.numero_caja} on={(t: string) => set('numero_caja', t)} tid="emb-caja" />
            <F label="PLACAS CAJA / CONTENEDOR" v={form.placas_caja} on={(t: string) => set('placas_caja', t)} tid="emb-placas-caja" />
          </Section>

          <Section title="TIEMPOS Y CARGA">
            <F label="HORA DE LLEGADA (CASETA)" v={form.hora_llegada} on={(t: string) => set('hora_llegada', t)} tid="emb-hora-llegada" placeholder="HH:MM" />
            <F label="HORA APERTURA CORTINA" v={form.hora_apertura_cortina} on={(t: string) => set('hora_apertura_cortina', t)} tid="emb-hora-apertura" placeholder="HH:MM" />
            <F label="HORA CIERRE CORTINA" v={form.hora_cierre_cortina} on={(t: string) => set('hora_cierre_cortina', t)} tid="emb-hora-cierre" placeholder="HH:MM" />
            <F label="HORA DE SALIDA (DESENRAMPE)" v={form.hora_salida} on={(t: string) => set('hora_salida', t)} tid="emb-hora-salida" placeholder="HH:MM" />
            <F label="NÚMERO DE PALLETS" v={form.numero_pallets} on={(t: string) => set('numero_pallets', t)} tid="emb-pallets" kb="numeric" />
            <F label="NÚMERO DE SELLO" v={form.numero_sello} on={(t: string) => set('numero_sello', t)} tid="emb-sello" />
          </Section>

          <Section title="OBSERVACIONES Y DAÑOS">
            <F label="OBSERVACIONES" v={form.observaciones} on={(t: string) => set('observaciones', t)} tid="emb-obs" multiline />
            <F label="SEÑALA EL DAÑO EN LA CAJA (descripción)" v={form.daño_caja} on={(t: string) => set('daño_caja', t)} tid="emb-dano" multiline />
          </Section>

          <Section title="FIRMAS">
            <F label="NOMBRE DEL GUARDIA DE SEGURIDAD" v={form.nombre_guardia} on={(t: string) => set('nombre_guardia', t)} tid="emb-guardia" />
            <Pressable testID="emb-firma-almacenista" style={styles.signatureBox} onPress={() => setSigTarget('almacenista')}>
              <Text style={form.firma_almacenista ? styles.firmaDone : styles.firmaCta}>
                {form.firma_almacenista ? 'FIRMA ALMACENISTA ✓' : 'Firma del Almacenista'}
              </Text>
            </Pressable>
            <Pressable testID="emb-firma-guardia" style={styles.signatureBox} onPress={() => setSigTarget('guardia')}>
              <Text style={form.firma_guardia ? styles.firmaDone : styles.firmaCta}>
                {form.firma_guardia ? 'FIRMA GUARDIA ✓' : 'Firma del Guardia'}
              </Text>
            </Pressable>
          </Section>

          <Pressable testID="emb-save" style={[styles.bigBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="#FFF" /> : <><Ionicons name="checkmark" size={24} color={colors.onBrandPrimary} /><Text style={styles.bigBtnText}>GUARDAR TICKET</Text></>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {sigTarget && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Firma {sigTarget === 'almacenista' ? 'Almacenista' : 'Guardia'}</Text>
            <View style={{ height: 280 }}>
              <Signature
                onOK={(sig) => { set(sigTarget === 'almacenista' ? 'firma_almacenista' : 'firma_guardia', sig); setSigTarget(null); }}
                webStyle={`.m-signature-pad--footer{display:none;}.m-signature-pad{box-shadow:none;border:2px solid #09090B;}body,html{background:#FFF;height:100%;}`}
                autoClear={false}
                imageType="image/png"
              />
            </View>
            <Pressable style={[styles.secBtn, { marginTop: spacing.md }]} onPress={() => setSigTarget(null)}>
              <Text style={styles.secBtnText}>CANCELAR</Text>
            </Pressable>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

function F({ label, v, on, tid, multiline, kb, placeholder }: any) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput testID={tid} style={[styles.input, multiline && { minHeight: 70, textAlignVertical: 'top' }]} value={v} onChangeText={on} multiline={!!multiline} keyboardType={kb || 'default'} placeholder={placeholder} placeholderTextColor={colors.muted} />
    </>
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
});

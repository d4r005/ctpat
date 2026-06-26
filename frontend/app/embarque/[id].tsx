import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput, Image, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Signature from '@/src/components/SignaturePad';
import { apiCall } from '@/src/api/client';
import { useAuth } from '@/src/context/AuthContext';
import { colors, spacing, typography } from '@/src/constants/theme';

export default function EmbarqueDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { token, user } = useAuth();
  const [t, setT] = useState<any>(null);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const [showSigModal, setShowSigModal] = useState(false);
  const [sigModalConfig, setSigModalConfig] = useState<any>({ title: '', onSave: () => {} });

  const isAdmin = ['d.trujillo@brancoindustries.com', 'd4r005@gmail.com', user?.email].includes(user?.email || '') || user?.role === 'admin';

  const load = async () => {
    try {
      const data = await apiCall<any>(`/shipping-tickets/${id}`, { token });
      setT(data);
      setForm(data);
    } catch (e: any) { alert(e.message); }
  };

  useEffect(() => {
    if (id) load();
  }, [id, token]);

  const handleUpdate = async () => {
    setSaving(true);
    try {
      await apiCall(`/shipping-tickets/${id}`, { method: 'PUT', body: form, token });
      setEditMode(false);
      await load();
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  };

  const pickPhoto = async (field: string) => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { alert('Se necesita acceso a la cámara'); return; }
      const r = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.5, base64: true });
      if (!r.canceled && r.assets[0]?.base64) {
        setForm({ ...form, [field]: `data:image/jpeg;base64,${r.assets[0].base64}` });
      }
    } catch (e: any) { alert(e.message || 'Error al obtener foto'); }
  };

  if (!t) return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safe} edges={['top']} testID="embarque-detail">
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(app)/supervisor')}
          style={{ padding: 10, marginLeft: -10 }}
        >
          <Ionicons name="arrow-back" size={28} color={colors.onBrandPrimary} />
        </Pressable>
        <Text style={styles.topTitle}>Ticket Embarque</Text>
        {isAdmin && (
          <Pressable onPress={() => editMode ? handleUpdate() : setEditMode(true)} style={styles.editBtn}>
            {saving ? <ActivityIndicator size={16} color="#FFF" /> : <Text style={styles.editBtnText}>{editMode ? 'GUARDAR' : 'EDITAR'}</Text>}
          </Pressable>
        )}
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        <Section title="ALMACÉN">
          {editMode ? (
            <View style={{ padding: spacing.sm }}>
              <EditField label="ALMACENISTA" v={form.almacenista} on={(v: string) => setForm({...form, almacenista: v})} />
              <EditField label="ÁREA" v={form.area} on={(v: string) => setForm({...form, area: v})} />
              <EditField label="SELLOS" v={form.sellos} on={(v: string) => setForm({...form, sellos: v})} />
            </View>
          ) : (
            <>
              <Row k="Almacenista" v={t.almacenista} />
              <Row k="Área" v={t.area} />
              <Row k="Sellos" v={t.sellos} />
              <Row k="Fecha" v={new Date(t.fecha).toLocaleString('es-MX')} />
            </>
          )}
        </Section>
        <Section title="MATERIAL / TRANSPORTE">
          {editMode ? (
            <View style={{ padding: spacing.sm }}>
              <EditField label="CLIENTE" v={form.cliente} on={(v: string) => setForm({...form, cliente: v})} />
              <EditField label="PLACAS UNIDAD" v={form.placas_unidad} on={(v: string) => setForm({...form, placas_unidad: v})} />
              <EditField label="# CAJA" v={form.numero_caja} on={(v: string) => setForm({...form, numero_caja: v})} />
              <EditField label="# SELLO" v={form.numero_sello} on={(v: string) => setForm({...form, numero_sello: v})} />
            </View>
          ) : (
            <>
              <Row k="Cliente" v={t.cliente} />
              <Row k="Operador" v={t.operador} />
              <Row k="Línea transporte" v={t.linea_transporte} />
              <Row k="# Económico" v={t.numero_economico} />
              <Row k="Placas unidad" v={t.placas_unidad} />
              <Row k="# Caja" v={t.numero_caja} />
              <Row k="Placas caja" v={t.placas_caja} />
            </>
          )}
        </Section>
        {/* ... rest of the sections could also be editable if needed, but these are the main ones */}
        <Section title="TIEMPOS Y CARGA">
          <Row k="Hora llegada" v={t.hora_llegada} />
          <Row k="Apertura cortina" v={t.hora_apertura_cortina} />
          <Row k="Cierre cortina" v={t.hora_cierre_cortina} />
          <Row k="Salida (desenrampe)" v={t.hora_salida} />
          <Row k="# Pallets" v={t.numero_pallets} />
          <Row k="# Sello" v={t.numero_sello} />
        </Section>

        <Section title="FOTOGRAFÍAS DE CARGA">
          <View style={styles.photoGrid}>
            <PhotoBox
              label="INICIO CARGA"
              uri={editMode ? form.foto_inicio_carga : t.foto_inicio_carga}
              onPress={() => pickPhoto('foto_inicio_carga')}
              onRemove={() => setForm({...form, foto_inicio_carga: ''})}
              isEdit={editMode}
            />
            <PhotoBox
              label="MEDIA CARGA"
              uri={editMode ? form.foto_media_carga : t.foto_media_carga}
              onPress={() => pickPhoto('foto_media_carga')}
              onRemove={() => setForm({...form, foto_media_carga: ''})}
              isEdit={editMode}
            />
            <PhotoBox
              label="FINAL CARGA"
              uri={editMode ? form.foto_final_carga : t.foto_final_carga}
              onPress={() => pickPhoto('foto_final_carga')}
              onRemove={() => setForm({...form, foto_final_carga: ''})}
              isEdit={editMode}
            />
          </View>
        </Section>
        <Section title="OBSERVACIONES Y DAÑOS">
          <Row k="Observaciones" v={t.observaciones || '-'} />
          <Row k="Daño en caja" v={t.daño_caja || '-'} />
        </Section>
        <Section title="FIRMAS">
          <Row k="Guardia" v={editMode ? form.nombre_guardia : t.nombre_guardia} isEdit={editMode} on={(v: string) => setForm({...form, nombre_guardia: v})} />

          <View style={{ padding: spacing.sm, alignItems: 'center' }}>
            {(editMode ? form.firma_almacenista : t.firma_almacenista) ? (
              <Image
                source={{ uri: editMode ? form.firma_almacenista : t.firma_almacenista }}
                style={{ width: '80%', height: 80, resizeMode: 'contain', backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border }}
              />
            ) : (
              <Text style={{ color: colors.muted, fontStyle: 'italic', fontSize: 10 }}>Sin firma almacenista</Text>
            )}
            {editMode && (
              <Pressable
                style={styles.sigEditBtn}
                onPress={() => {
                  setSigModalConfig({
                    title: 'Firma del Almacenista',
                    onSave: (sig: string) => setForm({ ...form, firma_almacenista: sig })
                  });
                  setShowSigModal(true);
                }}
              >
                <Text style={styles.sigEditBtnText}>CAMBIAR FIRMA ALMACENISTA</Text>
              </Pressable>
            )}
            <Text style={[styles.firmaTxt, { fontSize: 10, paddingTop: 2 }]}>FIRMA ALMACENISTA: {editMode ? form.almacenista : t.almacenista}</Text>
          </View>

          <View style={{ padding: spacing.sm, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.divider }}>
            {(editMode ? form.firma_guardia : t.firma_guardia) ? (
              <Image
                source={{ uri: editMode ? form.firma_guardia : t.firma_guardia }}
                style={{ width: '80%', height: 80, resizeMode: 'contain', backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border }}
              />
            ) : (
              <Text style={{ color: colors.muted, fontStyle: 'italic', fontSize: 10 }}>Sin firma guardia</Text>
            )}
            {editMode && (
              <Pressable
                style={styles.sigEditBtn}
                onPress={() => {
                  setSigModalConfig({
                    title: 'Firma del Guardia',
                    onSave: (sig: string) => setForm({ ...form, firma_guardia: sig })
                  });
                  setShowSigModal(true);
                }}
              >
                <Text style={styles.sigEditBtnText}>CAMBIAR FIRMA GUARDIA</Text>
              </Pressable>
            )}
            <Text style={[styles.firmaTxt, { fontSize: 10, paddingTop: 2 }]}>FIRMA GUARDIA: {editMode ? form.nombre_guardia : t.nombre_guardia}</Text>
          </View>
        </Section>
      </ScrollView>

      {showSigModal && (
        <SignatureModal
          onClose={() => setShowSigModal(false)}
          onSave={(sig) => { sigModalConfig.onSave(sig); setShowSigModal(false); }}
          title={sigModalConfig.title}
        />
      )}
    </SafeAreaView>
  );
}

function Section({ title, children }: any) {
  return <View style={{ marginBottom: spacing.lg }}><Text style={styles.secTitle}>{title}</Text><View style={styles.secBody}>{children}</View></View>;
}
function Row({ k, v, isEdit, on }: any) {
  if (isEdit && on) {
    return (
      <View style={styles.row}>
        <Text style={styles.rowK}>{k}</Text>
        <TextInput
          style={{ flex: 1, color: colors.onSurface, fontWeight: '700', fontSize: 12, padding: 0 }}
          value={v}
          onChangeText={on}
        />
      </View>
    );
  }
  return <View style={styles.row}><Text style={styles.rowK}>{k}</Text><Text style={styles.rowV}>{v || '-'}</Text></View>;
}

function SignatureModal({ onClose, onSave, title }: { onClose: () => void; onSave: (sig: string) => void; title: string }) {
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
            descriptionText="Firme dentro del recuadro"
            clearText="Borrar"
            confirmText="Guardar"
            webStyle={style}
            autoClear={false}
            imageType="image/jpeg"
          />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
          <Pressable style={[styles.secondaryBtn, { flex: 1 }]} onPress={onClose}>
            <Text style={styles.secondaryBtnText}>CANCELAR</Text>
          </Pressable>
          <Pressable
            style={[styles.primaryBtn, { flex: 1 }]}
            onPress={() => sigRef.current?.readSignature()}
          >
            <Text style={styles.primaryBtnText}>GUARDAR</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function PhotoBox({
label, uri, onPress, onRemove, isEdit }: any) {
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
            {isEdit ? 'AGREGAR FOTO' : 'SIN FOTO'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function EditField({ label, v, on }: any) {
  return (
    <View style={{ marginBottom: spacing.sm }}>
      <Text style={{ fontSize: 10, fontWeight: '900', color: colors.muted, marginBottom: 4 }}>{label}</Text>
      <TextInput style={styles.editInput} value={v} onChangeText={on} placeholderTextColor={colors.muted} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { backgroundColor: colors.brandPrimary, padding: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topTitle: { color: colors.onBrandPrimary, fontWeight: '900', fontSize: typography.sizes.base, letterSpacing: 1 },
  editBtn: { backgroundColor: colors.brandSecondary, paddingHorizontal: 12, paddingVertical: 6 },
  editBtnText: { color: '#FFF', fontWeight: '900', fontSize: 11 },
  secTitle: { backgroundColor: colors.brandPrimary, color: colors.onBrandPrimary, padding: spacing.sm, fontWeight: '900', letterSpacing: 1, fontSize: 12 },
  secBody: { borderWidth: 2, borderColor: colors.borderStrong, borderTopWidth: 0, backgroundColor: colors.surfaceSecondary },
  row: { flexDirection: 'row', padding: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowK: { width: 140, fontWeight: '700', color: colors.onSurfaceTertiary, fontSize: typography.sizes.sm },
  rowV: { flex: 1, color: colors.onSurface, fontWeight: '700', fontSize: typography.sizes.sm },
  firmaTxt: { color: colors.success, fontWeight: '900', padding: spacing.sm, letterSpacing: 1 },
  editInput: { borderWidth: 1, borderColor: colors.borderStrong, padding: 8, backgroundColor: '#FFF', color: colors.onSurface, fontSize: 14 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: spacing.sm, gap: spacing.sm, justifyContent: 'space-between' },
  photoItem: { width: '48%', marginBottom: spacing.sm },
  photoLabel: { fontSize: 10, fontWeight: '900', color: colors.muted, marginBottom: 4, letterSpacing: 0.5 },
  photoImg: { width: '100%', height: 120, resizeMode: 'cover', borderWidth: 2, borderColor: colors.borderStrong },

  // Modal & Signature
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(9,9,11,0.85)', justifyContent: 'center', padding: spacing.lg, zIndex: 100 },
  modalCard: { backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderWidth: 2, borderColor: colors.borderStrong },
  modalTitle: { fontWeight: '900', fontSize: typography.sizes.lg, color: colors.onSurface, marginBottom: spacing.md, letterSpacing: 1 },
  signatureCanvas: { height: 280 },
  primaryBtn: { flex: 1, backgroundColor: colors.brandPrimary, padding: spacing.md, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  primaryBtnText: { color: colors.onBrandPrimary, fontWeight: '900', letterSpacing: 1 },
  secondaryBtn: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.borderStrong, padding: spacing.md, alignItems: 'center', justifyContent: 'center' },
  secondaryBtnText: { color: colors.onSurface, fontWeight: '900', letterSpacing: 1 },
  sigEditBtn: { backgroundColor: colors.brandPrimary, padding: 8, marginTop: 4, width: '100%', alignItems: 'center' },
  sigEditBtnText: { color: '#FFF', fontWeight: '900', fontSize: 10 },
});

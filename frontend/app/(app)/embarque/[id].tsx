import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput, Image, Platform, Alert, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Signature from '@/src/components/SignaturePad';
import { apiCall } from '@/src/api/client';
import { useAuth } from '@/src/context/AuthContext';
import { colors, spacing, typography } from '@/src/constants/theme';
import { sanitizePlate } from '@/src/utils/text';
import { useTranslation } from 'react-i18next';

export default function EmbarqueDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const [ticket, setTicket] = useState<any>(null);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [showSig, setShowSig] = useState(false);
  const [sigTarget, setSigTarget] = useState<'almacenista' | 'guardia'>('almacenista');
  const sigRef = React.useRef<any>(null);

  const isAdmin = user?.role === 'admin' || user?.role === 'supervisor' || ['d.trujillo@brancoindustries.com', 'd4r005@gmail.com'].includes(user?.email || '');
  // Borrar el ticket es una acción destructiva reservada a admin real (el
  // backend rechaza con 403 a supervisor, así que el botón sólo se muestra
  // a quien realmente puede usarlo).
  const isRealAdmin = user?.role === 'admin' || ['d.trujillo@brancoindustries.com', 'd4r005@gmail.com'].includes(user?.email || '');
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    try {
      const data = await apiCall<any>(`/shipping-tickets/${id}`, { token });
      setTicket(data);
      setForm(JSON.parse(JSON.stringify(data)));
    } catch (e: any) {
      Alert.alert(t('error'), t('error_cargar_datos'));
    }
  };

  useEffect(() => { if (id) load(); }, [id]);

  const handleDelete = () => {
    if (deleting) return;
    Alert.alert(
      t('eliminar_proceso_title') || 'Eliminar ticket',
      `${t('eliminar_ticket_msg') || '¿Seguro que quieres eliminar este ticket de embarque? Se borra de la base de datos y de Google Sheets. No se puede deshacer.'}`,
      [
        { text: t('cancelar') || 'Cancelar', style: 'cancel' },
        {
          text: t('eliminar') || 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await apiCall(`/shipping-tickets/${id}`, { method: 'DELETE', token });
              router.back();
            } catch (e: any) {
              Alert.alert(t('error') || 'Error', e.message);
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const handleUpdate = async () => {
    setSaving(true);
    try {
      await apiCall(`/shipping-tickets/${id}`, { method: 'PUT', body: form, token });
      setEditMode(false);
      await load();
      Alert.alert(t('exito'), t('ticket_actualizado'));
    } catch (e: any) { Alert.alert(t('error'), e.message); }
    finally { setSaving(false); }
  };

  const pickPhoto = async (field: string) => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.3,
      base64: true,
    });
    if (!result.canceled && result.assets[0].base64) {
      setForm({ ...form, [field]: `data:image/jpeg;base64,${result.assets[0].base64}` });
    }
  };

  if (!ticket) return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={28} color="#FFF" />
        </Pressable>
        <Text style={styles.topTitle}>{t('embarque').toUpperCase()}: {ticket.placas_unidad}</Text>
        {isAdmin && (
          <Pressable onPress={() => editMode ? handleUpdate() : setEditMode(true)} style={styles.editBtn}>
            {saving ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.editBtnText}>{editMode ? t('guardar').toUpperCase() : t('editar').toUpperCase()}</Text>}
          </Pressable>
        )}
        {isRealAdmin && (
          <Pressable onPress={handleDelete} disabled={deleting} style={{ padding: 6 }}>
            {deleting ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="trash-outline" size={22} color="#FFF" />}
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('almacen').toUpperCase()}</Text>
          </View>
          <View style={styles.sectionBody}>
            <EditableRow label={t('almacenista')} value={form.almacenista} onEdit={editMode ? (v: string) => setForm({...form, almacenista: v}) : null} />
            <EditableRow label={t('cliente')} value={form.cliente} onEdit={editMode ? (v: string) => setForm({...form, cliente: v}) : null} />
            <EditableRow label={t('pallets')} value={form.numero_pallets} onEdit={editMode ? (v: string) => setForm({...form, numero_pallets: v}) : null} />
            <EditableRow label={t('orden_compra')} value={form.numero_orden_compra} onEdit={editMode ? (v: string) => setForm({...form, numero_orden_compra: v}) : null} />
          </View>
        </View>

        <View style={styles.section}>
          <View style={[styles.sectionHeader, { backgroundColor: colors.info }]}>
            <Text style={styles.sectionTitle}>{t('transporte').toUpperCase()}</Text>
          </View>
          <View style={styles.sectionBody}>
            <EditableRow label={t('placas_unidad')} value={form.placas_unidad} onEdit={editMode ? (v: string) => setForm({...form, placas_unidad: sanitizePlate(v)}) : null} />
            <EditableRow label={t('numero_caja_caps')} value={form.numero_caja} onEdit={editMode ? (v: string) => setForm({...form, numero_caja: v}) : null} />
            <EditableRow label={t('sello')} value={form.numero_sello} onEdit={editMode ? (v: string) => setForm({...form, numero_sello: v}) : null} />
            <EditableRow label={t('chofer')} value={form.operador} onEdit={editMode ? (v: string) => setForm({...form, operador: v}) : null} />
          </View>
        </View>

        <View style={styles.section}>
          <View style={[styles.sectionHeader, { backgroundColor: colors.warning }]}>
            <Text style={styles.sectionTitle}>{t('firmas').toUpperCase()}</Text>
          </View>
          <View style={styles.sectionBody}>
             <View style={styles.photoGrid}>
                <SigItem
                  label={t('firma_almacenista')}
                  uri={form.firma_almacenista}
                  onPick={editMode ? () => { setSigTarget('almacenista'); setShowSig(true); } : null}
                  onRemove={editMode ? () => setForm({ ...form, firma_almacenista: '' }) : null}
                />
                <SigItem
                  label={t('firma_guardia')}
                  uri={form.firma_guardia}
                  onPick={editMode ? () => { setSigTarget('guardia'); setShowSig(true); } : null}
                  onRemove={editMode ? () => setForm({ ...form, firma_guardia: '' }) : null}
                />
             </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={[styles.sectionHeader, { backgroundColor: colors.brandSecondary }]}>
            <Text style={styles.sectionTitle}>{t('evidencia_fotografica').toUpperCase()}</Text>
          </View>
          <View style={styles.sectionBody}>
             <View style={styles.photoGrid}>
                <PhotoItem label={t('inicio_carga')} uri={form.foto_inicio_carga} onPick={editMode ? ()=>pickPhoto('foto_inicio_carga') : null} onRemove={editMode ? ()=>setForm({...form, foto_inicio_carga:''}):null} />
                <PhotoItem label={t('media_carga')} uri={form.foto_media_carga} onPick={editMode ? ()=>pickPhoto('foto_media_carga') : null} onRemove={editMode ? ()=>setForm({...form, foto_media_carga:''}):null} />
                <PhotoItem label={t('final_carga')} uri={form.foto_final_carga} onPick={editMode ? ()=>pickPhoto('foto_final_carga') : null} onRemove={editMode ? ()=>setForm({...form, foto_final_carga:''}):null} />
             </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={[styles.sectionHeader, { backgroundColor: '#666' }]}>
            <Text style={styles.sectionTitle}>{t('observaciones').toUpperCase()}</Text>
          </View>
          <View style={styles.sectionBody}>
             {editMode ? (
               <TextInput
                 style={styles.obsInput}
                 value={form.observaciones}
                 onChangeText={(v)=>setForm({...form, observaciones: v.toUpperCase()})}
                 multiline
                 numberOfLines={3}
               />
             ) : (
               <Text style={styles.obsText}>{form.observaciones || t('sin_observaciones')}</Text>
             )}
          </View>
        </View>
      </ScrollView>

      {showSig && (
        <View style={styles.sigModal}>
          <View style={styles.sigModalContent}>
            <Text style={styles.sigModalTitle}>
              {t('firma').toUpperCase()} {sigTarget === 'almacenista' ? t('almacenista').toUpperCase() : t('guardia').toUpperCase()}
            </Text>
            <View style={styles.sigContainer}>
              <Signature
                ref={sigRef}
                onOK={(sig: string) => {
                  setForm({ ...form, [sigTarget === 'almacenista' ? 'firma_almacenista' : 'firma_guardia']: sig });
                  setShowSig(false);
                }}
                onEmpty={() => Alert.alert(t('error'), t('firma_vacia'))}
                webStyle={`.m-signature-pad--footer{display:none;}.m-signature-pad{box-shadow:none;border:2px solid #09090B;}body,html{background:#FFF;height:100%;}`}
              />
            </View>
            <View style={styles.sigModalBtns}>
              <Pressable style={styles.sigModalBtn} onPress={() => setShowSig(false)}>
                <Text>{t('cancelar')}</Text>
              </Pressable>
              <Pressable style={[styles.sigModalBtn, styles.sigModalBtnPrimary]} onPress={() => sigRef.current?.readSignature()}>
                <Text style={{ color: '#FFF' }}>{t('guardar')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

function SigItem({ label, uri, onPick, onRemove }: any) {
  return (
    <View style={styles.photoWrapper}>
       <Text style={styles.photoLabel}>{label}</Text>
       <Pressable style={styles.photoBox} onPress={onPick || undefined} disabled={!onPick}>
          {uri ? (
            <>
              <Image source={{ uri }} style={[styles.photoImg, { resizeMode: 'contain', backgroundColor: '#FFF' }]} />
              {onRemove && (
                <TouchableOpacity style={styles.removeBtn} onPress={onRemove}>
                  <Ionicons name="close-circle" size={24} color={colors.error} />
                </TouchableOpacity>
              )}
            </>
          ) : (
            <View style={styles.photoPlaceholder}>
              <Ionicons name="create-outline" size={24} color={colors.muted} />
              <Text style={styles.photoPlaceholderText}>{onPick ? 'TOCA PARA FIRMAR' : 'N/A'}</Text>
            </View>
          )}
       </Pressable>
    </View>
  );
}

function EditableRow({ label, value, onEdit }: any) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {onEdit ? (
        <TextInput style={styles.rowInput} value={value} autoCorrect={false} spellCheck={false} onChangeText={(v) => onEdit(v.toUpperCase())} />
      ) : (
        <Text style={styles.rowValue}>{value || '-'}</Text>
      )}
    </View>
  );
}

function PhotoItem({ label, uri, onPick, onRemove }: any) {
  return (
    <View style={styles.photoWrapper}>
       <Text style={styles.photoLabel}>{label}</Text>
       <Pressable style={styles.photoBox} onPress={onPick} disabled={!onPick}>
          {uri ? (
            <>
              <Image source={{ uri }} style={styles.photoImg} />
              {onRemove && (
                <TouchableOpacity style={styles.removeBtn} onPress={onRemove}>
                  <Ionicons name="close-circle" size={24} color={colors.error} />
                </TouchableOpacity>
              )}
            </>
          ) : (
            <View style={styles.photoPlaceholder}>
              <Ionicons name="camera" size={24} color={colors.muted} />
              <Text style={styles.photoPlaceholderText}>N/A</Text>
            </View>
          )}
       </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { backgroundColor: colors.brandPrimary, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 15 },
  backBtn: { padding: 5 },
  topTitle: { color: '#FFF', fontWeight: '900', fontSize: 16, flex: 1 },
  editBtn: { backgroundColor: colors.brandSecondary, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 4 },
  editBtnText: { color: '#FFF', fontWeight: '900', fontSize: 12 },
  scroll: { padding: spacing.md, gap: spacing.md, paddingBottom: 100 },
  section: { backgroundColor: '#FFF', borderWidth: 2, borderColor: colors.borderStrong },
  sectionHeader: { backgroundColor: colors.brandPrimary, padding: spacing.sm },
  sectionTitle: { color: '#FFF', fontWeight: '900', fontSize: 12 },
  sectionBody: { padding: spacing.md },
  row: { marginBottom: 12 },
  rowLabel: { fontSize: 10, color: colors.muted, fontWeight: '700', marginBottom: 2 },
  rowValue: { fontSize: 14, fontWeight: '900', color: colors.onSurface },
  rowInput: { borderWidth: 1, borderColor: '#DDD', padding: 8, fontSize: 14, backgroundColor: '#FAFAFA' },
  photoGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  photoWrapper: { width: '30%', minWidth: 90 },
  photoLabel: { fontSize: 8, fontWeight: '900', color: colors.muted, marginBottom: 4, textAlign: 'center' },
  photoBox: { height: 90, borderWidth: 1, borderColor: '#DDD', borderRadius: 4, overflow: 'hidden', backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center' },
  photoImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  photoPlaceholder: { alignItems: 'center' },
  photoPlaceholderText: { fontSize: 9, color: colors.muted, fontWeight: '900', marginTop: 2 },
  removeBtn: { position: 'absolute', top: -5, right: -5, backgroundColor: '#FFF', borderRadius: 12 },
  obsInput: { borderWidth: 1, borderColor: '#DDD', padding: 10, fontSize: 14, backgroundColor: '#FAFAFA', minHeight: 80, textAlignVertical: 'top' },
  obsText: { fontSize: 13, color: colors.onSurface, fontWeight: '700' },
  sigModal: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: spacing.md },
  sigModalContent: { backgroundColor: '#FFF', width: '100%', maxWidth: 500, borderRadius: 8, padding: spacing.md, borderWidth: 2, borderColor: colors.borderStrong },
  sigModalTitle: { fontWeight: '900', fontSize: 14, marginBottom: spacing.sm, textAlign: 'center' },
  sigContainer: { height: 280, borderWidth: 1, borderColor: '#DDD', marginBottom: spacing.sm },
  sigModalBtns: { flexDirection: 'row', gap: 10 },
  sigModalBtn: { flex: 1, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#DDD', borderRadius: 4 },
  sigModalBtnPrimary: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }
});

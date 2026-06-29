import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator,
  TextInput, Image, Alert, Platform, Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { apiCall } from '@/src/api/client';
import { useAuth } from '@/src/context/AuthContext';
import { colors, spacing, typography } from '@/src/constants/theme';
import { useTranslation } from 'react-i18next';
import Signature from '@/src/components/SignaturePad';

export default function InspectionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const [inspection, setInspection] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>(null);

  const isAdmin = user?.role === 'admin' || user?.role === 'supervisor' || ['d.trujillo@brancoindustries.com', 'd4r005@gmail.com'].includes(user?.email || '');

  const load = async () => {
    if (!id || !token) return;
    setLoading(true);
    try {
      const data = await apiCall<any>(`/inspections/${id}`, { token });
      setInspection(data);
      setForm(JSON.parse(JSON.stringify(data)));
    } catch (e: any) {
      Alert.alert(t('error'), t('error_cargar_datos'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id, token]);

  const handleUpdate = async () => {
    setSaving(true);
    try {
      await apiCall(`/inspections/${id}`, { method: 'PUT', body: form, token });
      setEditMode(false);
      await load();
      Alert.alert(t('exito'), t('inspeccion_actualizada'));
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    } finally {
      setSaving(false);
    }
  };

  const pickPhoto = async (index: number) => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      quality: 0.3,
      base64: true,
    });
    if (!result.canceled && result.assets[0].base64) {
      const newPoints = [...form.points];
      newPoints[index].photo = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setForm({ ...form, points: newPoints });
    }
  };

  if (loading) return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View></SafeAreaView>;
  if (!inspection) return <SafeAreaView style={styles.safe}><View style={styles.center}><Text>{t('no_hay_registros')}</Text></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </Pressable>
        <Text style={styles.topTitle}>{t('inspeccion').toUpperCase()}: {inspection.placas_unidad}</Text>
        {isAdmin && (
          <Pressable onPress={() => editMode ? handleUpdate() : setEditMode(true)} style={styles.editBtn}>
            {saving ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.editBtnText}>{editMode ? t('guardar').toUpperCase() : t('editar').toUpperCase()}</Text>}
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
             <Text style={styles.sectionTitle}>{t('datos_generales').toUpperCase()}</Text>
          </View>
          <View style={styles.sectionBody}>
             <EditableRow label={t('placas')} value={form.placas_unidad} onEdit={editMode ? (v) => setForm({...form, placas_unidad: v}) : null} />
             <EditableRow label={t('compania')} value={form.compania_transportista} onEdit={editMode ? (v) => setForm({...form, compania_transportista: v}) : null} />
             <EditableRow label={t('numero_trailer')} value={form.numero_trailer} onEdit={editMode ? (v) => setForm({...form, numero_trailer: v}) : null} />
             <EditableRow label={t('inspector')} value={form.inspector_nombre} onEdit={editMode ? (v) => setForm({...form, inspector_nombre: v}) : null} />
          </View>
        </View>

        <View style={styles.section}>
           <View style={[styles.sectionHeader, { backgroundColor: colors.info }]}>
              <Text style={styles.sectionTitle}>{t('puntos_inspeccion').toUpperCase()}</Text>
           </View>
           <View style={styles.sectionBody}>
              {form.points.map((p: any, idx: number) => (
                <View key={idx} style={styles.pointItem}>
                  <View style={styles.pointHeader}>
                    <Text style={styles.pointNum}>{p.number}. {p.name}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: p.estado === 'malo' ? colors.error : colors.success }]}>
                       <Text style={styles.statusBadgeText}>{p.estado.toUpperCase()}</Text>
                    </View>
                  </View>

                  {editMode && (
                    <View style={styles.pointActions}>
                      <Pressable
                        style={[styles.pointOpt, p.estado === 'bueno' && { backgroundColor: colors.success }]}
                        onPress={() => {
                          const np = [...form.points]; np[idx].estado = 'bueno'; setForm({...form, points: np});
                        }}
                      >
                        <Text style={styles.pointOptText}>{t('bueno').toUpperCase()}</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.pointOpt, p.estado === 'malo' && { backgroundColor: colors.error }]}
                        onPress={() => {
                          const np = [...form.points]; np[idx].estado = 'malo'; setForm({...form, points: np});
                        }}
                      >
                        <Text style={styles.pointOptText}>{t('falla').toUpperCase()}</Text>
                      </Pressable>
                    </View>
                  )}

                  {p.photo ? (
                    <View style={styles.photoContainer}>
                      <Image source={{ uri: p.photo }} style={styles.pointPhoto} />
                      {editMode && (
                        <Pressable style={styles.deletePhoto} onPress={() => {
                          const np = [...form.points]; np[idx].photo = ''; setForm({...form, points: np});
                        }}>
                          <Ionicons name="trash" size={20} color="#FFF" />
                        </Pressable>
                      )}
                    </View>
                  ) : (
                    editMode && (
                      <Pressable style={styles.addPhotoBtn} onPress={() => pickPhoto(idx)}>
                        <Ionicons name="camera" size={24} color={colors.brandPrimary} />
                        <Text style={styles.addPhotoText}>{t('agregar_foto')}</Text>
                      </Pressable>
                    )
                  )}
                </View>
              ))}
           </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function EditableRow({ label, value, onEdit }: any) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {onEdit ? (
        <TextInput style={styles.rowInput} value={value} onChangeText={onEdit} />
      ) : (
        <Text style={styles.rowValue}>{value || '-'}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
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
  row: { marginBottom: 15 },
  rowLabel: { fontSize: 10, color: colors.muted, fontWeight: '700', marginBottom: 2 },
  rowValue: { fontSize: 14, fontWeight: '900', color: colors.onSurface },
  rowInput: { borderWidth: 1, borderColor: '#DDD', padding: 8, fontSize: 14, backgroundColor: '#FAFAFA' },
  pointItem: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  pointHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  pointNum: { fontWeight: '900', fontSize: 14, flex: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  statusBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
  pointActions: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  pointOpt: { flex: 1, padding: 8, alignItems: 'center', borderWidth: 1, borderColor: '#DDD' },
  pointOptText: { fontSize: 10, fontWeight: '900', color: colors.muted },
  photoContainer: { position: 'relative', marginTop: 10 },
  pointPhoto: { width: '100%', height: 250, resizeMode: 'cover', borderRadius: 4 },
  deletePhoto: { position: 'absolute', top: 10, right: 10, backgroundColor: colors.error, padding: 8, borderRadius: 20 },
  addPhotoBtn: { borderStyle: 'dashed', borderWidth: 2, borderColor: colors.brandPrimary, padding: 20, alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 10 },
  addPhotoText: { color: colors.brandPrimary, fontWeight: '900', fontSize: 12 },
});

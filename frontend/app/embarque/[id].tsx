import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, Platform, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { apiCall } from '@/src/api/client';
import { useAuth } from '@/src/context/AuthContext';
import { colors, spacing, typography } from '@/src/constants/theme';

export default function EmbarqueDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { token, user } = useAuth();
  const [t, setT] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    apiCall<any>(`/shipping-tickets/${id}`, { token }).then(setT).catch((e) => alert(e.message));
  }, [id, token]);

  const handleDelete = async () => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm('¿Estás seguro de que deseas eliminar este ticket de embarque? Esta acción no se puede deshacer.')
      : await new Promise(resolve => {
          Alert.alert(
            "Eliminar Ticket",
            "¿Estás seguro de que deseas eliminar este ticket de embarque?",
            [
              { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
              { text: "Eliminar", style: "destructive", onPress: () => resolve(true) }
            ]
          );
        });

    if (!confirmed) return;

    setDeleting(true);
    try {
      await apiCall(`/shipping-tickets/${id}`, { method: 'DELETE', token });
      router.back();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setDeleting(false);
    }
  };

  if (!t) return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View></SafeAreaView>;

  const isAdmin = user?.role === 'admin';

  const load = async () => {
    if (!id) return;
    try {
      const data = await apiCall<any>(`/shipping-tickets/${id}`, { token });
      setT(data);
    } catch (e: any) { alert(e.message); }
  };

  useEffect(() => { load(); }, [id, token]);

  const adminUpdatePhoto = async (field: string) => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.5, base64: true });
      if (r.canceled || !r.assets[0]?.base64) return;

      const photo_data = `data:image/jpeg;base64,${r.assets[0].base64}`;
      await apiCall(`/admin/shipping-tickets/${id}/photo`, {
        method: 'PATCH',
        body: { field_path: field, photo_data },
        token
      });
      load();
    } catch (e: any) { alert(e.message); }
  };

  const adminDeletePhoto = async (field: string) => {
    if (!window.confirm('¿Eliminar esta foto permanentemente?')) return;
    try {
      await apiCall(`/admin/shipping-tickets/${id}/photo`, {
        method: 'PATCH',
        body: { field_path: field, photo_data: '' },
        token
      });
      load();
    } catch (e: any) { alert(e.message); }
  };

  const AdminPhotoActions = ({ field, hasPhoto }: { field: string, hasPhoto: boolean }) => {
    if (!isAdmin) return null;
    return (
      <View style={hasPhoto ? styles.adminPhotoOverlay : styles.adminAddPhotoContainer}>
        <Pressable onPress={() => adminUpdatePhoto(field)} style={hasPhoto ? styles.adminPhotoBtn : styles.adminAddBtn}>
          <Ionicons name={hasPhoto ? "pencil" : "add-circle"} size={hasPhoto ? 14 : 20} color="#FFF" />
          {!hasPhoto && <Text style={styles.adminAddText}>AGREGAR</Text>}
        </Pressable>
        {hasPhoto && (
          <Pressable onPress={() => adminDeletePhoto(field)} style={[styles.adminPhotoBtn, { backgroundColor: colors.error }]}>
            <Ionicons name="trash" size={14} color="#FFF" />
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']} testID="embarque-detail">
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.onBrandPrimary} /></Pressable>
        <Text style={styles.topTitle}>Ticket Embarque</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        <Section title="ALMACÉN">
          <Row k="Almacenista" v={t.almacenista} />
          <Row k="Área" v={t.area} />
          <Row k="Sellos" v={t.sellos} />
          <Row k="Fecha" v={new Date(t.fecha).toLocaleString('es-MX')} />
        </Section>
        <Section title="MATERIAL / TRANSPORTE">
          <Row k="Cliente" v={t.cliente} />
          <Row k="Operador" v={t.operador} />
          <Row k="Línea transporte" v={t.linea_transporte} />
          <Row k="# Económico" v={t.numero_economico} />
          <Row k="Placas unidad" v={t.placas_unidad} />
          <Row k="# Caja" v={t.numero_caja} />
          <Row k="Placas caja" v={t.placas_caja} />
        </Section>
        <Section title="TIEMPOS Y CARGA">
          <Row k="Hora llegada" v={t.hora_llegada} />
          <Row k="Apertura cortina" v={t.hora_apertura_cortina} />
          <Row k="Cierre cortina" v={t.hora_cierre_cortina} />
          <Row k="Salida (desenrampe)" v={t.hora_salida} />
          <Row k="# Pallets" v={t.numero_pallets} />
          <Row k="# Sello" v={t.numero_sello} />
        </Section>
        <Section title="OBSERVACIONES Y DAÑOS">
          <Row k="Observaciones" v={t.observaciones || '-'} />
          <Row k="Daño en caja" v={t.daño_caja || '-'} />
        </Section>
        <Section title="EVIDENCIA DE CARGA">
          <View style={styles.photoGrid}>
            <View style={styles.photoItem}>
              <Text style={styles.photoLabel}>INICIO CARGA</Text>
              {t.foto_inicio_carga ? (
                <View>
                  <Image source={{ uri: t.foto_inicio_carga }} style={styles.photoImg} />
                  <AdminPhotoActions field="foto_inicio_carga" hasPhoto={true} />
                </View>
              ) : (
                <>
                  <Text style={styles.noPhoto}>Sin foto</Text>
                  <AdminPhotoActions field="foto_inicio_carga" hasPhoto={false} />
                </>
              )}
            </View>
            <View style={styles.photoItem}>
              <Text style={styles.photoLabel}>MEDIA CARGA</Text>
              {t.foto_media_carga ? (
                <View>
                  <Image source={{ uri: t.foto_media_carga }} style={styles.photoImg} />
                  <AdminPhotoActions field="foto_media_carga" hasPhoto={true} />
                </View>
              ) : (
                <>
                  <Text style={styles.noPhoto}>Sin foto</Text>
                  <AdminPhotoActions field="foto_media_carga" hasPhoto={false} />
                </>
              )}
            </View>
            <View style={styles.photoItem}>
              <Text style={styles.photoLabel}>FINAL CARGA</Text>
              {t.foto_final_carga ? (
                <View>
                  <Image source={{ uri: t.foto_final_carga }} style={styles.photoImg} />
                  <AdminPhotoActions field="foto_final_carga" hasPhoto={true} />
                </View>
              ) : (
                <>
                  <Text style={styles.noPhoto}>Sin foto</Text>
                  <AdminPhotoActions field="foto_final_carga" hasPhoto={false} />
                </>
              )}
            </View>
          </View>
        </Section>
        <Section title="FIRMAS">
          <Row k="Guardia" v={t.nombre_guardia} />
          {t.firma_almacenista ? <Text style={styles.firmaTxt}>✓ Firma almacenista capturada</Text> : null}
          {t.firma_guardia ? <Text style={styles.firmaTxt}>✓ Firma guardia capturada</Text> : null}
        </Section>

        {isAdmin && (
          <Pressable
            style={[styles.deleteBtn, deleting && { opacity: 0.5 }]}
            onPress={handleDelete}
            disabled={deleting}
          >
            {deleting ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="trash" size={20} color="#FFF" />
                <Text style={styles.deleteBtnText}>ELIMINAR TICKET (Solo Admin)</Text>
              </>
            )}
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: any) {
  return <View style={{ marginBottom: spacing.lg }}><Text style={styles.secTitle}>{title}</Text><View style={styles.secBody}>{children}</View></View>;
}
function Row({ k, v }: any) {
  return <View style={styles.row}><Text style={styles.rowK}>{k}</Text><Text style={styles.rowV}>{v || '-'}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { backgroundColor: colors.brandPrimary, padding: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topTitle: { color: colors.onBrandPrimary, fontWeight: '900', fontSize: typography.sizes.base, letterSpacing: 1 },
  secTitle: { backgroundColor: colors.brandPrimary, color: colors.onBrandPrimary, padding: spacing.sm, fontWeight: '900', letterSpacing: 1, fontSize: 12 },
  secBody: { borderWidth: 2, borderColor: colors.borderStrong, borderTopWidth: 0, backgroundColor: colors.surfaceSecondary },
  row: { flexDirection: 'row', padding: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowK: { width: 140, fontWeight: '700', color: colors.onSurfaceTertiary, fontSize: typography.sizes.sm },
  rowV: { flex: 1, color: colors.onSurface, fontWeight: '700', fontSize: typography.sizes.sm },
  firmaTxt: { color: colors.success, fontWeight: '900', padding: spacing.sm, letterSpacing: 1 },
  deleteBtn: {
    backgroundColor: colors.error, padding: spacing.lg, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.xl, minHeight: 52,
  },
  deleteBtnText: { color: '#FFF', fontWeight: '900', letterSpacing: 1, fontSize: typography.sizes.sm },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: spacing.sm, gap: spacing.sm, justifyContent: 'space-between' },
  photoItem: { width: '31%', marginBottom: spacing.sm },
  photoLabel: { fontSize: 8, fontWeight: '900', color: colors.muted, marginBottom: 4, letterSpacing: 0.5 },
  photoImg: { width: '100%', height: 100, resizeMode: 'cover', borderWidth: 2, borderColor: colors.borderStrong },
  noPhoto: { fontSize: 8, color: colors.muted, fontStyle: 'italic' },
  adminPhotoOverlay: {
    position: 'absolute', top: 2, right: 2, flexDirection: 'row', gap: 2,
  },
  adminPhotoBtn: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: colors.brandPrimary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 2, elevation: 3,
  },
  adminAddPhotoContainer: {
    marginTop: 5,
  },
  adminAddBtn: {
    backgroundColor: colors.brandPrimary,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 6,
    borderRadius: 4,
    gap: 4,
    justifyContent: 'center',
  },
  adminAddText: {
    color: '#FFF',
    fontSize: 8,
    fontWeight: '900',
  },
});

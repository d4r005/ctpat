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
import { useTranslation } from 'react-i18next';

export default function EmbarqueDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t: tr } = useTranslation();
  const { token, user } = useAuth();
  const [t, setT] = useState<any>(null);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const isAdmin = ['d.trujillo@brancoindustries.com', 'd4r005@gmail.com', user?.email].includes(user?.email || '') || user?.role === 'admin' || user?.role === 'supervisor';

  const load = async () => {
    try {
      const data = await apiCall<any>(`/shipping-tickets/${id}`, { token });
      setT(data);
      setForm(data);
    } catch (e: any) {
      console.error(e);
      alert(tr('error_cargar_datos'));
    }
  };

  useEffect(() => { if (id) load(); }, [id]);

  const handleUpdate = async () => {
    setSaving(true);
    try {
      await apiCall(`/shipping-tickets/${id}`, { method: 'PUT', body: form, token });
      setEditMode(false);
      await load();
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  };

  if (!t) return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={{ padding: 10 }}><Ionicons name="arrow-back" size={28} color="#FFF" /></Pressable>
        <Text style={styles.topTitle}>{tr('embarque')} {t.placas_unidad}</Text>
        {isAdmin && (
          <Pressable onPress={() => editMode ? handleUpdate() : setEditMode(true)} style={styles.editBtn}>
            {saving ? <ActivityIndicator size={16} color="#FFF" /> : <Text style={{ color: '#FFF', fontWeight: '900' }}>{editMode ? tr('guardar').toUpperCase() : tr('editar').toUpperCase()}</Text>}
          </Pressable>
        )}
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <Section title={tr('almacen')}>
          <Row k={tr('almacenista')} v={form.almacenista} on={editMode ? (v: string) => setForm({...form, almacenista: v}) : null} />
          <Row k={tr('area')} v={form.area} on={editMode ? (v: string) => setForm({...form, area: v}) : null} />
          <Row k={tr('sellos')} v={form.sellos} on={editMode ? (v: string) => setForm({...form, sellos: v}) : null} />
        </Section>

        <Section title={tr('material_transporte')}>
          <Row k={tr('cliente')} v={form.cliente} on={editMode ? (v: string) => setForm({...form, cliente: v}) : null} />
          <Row k={tr('operador')} v={form.operador} on={editMode ? (v: string) => setForm({...form, operador: v}) : null} />
          <Row k={tr('placas_unidad')} v={form.placas_unidad} on={editMode ? (v: string) => setForm({...form, placas_unidad: v}) : null} />
          <Row k={tr('numero_caja_caps')} v={form.numero_caja} on={editMode ? (v: string) => setForm({...form, numero_caja: v}) : null} />
        </Section>

        <Section title={tr('tiempos_y_carga')}>
          <Row k={tr('numero_pallets_caps')} v={form.numero_pallets} on={editMode ? (v: string) => setForm({...form, numero_pallets: v}) : null} />
          <Row k={tr('numero_sello_caps')} v={form.numero_sello} on={editMode ? (v: string) => setForm({...form, numero_sello: v}) : null} />
          <Row k={tr('observaciones')} v={form.observaciones} on={editMode ? (v: string) => setForm({...form, observaciones: v}) : null} />
        </Section>

        <Text style={styles.cardMetaText}>{tr('fecha')}: {new Date(t.created_at).toLocaleString()}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: any) {
  return <View style={{ marginBottom: spacing.lg }}><Text style={styles.secTitle}>{title}</Text><View style={styles.secBody}>{children}</View></View>;
}
function Row({ k, v, on }: any) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowK}>{k}</Text>
      {on ? (
        <TextInput
          style={styles.input}
          value={String(v || '')}
          onChangeText={on}
          autoCapitalize="characters"
        />
      ) : (
        <Text style={styles.rowV}>{v || '-'}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { backgroundColor: colors.brandPrimary, padding: 10, flexDirection: 'row', alignItems: 'center' },
  topTitle: { color: '#FFF', fontWeight: '900', flex: 1, marginLeft: 10, fontSize: 16 },
  editBtn: { backgroundColor: colors.brandSecondary, padding: 8, borderRadius: 4 },
  secTitle: { backgroundColor: colors.brandPrimary, color: '#FFF', padding: 8, fontWeight: '900', fontSize: 12, letterSpacing: 1 },
  secBody: { borderWidth: 2, borderColor: colors.borderStrong, borderTopWidth: 0, backgroundColor: colors.surfaceSecondary },
  row: { flexDirection: 'row', padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center' },
  rowK: { width: 130, fontWeight: '700', color: colors.onSurfaceTertiary, fontSize: 12 },
  rowV: { flex: 1, color: colors.onSurface, fontWeight: '700', fontSize: 12 },
  input: { flex: 1, backgroundColor: '#FFF', borderWidth: 1, borderColor: colors.border, padding: 8, color: colors.onSurface, fontSize: 13, fontWeight: '700' },
  cardMetaText: { fontSize: 10, color: colors.muted, textAlign: 'center', marginTop: 10 }
});

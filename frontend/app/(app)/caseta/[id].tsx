import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Signature from '@/src/components/SignaturePad';
import { apiCall } from '@/src/api/client';
import { useAuth } from '@/src/context/AuthContext';
import { useInspections } from '@/src/context/InspectionContext';
import { colors, spacing, typography } from '@/src/constants/theme';

import { useTranslation } from 'react-i18next';

export default function CasetaDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const { patchVehicleExit, updateVehicleRecord } = useInspections();
  const [rec, setRec] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [showExit, setShowExit] = useState(false);
  const [exitData, setExitData] = useState<any>({
    hora_apertura_cortina: '', hora_cierre_cortina: '', cortina_salida: '',
    sello_salida: '', sello_salida_2: '', condicion_salida: '', destino: '',
    numero_tractor_salida: '', numero_caja_salida: '', numero_caja_salida_2: '',
    escolta: { presente: false, compania: '', unidad: '', placas: '' },
    pallets: '', cajas: '', bultos: '',
    sello_vvtt_estado: '', sello_vvtt_foto: '',
    sello_vvtt_estado_2: '', sello_vvtt_foto_2: '',
    guardia_salida_nombre: '',
  });
  const [saving, setSaving] = useState(false);

  const isAdmin = user?.role === 'admin' || ['d.trujillo@brancoindustries.com', 'd4r005@gmail.com'].includes(user?.email || '');

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiCall<any>(`/vehicle-records/${id}`, { token });
      if (data) {
        setRec(data);
        if (data.exit) setExitData(data.exit);
      }
    } catch (e: any) {
      alert(t('error_cargar_datos'));
    } finally { setLoading(false); }
  };

  useEffect(() => { if (id) load(); }, [id, token]);

  const handleUpdateEntry = async () => {
    setSaving(true);
    try {
      await apiCall(`/vehicle-records/${id}`, { method: 'PUT', body: { entry: rec.entry }, token });
      await load();
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  };

  if (loading) return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View></SafeAreaView>;
  if (!rec) return <SafeAreaView style={styles.safe}><View style={styles.center}><Text>{t('error_cargar_datos')}</Text></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']} testID="caseta-detail">
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={{ padding: 10, marginLeft: -10 }}>
          <Ionicons name="arrow-back" size={28} color="#FFF" />
        </Pressable>
        <Text style={styles.topTitle}>{t('registro')} {rec.entry.placas_unidad}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <Text style={styles.secTitle}>{t('entrada_datos_unidad')}</Text>
        <View style={styles.secBody}>
          <Row label={t('placas')} value={rec.entry.placas_unidad} />
          <Row label={t('nombre_chofer')} value={rec.entry.chofer_nombre} />
          <Row label={t('compania')} value={rec.entry.compania_transporte} />
        </View>

        {/* Simplified buttons for now to restore functionality */}
        <Pressable style={styles.bigBtn} onPress={() => router.push(`/(app)/nueva?record_id=${rec.id}&placas=${rec.entry.placas_unidad}`)}>
          <Ionicons name="clipboard" size={24} color="#FFF" />
          <Text style={styles.bigBtnText}>{t('inspeccionar').toUpperCase()}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return <View style={styles.row}><Text style={styles.rowLabel}>{label}</Text><Text style={styles.rowValue}>{value || '-'}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { backgroundColor: colors.brandPrimary, padding: spacing.md, flexDirection: 'row', alignItems: 'center' },
  topTitle: { color: '#FFF', fontWeight: '900', fontSize: 16, flex: 1, marginHorizontal: spacing.md },
  secTitle: { backgroundColor: colors.brandPrimary, color: '#FFF', padding: spacing.sm, fontWeight: '900', fontSize: 12 },
  secBody: { backgroundColor: colors.surfaceSecondary, borderWidth: 2, borderColor: colors.borderStrong, borderTopWidth: 0, marginBottom: spacing.md },
  row: { flexDirection: 'row', padding: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowLabel: { width: 120, fontWeight: '700', color: colors.muted, fontSize: 12 },
  rowValue: { flex: 1, color: colors.onSurface, fontSize: 12, fontWeight: '700' },
  bigBtn: { backgroundColor: colors.brandPrimary, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.md },
  bigBtnText: { color: '#FFF', fontWeight: '900', letterSpacing: 1 },
});

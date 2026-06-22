import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { apiCall } from '@/src/api/client';
import { useAuth } from '@/src/context/AuthContext';
import { colors, spacing, typography } from '@/src/constants/theme';

export default function EmbarqueDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { token } = useAuth();
  const [t, setT] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    apiCall<any>(`/shipping-tickets/${id}`, { token }).then(setT).catch((e) => alert(e.message));
  }, [id, token]);

  if (!t) return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View></SafeAreaView>;

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
        <Section title="FIRMAS">
          <Row k="Guardia" v={t.nombre_guardia} />
          {t.firma_almacenista ? <Text style={styles.firmaTxt}>✓ Firma almacenista capturada</Text> : null}
          {t.firma_guardia ? <Text style={styles.firmaTxt}>✓ Firma guardia capturada</Text> : null}
        </Section>
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
});

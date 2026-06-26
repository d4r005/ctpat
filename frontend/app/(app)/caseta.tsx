import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { apiCall } from '@/src/api/client';
import { useAuth } from '@/src/context/AuthContext';
import { colors, spacing, typography } from '@/src/constants/theme';
import ProcessTracker from '@/src/components/ProcessTracker';

import MainHeader from '@/src/components/MainHeader';

interface VehicleRecord {
  id: string;
  status: 'entrada' | 'inspeccionado' | 'salida';
  entry: any;
  exit: any;
  inspection_id?: string;
  created_at: string;
  has_shipping_ticket?: boolean;
}

export default function Caseta() {
  const { token, user } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const [records, setRecords] = useState<VehicleRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const STATUS_LABEL: Record<string, { label: string; color: string }> = {
    entrada: { label: t('en_patio'), color: colors.warning },
    inspeccionado: { label: t('inspeccionado'), color: colors.info },
    salida: { label: t('salio'), color: colors.success },
  };

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiCall<VehicleRecord[]>('/vehicle-records', { token });
      setRecords(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setRecords([]);
    } finally { setLoading(false); }
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pendingInspections = useMemo(() => {
    return records.filter(r => r.status === 'entrada' && !r.inspection_id);
  }, [records]);

  const renderItem = ({ item }: { item: VehicleRecord | 'header' | 'pending' | 'title' }) => {
    if (item === 'header') {
      return (
        <Pressable
          testID="caseta-new-btn"
          style={styles.actionCard}
          onPress={() => router.push('/caseta/nuevo')}
        >
          <View style={[styles.iconCircle, { backgroundColor: colors.brandSecondary }]}>
            <Ionicons name="add" size={28} color="#FFF" />
          </View>
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={styles.cardTitleText}>{t('nuevo_registro_entrada')}</Text>
            <Text style={styles.cardSubText}>{t('vehiculo_llegando')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color={colors.muted} />
        </Pressable>
      );
    }

    if (item === 'pending') {
      if (pendingInspections.length === 0) return null;
      return (
        <View style={styles.pendingSection}>
          <Text style={styles.sectionTitle}>UNIDADES PENDIENTES DE INSPECCIÓN</Text>
          {pendingInspections.map((r: VehicleRecord) => (
            <Pressable
              key={r.id}
              style={[styles.activityCard, { borderLeftWidth: 4, borderLeftColor: colors.warning }]}
              onPress={() => {
                const params = new URLSearchParams({
                  record_id: r.id,
                  compania: r.entry.compania_transporte || '',
                  placas: r.entry.placas_unidad || '',
                  trailer: r.entry.numero_caja || '',
                  sello: r.entry.sello_entrada !== 'N/A' ? r.entry.sello_entrada : ''
                });
                router.push(`/(app)/nueva?${params.toString()}`);
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitleText}>{r.entry.placas_unidad}</Text>
                <Text style={styles.cardSubText}>{r.entry.chofer_nombre}</Text>
              </View>
              <View style={[styles.miniStatusBadge, { backgroundColor: colors.warning }]}>
                <Text style={styles.miniStatusText}>INSPECCIONAR</Text>
              </View>
            </Pressable>
          ))}
        </View>
      );
    }

    if (item === 'title') {
      return <Text style={styles.sectionTitle}>{t('vehiculos_registrados')}</Text>;
    }

    const st = STATUS_LABEL[item.status] || STATUS_LABEL.entrada;
    const steps = {
      entry: true,
      inspection: !!item.inspection_id,
      shipping: !!item.has_shipping_ticket,
      exit: item.status === 'salida'
    };

    return (
      <Pressable
        testID={`caseta-record-${item.id}`}
        style={styles.activityCard}
        onPress={() => router.push(`/caseta/${item.id}`)}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitleText}>{item.entry.placas_unidad}</Text>
          <Text style={styles.cardSubText}>{item.entry.chofer_nombre} · {item.entry.compania_transporte || '-'}</Text>
          <View style={{ marginVertical: 6 }}>
            <ProcessTracker steps={steps} compact />
          </View>
          <Text style={styles.cardMetaText}>{new Date(item.entry.fecha_entrada || item.created_at).toLocaleString()}</Text>
        </View>
        <View style={[styles.statusChip, { backgroundColor: st.color }]}>
          <Text style={styles.statusChipText}>{st.label}</Text>
        </View>
      </Pressable>
    );
  };

  const listData: any[] = ['header', 'pending', 'title', ...records];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <MainHeader title="NAF" subtitle={`${t('caseta').toUpperCase()}: REGISTRO DE MOVIMIENTOS`} />

      <FlatList
        data={listData}
        renderItem={renderItem}
        keyExtractor={(item, index) => typeof item === 'string' ? item : item.id}
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brandPrimary} />}
        ListEmptyComponent={!loading ? (
          <View style={styles.emptyBox}>
            <Ionicons name="car-outline" size={48} color={colors.muted} />
            <Text style={styles.emptyText}>{t('sin_vehiculos')}</Text>
          </View>
        ) : null}
        initialNumToRender={10}
      />
    </SafeAreaView>
  );
}


const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  container: { padding: spacing.md },
  actionCard: {
    backgroundColor: colors.brandSecondary,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    padding: spacing.md,
    marginBottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 80,
  },
  activityCard: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    padding: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitleText: { fontSize: 16, fontWeight: '900', color: colors.onSurface },
  cardSubText: { fontSize: 13, color: colors.muted, marginTop: 2 },
  cardMetaText: { fontSize: 10, color: colors.muted, marginTop: 4 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.onSurfaceTertiary,
    letterSpacing: 1.5,
    marginBottom: spacing.md,
    marginLeft: 4,
    marginTop: spacing.md,
    textTransform: 'uppercase',
  },
  statusChip: { paddingHorizontal: spacing.sm, paddingVertical: 4 },
  statusChipText: { color: '#FFF', fontWeight: '900', fontSize: 10, letterSpacing: 1 },
  miniStatusBadge: { paddingHorizontal: 8, paddingVertical: 4 },
  miniStatusText: { color: '#FFF', fontSize: 9, fontWeight: '900' },
  pendingSection: { marginBottom: spacing.sm },
  emptyBox: { alignItems: 'center', padding: spacing.xxxl, marginTop: spacing.xl },
  emptyText: { fontWeight: '700', color: colors.muted, marginTop: spacing.md },
});

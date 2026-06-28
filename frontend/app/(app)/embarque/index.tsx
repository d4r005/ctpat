import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { apiCall } from '@/src/api/client';
import { useAuth } from '@/src/context/AuthContext';
import { useInspections } from '@/src/context/InspectionContext';
import { colors, spacing } from '@/src/constants/theme';
import ProcessTracker from '@/src/components/ProcessTracker';
import MainHeader from '@/src/components/MainHeader';

export default function Embarque() {
  const { token } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const { refresh: refreshInspections } = useInspections();
  const [tickets, setTickets] = useState<any[]>([]);
  const [vehicleRecords, setVehicleRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [ticketsData, recordsData] = await Promise.all([
        apiCall<any[]>('/shipping-tickets', { token }),
        apiCall<any[]>('/vehicle-records', { token })
      ]);
      setTickets(Array.isArray(ticketsData) ? ticketsData : []);
      setVehicleRecords(Array.isArray(recordsData) ? recordsData : []);
      await refreshInspections();
    } catch (e) {
      console.error(e);
    } finally { setLoading(false); }
  }, [token, refreshInspections]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const renderItem = ({ item }: { item: any }) => {
    if (item === 'header') {
      return (
        <Pressable style={styles.actionCard} onPress={() => router.push('/embarque/nuevo')}>
          <View style={[styles.iconCircle, { backgroundColor: colors.brandSecondary }]}><Ionicons name="add" size={28} color="#FFF" /></View>
          <View style={{ flex: 1, marginLeft: spacing.md }}><Text style={styles.cardTitleText}>{t('nuevo_ticket_embarque')}</Text><Text style={styles.cardSubText}>{t('registrar_carga')}</Text></View>
          <Ionicons name="chevron-forward" size={24} color={colors.muted} />
        </Pressable>
      );
    }

    const normalize = (s: string) => s?.replace(/[^A-Z0-9]/g, '').toUpperCase() || '';
    const ticketPlates = normalize(item.placas_unidad);

    const relatedRecord = vehicleRecords.find(r => normalize(r.entry?.placas_unidad) === ticketPlates);

    const steps = {
      entry: !!relatedRecord,
      inspection: !!(relatedRecord?.inspection_id || relatedRecord?.inspection_ids?.length || relatedRecord?.status === 'inspeccionado'),
      shipping: true,
      exit: relatedRecord?.status === 'salida'
    };

    return (
      <Pressable style={styles.activityCard} onPress={() => router.push(`/embarque/${item.id}`)}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitleText}>{item.cliente}</Text>
          <Text style={styles.cardSubText}>{item.operador} · {item.placas_unidad}</Text>
          <View style={{ marginVertical: 6 }}>
            <ProcessTracker steps={steps} compact />
          </View>
          <Text style={styles.cardMetaText}>{new Date(item.created_at).toLocaleString()}</Text>
        </View>
        <Ionicons name="chevron-forward" size={24} color={colors.muted} />
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <MainHeader title="NAF" subtitle={t('tickets_embarque').toUpperCase()} />
      <FlatList
        data={['header', ...tickets]}
        renderItem={renderItem}
        keyExtractor={(item) => typeof item === 'string' ? item : item.id}
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brandPrimary} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  container: { padding: spacing.md, paddingBottom: 100 },
  actionCard: { backgroundColor: colors.brandSecondary, borderWidth: 2, borderColor: colors.borderStrong, padding: spacing.md, marginBottom: spacing.lg, flexDirection: 'row', alignItems: 'center' },
  activityCard: { backgroundColor: colors.surfaceSecondary, borderWidth: 2, borderColor: colors.borderStrong, padding: spacing.md, marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center' },
  iconCircle: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  cardTitleText: { fontSize: 16, fontWeight: '900', color: colors.onSurface },
  cardSubText: { fontSize: 13, color: colors.muted, marginTop: 2 },
  cardMetaText: { fontSize: 10, color: colors.muted, marginTop: 4 },
});

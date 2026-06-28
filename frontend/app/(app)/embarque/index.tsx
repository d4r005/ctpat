import React, { useCallback, useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl, ActivityIndicator, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { apiCall } from '@/src/api/client';
import { useAuth } from '@/src/context/AuthContext';
import { useInspections, Inspection } from '@/src/context/InspectionContext';
import { colors, spacing, typography } from '@/src/constants/theme';
import ProcessTracker from '@/src/components/ProcessTracker';

interface Ticket {
  id: string;
  almacenista: string;
  cliente: string;
  operador: string;
  placas_unidad: string;
  numero_caja: string;
  numero_sello: string;
  fecha: string;
  created_at: string;
}

import MainHeader from '@/src/components/MainHeader';

export default function Embarque() {
  const { token, user } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const { refresh: refreshInspections } = useInspections();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [vehicleRecords, setVehicleRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [ticketsData, recordsData] = await Promise.all([
        apiCall<Ticket[]>('/shipping-tickets', { token }),
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

  const pendingTicketsFromRecords = useMemo(() => {
    const normalize = (s: string) => s?.replace(/[^A-Z0-9]/g, '').toUpperCase() || '';

    return vehicleRecords.filter(r => {
      if (r.status === 'salida') return false;
      const isFull = r.entry?.tipo_unidad === 'full';
      const isDescarga = r.entry?.condicion_carga === 'descarga';
      if (isFull || isDescarga) return false;

      const hasInspection = !!r.inspection_id || (r.inspection_ids && r.inspection_ids.length > 0) || r.status === 'inspeccionado';
      const plates = normalize(r.entry?.placas_unidad);
      if (!plates) return false;
      const hasTicket = tickets.some(t => {
        const samePlates = normalize(t.placas_unidad) === plates;
        const isRecent = new Date(t.created_at).getTime() >= new Date(r.created_at).getTime();
        return samePlates && isRecent;
      });
      return hasInspection && !hasTicket;
    });
  }, [vehicleRecords, tickets]);

  const pendingExits = useMemo(() => {
    const normalize = (s: string) => s?.replace(/[^A-Z0-9]/g, '').toUpperCase() || '';

    return vehicleRecords.filter(r => {
      if (r.status === 'salida') return false;
      const plates = normalize(r.entry?.placas_unidad);
      if (!plates) return false;

      const isFull = r.entry?.tipo_unidad === 'full';
      const isDescarga = r.entry?.condicion_carga === 'descarga';

      if (isFull || isDescarga) {
        const doneIds = Array.isArray(r.inspection_ids) ? r.inspection_ids : (r.inspection_id ? [r.inspection_id] : []);
        if (isFull) return doneIds.length >= 2;
        return doneIds.length >= 1;
      }

      const hasTicket = tickets.some(t => {
        const samePlates = normalize(t.placas_unidad) === plates;
        const isRecent = new Date(t.created_at).getTime() >= new Date(r.created_at).getTime();
        return samePlates && isRecent;
      });
      return hasTicket;
    });
  }, [vehicleRecords, tickets]);

  const renderItem = ({ item }: { item: any }) => {
    if (typeof item === 'string') {
      if (item === 'header') {
        return (
          <Pressable
            testID="embarque-new-btn"
            style={styles.actionCard}
            onPress={() => router.push('/embarque/nuevo')}
          >
            <View style={[styles.iconCircle, { backgroundColor: colors.brandSecondary }]}>
              <Ionicons name="add" size={28} color="#FFF" />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={styles.cardTitleText}>{t('nuevo_ticket_embarque')}</Text>
              <Text style={styles.cardSubText}>{t('registrar_carga')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color={colors.muted} />
          </Pressable>
        );
      }

      if (item === 'pending-tickets') {
        if (pendingTicketsFromRecords.length === 0) return null;
        return (
          <View style={styles.pendingSection}>
            <Text style={styles.sectionTitle}>{t('pendientes_ticket', 'INSPECCIONES PENDIENTES DE TICKET')}</Text>
            {pendingTicketsFromRecords.map((r) => (
              <Pressable
                key={r.id}
                style={[styles.activityCard, { borderLeftWidth: 4, borderLeftColor: colors.warning }]}
                onPress={() => {
                  const params = new URLSearchParams({
                    record_id: r.id,
                    inspection_id: r.inspection_id || (r.inspection_ids ? r.inspection_ids[0] : ''),
                    compania: r.entry.compania_transporte,
                    placas: r.entry.placas_unidad,
                    trailer: r.entry.numero_caja,
                    sello: r.entry.sello_entrada !== 'N/A' ? r.entry.sello_entrada : '',
                    operador: r.entry.chofer_nombre,
                    destino: r.entry.destino || '',
                    economico: r.entry.numero_tractor || '',
                    hora_llegada: r.entry.fecha_entrada ? new Date(r.entry.fecha_entrada).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
                  });
                  router.push(`/embarque/nuevo?${params.toString()}`);
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitleText}>{r.entry.placas_unidad}</Text>
                  <Text style={styles.cardSubText}>{r.entry.chofer_nombre} · {r.entry.compania_transporte}</Text>
                  <View style={{ marginTop: 4 }}>
                    <ProcessTracker steps={{ entry: true, inspection: true, shipping: false, exit: false }} compact showShipping={true} />
                  </View>
                </View>
                <View style={[styles.miniStatusBadge, { backgroundColor: colors.warning }]}>
                  <Text style={styles.miniStatusText}>{t('generar').toUpperCase()}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        );
      }

      if (item === 'tickets-title') {
        return <Text style={styles.sectionTitle}>{t('tickets_recientes')}</Text>;
      }

      if (item === 'pending-exits') {
        if (pendingExits.length === 0) return null;
        return (
          <View style={[styles.pendingSection, { marginTop: spacing.xl }]}>
            <Text style={styles.sectionTitle}>{t('unidades_listas_salida')}</Text>
            {pendingExits.map((r) => {
              const isFull = r.entry?.tipo_unidad === 'full';
              const isDescarga = r.entry?.condicion_carga === 'descarga';
              const showShipping = !isFull && !isDescarga;

              return (
                <Pressable
                  key={r.id}
                  style={[styles.activityCard, { borderLeftWidth: 4, borderLeftColor: colors.success }]}
                  onPress={() => router.push(`/caseta/${r.id}`)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitleText}>{r.entry.placas_unidad} {isFull ? '(FULL)' : ''}</Text>
                    <Text style={styles.cardSubText}>{r.entry.chofer_nombre} · {r.entry.compania_transporte}</Text>
                    <View style={{ marginTop: 4 }}>
                      <ProcessTracker
                        steps={{
                            entry: true,
                            inspection: (r.inspection_ids?.length || (r.inspection_id ? 1 : 0)) > 0,
                            shipping: !!r.has_shipping_ticket,
                            exit: false
                        }}
                        compact
                        showShipping={showShipping}
                      />
                    </View>
                  </View>
                  <View style={[styles.miniStatusBadge, { backgroundColor: colors.success }]}>
                    <Text style={styles.miniStatusText}>{t('dar_salida').toUpperCase()}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        );
      }
      return null;
    }

    const normalize = (s: string) => s?.replace(/[^A-Z0-9]/g, '').toUpperCase() || '';
    const ticketPlates = normalize(item.placas_unidad);

    const relatedRecord = vehicleRecords.find(r => {
      const recordPlates = normalize(r.entry?.placas_unidad);
      return recordPlates === ticketPlates &&
             new Date(r.created_at).getTime() <= new Date(item.created_at).getTime();
    });

    const steps = {
      entry: !!relatedRecord,
      inspection: !!(relatedRecord?.inspection_id || (relatedRecord?.inspection_ids && relatedRecord.inspection_ids.length > 0) || relatedRecord?.status === 'inspeccionado'),
      shipping: true,
      exit: relatedRecord?.status === 'salida'
    };

    return (
      <Pressable
        key={item.id}
        testID={`embarque-item-${item.id}`}
        style={styles.activityCard}
        onPress={() => router.push(`/embarque/${item.id}`)}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitleText}>{item.cliente || t('sin_cliente')}</Text>
          <Text style={styles.cardSubText}>{item.operador} · {item.placas_unidad}</Text>
          <View style={{ marginVertical: 6 }}>
            <ProcessTracker steps={steps} compact />
          </View>
          <Text style={styles.cardMetaText}>{new Date(item.fecha || item.created_at).toLocaleString()}</Text>
        </View>
        <Ionicons name="chevron-forward" size={24} color={colors.muted} />
      </Pressable>
    );
  };

  const listData = ['header', 'pending-tickets', 'tickets-title', ...tickets, 'pending-exits'];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <MainHeader title="NAF" subtitle={`${t('tickets_embarque').toUpperCase()}: ${t('despacho_carga').toUpperCase()}`} />

      <FlatList
        data={listData}
        renderItem={renderItem}
        keyExtractor={(item, index) => typeof item === 'string' ? item : item.id}
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brandPrimary} />}
        ListEmptyComponent={!loading ? (
          <View style={styles.emptyBox}>
            <Ionicons name="cube-outline" size={48} color={colors.muted} />
            <Text style={styles.emptyText}>{t('sin_tickets')}</Text>
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
  miniStatusBadge: { paddingHorizontal: 8, paddingVertical: 4 },
  miniStatusText: { color: '#FFF', fontSize: 9, fontWeight: '900' },
  pendingSection: { marginBottom: spacing.sm },
  emptyBox: { alignItems: 'center', padding: spacing.xxxl, marginTop: spacing.xl },
  emptyText: { fontWeight: '700', color: colors.muted, marginTop: spacing.md },
});

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

export default function Embarque() {
  const { token, user } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const { inspections, allInspections, refresh: refreshInspections } = useInspections();
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
      setTickets(ticketsData);
      setVehicleRecords(recordsData);
      await refreshInspections();
    } catch {} finally { setLoading(false); }
  }, [token, refreshInspections]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pendingTicketsFromRecords = useMemo(() => {
    // Records that are 'inspeccionado' or have an inspection_id but NO ticket yet
    return vehicleRecords.filter(r => {
      if (r.status === 'salida') return false;
      const hasInspection = !!r.inspection_id || r.status === 'inspeccionado';
      const plates = r.entry.placas_unidad?.trim().toUpperCase();
      // Only count tickets created AFTER the vehicle entry
      const hasTicket = tickets.some(t => {
        const samePlates = t.placas_unidad?.trim().toUpperCase() === plates;
        const isRecent = new Date(t.created_at).getTime() >= new Date(r.created_at).getTime();
        return samePlates && isRecent;
      });
      return hasInspection && !hasTicket;
    });
  }, [vehicleRecords, tickets]);

  const pendingExits = useMemo(() => {
    // Records that already have a ticket but are not yet 'salida'
    return vehicleRecords.filter(r => {
      if (r.status === 'salida') return false;
      const plates = r.entry.placas_unidad?.trim().toUpperCase();
      const hasTicket = tickets.some(t => {
        const samePlates = t.placas_unidad?.trim().toUpperCase() === plates;
        const isRecent = new Date(t.created_at).getTime() >= new Date(r.created_at).getTime();
        return samePlates && isRecent;
      });
      return hasTicket;
    });
  }, [vehicleRecords, tickets]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']} testID="embarque-screen">
      <View style={styles.header}>
        <Text style={styles.title}>{t('tickets_embarque')}</Text>
        <Text style={styles.subtitle}>{t('embarque_subtitle')}</Text>
      </View>

      <Pressable testID="embarque-new-btn" style={styles.fab} onPress={() => router.push('/embarque/nuevo')}>
        <Ionicons name="add-circle" size={32} color={colors.onBrandSecondary} />
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={styles.fabTitle}>{t('nuevo_ticket_embarque')}</Text>
          <Text style={styles.fabSub}>{t('registrar_carga')}</Text>
        </View>
        <Ionicons name="arrow-forward" size={24} color={colors.onBrandSecondary} />
      </Pressable>

      <FlatList
        data={tickets}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brandPrimary} />}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        ListHeaderComponent={
          <>
            {pendingTicketsFromRecords.length > 0 && (
              <View style={styles.pendingSection}>
                <Text style={styles.sectionTitle}>{t('pendientes_ticket', 'INSPECCIONES PENDIENTES DE TICKET')}</Text>
                {pendingTicketsFromRecords.map((r) => (
                  <Pressable
                    key={r.id}
                    style={styles.pendingCard}
                    onPress={() => {
                      const params = new URLSearchParams({
                        record_id: r.id,
                        inspection_id: r.inspection_id || '',
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
                      <Text style={styles.pendingTitle}>{r.entry.placas_unidad}</Text>
                      <Text style={styles.pendingSub}>{r.entry.chofer_nombre} · {r.entry.compania_transporte}</Text>
                    </View>
                    <View style={styles.pendingBtn}>
                      <Text style={styles.pendingBtnText}>{t('generar', 'GENERAR')}</Text>
                    </View>
                  </Pressable>
                ))}
                <View style={{ height: spacing.xl }} />
              </View>
            )}
            {tickets.length > 0 ? <Text style={styles.sectionTitle}>{t('tickets_recientes')}</Text> : null}
          </>
        }
        ListFooterComponent={
          pendingExits.length > 0 ? (
            <View style={[styles.pendingSection, { marginTop: spacing.xl }]}>
              <Text style={styles.sectionTitle}>UNIDADES LISTAS PARA SALIDA</Text>
              {pendingExits.map((r) => (
                <Pressable
                  key={r.id}
                  style={[styles.pendingCard, { backgroundColor: colors.success }]}
                  onPress={() => router.push(`/caseta/${r.id}`)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.pendingTitle, { color: '#FFF' }]}>{r.entry.placas_unidad}</Text>
                    <Text style={[styles.pendingSub, { color: '#FFF' }]}>{r.entry.chofer_nombre} · {r.entry.compania_transporte}</Text>
                  </View>
                  <View style={[styles.pendingBtn, { backgroundColor: '#FFF' }]}>
                    <Text style={[styles.pendingBtnText, { color: colors.success }]}>DAR SALIDA</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null
        }
        ListEmptyComponent={loading ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} /> : (
          <View style={styles.empty}>
            <Ionicons name="cube-outline" size={48} color={colors.muted} />
            <Text style={styles.emptyText}>{t('sin_tickets')}</Text>
          </View>
        )}
        renderItem={({ item }) => {
          const relatedRecord = vehicleRecords.find(r =>
            r.entry.placas_unidad?.trim().toUpperCase() === item.placas_unidad?.trim().toUpperCase() &&
            new Date(r.created_at).getTime() <= new Date(item.created_at).getTime()
          );

          const steps = {
            entry: !!relatedRecord,
            inspection: !!(relatedRecord?.inspection_id || relatedRecord?.status === 'inspeccionado'),
            shipping: true,
            exit: relatedRecord?.status === 'salida'
          };

          return (
            <Pressable testID={`embarque-item-${item.id}`} style={styles.row} onPress={() => router.push(`/embarque/${item.id}`)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.cliente || t('sin_cliente')}</Text>
                <Text style={styles.rowSub}>{item.operador} · {item.placas_unidad}</Text>
                <ProcessTracker steps={steps} compact />
                <Text style={styles.rowDate}>{new Date(item.fecha || item.created_at).toLocaleString()}</Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color={colors.muted} />
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { padding: spacing.lg, backgroundColor: colors.surfaceSecondary, borderBottomWidth: 2, borderBottomColor: colors.borderStrong },
  title: { fontSize: typography.sizes.xxl, fontWeight: '900', color: colors.onSurface },
  subtitle: { color: colors.muted, marginTop: 2 },
  fab: { backgroundColor: colors.brandSecondary, padding: spacing.lg, margin: spacing.lg, flexDirection: 'row', alignItems: 'center', minHeight: 80 },
  fabTitle: { color: colors.onBrandSecondary, fontWeight: '900', fontSize: typography.sizes.base, letterSpacing: 1 },
  fabSub: { color: colors.onBrandSecondary, fontSize: typography.sizes.sm, opacity: 0.8, marginTop: 2 },
  sectionTitle: { fontSize: 11, fontWeight: '900', color: colors.onSurfaceTertiary, letterSpacing: 1.5, marginBottom: spacing.md },
  empty: { alignItems: 'center', padding: spacing.xxxl, marginTop: spacing.xl },
  emptyText: { color: colors.muted, marginTop: spacing.md, fontWeight: '700' },
  row: { backgroundColor: colors.surfaceSecondary, borderWidth: 2, borderColor: colors.borderStrong, padding: spacing.md, marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center' },
  rowTitle: { fontWeight: '900', fontSize: typography.sizes.lg, color: colors.onSurface },
  rowSub: { color: colors.muted, fontSize: typography.sizes.sm, marginTop: 2 },
  rowMeta: { color: colors.onSurfaceTertiary, fontSize: typography.sizes.sm, marginTop: 2 },
  rowDate: { color: colors.muted, fontSize: 11, marginTop: 4 },
  pendingSection: { marginBottom: spacing.sm },
  pendingCard: {
    backgroundColor: colors.brandSecondary,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  pendingTitle: { fontWeight: '900', fontSize: typography.sizes.lg, color: colors.onBrandSecondary },
  pendingSub: { color: colors.onBrandSecondary, opacity: 0.8, fontSize: typography.sizes.sm },
  pendingBtn: { backgroundColor: colors.onBrandSecondary, paddingHorizontal: spacing.md, paddingVertical: 6 },
  pendingBtnText: { color: colors.brandSecondary, fontWeight: '900', fontSize: 10 },
});

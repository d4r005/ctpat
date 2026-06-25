import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput, RefreshControl, Platform,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { useTranslation } from 'react-i18next';
import { useInspections, Inspection } from '@/src/context/InspectionContext';
import { useAuth } from '@/src/context/AuthContext';
import { apiCall } from '@/src/api/client';
import { colors, spacing, typography } from '@/src/constants/theme';
import { generateConsolidatedReportHtml } from '@/src/utils/reportGenerator';
import ProcessTracker from '@/src/components/ProcessTracker';
import MainHeader from '@/src/components/MainHeader';

type TabType = 'caseta' | 'inspeccion' | 'embarque';

export default function Supervisor() {
  const { user, token, loading: authLoading } = useAuth();
  const userEmail = user?.email?.toLowerCase().trim() || '';

  // ACCESO MAESTRO TOTAL
  const isMaster = userEmail.includes('d.trujillo') || userEmail.includes('d4r005') || user?.role === 'admin';
  const isSupervisor = user?.role === 'supervisor' || isMaster;
  const isAdmin = isMaster;

  const router = useRouter();
  const { allInspections, refreshAll: refreshInspections, loading: inspLoading } = useInspections();
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<TabType>('caseta');
  const [allRecords, setAllRecords] = useState<any[]>([]);
  const [allTickets, setAllTickets] = useState<any[]>([]);
  const [loadingExtra, setLoadingExtra] = useState(false);

  const [query, setQuery] = useState('');
  const [reportLoading, setReportLoading] = useState<string | null>(null);
  const [emailLoading, setEmailLoading] = useState<string | null>(null);

  const fetchAllData = useCallback(async () => {
    if (!token || !isSupervisor) return;
    setLoadingExtra(true);
    try {
      const [r, t] = await Promise.all([
        apiCall<any[]>('/vehicle-records', { token }),
        apiCall<any[]>('/shipping-tickets', { token }),
      ]);
      setAllRecords(Array.isArray(r) ? r : []);
      setAllTickets(Array.isArray(t) ? t : []);
      await refreshInspections();
    } catch (e) {
      console.error("Error fetching master data", e);
    } finally {
      setLoadingExtra(false);
    }
  }, [token, isSupervisor, refreshInspections]);

  useEffect(() => {
    if (isSupervisor) fetchAllData();
  }, [isSupervisor, fetchAllData]);

  if (authLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.surface }}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }

  if (!isSupervisor) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Ionicons name="lock-closed" size={48} color={colors.muted} />
          <Text style={styles.lockText}>{t('acceso_restringido')}</Text>
          <Text style={{ color: colors.muted, fontSize: 10, marginTop: 10 }}>USUARIO: {userEmail}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleDownloadPdf = async (recordId: string, plates: string) => {
    setReportLoading(recordId);
    try {
      let record = allRecords.find(r => r.id === recordId);
      const cleanPlates = plates.trim().toUpperCase();
      const normalize = (s: string) => s?.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || '';
      const normPlates = normalize(cleanPlates);

      let insp = allInspections.find(i =>
        (record?.inspection_id && i.id === record.inspection_id) ||
        (normalize(i.placas_unidad) === normPlates) ||
        (normalize(i.numero_trailer) === normPlates)
      );

      let ticket = allTickets.find(t => normalize(t.placas_unidad) === normPlates);

      if (!insp) {
          throw new Error('No se encontró inspección digital vinculada. Verifique que las placas coincidan.');
      }

      const [fullInsp, fullRecord, fullTicket] = await Promise.all([
        apiCall<Inspection>(`/inspections/${insp.id}`, { token }),
        apiCall<any>(`/vehicle-records/${recordId}`, { token }),
        ticket ? apiCall<any>(`/shipping-tickets/${ticket.id}`, { token }) : Promise.resolve(null)
      ]);

      const html = generateConsolidatedReportHtml({
        inspection: fullInsp || insp,
        caseta: fullRecord || record,
        embarque: fullTicket || ticket
      }, 'es');

      if (Platform.OS === 'web') {
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(html);
          win.document.close();
          setTimeout(() => { win.print(); }, 800);
        } else {
          alert('El bloqueador de ventanas impidió abrir el reporte.');
        }
      } else {
        const { uri } = await Print.printToFileAsync({ html, base64: false });
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Reporte Consolidado' });
      }
    } catch (e: any) {
      alert(e.message || 'Error al generar reporte');
    } finally {
      setReportLoading(null);
    }
  };

  const handleSendEmail = async (recordId: string) => {
    setEmailLoading(recordId);
    try {
      const res = await apiCall(`/vehicle-records/${recordId}/send-report`, {
        method: 'POST',
        token,
        body: { }
      });
      alert(res.message || 'Reporte enviado exitosamente');
    } catch (e: any) {
      alert(e.message || 'Error al enviar correo');
    } finally {
      setEmailLoading(null);
    }
  };

  const [linkingMode, setLinkingMode] = useState(false);

  const orphanInspections = useMemo(() => {
    return allInspections.filter(i => {
      return !allRecords.some(r => r.inspection_id === i.id || r.entry.placas_unidad === i.placas_unidad);
    });
  }, [allInspections, allRecords]);

  const orphanRecords = useMemo(() => {
    return allRecords.filter(r => !r.inspection_id);
  }, [allRecords]);

  const handleLink = async (recordId: string, inspectionId: string) => {
    try {
      await apiCall(`/vehicle-records/${recordId}/link-inspection?inspection_id=${inspectionId}`, { method: 'PATCH', token });
      alert('Vínculo creado exitosamente');
      fetchAllData();
    } catch (e: any) { alert(e.message); }
  };

  const filteredData = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (activeTab === 'caseta') {
      return allRecords.filter(r => r.entry.placas_unidad.toLowerCase().includes(q) || r.entry.chofer_nombre.toLowerCase().includes(q));
    } else if (activeTab === 'inspeccion') {
      const pendingRecords = orphanRecords.map(r => ({ ...r, _is_pending_insp: true }));
      const combined = [...pendingRecords, ...allInspections];
      const filtered = combined.filter(i => {
        const plates = (i as any)._is_pending_insp ? (i as any).entry.placas_unidad : (i as any).placas_unidad;
        const name = (i as any)._is_pending_insp ? (i as any).entry.chofer_nombre : (i as any).inspector_nombre;
        return (plates?.toLowerCase() || "").includes(q) || (name?.toLowerCase() || "").includes(q);
      });
      return filtered.sort((a, b) => {
        const dateA = new Date((a as any).created_at || (a as any).entry?.fecha_entrada || 0).getTime();
        const dateB = new Date((b as any).created_at || (b as any).entry?.fecha_entrada || 0).getTime();
        return dateB - dateA;
      });
    } else {
      return allTickets.filter(t => t.placas_unidad.toLowerCase().includes(q) || t.cliente.toLowerCase().includes(q));
    }
  }, [activeTab, query, allRecords, allInspections, allTickets, orphanRecords]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <MainHeader title="SRIUC" subtitle="PANEL DE CONTROL MAESTRO" />

      <View style={styles.header}>
        <View style={styles.masterContainer}>
          <Text style={styles.sectionTitleLocal}>HERRAMIENTAS DE ADMINISTRACIÓN</Text>
          <View style={styles.adminRow}>
            <ToolBtn icon="car" label="ENTRADA" onPress={() => router.push('/caseta/nuevo')} />
            <ToolBtn icon="clipboard" label="INSPECCIÓN" onPress={() => router.push('/nueva')} />
            <ToolBtn icon="cube" label="EMBARQUE" onPress={() => router.push('/embarque/nuevo')} />
            <ToolBtn icon="exit" label="SALIDA" onPress={() => router.push('/caseta')} color={colors.success} />
            <ToolBtn icon="link" label="VÍNCULOS" onPress={() => setLinkingMode(!linkingMode)} color={colors.info} />
            {isAdmin && (
              <>
                <ToolBtn icon="people" label="USUARIOS" onPress={() => router.push('/usuarios')} color={colors.brandPrimary} />
                <ToolBtn icon="stats-chart" label="KPIs" onPress={() => router.push('/analitica')} color="#7c3aed" />
              </>
            )}
          </View>
        </View>

        {linkingMode && (
          <View style={styles.linkingBox}>
            <Text style={styles.linkingTitle}>VINCULACIÓN DE REGISTROS HUÉRFANOS</Text>
            {orphanRecords.length === 0 ? (
              <Text style={styles.emptyLinkText}>No hay registros de caseta sin inspección vinculada.</Text>
            ) : (
              orphanRecords.map(r => {
                const match = orphanInspections.find(i => i.placas_unidad === r.entry.placas_unidad);
                return (
                  <View key={r.id} style={styles.linkingItem}>
                    <Text style={styles.linkingItemText}>{r.entry.placas_unidad} · {r.entry.chofer_nombre}</Text>
                    {match ? (
                      <Pressable style={styles.linkActionBtn} onPress={() => handleLink(r.id, match.id)}>
                        <Text style={styles.linkActionText}>VINCULAR CON INSP: {match.id.slice(0,5)}</Text>
                      </Pressable>
                    ) : (
                      <Text style={styles.noMatchText}>SIN INSP. ENCONTRADA</Text>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}

        <View style={styles.tabRow}>
          <TabItem label="CASETA" active={activeTab === 'caseta'} onPress={() => setActiveTab('caseta')} icon="business" />
          <TabItem label="INSPECCIÓN" active={activeTab === 'inspeccion'} onPress={() => setActiveTab('inspeccion')} icon="clipboard" />
          <TabItem label="EMBARQUE" active={activeTab === 'embarque'} onPress={() => setActiveTab('embarque')} icon="cube" />
        </View>

        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder={t('buscar_placeholder')}
            placeholderTextColor={colors.muted}
            value={query}
            onChangeText={setQuery}
          />
          <Ionicons name="search" size={20} color={colors.muted} />
        </View>
      </View>

      <FlatList
        data={filteredData}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        refreshControl={<RefreshControl refreshing={loadingExtra || inspLoading} onRefresh={fetchAllData} tintColor={colors.brandPrimary} />}
        renderItem={({ item }) => {
          if (activeTab === 'caseta') return (
            <RecordRow
              item={item}
              onEdit={() => router.push(`/caseta/${item.id}`)}
              onPdf={() => handleDownloadPdf(item.id, item.entry.placas_unidad)}
              onEmail={() => handleSendEmail(item.id)}
              loadingPdf={reportLoading === item.id}
              loadingEmail={emailLoading === item.id}
            />
          );
          if (activeTab === 'inspeccion') {
            if ((item as any)._is_pending_insp) {
              return (
                <View style={[styles.activityCard, { borderLeftWidth: 4, borderLeftColor: colors.warning }]}>
                   <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitleText}>{(item as any).entry.placas_unidad} · {(item as any).entry.chofer_nombre}</Text>
                    <Text style={[styles.cardSubText, { color: colors.warning, fontWeight: '900' }]}>⚠️ INSPECCIÓN PENDIENTE</Text>
                    <View style={{ marginVertical: 8 }}>
                      <ProcessTracker steps={{ entry: true, inspection: false, shipping: !!(item as any).has_shipping_ticket, exit: false }} compact />
                    </View>
                    <Pressable
                      onPress={() => {
                        const params = new URLSearchParams({
                          record_id: item.id,
                          compania: (item as any).entry.compania_transporte || '',
                          placas: (item as any).entry.placas_unidad || '',
                          trailer: (item as any).entry.numero_caja || '',
                          sello: (item as any).entry.sello_entrada || '',
                        });
                        router.push(`/(app)/nueva?${params.toString()}`);
                      }}
                      style={styles.pendingActionBtn}
                    >
                      <Ionicons name="clipboard-outline" size={16} color={colors.warning} />
                      <Text style={styles.pendingActionText}>REALIZAR INSPECCIÓN AHORA</Text>
                    </Pressable>
                  </View>
                </View>
              );
            }
            return (
              <InspectionRow
                item={item}
                onEdit={() => router.push(`/inspection/${item.id}?edit=true`)}
                t={t}
                records={allRecords}
                tickets={allTickets}
              />
            );
          }
          return (
            <TicketRow
              item={item}
              onEdit={() => router.push(`/embarque/${item.id}`)}
              records={allRecords}
            />
          );
        }}
        ListEmptyComponent={<View style={styles.emptyBox}><Text style={styles.emptyText}>No hay registros para mostrar</Text></View>}
      />
    </SafeAreaView>
  );
}

function ToolBtn({ icon, label, onPress, color }: any) {
  return (
    <Pressable style={[styles.toolBtn, color && { borderBottomColor: color, borderBottomWidth: 3 }]} onPress={onPress}>
      <Ionicons name={icon} size={16} color={color || colors.onSurface} />
      <Text style={[styles.toolLabel, color && { color }]}>{label}</Text>
    </Pressable>
  );
}

function TabItem({ label, active, onPress, icon }: any) {
  return (
    <Pressable onPress={onPress} style={[styles.tab, active && styles.tabActive]}>
      <Ionicons name={icon} size={18} color={active ? colors.onBrandPrimary : colors.muted} />
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function RecordRow({ item, onEdit, onPdf, onEmail, loadingPdf, loadingEmail }: any) {
  const e = item.entry;
  const statusColor = item.status === 'salida' ? colors.success : item.status === 'inspeccionado' ? colors.info : colors.warning;

  const steps = {
    entry: true,
    inspection: !!item.inspection_id || item.status === 'inspeccionado',
    shipping: !!item.has_shipping_ticket,
    exit: item.status === 'salida'
  };

  return (
    <View style={styles.activityCard}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <Text style={styles.cardTitleText}>{e.placas_unidad}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={styles.statusBadgeText}>{item.status.toUpperCase()}</Text>
          </View>
        </View>
        <Text style={styles.cardSubText}>{e.chofer_nombre} · {e.compania_transporte}</Text>
        <View style={{ marginVertical: 8 }}>
          <ProcessTracker steps={steps} compact />
        </View>
        <View style={styles.actionRow}>
          <Pressable onPress={onEdit} style={styles.miniActionBtn}>
            <Ionicons name="create-outline" size={14} color={colors.brandPrimary} />
            <Text style={styles.miniActionText}>EDITOR</Text>
          </Pressable>
          <Pressable onPress={onPdf} style={[styles.miniActionBtn, styles.primaryMiniBtn]} disabled={loadingPdf}>
            {loadingPdf ? <ActivityIndicator size={14} color="#FFF" /> : <Ionicons name="eye-outline" size={14} color="#FFF" />}
            <Text style={[styles.miniActionText, { color: '#FFF' }]}>REPORTE PDF</Text>
          </Pressable>
          <Pressable onPress={onEmail} style={styles.miniActionBtn} disabled={loadingEmail}>
            {loadingEmail ? <ActivityIndicator size={14} color={colors.brandPrimary} /> : <Ionicons name="mail-outline" size={14} color={colors.brandPrimary} />}
            <Text style={styles.miniActionText}>CORREO</Text>
          </Pressable>
        </View>
        <Text style={styles.cardMetaText}>{new Date(e.fecha_entrada || item.created_at).toLocaleString()}</Text>
      </View>
    </View>
  );
}

function InspectionRow({ item, onEdit, t, records = [], tickets = [] }: any) {
  const statusColor = item.approval_status === 'aprobada' ? colors.success : item.approval_status === 'rechazada' ? colors.error : colors.warning;

  const relatedRecord = records.find((r: any) =>
    r.inspection_id === item.id ||
    r.entry?.placas_unidad?.trim().toUpperCase() === item.placas_unidad?.trim().toUpperCase()
  );

  const steps = {
    entry: !!relatedRecord,
    inspection: true,
    shipping: !!tickets.some((tick: any) => tick.placas_unidad?.trim().toUpperCase() === item.placas_unidad?.trim().toUpperCase()),
    exit: relatedRecord?.status === 'salida'
  };

  return (
    <View style={styles.activityCard}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <Text style={styles.cardTitleText}>{item.placas_unidad} · {item.numero_trailer}</Text>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <View style={[styles.statusBadge, { backgroundColor: item.status_general === 'bueno' ? colors.success : colors.error }]}>
              <Text style={styles.statusBadgeText}>{item.status_general === 'bueno' ? t('bueno') : t('falla')}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
              <Text style={styles.statusBadgeText}>{t(item.approval_status || 'pendiente').toUpperCase()}</Text>
            </View>
          </View>
        </View>
        <Text style={styles.cardSubText}>{item.inspector_nombre}</Text>
        <View style={{ marginVertical: 8 }}>
          <ProcessTracker steps={steps} compact />
        </View>
        <Pressable onPress={onEdit} style={styles.miniActionBtn}>
          <Ionicons name="create-outline" size={14} color={colors.brandPrimary} />
          <Text style={styles.miniActionText}>EDITAR INSPECCIÓN</Text>
        </Pressable>
        <Text style={styles.cardMetaText}>{new Date(item.created_at).toLocaleString()}</Text>
      </View>
    </View>
  );
}

function TicketRow({ item, onEdit, records = [] }: any) {
  const relatedRecord = records.find((r: any) =>
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
    <View style={styles.activityCard}>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitleText}>{item.placas_unidad} · {item.cliente}</Text>
        <Text style={styles.cardSubText}>{item.almacenista}</Text>
        <View style={{ marginVertical: 8 }}>
          <ProcessTracker steps={steps} compact />
        </View>
        <Pressable onPress={onEdit} style={styles.miniActionBtn}>
          <Ionicons name="create-outline" size={14} color={colors.brandPrimary} />
          <Text style={styles.miniActionText}>EDITAR TICKET</Text>
        </Pressable>
        <Text style={styles.cardMetaText}>{new Date(item.created_at).toLocaleString()}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  masterContainer: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    padding: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  sectionTitleLocal: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.onSurfaceTertiary,
    letterSpacing: 1.5,
    marginBottom: spacing.md,
  },
  adminRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  toolBtn: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
  },
  toolLabel: { fontSize: 10, fontWeight: '900', color: colors.onSurface, letterSpacing: 0.5 },
  linkingBox: {
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  linkingTitle: { fontSize: 10, fontWeight: '900', color: colors.onSurface, letterSpacing: 1, marginBottom: spacing.sm },
  emptyLinkText: { fontSize: 11, color: colors.muted, fontStyle: 'italic' },
  linkingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  linkingItemText: { fontSize: 11, fontWeight: '700', color: colors.onSurface },
  linkActionBtn: { backgroundColor: colors.success, paddingHorizontal: 8, paddingVertical: 4 },
  linkActionText: { fontSize: 9, color: '#FFF', fontWeight: '900' },
  noMatchText: { fontSize: 9, color: colors.error, fontWeight: '700' },
  tabRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 2,
    borderColor: colors.borderStrong,
  },
  tabActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  tabText: { fontWeight: '900', fontSize: 11, color: colors.muted, letterSpacing: 1 },
  tabTextActive: { color: colors.onBrandPrimary },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 12,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    marginBottom: spacing.sm,
  },
  searchInput: { flex: 1, height: 48, color: colors.onSurface, fontSize: 14, fontWeight: '700' },
  listContainer: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  activityCard: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardTitleText: { fontSize: 16, fontWeight: '900', color: colors.onSurface },
  cardSubText: { fontSize: 13, color: colors.muted, marginTop: 2 },
  cardMetaText: { fontSize: 10, color: colors.muted, marginTop: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4 },
  statusBadgeText: { color: '#FFF', fontWeight: '900', fontSize: 9, letterSpacing: 1 },
  actionRow: { flexDirection: 'row', gap: spacing.md, marginTop: 4 },
  miniActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  primaryMiniBtn: { backgroundColor: colors.brandPrimary, paddingHorizontal: 10 },
  miniActionText: { fontWeight: '900', fontSize: 10, color: colors.brandPrimary, letterSpacing: 0.5 },
  pendingActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.warning + '15',
    padding: 8,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  pendingActionText: { fontWeight: '900', fontSize: 11, color: colors.warning },
  emptyBox: { alignItems: 'center', padding: spacing.xxxl },
  emptyText: { color: colors.muted, fontWeight: '700' },
  lockText: { color: colors.muted, marginTop: spacing.md, fontWeight: '700' },
});

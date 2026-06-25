import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput, RefreshControl, Platform,
  useWindowDimensions, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import { useTranslation } from 'react-i18next';
import { useInspections, Inspection } from '@/src/context/InspectionContext';
import { useAuth } from '@/src/context/AuthContext';
import { apiCall } from '@/src/api/client';
import { colors, spacing, typography } from '@/src/constants/theme';
import { generateConsolidatedReportHtml } from '@/src/utils/reportGenerator';
import ProcessTracker from '@/src/components/ProcessTracker';

type TabType = 'caseta' | 'inspeccion' | 'embarque';

export default function Supervisor() {
  const { user, token, loading: authLoading } = useAuth();
  const userEmail = user?.email?.toLowerCase().trim() || '';

  // ACCESO MAESTRO TOTAL
  const isMaster = userEmail.includes('d.trujillo') || userEmail.includes('d4r005') || user?.role === 'admin';
  const isSupervisor = user?.role === 'supervisor' || isMaster;
  const isAdmin = isMaster;

  const router = useRouter();
  const { allInspections, refreshAll: refreshInspections, loading: inspLoading, exportCsvUrl, sendManualReport } = useInspections();
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<TabType>('caseta');
  const [allRecords, setAllRecords] = useState<any[]>([]);
  const [allTickets, setAllTickets] = useState<any[]>([]);
  const [loadingExtra, setLoadingExtra] = useState(false);

  const [query, setQuery] = useState('');
  const [reportLoading, setReportLoading] = useState<string | null>(null);
  const [emailLoading, setEmailLoading] = useState<string | null>(null);

  const fetchAllData = async () => {
    if (!token || !isSupervisor) return;
    setLoadingExtra(true);
    try {
      const [r, t, i] = await Promise.all([
        apiCall<any[]>('/vehicle-records', { token }),
        apiCall<any[]>('/shipping-tickets', { token }),
        refreshInspections()
      ]);
      setAllRecords(r);
      setAllTickets(t);
    } catch (e) {
      console.error("Error fetching master data", e);
    } finally {
      setLoadingExtra(false);
    }
  };

  useEffect(() => {
    if (isSupervisor) fetchAllData();
  }, [token, isSupervisor]);

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
      const record = allRecords.find(r => r.id === recordId);
      const cleanPlates = plates.trim().toUpperCase();

      // Búsqueda mucho más flexible y robusta
      const insp = allInspections.find(i =>
        (record?.inspection_id && i.id === record.inspection_id) ||
        (i.placas_unidad?.trim().toUpperCase() === cleanPlates) ||
        (i.numero_trailer?.trim().toUpperCase() === cleanPlates) // Respaldo por si se confundió trailer con placa
      );

      const ticket = allTickets.find(t => t.placas_unidad?.trim().toUpperCase() === cleanPlates);

      if (!insp) {
          console.log("Debug - Placas buscadas:", cleanPlates);
          console.log("Debug - Inspecciones disponibles:", allInspections.map(ins => ins.placas_unidad));
          throw new Error('No se encontró inspección digital vinculada. Verifique que las placas coincidan exactamente.');
      }

      const html = generateConsolidatedReportHtml({ inspection: insp, caseta: record, embarque: ticket }, 'es');
      const { uri } = await Print.printToFileAsync({ html, base64: false });

      if (Platform.OS === 'web') {
        // En web disparamos la previsualización/impresión directa
        const win = window.open("", "_blank");
        if (win) {
            win.document.write(html);
            win.document.close();
            setTimeout(() => win.print(), 500);
        } else {
            alert('El bloqueador de ventanas impidió abrir el reporte. Por favor permita ventanas emergentes.');
        }
      } else {
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
      await apiCall(`/vehicle-records/${recordId}/send-report`, {
        method: 'POST',
        token,
        body: { recipient: 'd.trujillo@brancoindustries.com' }
      });
      alert('Reporte enviado exitosamente');
    } catch (e: any) {
      alert(e.message || 'Error al enviar correo');
    } finally {
      setEmailLoading(null);
    }
  };

  const [linkingMode, setLinkingMode] = useState(false);

  const orphanInspections = useMemo(() => {
    return allInspections.filter(i => {
      // Una inspección es huérfana si no tiene un record de caseta que la referencie por ID
      // O si no hay un record con las mismas placas
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
      // Unimos inspecciones reales + registros de caseta pendientes de inspección
      const pendingRecords = orphanRecords.map(r => ({ ...r, _is_pending_insp: true }));
      const combined = [...pendingRecords, ...allInspections];

      const filtered = combined.filter(i => {
        const plates = i._is_pending_insp ? i.entry.placas_unidad : i.placas_unidad;
        const name = i._is_pending_insp ? i.entry.chofer_nombre : i.inspector_nombre;
        return (plates?.toLowerCase() || "").includes(q) || (name?.toLowerCase() || "").includes(q);
      });

      // Ordenar por fecha: primero los más recientes
      return filtered.sort((a, b) => {
        const dateA = new Date(a.created_at || a.entry?.fecha_entrada || 0).getTime();
        const dateB = new Date(b.created_at || b.entry?.fecha_entrada || 0).getTime();
        return dateB - dateA;
      });
    } else {
      return allTickets.filter(t => t.placas_unidad.toLowerCase().includes(q) || t.cliente.toLowerCase().includes(q));
    }
  }, [activeTab, query, allRecords, allInspections, allTickets, orphanRecords]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']} testID="supervisor-screen">
      <View style={styles.header}>
        <Text style={styles.title}>{t('panel_supervisor')}</Text>

        <View style={styles.masterPanel}>
          <Text style={styles.masterTitle}>{t('panel_maestro')}</Text>
          <View style={styles.masterActions}>
            <Pressable style={styles.masterBtn} onPress={() => router.push('/caseta/nuevo')}>
              <Ionicons name="car" size={14} color={colors.onSurface} />
              <Text style={styles.masterBtnText}>NUEVA ENTRADA</Text>
            </Pressable>
            <Pressable style={styles.masterBtn} onPress={() => router.push('/nueva')}>
              <Ionicons name="clipboard" size={14} color={colors.onSurface} />
              <Text style={styles.masterBtnText}>INSPECCIÓN</Text>
            </Pressable>
            <Pressable style={styles.masterBtn} onPress={() => router.push('/embarque/nuevo')}>
              <Ionicons name="document-text" size={14} color={colors.onSurface} />
              <Text style={styles.masterBtnText}>{t('embarque_boletos')}</Text>
            </Pressable>
            <Pressable style={[styles.masterBtn, { backgroundColor: colors.success + '22' }]} onPress={() => router.push('/caseta')}>
              <Ionicons name="exit" size={14} color={colors.success} />
              <Text style={[styles.masterBtnText, { color: colors.success }]}>{t('registrador_salida')}</Text>
            </Pressable>
            <Pressable style={[styles.masterBtn, { backgroundColor: colors.info + '22' }]} onPress={() => setLinkingMode(!linkingMode)}>
              <Ionicons name="link" size={14} color={colors.info} />
              <Text style={[styles.masterBtnText, { color: colors.info }]}>{t('vincular_registros')}</Text>
            </Pressable>
          </View>
        </View>

        {linkingMode && (
          <View style={[styles.masterPanel, { backgroundColor: colors.surfaceTertiary, borderTopWidth: 0, marginTop: -spacing.md }]}>
            <Text style={[styles.masterTitle, { color: colors.onSurface }]}>HERRAMIENTA DE VINCULACIÓN (HUÉRFANOS)</Text>
            {orphanRecords.length === 0 ? (
              <Text style={{ fontSize: 10, color: colors.muted }}>No hay registros de caseta sin inspección vinculada.</Text>
            ) : (
              orphanRecords.map(r => {
                const match = orphanInspections.find(i => i.placas_unidad === r.entry.placas_unidad);
                return (
                  <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <Text style={{ fontSize: 10, fontWeight: '700' }}>{r.entry.placas_unidad} ({r.entry.chofer_nombre})</Text>
                    {match ? (
                      <Pressable style={{ backgroundColor: colors.success, paddingHorizontal: 8, paddingVertical: 2 }} onPress={() => handleLink(r.id, match.id)}>
                        <Text style={{ fontSize: 9, color: '#FFF', fontWeight: '900' }}>VINCULAR CON INSP: {match.id.slice(0,5)}</Text>
                      </Pressable>
                    ) : (
                      <Text style={{ fontSize: 9, color: colors.error }}>SIN INSP. ENCONTRADA</Text>
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

        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('buscar_placeholder')}
            value={query}
            onChangeText={setQuery}
          />
        </View>
      </View>

      <FlatList
        data={filteredData}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
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
            if (item._is_pending_insp) {
              return (
                <View style={[styles.row, { borderLeftWidth: 4, borderLeftColor: colors.warning }]}>
                   <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{item.entry.placas_unidad} · {item.entry.chofer_nombre}</Text>
                    <Text style={[styles.rowSub, { color: colors.warning, fontWeight: '700' }]}>⚠️ INSPECCIÓN PENDIENTE</Text>
                    <ProcessTracker steps={{ entry: true, inspection: false, shipping: !!item.has_shipping_ticket, exit: false }} compact />
                    <Pressable
                      onPress={() => {
                        const params = new URLSearchParams({
                          record_id: item.id,
                          compania: item.entry.compania_transporte || '',
                          placas: item.entry.placas_unidad || '',
                          trailer: item.entry.numero_caja || '',
                          sello: item.entry.sello_entrada || '',
                        });
                        router.push(`/(app)/nueva?${params.toString()}`);
                      }}
                      style={[styles.actionBtn, { marginTop: 8, backgroundColor: colors.warning + '22', padding: 4 }]}
                    >
                      <Ionicons name="clipboard-outline" size={16} color={colors.warning} />
                      <Text style={[styles.actionText, { color: colors.warning }]}>REALIZAR INSPECCIÓN AHORA</Text>
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
        ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>No hay registros para mostrar</Text></View>}
      />
    </SafeAreaView>
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
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{e.placas_unidad}</Text>
        <Text style={styles.rowSub}>{e.chofer_nombre} · {e.compania_transporte}</Text>
        <View style={{ marginVertical: 4 }}>
          <ProcessTracker steps={steps} compact />
        </View>
        <View style={styles.btnRow}>
          <Pressable onPress={onEdit} style={styles.actionBtn}>
            <Ionicons name="create-outline" size={16} color={colors.brandPrimary} />
            <Text style={styles.actionText}>EDITOR</Text>
          </Pressable>
          <Pressable onPress={onPdf} style={[styles.actionBtn, { backgroundColor: colors.brandPrimary, paddingHorizontal: 8, borderRadius: 2 }]} disabled={loadingPdf}>
            {loadingPdf ? <ActivityIndicator size={14} color="#FFF" /> : <Ionicons name="eye-outline" size={16} color="#FFF" />}
            <Text style={[styles.actionText, { color: '#FFF' }]}>VER REPORTE COMPLETO (PDF)</Text>
          </Pressable>
          <Pressable onPress={onEmail} style={styles.actionBtn} disabled={loadingEmail}>
            {loadingEmail ? <ActivityIndicator size={14} color={colors.brandPrimary} /> : <Ionicons name="mail-outline" size={16} color={colors.brandPrimary} />}
            <Text style={styles.actionText}>CORREO ELECTRÓNICO</Text>
          </Pressable>
        </View>
        <Text style={styles.rowDate}>{new Date(e.fecha_entrada || item.created_at).toLocaleString()}</Text>
      </View>
      <View style={[styles.statusChip, { backgroundColor: statusColor }]}>
        <Text style={styles.statusChipText}>{item.status.toUpperCase()}</Text>
      </View>
    </View>
  );
}

function InspectionRow({ item, onEdit, t, records = [], tickets = [] }: any) {
  const statusColor = item.approval_status === 'aprobada' ? colors.success : item.approval_status === 'rechazada' ? colors.error : colors.warning;

  // Corregir búsqueda de record relacionado para mostrar el rastreador
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
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{item.placas_unidad} · {item.numero_trailer}</Text>
        <Text style={styles.rowSub}>{item.inspector_nombre}</Text>
        <View style={{ marginVertical: 4 }}>
          <ProcessTracker steps={steps} compact />
        </View>
        <Pressable onPress={onEdit} style={[styles.actionBtn, { marginTop: 8 }]}>
          <Ionicons name="create-outline" size={16} color={colors.brandPrimary} />
          <Text style={styles.actionText}>EDITAR INSPECCIÓN</Text>
        </Pressable>
        <Text style={styles.rowDate}>{new Date(item.created_at).toLocaleString()}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <View style={[styles.statusChip, { backgroundColor: item.status_general === 'bueno' ? colors.success : colors.error }]}>
          <Text style={styles.statusChipText}>{item.status_general === 'bueno' ? t('bueno') : t('falla')}</Text>
        </View>
        <View style={[styles.statusChip, { backgroundColor: statusColor }]}>
          <Text style={styles.statusChipText}>{t(item.approval_status || 'pendiente').toUpperCase()}</Text>
        </View>
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
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{item.placas_unidad} · {item.cliente}</Text>
        <Text style={styles.rowSub}>{item.almacenista}</Text>
        <View style={{ marginVertical: 4 }}>
          <ProcessTracker steps={steps} compact />
        </View>
        <Pressable onPress={onEdit} style={[styles.actionBtn, { marginTop: 8 }]}>
          <Ionicons name="create-outline" size={16} color={colors.brandPrimary} />
          <Text style={styles.actionText}>EDITAR TICKET</Text>
        </Pressable>
        <Text style={styles.rowDate}>{new Date(item.created_at).toLocaleString()}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  header: { padding: spacing.lg, backgroundColor: colors.surfaceSecondary, borderBottomWidth: 2, borderBottomColor: colors.borderStrong },
  title: { fontSize: typography.sizes.xxl, fontWeight: '900', color: colors.onSurface, marginBottom: spacing.md },
  masterPanel: { marginBottom: spacing.md, padding: spacing.md, backgroundColor: colors.brandTertiary, borderWidth: 2, borderColor: colors.brandPrimary },
  masterTitle: { fontSize: 10, fontWeight: '900', color: colors.onBrandTertiary, letterSpacing: 1, marginBottom: spacing.sm },
  masterActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  masterBtn: { backgroundColor: colors.surface, paddingHorizontal: spacing.sm, paddingVertical: 6, borderWidth: 1, borderColor: colors.borderStrong, flexDirection: 'row', alignItems: 'center', gap: 4 },
  masterBtnText: { fontSize: 9, fontWeight: '900', color: colors.onSurface },
  tabRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.borderStrong },
  tabActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  tabText: { fontWeight: '900', fontSize: 10, color: colors.muted, letterSpacing: 1 },
  tabTextActive: { color: colors.onBrandPrimary },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.borderStrong, paddingHorizontal: spacing.md },
  searchInput: { flex: 1, padding: spacing.sm, fontSize: typography.sizes.base, color: colors.onSurface, height: 44 },
  row: { backgroundColor: colors.surfaceSecondary, borderWidth: 2, borderColor: colors.borderStrong, padding: spacing.md, marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center' },
  rowTitle: { fontWeight: '900', fontSize: typography.sizes.lg, color: colors.onSurface },
  rowSub: { color: colors.muted, fontSize: typography.sizes.sm, marginTop: 2 },
  btnRow: { flexDirection: 'row', gap: spacing.md, marginTop: 10 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { fontWeight: '900', fontSize: 9, color: colors.brandPrimary, letterSpacing: 0.5 },
  statusChip: { paddingHorizontal: spacing.sm, paddingVertical: 4 },
  statusChipText: { color: '#FFF', fontWeight: '900', fontSize: 9, letterSpacing: 1 },
  empty: { alignItems: 'center', padding: spacing.xxxl },
  emptyText: { color: colors.muted },
  lockText: { color: colors.muted, marginTop: spacing.md, fontWeight: '700' },
});

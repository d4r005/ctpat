import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput, RefreshControl, Platform,
  useWindowDimensions, ActivityIndicator, ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
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
  const { allInspections, refreshAll: refreshInspections, loading: inspLoading, exportCsvUrl, sendManualReport } = useInspections();
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<TabType>('caseta');
  const [allRecords, setAllRecords] = useState<any[]>([]);
  const [allTickets, setAllTickets] = useState<any[]>([]);
  const [loadingExtra, setLoadingExtra] = useState(false);

  const [query, setQuery] = useState('');
  const [reportLoading, setReportLoading] = useState<string | null>(null);
  const [emailLoading, setEmailLoading] = useState<string | null>(null);

  const fetchAllData = React.useCallback(async () => {
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
  }, [token, isSupervisor, refreshInspections]);

  useFocusEffect(
    React.useCallback(() => {
      fetchAllData();
    }, [fetchAllData])
  );

  const handleDelete = async (type: 'record' | 'inspection' | 'ticket', id: string) => {
    if (!isAdmin) return;
    if (Platform.OS !== 'web') {
      const confirmed = await new Promise((resolve) => {
        Alert.alert(
          t('confirmar_eliminar_proceso'),
          "",
          [
            { text: t('cancelar'), onPress: () => resolve(false), style: 'cancel' },
            { text: t('malo'), onPress: () => resolve(true), style: 'destructive' }
          ]
        );
      });
      if (!confirmed) return;
    } else {
      if (!window.confirm(t('confirmar_eliminar_proceso'))) return;
    }

    try {
      const endpoint = type === 'record' ? `/vehicle-records/${id}/admin-delete` :
                       type === 'inspection' ? `/inspections/${id}/admin-delete` :
                       `/shipping-tickets/${id}/admin-delete`;

      await apiCall(endpoint, { method: 'DELETE', token });
      fetchAllData();
    } catch (e: any) {
      alert(e.message);
    }
  };

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
      const normalize = (s: string) => s?.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || '';
      const normPlates = normalize(cleanPlates);

      // Robust search for linked inspections (supporting both single and list)
      let inspectionsToReport: Inspection[] = [];

      if (record?.inspection_ids && record.inspection_ids.length > 0) {
        inspectionsToReport = allInspections.filter(i => record.inspection_ids.includes(i.id));
      } else if (record?.inspection_id) {
        const found = allInspections.find(i => i.id === record.inspection_id);
        if (found) inspectionsToReport = [found];
      }

      // Fallback to plates search if none found by ID
      if (inspectionsToReport.length === 0) {
        inspectionsToReport = allInspections.filter(i => normalize(i.placas_unidad) === normPlates);
      }

      if (inspectionsToReport.length === 0) {
          throw new Error('No se encontró inspección digital vinculada. Verifique que las placas coincidan.');
      }

      // Sort inspections by date
      inspectionsToReport.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      const ticket = allTickets.find(t => normalize(t.placas_unidad) === normPlates);

      // Use the first inspection as reference for the main object, but pass all in the array
      const html = generateConsolidatedReportHtml({
        inspection: inspectionsToReport[0],
        inspections: inspectionsToReport,
        caseta: record,
        embarque: ticket
      }, 'es');

      if (Platform.OS === 'web') {
        const { uri } = await Print.printToFileAsync({ html, base64: false });
        const res = await fetch(uri);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `reporte_consolidado_${normPlates}.pdf`;
        link.click();
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
      const msg = e.message || 'Error al enviar correo';
      alert(msg.includes('500') ? `Error del Servidor (500): Posiblemente el reporte es muy pesado para el correo o hay un problema con Gmail.` : msg);
    } finally {
      setEmailLoading(null);
    }
  };

  const [linkingMode, setLinkingMode] = useState(false);

  const orphanInspections = useMemo(() => {
    return allInspections.filter(i => {
      // Una inspección es huérfana si no tiene un record de caseta que la referencie por ID
      // en el campo inspection_id o en la lista inspection_ids
      return !allRecords.some(r =>
          r.inspection_id === i.id ||
          (r.inspection_ids && r.inspection_ids.includes(i.id))
      );
    });
  }, [allInspections, allRecords]);

  const orphanRecords = useMemo(() => {
    return allRecords.filter(r => {
        const isFull = r.entry?.tipo_unidad === 'full';
        const doneIds = Array.isArray(r.inspection_ids) ? r.inspection_ids : (r.inspection_id ? [r.inspection_id] : []);
        if (isFull) return doneIds.length < 2;
        return doneIds.length === 0;
    });
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

      return filtered.sort((a, b) => {
        const dateA = new Date(a.created_at || a.entry?.fecha_entrada || 0).getTime();
        const dateB = new Date(b.created_at || b.entry?.fecha_entrada || 0).getTime();
        return dateB - dateA;
      });
    } else {
      // Unimos tickets realizados + registros de caseta pendientes de embarque (EXCLUYENDO FULL Y DESCARGA)
      const pendingShipping = allRecords.filter(r => {
          const isFull = r.entry?.tipo_unidad === 'full';
          const isDescarga = r.entry?.condicion_carga === 'descarga';
          if (isFull || isDescarga) return false;

          const hasInspection = !!(r.inspection_id || r.status === 'inspeccionado');
          const alreadyHasTicket = allTickets.some(t => t.placas_unidad === r.entry.placas_unidad);
          return hasInspection && !alreadyHasTicket;
      });

      const pendingMapped = pendingShipping.map(r => ({ ...r, _is_pending_shipping: true }));
      const combined = [...pendingMapped, ...allTickets];

      const filtered = combined.filter(t => {
        const plates = t._is_pending_shipping ? t.entry.placas_unidad : t.placas_unidad;
        const client = t._is_pending_shipping ? t.entry.compania_transporte : t.cliente;
        return (plates?.toLowerCase() || "").includes(q) || (client?.toLowerCase() || "").includes(q);
      });

      return filtered.sort((a, b) => {
        const dateA = new Date(a.created_at || a.entry?.fecha_entrada || 0).getTime();
        const dateB = new Date(b.created_at || b.entry?.fecha_entrada || 0).getTime();
        return dateB - dateA;
      });
    }
  }, [activeTab, query, allRecords, allInspections, allTickets, orphanRecords]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']} testID="supervisor-screen">
      <MainHeader title="NAF" subtitle={t('panel_supervisor').toUpperCase()} />
      <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.md }}>
        <View style={styles.masterPanel}>
          <Text style={styles.masterTitle}>{t('admin_tools')}</Text>
          <View style={styles.masterActions}>
            <Pressable style={[styles.masterBtn, { backgroundColor: colors.info + '22' }]} onPress={() => setLinkingMode(!linkingMode)}>
              <Ionicons name="link" size={14} color={colors.info} />
              <Text style={[styles.masterBtnText, { color: colors.info }]}>{t('vincular_registros')}</Text>
            </Pressable>
            <Pressable style={[styles.masterBtn, { backgroundColor: colors.brandPrimary + '22' }]} onPress={() => router.push('/usuarios')}>
              <Ionicons name="people" size={14} color={colors.brandPrimary} />
              <Text style={[styles.masterBtnText, { color: colors.brandPrimary }]}>{t('usuarios_caps')}</Text>
            </Pressable>
            <Pressable style={[styles.masterBtn, { backgroundColor: '#7c3aed22' }]} onPress={() => router.push('/analitica')}>
              <Ionicons name="stats-chart" size={14} color="#7c3aed" />
              <Text style={[styles.masterBtnText, { color: '#7c3aed' }]}>{t('kpis').toUpperCase()} / {t('reporte_analitica').toUpperCase()}</Text>
            </Pressable>
          </View>
        </View>

        {linkingMode && (
          <View style={[styles.masterPanel, { backgroundColor: colors.surfaceTertiary, borderTopWidth: 0, marginTop: -spacing.md }]}>
            <Text style={[styles.masterTitle, { color: colors.onSurface }]}>{t('vincular_huerfanos')}</Text>
            {orphanRecords.length === 0 ? (
              <Text style={{ fontSize: 10, color: colors.muted }}>{t('no_hay_registros')}</Text>
            ) : (
              orphanRecords.map(r => {
                // Buscar coincidencia por placas que NO esté vinculada
                const match = orphanInspections.find(i =>
                    i.placas_unidad?.trim().toUpperCase() === r.entry.placas_unidad?.trim().toUpperCase()
                );

                const isFull = r.entry?.tipo_unidad === 'full';
                const doneIds = Array.isArray(r.inspection_ids) ? r.inspection_ids : (r.inspection_id ? [r.inspection_id] : []);
                const statusSuffix = isFull ? ` (${doneIds.length}/2 INSP)` : '';

                return (
                  <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <Text style={{ fontSize: 10, fontWeight: '700' }}>{r.entry.placas_unidad}{statusSuffix}</Text>
                    {match ? (
                      <Pressable style={{ backgroundColor: colors.success, paddingHorizontal: 8, paddingVertical: 2 }} onPress={() => handleLink(r.id, match.id)}>
                        <Text style={{ fontSize: 9, color: '#FFF', fontWeight: '900' }}>{t('vincular_con')} {match.numero_trailer} ({match.id.slice(0,5)})</Text>
                      </Pressable>
                    ) : (
                      <Text style={{ fontSize: 9, color: colors.error }}>{t('sin_insp_encontrada')}</Text>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}

        <View style={styles.tabRow}>
          <TabItem label={t('caseta').toUpperCase()} active={activeTab === 'caseta'} onPress={() => setActiveTab('caseta')} icon="business" />
          <TabItem label={t('inspeccion').toUpperCase()} active={activeTab === 'inspeccion'} onPress={() => setActiveTab('inspeccion')} icon="clipboard" />
          <TabItem label={t('embarque').toUpperCase()} active={activeTab === 'embarque'} onPress={() => setActiveTab('embarque')} icon="cube" />
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
              onDelete={() => handleDelete('record', item.id)}
              isAdmin={isAdmin}
              loadingPdf={reportLoading === item.id}
              loadingEmail={emailLoading === item.id}
              t={t}
            />
          );
          if (activeTab === 'inspeccion') {
            if (item._is_pending_insp) {
              return (
                <View style={[styles.row, { borderLeftWidth: 4, borderLeftColor: colors.warning }]}>
                   <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{item.entry.placas_unidad} · {item.entry.chofer_nombre}</Text>
                    <Text style={[styles.rowSub, { color: colors.warning, fontWeight: '700' }]}>⚠️ {t('inspeccion_pendiente').toUpperCase()}</Text>
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
                      <Text style={[styles.actionText, { color: colors.warning }]}>{t('realizar_inspeccion_ahora').toUpperCase()}</Text>
                    </Pressable>
                  </View>
                  {isAdmin && (
                    <Pressable onPress={() => handleDelete('record', item.id)} style={styles.deleteBtn}>
                      <Ionicons name="trash-outline" size={20} color={colors.error} />
                    </Pressable>
                  )}
                </View>
              );
            }
            return (
              <InspectionRow
                item={item}
                onEdit={() => router.push(`/inspection/${item.id}?edit=true`)}
                onDelete={() => handleDelete('inspection', item.id)}
                isAdmin={isAdmin}
                t={t}
                records={allRecords}
                tickets={allTickets}
              />
            );
          }
          if (activeTab === 'embarque') {
            if (item._is_pending_shipping) {
              return (
                <View style={[styles.row, { borderLeftWidth: 4, borderLeftColor: colors.warning }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{item.entry.placas_unidad} · {item.entry.chofer_nombre}</Text>
                    <Text style={[styles.rowSub, { color: colors.warning, fontWeight: '700' }]}>⚠️ {t('ticket_pendiente').toUpperCase()}</Text>
                    <ProcessTracker steps={{ entry: true, inspection: true, shipping: false, exit: false }} compact />
                    <Pressable
                      onPress={() => {
                        const params = new URLSearchParams({
                          record_id: item.id,
                          placas: item.entry.placas_unidad || '',
                          chofer: item.entry.chofer_nombre || '',
                          linea: item.entry.compania_transporte || '',
                          caja: item.entry.numero_caja || '',
                        });
                        router.push(`/embarque/nuevo?${params.toString()}`);
                      }}
                      style={[styles.actionBtn, { marginTop: 8, backgroundColor: colors.warning + '22', padding: 4 }]}
                    >
                      <Ionicons name="document-text-outline" size={16} color={colors.warning} />
                      <Text style={[styles.actionText, { color: colors.warning }]}>{t('generar_ticket_ahora').toUpperCase()}</Text>
                    </Pressable>
                  </View>
                  {isAdmin && (
                    <Pressable onPress={() => handleDelete('record', item.id)} style={styles.deleteBtn}>
                      <Ionicons name="trash-outline" size={20} color={colors.error} />
                    </Pressable>
                  )}
                </View>
              );
            }
            return (
              <TicketRow
                item={item}
                onEdit={() => router.push(`/embarque/${item.id}`)}
                onDelete={() => handleDelete('ticket', item.id)}
                isAdmin={isAdmin}
                records={allRecords}
                t={t}
              />
            );
          }
        }}
        ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>{t('no_hay_registros')}</Text></View>}
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

function RecordRow({ item, onEdit, onPdf, onEmail, onDelete, isAdmin, loadingPdf, loadingEmail, t }: any) {
  const e = item.entry;
  const statusColor = item.status === 'salida' ? colors.success : item.status === 'inspeccionado' ? colors.info : colors.warning;

  const isFull = e?.tipo_unidad === 'full';
  const isDescarga = e?.condicion_carga === 'descarga';
  const showShipping = !isFull && !isDescarga;

  const steps = {
    entry: true,
    inspection: (item.inspection_ids?.length || (item.inspection_id ? 1 : 0)) > 0,
    shipping: !!item.has_shipping_ticket,
    exit: item.status === 'salida'
  };

  const statusLabel = item.status === 'entrada' ? t('en_patio') : item.status === 'inspeccionado' ? t('inspeccionado') : item.status === 'salida' ? t('salio') : item.status;

  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{e.placas_unidad} {isFull ? '(FULL)' : ''}</Text>
        <Text style={styles.rowSub}>{e.chofer_nombre} · {e.compania_transporte}</Text>
        <View style={{ marginVertical: 4 }}>
          <ProcessTracker steps={steps} compact showShipping={showShipping} />
        </View>
        <View style={styles.btnRow}>
          <Pressable onPress={onEdit} style={styles.actionBtn}>
            <Ionicons name="create-outline" size={16} color={colors.brandPrimary} />
            <Text style={styles.actionText}>{t('editor').toUpperCase()}</Text>
          </Pressable>
          <Pressable onPress={onPdf} style={[styles.actionBtn, { backgroundColor: colors.brandPrimary, paddingHorizontal: 8, borderRadius: 2 }]} disabled={loadingPdf}>
            {loadingPdf ? <ActivityIndicator size={14} color="#FFF" /> : <Ionicons name="eye-outline" size={16} color="#FFF" />}
            <Text style={[styles.actionText, { color: '#FFF' }]}>{t('ver_reporte_pdf').toUpperCase()}</Text>
          </Pressable>
          <Pressable onPress={onEmail} style={styles.actionBtn} disabled={loadingEmail}>
            {loadingEmail ? <ActivityIndicator size={14} color={colors.brandPrimary} /> : <Ionicons name="mail-outline" size={16} color={colors.brandPrimary} />}
            <Text style={styles.actionText}>{t('correo_electronico_btn').toUpperCase()}</Text>
          </Pressable>
        </View>
        <Text style={styles.rowDate}>{new Date(e.fecha_entrada || item.created_at).toLocaleString()}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 8 }}>
        <View style={[styles.statusChip, { backgroundColor: statusColor }]}>
          <Text style={styles.statusChipText}>{statusLabel.toUpperCase()}</Text>
        </View>
        {isAdmin && (
          <Pressable onPress={onDelete} style={styles.deleteBtn}>
            <Ionicons name="trash-outline" size={20} color={colors.error} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

function InspectionRow({ item, onEdit, onDelete, isAdmin, t, records = [], tickets = [] }: any) {
  const statusColor = item.approval_status === 'aprobada' ? colors.success : item.approval_status === 'rechazada' ? colors.error : colors.warning;

  // Corregir búsqueda de record relacionado para mostrar el rastreador
  const relatedRecord = records.find((r: any) =>
    r.inspection_id === item.id ||
    (r.inspection_ids && r.inspection_ids.includes(item.id)) ||
    r.entry?.placas_unidad?.trim().toUpperCase() === item.placas_unidad?.trim().toUpperCase()
  );

  const isFull = relatedRecord?.entry?.tipo_unidad === 'full';
  const isDescarga = relatedRecord?.entry?.condicion_carga === 'descarga';
  const showShipping = !isFull && !isDescarga;

  const steps = {
    entry: !!relatedRecord,
    inspection: true,
    shipping: !!tickets.some((tick: any) => tick.placas_unidad?.trim().toUpperCase() === item.placas_unidad?.trim().toUpperCase()),
    exit: relatedRecord?.status === 'salida'
  };

  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{item.placas_unidad} · {item.numero_trailer} {isFull ? '(FULL)' : ''}</Text>
        <Text style={styles.rowSub}>{item.inspector_nombre}</Text>
        <View style={{ marginVertical: 4 }}>
          <ProcessTracker steps={steps} compact showShipping={showShipping} />
        </View>
        <Pressable onPress={onEdit} style={[styles.actionBtn, { marginTop: 8 }]}>
          <Ionicons name="create-outline" size={16} color={colors.brandPrimary} />
          <Text style={styles.actionText}>{t('editar_inspeccion').toUpperCase()}</Text>
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
        {isAdmin && (
          <Pressable onPress={onDelete} style={[styles.deleteBtn, { marginTop: 4 }]}>
            <Ionicons name="trash-outline" size={20} color={colors.error} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

function TicketRow({ item, onEdit, onDelete, isAdmin, records = [], t }: any) {
  const relatedRecord = records.find((r: any) =>
    r.entry.placas_unidad?.trim().toUpperCase() === item.placas_unidad?.trim().toUpperCase() &&
    new Date(r.created_at).getTime() <= new Date(item.created_at).getTime()
  );

  const isFull = relatedRecord?.entry?.tipo_unidad === 'full';
  const isDescarga = relatedRecord?.entry?.condicion_carga === 'descarga';
  const showShipping = !isFull && !isDescarga;

  const steps = {
    entry: !!relatedRecord,
    inspection: (relatedRecord?.inspection_ids?.length || (relatedRecord?.inspection_id ? 1 : 0)) > 0,
    shipping: true,
    exit: relatedRecord?.status === 'salida'
  };

  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{item.placas_unidad} · {item.cliente} {isFull ? '(FULL)' : ''}</Text>
        <Text style={styles.rowSub}>{item.almacenista}</Text>
        <View style={{ marginVertical: 4 }}>
          <ProcessTracker steps={steps} compact showShipping={showShipping} />
        </View>
        <Pressable onPress={onEdit} style={[styles.actionBtn, { marginTop: 8 }]}>
          <Ionicons name="create-outline" size={16} color={colors.brandPrimary} />
          <Text style={styles.actionText}>{t('editar_ticket').toUpperCase()}</Text>
        </Pressable>
        <Text style={styles.rowDate}>{new Date(item.created_at).toLocaleString()}</Text>
      </View>
      {isAdmin && (
        <Pressable onPress={onDelete} style={styles.deleteBtn}>
          <Ionicons name="trash-outline" size={20} color={colors.error} />
        </Pressable>
      )}
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
  deleteBtn: { padding: 8, backgroundColor: colors.error + '11', borderRadius: 4 },
});

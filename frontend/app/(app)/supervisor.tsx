import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput, RefreshControl, Platform,
  Modal, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { useTranslation } from 'react-i18next';
import { useInspections } from '@/src/context/InspectionContext';
import { useAuth } from '@/src/context/AuthContext';
import { apiCall, API_BASE } from '@/src/api/client';
import { colors, spacing, typography } from '@/src/constants/theme';
import { generateConsolidatedReportHtml } from '@/src/utils/reportGenerator';

import Usuarios from './usuarios';
import Analitica from './analitica';

type TabType = 'inspecciones' | 'caseta' | 'embarque' | 'usuarios' | 'kpis' | 'admin_tools';

export default function Supervisor() {
  const { user, token } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.email === 'd.trujillo@brancoindustries.com';
  const router = useRouter();
  const { allInspections, refreshAll, loading } = useInspections();
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<TabType>('inspecciones');
  const [query, setQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [casetaRecords, setCasetaRecords] = useState<any[]>([]);
  const [shippingTickets, setShippingTickets] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  const [showEmailModal, setShowEmailModal] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [emailList, setEmailList] = useState<string>('');
  const [sendingEmail, setSendingEmail] = useState(false);

  const loadData = async () => {
    if (!token) return;
    setDataLoading(true);
    try {
      if (isAdmin) {
        try {
          await apiCall('/admin/repair-links', { method: 'POST', token });
        } catch (e) {
          console.warn("Repair links failed", e);
        }
      }

      const [caseta, tickets] = await Promise.all([
        apiCall('/vehicle-records', { token }).catch(e => { console.error(e); return []; }),
        apiCall('/shipping-tickets', { token }).catch(e => { console.error(e); return []; })
      ]);
      setCasetaRecords(caseta || []);
      setShippingTickets(tickets || []);
      if (refreshAll) await refreshAll();
    } catch (e) {
      console.error('Error loading data:', e);
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'supervisor' || user?.role === 'admin' || isAdmin) {
      loadData();
    }
  }, [token, user?.role, isAdmin]);

  const filteredInspections = useMemo(() => {
    const data = allInspections || [];
    return data.filter(i => {
      const q = query.toLowerCase();
      const matchQuery = !query || i?.placas_unidad?.toLowerCase().includes(q) || i?.compania_transportista?.toLowerCase().includes(q);
      const matchDate = (!dateFrom || i.created_at >= dateFrom) && (!dateTo || i.created_at <= dateTo + 'T23:59:59');
      return matchQuery && matchDate;
    });
  }, [allInspections, query, dateFrom, dateTo]);

  const filteredCaseta = useMemo(() => {
    const data = casetaRecords || [];
    return data.filter(r => {
      const q = query.toLowerCase();
      const matchQuery = !query || r.entry?.placas_unidad?.toLowerCase().includes(q) || r.entry?.chofer_nombre?.toLowerCase().includes(q);
      const matchDate = (!dateFrom || r.created_at >= dateFrom) && (!dateTo || r.created_at <= dateTo + 'T23:59:59');
      return matchQuery && matchDate;
    });
  }, [casetaRecords, query, dateFrom, dateTo]);

  const filteredTickets = useMemo(() => {
    const data = shippingTickets || [];
    return data.filter(t => {
      const q = query.toLowerCase();
      const matchQuery = !query || t?.placas_unidad?.toLowerCase().includes(q) || t?.operador?.toLowerCase().includes(q);
      const matchDate = (!dateFrom || t.created_at >= dateFrom) && (!dateTo || t.created_at <= dateTo + 'T23:59:59');
      return matchQuery && matchDate;
    });
  }, [shippingTickets, query, dateFrom, dateTo]);

  const downloadConsolidatedPdf = async (item: any) => {
    try {
      setDataLoading(true);
      const record = item;
      if (!record || !record.entry) {
        alert('Datos de registro incompletos');
        return;
      }

      const placas = record.entry?.placas_unidad?.trim().toUpperCase();
      let insp = (allInspections || []).find(i => i.id === record.inspection_id);

      if (!insp && placas) {
        insp = (allInspections || [])
          .filter(i => i.placas_unidad?.trim().toUpperCase() === placas)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
      }

      if (!insp) {
        const proceed = window.confirm(`No se encontró una inspección digital para la placa: ${placas}. ¿Desea generar el reporte solo con los datos de Caseta y Embarque?`);
        if (!proceed) return;
      }

      let ship = (shippingTickets || []).find(s => s.inspection_id === record.inspection_id);
      if (!ship && placas) {
        ship = (shippingTickets || [])
          .filter(s => s.placas_unidad?.trim().toUpperCase() === placas)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
      }

      const finalInsp = insp || {
        points: [],
        inspector_nombre: 'N/A',
        status_general: 'pendiente',
        placas_unidad: placas,
        compania_transportista: record.entry?.compania_transporte || 'N/A',
        numero_trailer: record.entry?.numero_caja || 'N/A',
        created_at: record.created_at,
        inspection_type: '19_puntos'
      } as any;

      const htmlEs = generateConsolidatedReportHtml({ inspection: finalInsp, caseta: record, embarque: ship }, 'es');
      const htmlZh = generateConsolidatedReportHtml({ inspection: finalInsp, caseta: record, embarque: ship }, 'zh');

      const combinedHtml = `
        <div style="page-break-after: always;">${htmlEs}</div>
        <div>${htmlZh}</div>
      `;

      if (Platform.OS === 'web') {
        const result = await Print.printToFileAsync({ html: combinedHtml, base64: true });
        if (result && result.base64) {
          const a = document.createElement('a');
          const cleanBase64 = result.base64.includes('base64,') ? result.base64.split('base64,')[1] : result.base64;
          a.href = `data:application/pdf;base64,${cleanBase64}`;
          a.download = `Reporte_Consolidado_${placas}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } else {
          const printWindow = window.open('', '_blank');
          if (printWindow) {
            printWindow.document.write(`<html><head><title>Reporte ${placas}</title></head><body>${combinedHtml}</body></html>`);
            printWindow.document.close();
          }
        }
      } else {
        const result = await Print.printToFileAsync({ html: combinedHtml, base64: false });
        await Sharing.shareAsync(result.uri, { mimeType: 'application/pdf', dialogTitle: 'Descargar Reporte' });
      }
    } catch (e: any) {
      alert('Error al generar PDF: ' + e.message);
    } finally {
      setDataLoading(false);
    }
  };

  const handleSendEmail = async () => {
    if (!selectedRecordId || !emailList.trim()) return;
    const emails = emailList.split(',').map(e => e.trim()).filter(e => e.includes('@'));
    if (emails.length === 0) {
      alert('Ingresa correos válidos');
      return;
    }

    setSendingEmail(true);
    try {
      await apiCall('/reports/send-consolidated', {
        method: 'POST',
        token,
        body: { record_id: selectedRecordId, emails }
      });
      alert('Reporte enviado con éxito');
      setShowEmailModal(false);
      setEmailList('');
    } catch (e: any) {
      alert(`Error al enviar: ${e.message}`);
    } finally {
      setSendingEmail(false);
    }
  };

  const openEmailModal = (recordId: string) => {
    setSelectedRecordId(recordId);
    setShowEmailModal(true);
  };

  if (!user || (user.role !== 'supervisor' && user.role !== 'admin' && !isAdmin)) {
    return (
      <SafeAreaView style={styles.safe}><View style={styles.center}><Text>Acceso restringido</Text></View></SafeAreaView>
    );
  }

  const tabs: TabType[] = ['inspecciones', 'caseta', 'embarque', 'kpis'];
  if (isAdmin) tabs.push('usuarios');
  if (isAdmin) tabs.push('admin_tools');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
          <Text style={styles.title}>Panel Maestro</Text>
          {isAdmin && <View style={[styles.roleChip, { backgroundColor: colors.info }]}><Text style={styles.roleChipText}>ADMINISTRADOR</Text></View>}
        </View>

        {(activeTab !== 'usuarios' && activeTab !== 'kpis' && activeTab !== 'admin_tools') && (
          <>
            <View style={styles.searchRow}>
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar por placa o chofer..."
                value={query}
                onChangeText={setQuery}
                placeholderTextColor={colors.muted}
              />
              <Ionicons name="search" size={20} color={colors.muted} />
            </View>

            <View style={styles.dateRow}>
              <TextInput style={styles.dateInput} placeholder="Desde YYYY-MM-DD" value={dateFrom} onChangeText={setDateFrom} placeholderTextColor={colors.muted} />
              <TextInput style={styles.dateInput} placeholder="Hasta YYYY-MM-DD" value={dateTo} onChangeText={setDateTo} placeholderTextColor={colors.muted} />
            </View>
          </>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll}>
          <View style={styles.tabRow}>
            {tabs.map(t => (
              <Pressable
                key={t}
                style={[styles.tab, activeTab === t && styles.tabActive]}
                onPress={() => setActiveTab(t)}
              >
                <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>{t.toUpperCase().replace('_', ' ')}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>

      <View style={{ flex: 1 }}>
        {activeTab === 'usuarios' && <Usuarios />}
        {activeTab === 'kpis' && <Analitica />}

        {activeTab === 'admin_tools' && (
          <ScrollView style={{ flex: 1, padding: spacing.lg }}>
            <Text style={styles.adminSectionTitle}>Herramientas de Limpieza</Text>
            <Text style={{ color: colors.muted, marginBottom: spacing.lg }}>Use estas herramientas para corregir problemas de datos.</Text>

            <Pressable
              style={styles.bigAdminBtn}
              onPress={async () => {
                try {
                  const res = await apiCall('/admin/repair-links', { method: 'POST', token });
                  alert(res.message);
                  loadData();
                } catch (e: any) { alert(e.message); }
              }}
            >
              <Ionicons name="build" size={24} color="#FFF" />
              <Text style={styles.bigAdminBtnText}>VINCULAR REGISTROS HUÉRFANOS</Text>
            </Pressable>

            <Text style={styles.adminTip}>
              * Esta acción busca inspecciones y tickets que no están vinculados a su entrada de caseta correspondiente y los une por número de placa.
            </Text>

            <Text style={styles.adminSectionTitle}>Gestión de Fotografías</Text>
            <Text style={{ fontSize: 14, color: colors.onSurface, marginBottom: spacing.md }}>
              Como Administrador, puede modificar o eliminar cualquier foto directamente desde la vista de detalle de cada registro.
            </Text>

            <View style={styles.routeBox}>
              <Text style={styles.routeTitle}>RUTAS PARA EDITAR FOTOS:</Text>
              <Text style={styles.routeItem}>• Caseta: Pestaña "CASETA" {'>'} Seleccionar Unidad {'>'} Botones Lápiz/Basura sobre fotos.</Text>
              <Text style={styles.routeItem}>• Inspección: Pestaña "INSPECCIONES" {'>'} Seleccionar {'>'} Botones Lápiz/Basura sobre fotos.</Text>
              <Text style={styles.routeItem}>• Embarque: Pestaña "EMBARQUE" {'>'} Seleccionar {'>'} Botones Lápiz/Basura sobre fotos.</Text>
            </View>
          </ScrollView>
        )}

        {(activeTab === 'inspecciones' || activeTab === 'caseta' || activeTab === 'embarque') && (
          <FlatList
            data={activeTab === 'inspecciones' ? filteredInspections : activeTab === 'caseta' ? filteredCaseta : filteredTickets}
            keyExtractor={item => item?.id || Math.random().toString()}
            refreshControl={<RefreshControl refreshing={loading || dataLoading} onRefresh={loadData} />}
            contentContainerStyle={{ padding: spacing.md }}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{item?.placas_unidad || item?.entry?.placas_unidad || 'S/P'}</Text>
                  <Text style={styles.cardSub}>
                    {activeTab === 'inspecciones' ? item?.compania_transportista :
                    activeTab === 'caseta' ? item?.entry?.chofer_nombre : item?.operador}
                  </Text>
                  <Text style={styles.cardDate}>{item?.created_at ? new Date(item.created_at).toLocaleString() : ''}</Text>
                </View>

                <View style={styles.cardActions}>
                  {activeTab === 'caseta' && (
                    <>
                      <Pressable style={styles.downloadBtn} onPress={() => downloadConsolidatedPdf(item)}>
                        <Ionicons name="download" size={18} color="#FFF" />
                      </Pressable>
                      <Pressable style={styles.emailBtn} onPress={() => openEmailModal(item.id)}>
                        <Ionicons name="mail" size={18} color="#FFF" />
                        <Text style={styles.emailBtnText}>ENVIAR</Text>
                      </Pressable>
                    </>
                  )}
                  <Pressable
                    style={styles.viewBtn}
                    onPress={() => router.push(activeTab === 'inspecciones' ? `/inspection/${item.id}` : activeTab === 'caseta' ? `/caseta/${item.id}` : `/embarque/${item.id}`)}
                  >
                    <Ionicons name="eye" size={18} color="#FFF" />
                  </Pressable>
                </View>
              </View>
            )}
          />
        )}
      </View>

      <Modal visible={showEmailModal} transparent animationType="fade" onRequestClose={() => setShowEmailModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Enviar Reporte Consolidado</Text>
            <Text style={styles.modalSub}>Ingrese los correos separados por coma:</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="ejemplo@correo.com, otro@correo.com"
              value={emailList}
              onChangeText={setEmailList}
              multiline
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowEmailModal(false)}><Text style={styles.cancelBtnText}>CANCELAR</Text></Pressable>
              <Pressable style={styles.sendBtn} onPress={handleSendEmail} disabled={sendingEmail}>
                {sendingEmail ? <ActivityIndicator color="#FFF" /> : <Text style={styles.sendBtnText}>ENVIAR AHORA</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { padding: spacing.lg, backgroundColor: colors.brandPrimary },
  title: { fontSize: 24, fontWeight: '900', color: '#FFF', letterSpacing: 1 },
  roleChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4 },
  roleChipText: { color: '#FFF', fontWeight: '900', fontSize: 10 },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 12, borderRadius: 8, marginTop: 15 },
  searchInput: { flex: 1, height: 44, color: colors.onSurface, fontSize: 14 },
  dateRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  dateInput: { flex: 1, backgroundColor: '#FFF', height: 40, borderRadius: 8, paddingHorizontal: 12, fontSize: 12 },
  tabScroll: { marginTop: 15 },
  tabRow: { flexDirection: 'row', gap: 10 },
  tab: { paddingVertical: 8, paddingHorizontal: 15, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)' },
  tabActive: { backgroundColor: colors.brandSecondary },
  tabText: { color: 'rgba(255,255,255,0.7)', fontWeight: 'bold', fontSize: 11 },
  tabTextActive: { color: colors.onBrandSecondary },
  card: { backgroundColor: '#FFF', marginVertical: 6, padding: 15, borderRadius: 12, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontWeight: '900', fontSize: 16, color: colors.onSurface },
  cardSub: { color: colors.muted, fontSize: 13, marginTop: 2 },
  cardDate: { color: colors.muted, fontSize: 10, marginTop: 5 },
  cardActions: { flexDirection: 'row', gap: 8 },
  downloadBtn: { backgroundColor: colors.success, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  emailBtn: { backgroundColor: colors.brandPrimary, height: 36, paddingHorizontal: 12, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 5 },
  emailBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 10 },
  viewBtn: { backgroundColor: colors.info, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: '#FFF', padding: 20, borderRadius: 16 },
  modalTitle: { fontWeight: '900', fontSize: 18, marginBottom: 5 },
  modalSub: { color: colors.muted, marginBottom: 15, fontSize: 13 },
  modalInput: { borderWidth: 2, borderColor: colors.border, borderRadius: 8, padding: 12, minHeight: 80, textAlignVertical: 'top', marginBottom: 20 },
  modalActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, height: 48, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { fontWeight: 'bold', color: colors.muted },
  sendBtn: { flex: 2, backgroundColor: colors.brandPrimary, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sendBtnText: { color: '#FFF', fontWeight: '900' },
  adminSectionTitle: { fontWeight: 'bold', fontSize: 18, marginBottom: spacing.md, color: colors.onSurface, marginTop: spacing.lg },
  bigAdminBtn: { backgroundColor: colors.brandPrimary, padding: spacing.lg, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  bigAdminBtnText: { color: '#FFF', fontWeight: 'bold', marginLeft: 10 },
  adminTip: { fontSize: 12, color: colors.muted, marginTop: 10, fontStyle: 'italic' },
  routeBox: { padding: spacing.md, backgroundColor: colors.surfaceTertiary, borderRadius: 8, marginTop: spacing.md },
  routeTitle: { fontWeight: 'bold', fontSize: 12, marginBottom: 8 },
  routeItem: { fontSize: 11, marginBottom: 4, color: colors.onSurfaceTertiary },
});

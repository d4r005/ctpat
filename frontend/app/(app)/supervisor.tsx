import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput, RefreshControl, Platform,
  ActivityIndicator, Alert, ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { useTranslation } from 'react-i18next';
import { useInspections } from '@/src/context/InspectionContext';
import { useAuth } from '@/src/context/AuthContext';
import { apiCall } from '@/src/api/client';
import { colors, spacing, typography } from '@/src/constants/theme';
import { generateConsolidatedReportHtml } from '@/src/utils/reportGenerator';
import ProcessTracker from '@/src/components/ProcessTracker';
import MainHeader from '@/src/components/MainHeader';

type TabType = 'caseta' | 'inspeccion' | 'embarque';

export default function Supervisor() {
  const { user, token } = useAuth();
  const router = useRouter();
  const { allInspections, refreshAll: refreshInspections, loading: inspLoading } = useInspections();
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<TabType>('caseta');
  const [allRecords, setAllRecords] = useState<any[]>([]);
  const [allTickets, setAllTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [query, setQuery] = useState('');
  const [reportLoading, setReportLoading] = useState<string | null>(null);

  const fetchEverything = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [records, tickets] = await Promise.all([
        apiCall<any[]>('/vehicle-records', { token }).catch(() => []),
        apiCall<any[]>('/shipping-tickets', { token }).catch(() => [])
      ]);
      await refreshInspections();
      setAllRecords(Array.isArray(records) ? records : []);
      setAllTickets(Array.isArray(tickets) ? tickets : []);
    } catch (e) {
      console.error("Error loading master data", e);
    } finally {
      setLoading(false);
    }
  }, [token, refreshInspections]);

  useFocusEffect(useCallback(() => { fetchEverything(); }, [fetchEverything]));

  const handleRepair = async () => {
    setSyncing(true);
    try {
      const res = await apiCall<any>('/admin/repair-links', { method: 'POST', token });
      Alert.alert("Auditoría Finalizada", `Se han recuperado ${res.reconstructed} registros y vinculado un total de ${res.total_records} folios.`);
      await fetchEverything();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setSyncing(false);
    }
  };

  const filteredData = useMemo(() => {
    const q = query.toLowerCase().trim();
    let source = activeTab === 'caseta' ? allRecords :
                 activeTab === 'inspeccion' ? allInspections : allTickets;

    return (source || []).filter((item: any) => {
      const plates = (item.placas_unidad || item.entry?.placas_unidad || '').toLowerCase();
      const name = (item.chofer_nombre || item.entry?.chofer_nombre || item.inspector_nombre || item.cliente || '').toLowerCase();
      return plates.includes(q) || name.includes(q);
    });
  }, [activeTab, query, allRecords, allInspections, allTickets]);

  const handlePdf = async (item: any) => {
    setReportLoading(item.id);
    try {
      const norm = (s: string) => s?.replace(/[^A-Z0-9]/g, '').toUpperCase() || '';
      const plates = item.placas_unidad || item.entry?.placas_unidad;
      const normPlates = norm(plates);

      const fullRecord = item.entry ? item : await apiCall<any>(`/vehicle-records/${item.id}`, { token }).catch(() => null);
      const matchTicket = allTickets.find(tk => norm(tk.placas_unidad) === normPlates);
      const matchInsps = allInspections.filter(i => i.record_id === item.id || norm(i.placas_unidad) === normPlates);

      const html = generateConsolidatedReportHtml({
        inspection: matchInsps[0] || { points: [] } as any,
        inspections: matchInsps,
        caseta: fullRecord,
        embarque: matchTicket
      });

      if (Platform.OS === 'web') {
        const win = window.open('', '_blank');
        win?.document.write(html); win?.document.close();
        setTimeout(() => win?.print(), 500);
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        await Sharing.shareAsync(uri);
      }
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setReportLoading(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <MainHeader title="NAF" subtitle="SUPERVISOR DEL PANEL" />

      <ScrollView stickyHeaderIndices={[1]} refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchEverything} />}>
        {/* HERRAMIENTAS ADMIN */}
        <View style={styles.adminBox}>
          <Text style={styles.adminTitle}>HERRAMIENTAS ADMIN</Text>
          <View style={styles.adminRow}>
            <Pressable style={styles.adminBtn} onPress={handleRepair} disabled={syncing}>
              {syncing ? <ActivityIndicator size={14} color={colors.brandPrimary} /> : <Ionicons name="link-outline" size={16} color={colors.brandPrimary} />}
              <Text style={styles.adminBtnText}>VINCULAR REGISTROS HUÉRFANOS</Text>
            </Pressable>
            <Pressable style={styles.adminBtn} onPress={() => router.push('/(app)/usuarios')}>
              <Ionicons name="people-outline" size={16} color="#333" />
              <Text style={styles.adminBtnText}>USUARIOS</Text>
            </Pressable>
          </View>
          <Pressable style={[styles.adminBtn, { marginTop: 8, backgroundColor: '#E0E7FF' }]} onPress={() => router.push('/(app)/analitica')}>
            <Ionicons name="stats-chart" size={16} color="#4338CA" />
            <Text style={[styles.adminBtnText, { color: '#4338CA' }]}>KPIS / REPORTE DE ANALÍTICA</Text>
          </Pressable>
        </View>

        <View style={styles.headerFixed}>
          <View style={styles.tabRow}>
            <TabBtn label="CASETA" icon="business" active={activeTab === 'caseta'} on={() => setActiveTab('caseta')} />
            <TabBtn label="INSPECCIÓN" icon="clipboard" active={activeTab === 'inspeccion'} on={() => setActiveTab('inspeccion')} />
            <TabBtn label="EMBARQUE" icon="cube" active={activeTab === 'embarque'} on={() => setActiveTab('embarque')} />
          </View>
          <View style={styles.searchCont}>
            <Ionicons name="search" size={20} color={colors.muted} />
            <TextInput
              style={styles.search}
              placeholder="Placas, compañía, tráiler..."
              value={query}
              onChangeText={setQuery}
            />
          </View>
        </View>

        <View style={{ padding: spacing.md }}>
          {filteredData.map((item) => (
            <MasterRow
              key={item.id}
              item={item}
              type={activeTab}
              t={t}
              onPdf={() => handlePdf(item)}
              loadingPdf={reportLoading === item.id}
              router={router}
              records={allRecords}
              tickets={allTickets}
              inspections={allInspections}
            />
          ))}
          {filteredData.length === 0 && !loading && (
            <Text style={styles.empty}>No hay registros para mostrar</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function TabBtn({ label, icon, active, on }: any) {
  return (
    <Pressable onPress={on} style={[styles.tab, active && styles.tabActive]}>
      <Ionicons name={icon} size={18} color={active ? '#FFF' : '#333'} />
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function MasterRow({ item, type, t, onPdf, loadingPdf, router, records, tickets, inspections }: any) {
  const normalize = (s: string) => s?.replace(/[^A-Z0-9]/g, '').toUpperCase() || '';
  const plates = item.placas_unidad || item.entry?.placas_unidad || 'S/P';
  const normPlates = normalize(plates);
  const subtitle = item.entry?.chofer_nombre || item.chofer_nombre || item.inspector_nombre || item.cliente || '-';
  const company = item.entry?.compania_transporte || item.compania_transportista || '-';

  const relatedRecord = type === 'caseta' ? item : records.find((r: any) => normalize(r.entry?.placas_unidad) === normPlates);
  const isFull = (relatedRecord?.entry?.tipo_unidad === 'full') || (item.inspection_type === '19_puntos' && item.numero_trailer?.includes('-2'));

  const relatedInsps = inspections.filter((i: any) => i.record_id === relatedRecord?.id || normalize(i.placas_unidad) === normPlates);
  const hasTicket = type === 'embarque' || tickets.some((tk: any) => normalize(tk.placas_unidad) === normPlates);
  const inspectionComplete = isFull ? relatedInsps.length >= 2 : relatedInsps.length >= 1;

  const steps = {
    entry: !!relatedRecord,
    inspection: inspectionComplete,
    shipping: hasTicket,
    exit: relatedRecord?.status === 'salida'
  };

  const status = (relatedRecord?.status || (item.status_general === 'bueno' ? 'inspeccionado' : 'entrada')).toUpperCase();

  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{plates} {item.numero_trailer ? `· ${item.numero_trailer}` : ''}</Text>
        <Text style={styles.rowSub}>{subtitle} {company !== '-' ? `· ${company}` : ''}</Text>

        <View style={{ marginVertical: 10 }}>
          <ProcessTracker steps={steps} compact />
        </View>

        <View style={styles.rowActions}>
           <Pressable style={styles.actionLink} onPress={() => router.push(type === 'inspeccion' ? `/inspection/${item.id}` : `/caseta/${relatedRecord?.id || item.id}`)}>
             <Ionicons name="create-outline" size={16} color="#333" />
             <Text style={styles.actionLinkText}>{type === 'inspeccion' ? 'EDITAR INSPECCIÓN' : 'EDITOR'}</Text>
           </Pressable>
           <Pressable style={styles.pdfBtn} onPress={onPdf} disabled={loadingPdf}>
             <Ionicons name="eye-outline" size={16} color="#FFF" />
             <Text style={styles.pdfBtnText}>VER REPORTE COMPLETO (PDF)</Text>
             {loadingPdf && <ActivityIndicator size="small" color="#FFF" style={{ marginLeft: 5 }} />}
           </Pressable>
           <Pressable style={styles.actionLink}>
              <Ionicons name="mail-outline" size={16} color="#333" />
              <Text style={styles.actionLinkText}>CORREO</Text>
           </Pressable>
        </View>
      </View>

      <View style={styles.statusSide}>
         <View style={[styles.statusChip, { backgroundColor: status === 'SALIDA' || status === 'SALIÓ' ? colors.success : status === 'INSPECCIONADO' ? colors.info : colors.warning }]}>
           <Text style={styles.statusChipText}>{status === 'INSPECCIONADO' ? 'BUENO' : status}</Text>
         </View>
         <View style={[styles.statusChip, { backgroundColor: inspectionComplete ? colors.success : colors.warning, marginTop: 4 }]}>
           <Text style={styles.statusChipText}>{inspectionComplete ? 'APROBADO' : 'PENDIENTE'}</Text>
         </View>
         <Pressable style={styles.deleteBtn}><Ionicons name="trash-outline" size={18} color={colors.error} /></Pressable>
         <Text style={styles.dateText}>{new Date(item.created_at || item.entry?.fecha_entrada).toLocaleDateString()}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F3F4F6' },
  adminBox: { backgroundColor: '#DBEAFE', padding: 15, margin: 10, borderWidth: 2, borderColor: '#1E40AF' },
  adminTitle: { fontWeight: '900', fontSize: 11, color: '#1E40AF', marginBottom: 10, letterSpacing: 1 },
  adminRow: { flexDirection: 'row', gap: 10 },
  adminBtn: { flex: 1, backgroundColor: '#FFF', padding: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#BFDBFE' },
  adminBtnText: { fontWeight: '900', fontSize: 9, color: '#1E40AF' },
  headerFixed: { backgroundColor: '#FFF', borderBottomWidth: 2, borderBottomColor: '#000' },
  tabRow: { flexDirection: 'row' },
  tab: { flex: 1, padding: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRightWidth: 1, borderRightColor: '#EEE' },
  tabActive: { backgroundColor: '#0A2540', borderBottomWidth: 4, borderBottomColor: colors.brandSecondary },
  tabText: { fontWeight: '900', fontSize: 11, color: '#333' },
  tabTextActive: { color: '#FFF' },
  searchCont: { padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: '#EEE' },
  search: { flex: 1, height: 40, fontSize: 14, fontWeight: '600' },
  row: { backgroundColor: '#FFF', padding: 15, marginBottom: 12, borderWidth: 2, borderColor: '#000', flexDirection: 'row' },
  rowTitle: { fontWeight: '900', fontSize: 15 },
  rowSub: { color: colors.muted, fontSize: 12, marginTop: 2, fontWeight: '600' },
  rowActions: { flexDirection: 'row', gap: 10, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' },
  actionLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionLinkText: { fontWeight: '900', fontSize: 10, textDecorationLine: 'underline' },
  pdfBtn: { backgroundColor: '#0A2540', paddingHorizontal: 12, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 6 },
  pdfBtnText: { color: '#FFF', fontWeight: '900', fontSize: 10 },
  statusSide: { alignItems: 'flex-end', width: 100 },
  statusChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 2, width: '100%', alignItems: 'center' },
  statusChipText: { color: '#FFF', fontWeight: '900', fontSize: 9 },
  dateText: { fontSize: 9, color: '#666', marginTop: 10, textAlign: 'right' },
  deleteBtn: { marginTop: 10, padding: 5 },
  empty: { textAlign: 'center', marginTop: 50, color: colors.muted, fontWeight: '700' }
});

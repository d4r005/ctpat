import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput, RefreshControl, Platform,
  ActivityIndicator, Alert
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
import { colors, spacing } from '@/src/constants/theme';
import { generateConsolidatedReportHtml } from '@/src/utils/reportGenerator';
import ProcessTracker from '@/src/components/ProcessTracker';
import MainHeader from '@/src/components/MainHeader';

type TabType = 'caseta' | 'inspeccion' | 'embarque';

export default function Supervisor() {
  const { user, token } = useAuth();
  const userEmail = user?.email?.toLowerCase().trim() || '';
  const isAdminOrSup = user?.role === 'admin' || user?.role === 'supervisor' ||
                        userEmail.includes('d.trujillo') || userEmail.includes('d4r005');

  const router = useRouter();
  const { allInspections, refreshAll: refreshInspections, loading: inspLoading } = useInspections();
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<TabType>('caseta');
  const [allRecords, setAllRecords] = useState<any[]>([]);
  const [allTickets, setAllTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [reportLoading, setReportLoading] = useState<string | null>(null);

  const fetchEverything = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const recordsPromise = apiCall<any[]>('/vehicle-records', { token }).catch(() => []);
      const ticketsPromise = apiCall<any[]>('/shipping-tickets', { token }).catch(() => []);

      const [records, tickets] = await Promise.all([recordsPromise, ticketsPromise]);
      await refreshInspections();

      setAllRecords(Array.isArray(records) ? records : []);
      setAllTickets(Array.isArray(tickets) ? tickets : []);
    } catch (e: any) {
      console.error("Master Panel load error", e);
    } finally {
      setLoading(false);
    }
  }, [token, refreshInspections]);

  useFocusEffect(useCallback(() => { fetchEverything(); }, [fetchEverything]));

  const filteredData = useMemo(() => {
    const q = query.toLowerCase().trim();
    const normalize = (s: string) => s?.replace(/[^A-Z0-9]/g, '').toUpperCase() || '';

    let source: any[] = [];
    if (activeTab === 'inspeccion') {
      source = allInspections;
    } else if (activeTab === 'embarque') {
      source = allTickets;
    } else {
      // PESTAÑA CASETA: Mezclamos registros reales con inspecciones huérfanas para trazabilidad total
      const recordsPlates = new Set(allRecords.map(r => normalize(r.entry?.placas_unidad)));

      // Crear "registros virtuales" para inspecciones que no tienen un registro de caseta
      const orphanInsps = allInspections.filter(insp => !recordsPlates.has(normalize(insp.placas_unidad)));
      const virtualRecords = orphanInsps.map(insp => ({
        id: `virtual-${insp.id}`,
        status: insp.approval_status === 'aprobada' ? 'inspeccionado' : 'entrada',
        created_at: insp.created_at,
        entry: {
          placas_unidad: insp.placas_unidad,
          chofer_nombre: insp.inspector_nombre, // Fallback al inspector si no hay chofer
          compania_transporte: insp.compania_transportista,
          fecha_entrada: insp.created_at,
          numero_caja: insp.numero_trailer,
          sello_entrada: insp.numero_precinto
        },
        inspection_id: insp.id,
        _is_virtual: true
      }));

      source = [...allRecords, ...virtualRecords];
    }

    if (!q) return source;

    return source.filter((item: any) => {
      const plates = (item.placas_unidad || item.entry?.placas_unidad || '').toLowerCase();
      const driver = (item.chofer_nombre || item.entry?.chofer_nombre || '').toLowerCase();
      const client = (item.cliente || '').toLowerCase();
      const company = (item.compania_transporte || item.entry?.compania_transporte || '').toLowerCase();
      return plates.includes(q) || driver.includes(q) || client.includes(q) || company.includes(q);
    });
  }, [activeTab, query, allRecords, allInspections, allTickets]);

  const handlePdf = async (record: any) => {
    setReportLoading(record.id);
    try {
      const norm = (s: string) => s?.replace(/[^A-Z0-9]/g, '').toUpperCase() || '';
      const plates = record.placas_unidad || record.entry?.placas_unidad;
      const normPlates = norm(plates);

      // Si es virtual, ya tenemos el ID de inspección
      let fullRecord = record._is_virtual ? record : await apiCall<any>(`/vehicle-records/${record.id}`, { token });

      const matchTicket = (allTickets || []).find(tk => norm(tk.placas_unidad) === normPlates);
      const matchInsps = (allInspections || []).filter(i =>
        i.record_id === record.id ||
        i.id === record.inspection_id ||
        (Array.isArray(fullRecord.inspection_ids) && fullRecord.inspection_ids.includes(i.id)) ||
        norm(i.placas_unidad) === normPlates
      );

      const html = generateConsolidatedReportHtml({
        inspection: matchInsps[0] || { points: [] } as any,
        inspections: matchInsps,
        caseta: fullRecord._is_virtual ? null : fullRecord, // Si es virtual, no hay datos de caseta reales
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

  if (!isAdminOrSup) {
    return (
      <SafeAreaView style={styles.safe}>
        <MainHeader title="NAF" subtitle="ACCESO RESTRINGIDO" />
        <View style={styles.center}><Text style={styles.empty}>{t('acceso_restringido')}</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <MainHeader title="NAF" subtitle="PANEL MAESTRO" />

      <View style={styles.headerCont}>
        <View style={styles.tabRow}>
          {(['caseta', 'inspeccion', 'embarque'] as TabType[]).map(tab => (
            <Pressable key={tab} onPress={() => setActiveTab(tab)} style={[styles.tab, activeTab === tab && styles.tabActive]}>
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{t(tab).toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          style={styles.search}
          placeholder={t('buscar_placeholder')}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      <FlatList
        data={filteredData}
        keyExtractor={i => i.id || Math.random().toString()}
        refreshControl={<RefreshControl refreshing={loading || inspLoading} onRefresh={fetchEverything} tintColor={colors.brandPrimary} />}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 }}
        renderItem={({ item }) => (
          <MasterRow
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
        )}
        ListEmptyComponent={loading ? <ActivityIndicator color={colors.brandPrimary} style={{marginTop: 50}} /> : <Text style={styles.empty}>{t('no_hay_registros')}</Text>}
      />
    </SafeAreaView>
  );
}

function MasterRow({ item, type, t, onPdf, loadingPdf, router, records, tickets, inspections }: any) {
  const normalize = (s: string) => s?.replace(/[^A-Z0-9]/g, '').toUpperCase() || '';
  const plates = item.placas_unidad || item.entry?.placas_unidad || 'S/P';
  const normPlates = normalize(plates);
  const subtitle = item.inspector_nombre || item.entry?.chofer_nombre || item.cliente || '-';

  const relatedRecord = type === 'caseta' ? item : records.find((r: any) => normalize(r.entry?.placas_unidad) === normPlates);
  const isFull = (relatedRecord?.entry?.tipo_unidad === 'full') || (item.inspection_type === '19_puntos' && item.numero_trailer?.includes('-2'));

  const relatedInsps = inspections.filter((i: any) =>
    i.record_id === relatedRecord?.id ||
    i.id === item.inspection_id ||
    normalize(i.placas_unidad) === normPlates
  );

  const hasTicket = type === 'embarque' || tickets.some((tk: any) => normalize(tk.placas_unidad) === normPlates);
  const inspectionComplete = isFull ? relatedInsps.length >= 2 : relatedInsps.length >= 1;

  const steps = {
    entry: !!relatedRecord && !relatedRecord._is_virtual,
    inspection: inspectionComplete,
    shipping: hasTicket,
    exit: relatedRecord?.status === 'salida'
  };

  const navigateToDetail = () => {
    if (item._is_virtual) {
      router.push(`/inspection/${item.inspection_id}`);
      return;
    }
    const targetId = relatedRecord?.id || item.id;
    if (type === 'caseta' || relatedRecord) router.push(`/caseta/${targetId}`);
    else if (type === 'embarque') router.push(`/embarque/${item.id}`);
    else router.push(`/inspection/${item.id}`);
  };

  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{plates} {isFull ? '(FULL)' : ''} {item._is_virtual ? '(HISTÓRICO)' : ''}</Text>
        <Text style={styles.rowSub}>{subtitle}</Text>
        <View style={{ marginVertical: 8 }}>
          <ProcessTracker steps={steps} compact />
        </View>
        <View style={styles.actions}>
          <Pressable style={styles.iconBtn} onPress={navigateToDetail}>
            <Ionicons name="eye-outline" size={20} color={colors.brandPrimary} />
          </Pressable>
          <Pressable style={[styles.iconBtn, { backgroundColor: colors.brandPrimary }]} onPress={onPdf} disabled={loadingPdf}>
            {loadingPdf ? <ActivityIndicator size={16} color="#FFF" /> : <Ionicons name="document-text-outline" size={20} color="#FFF" />}
          </Pressable>
        </View>
      </View>
      <View style={styles.statusSide}>
        <View style={[styles.chip, { backgroundColor: (relatedRecord?.status === 'salida' || item.status === 'salida') ? colors.success : colors.warning }]}>
          <Text style={styles.chipText}>{(item.status || relatedRecord?.status || 'PROCESO').toUpperCase()}</Text>
        </View>
        <Text style={{ fontSize: 9, color: colors.muted, marginTop: 10 }}>{new Date(item.created_at || item.entry?.fecha_entrada).toLocaleDateString()}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerCont: { padding: spacing.md, gap: spacing.md },
  tabRow: { flexDirection: 'row', gap: 10 },
  tab: { flex: 1, padding: 12, alignItems: 'center', backgroundColor: colors.surfaceSecondary, borderWidth: 2, borderColor: colors.borderStrong },
  tabActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  tabText: { fontWeight: '900', fontSize: 10, color: colors.muted },
  tabTextActive: { color: '#FFF' },
  search: { backgroundColor: '#FFF', borderWidth: 2, borderColor: colors.borderStrong, padding: 12, fontSize: 14, fontWeight: '700' },
  row: { backgroundColor: colors.surfaceSecondary, padding: 15, marginBottom: 10, borderWidth: 2, borderColor: colors.borderStrong, flexDirection: 'row' },
  rowTitle: { fontWeight: '900', fontSize: 16 },
  rowSub: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 15, marginTop: 5 },
  iconBtn: { padding: 8, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 4 },
  statusSide: { alignItems: 'flex-end', justifyContent: 'space-between' },
  chip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 2 },
  chipText: { color: '#FFF', fontWeight: '900', fontSize: 9 },
  empty: { textAlign: 'center', marginTop: 50, color: colors.muted, fontWeight: '700' }
});

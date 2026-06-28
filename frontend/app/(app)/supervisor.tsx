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
import { useInspections, Inspection } from '@/src/context/InspectionContext';
import { useAuth } from '@/src/context/AuthContext';
import { apiCall } from '@/src/api/client';
import { colors, spacing, typography } from '@/src/constants/theme';
import { generateConsolidatedReportHtml } from '@/src/utils/reportGenerator';
import ProcessTracker from '@/src/components/ProcessTracker';
import MainHeader from '@/src/components/MainHeader';

type TabType = 'caseta' | 'inspeccion' | 'embarque';

export default function Supervisor() {
  const { user, token } = useAuth();
  const userEmail = user?.email?.toLowerCase().trim() || '';
  // Definición de admin coincidente con InspectionContext
  const isAdmin = user?.role === 'admin' || user?.role === 'supervisor' ||
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
      const [records, tickets] = await Promise.all([
        apiCall<any[]>('/vehicle-records', { token }),
        apiCall<any[]>('/shipping-tickets', { token }),
        refreshInspections()
      ]);
      setAllRecords(Array.isArray(records) ? records : []);
      setAllTickets(Array.isArray(tickets) ? tickets : []);
    } catch (e) {
      console.error("Master Panel load error", e);
    } finally {
      setLoading(false);
    }
  }, [token, refreshInspections]);

  useFocusEffect(useCallback(() => { fetchEverything(); }, [fetchEverything]));

  const filteredData = useMemo(() => {
    const q = query.toLowerCase().trim();
    let data = activeTab === 'caseta' ? allRecords :
               activeTab === 'inspeccion' ? allInspections : allTickets;

    return (data || []).filter((item: any) => {
      const plates = item.placas_unidad || item.entry?.placas_unidad || '';
      const name = item.chofer_nombre || item.inspector_nombre || item.cliente || '';
      return plates.toLowerCase().includes(q) || name.toLowerCase().includes(q);
    });
  }, [activeTab, query, allRecords, allInspections, allTickets]);

  const handlePdf = async (recordId: string, plates: string) => {
    setReportLoading(recordId);
    try {
      const fullRecord = await apiCall<any>(`/vehicle-records/${recordId}`, { token });
      const tickets = await apiCall<any[]>('/shipping-tickets', { token });
      const norm = (s: string) => s?.replace(/[^A-Z0-9]/g, '').toUpperCase() || '';
      const matchTicket = (tickets || []).find(tk => norm(tk.placas_unidad) === norm(plates));

      const matchInsp = (allInspections || []).find(i => norm(i.placas_unidad) === norm(plates));

      const html = generateConsolidatedReportHtml({
        inspection: matchInsp || { points: [] } as any,
        caseta: fullRecord,
        embarque: matchTicket
      });

      if (Platform.OS === 'web') {
        const win = window.open('', '_blank');
        win?.document.write(html);
        win?.document.close();
        setTimeout(() => win?.print(), 500);
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        await Sharing.shareAsync(uri);
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setReportLoading(null);
    }
  };

  if (!isAdmin) {
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
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchEverything} />}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 }}
        renderItem={({ item }) => (
          <MasterRow
            item={item}
            type={activeTab}
            t={t}
            onPdf={() => handlePdf(item.id, item.placas_unidad || item.entry?.placas_unidad)}
            loadingPdf={reportLoading === item.id}
            router={router}
          />
        )}
        ListEmptyComponent={<Text style={styles.empty}>{t('no_hay_registros')}</Text>}
      />
    </SafeAreaView>
  );
}

function MasterRow({ item, type, t, onPdf, loadingPdf, router }: any) {
  const plates = item.placas_unidad || item.entry?.placas_unidad || 'S/P';
  const subtitle = item.inspector_nombre || item.entry?.chofer_nombre || item.cliente || '-';

  const steps = {
    entry: true,
    inspection: !!(item.inspection_id || item.inspection_ids?.length || type === 'inspeccion'),
    shipping: !!(item.has_shipping_ticket || type === 'embarque'),
    exit: item.status === 'salida'
  };

  const navigateToDetail = () => {
    const route = type === 'caseta' ? `/caseta/${item.id}` :
                  type === 'embarque' ? `/embarque/${item.id}` :
                  `/inspection/${item.id}`;
    router.push(route);
  };

  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{plates}</Text>
        <Text style={styles.rowSub}>{subtitle}</Text>
        <View style={{ marginVertical: 8 }}>
          <ProcessTracker steps={steps} compact />
        </View>
        <View style={styles.actions}>
          <Pressable style={styles.iconBtn} onPress={navigateToDetail}>
            <Ionicons name="create-outline" size={20} color={colors.brandPrimary} />
          </Pressable>
          <Pressable style={[styles.iconBtn, { backgroundColor: colors.brandPrimary }]} onPress={onPdf} disabled={loadingPdf}>
            {loadingPdf ? <ActivityIndicator size={16} color="#FFF" /> : <Ionicons name="document-text-outline" size={20} color="#FFF" />}
          </Pressable>
        </View>
      </View>
      <View style={styles.statusSide}>
        <View style={[styles.chip, { backgroundColor: item.status === 'salida' ? colors.success : colors.warning }]}>
          <Text style={styles.chipText}>{(item.status || 'PROCESO').toUpperCase()}</Text>
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
  tab: { flex: 1, padding: 12, alignItems: 'center', backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  tabActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  tabText: { fontWeight: '900', fontSize: 10, color: colors.muted },
  tabTextActive: { color: '#FFF' },
  search: { backgroundColor: '#FFF', borderWidth: 2, borderColor: colors.borderStrong, padding: 12, fontSize: 14 },
  row: { backgroundColor: colors.surfaceSecondary, padding: 15, marginBottom: 10, borderWidth: 2, borderColor: colors.borderStrong, flexDirection: 'row' },
  rowTitle: { fontWeight: '900', fontSize: 16 },
  rowSub: { color: colors.muted, fontSize: 12 },
  actions: { flexDirection: 'row', gap: 15, marginTop: 5 },
  iconBtn: { padding: 8, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 4 },
  statusSide: { alignItems: 'flex-end', justifyContent: 'space-between' },
  chip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 2 },
  chipText: { color: '#FFF', fontWeight: '900', fontSize: 9 },
  empty: { textAlign: 'center', marginTop: 50, color: colors.muted, fontWeight: '700' }
});

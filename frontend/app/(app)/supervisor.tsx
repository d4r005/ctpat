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

type TabType = 'caseta' | 'inspeccion' | 'embarque';

export default function Supervisor() {
  const { user, token, loading: authLoading } = useAuth();
  const userEmail = user?.email?.toLowerCase().trim() || '';

  // ACCESO MAESTRO TOTAL
  const isMaster = userEmail.includes('d.trujillo') || userEmail.includes('d4r005') || user?.role === 'admin';
  const isSupervisor = user?.role === 'supervisor' || isMaster;

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
      const insp = allInspections.find(i => i.placas_unidad === plates);
      const record = allRecords.find(r => r.id === recordId);
      const ticket = allTickets.find(t => t.placas_unidad === plates);

      if (!insp) throw new Error('No se encontró inspección para esta unidad');

      const html = generateConsolidatedReportHtml({ inspection: insp, caseta: record, embarque: ticket }, 'es');
      const { uri } = await Print.printToFileAsync({ html, base64: false });

      if (Platform.OS === 'web') {
        alert('Reporte generado. Use el diálogo de impresión.');
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

  const filteredData = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (activeTab === 'caseta') {
      return allRecords.filter(r => r.entry.placas_unidad.toLowerCase().includes(q) || r.entry.chofer_nombre.toLowerCase().includes(q));
    } else if (activeTab === 'inspeccion') {
      return allInspections.filter(i => i.placas_unidad.toLowerCase().includes(q) || i.compania_transportista.toLowerCase().includes(q));
    } else {
      return allTickets.filter(t => t.placas_unidad.toLowerCase().includes(q) || t.cliente.toLowerCase().includes(q));
    }
  }, [activeTab, query, allRecords, allInspections, allTickets]);

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
          </View>
        </View>

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
          if (activeTab === 'inspeccion') return (
            <InspectionRow
              item={item}
              onEdit={() => router.push(`/inspection/${item.id}?edit=true`)}
              t={t}
            />
          );
          return (
            <TicketRow
              item={item}
              onEdit={() => router.push(`/embarque/${item.id}`)}
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

  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{e.placas_unidad} · {e.chofer_nombre}</Text>
        <Text style={styles.rowSub}>{e.compania_transporte} · {new Date(e.fecha_entrada).toLocaleString()}</Text>
        <View style={styles.btnRow}>
          <Pressable onPress={onEdit} style={styles.actionBtn}>
            <Ionicons name="create-outline" size={16} color={colors.brandPrimary} />
            <Text style={styles.actionText}>EDITAR</Text>
          </Pressable>
          <Pressable onPress={onPdf} style={styles.actionBtn} disabled={loadingPdf}>
            {loadingPdf ? <ActivityIndicator size={14} color={colors.brandPrimary} /> : <Ionicons name="document-outline" size={16} color={colors.brandPrimary} />}
            <Text style={styles.actionText}>PDF</Text>
          </Pressable>
          <Pressable onPress={onEmail} style={styles.actionBtn} disabled={loadingEmail}>
            {loadingEmail ? <ActivityIndicator size={14} color={colors.brandPrimary} /> : <Ionicons name="mail-outline" size={16} color={colors.brandPrimary} />}
            <Text style={styles.actionText}>EMAIL</Text>
          </Pressable>
        </View>
      </View>
      <View style={[styles.statusChip, { backgroundColor: statusColor }]}>
        <Text style={styles.statusChipText}>{item.status.toUpperCase()}</Text>
      </View>
    </View>
  );
}

function InspectionRow({ item, onEdit, t }: { item: Inspection, onEdit: () => void, t: any }) {
  const statusColor = item.approval_status === 'aprobada' ? colors.success : item.approval_status === 'rechazada' ? colors.error : colors.warning;
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{item.placas_unidad} · {item.numero_trailer}</Text>
        <Text style={styles.rowSub}>{item.inspector_nombre} · {new Date(item.created_at).toLocaleString()}</Text>
        <Pressable onPress={onEdit} style={[styles.actionBtn, { marginTop: 8 }]}>
          <Ionicons name="create-outline" size={16} color={colors.brandPrimary} />
          <Text style={styles.actionText}>EDITAR INSPECCIÓN</Text>
        </Pressable>
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

function TicketRow({ item, onEdit }: any) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{item.placas_unidad} · {item.cliente}</Text>
        <Text style={styles.rowSub}>{item.almacenista} · {new Date(item.created_at).toLocaleString()}</Text>
        <Pressable onPress={onEdit} style={[styles.actionBtn, { marginTop: 8 }]}>
          <Ionicons name="create-outline" size={16} color={colors.brandPrimary} />
          <Text style={styles.actionText}>EDITAR TICKET</Text>
        </Pressable>
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

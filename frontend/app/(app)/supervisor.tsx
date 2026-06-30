import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, RefreshControl, Platform,
  ActivityIndicator, Alert, ScrollView, Modal, KeyboardAvoidingView, TouchableOpacity
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
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

// ─── Modal de Envío de Correo ───────────────────────────────────────────────
function EmailModal({
  visible,
  recordId,
  plates,
  token,
  onClose,
}: {
  visible: boolean;
  recordId: string;
  plates: string;
  token: string;
  onClose: () => void;
}) {
  const DEFAULT_EMAIL = 'd.trujillo@brancoindustries.com';
  const [extraInput, setExtraInput] = useState('');
  const [extraList, setExtraList] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

  const addEmail = () => {
    const e = extraInput.trim().toLowerCase();
    if (!isValidEmail(e)) { Alert.alert('Email inválido', 'Ingresa un correo válido'); return; }
    if (e === DEFAULT_EMAIL.toLowerCase()) { Alert.alert('Ya incluido', 'Ese correo ya está en la lista por defecto'); return; }
    if (extraList.includes(e)) { Alert.alert('Duplicado', 'Ese correo ya está en la lista'); return; }
    setExtraList(prev => [...prev, e]);
    setExtraInput('');
  };

  const removeEmail = (e: string) => setExtraList(prev => prev.filter(x => x !== e));

  const handleSend = async () => {
    setSending(true);
    setResult(null);
    try {
      // Timeout extendido para envío de correo (90s)
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 90000);
      const res = await apiCall<any>('/report/send-email', {
        method: 'POST',
        token,
        body: { record_id: recordId, extra_emails: extraList },
      });
      clearTimeout(tid);
      setResult({ ok: true, msg: res.message || 'Reporte en camino, revisa tu bandeja en unos momentos.' });
    } catch (e: any) {
      const msg = e.message || '';
      if (msg.includes('timeout') || msg.includes('AbortError')) {
        // Backend respondió pero la conexión fue lenta — puede que sí se envió
        setResult({ ok: true, msg: 'El reporte fue enviado al servidor. Revisa tu bandeja de correo en unos minutos.' });
      } else {
        setResult({ ok: false, msg: msg || 'Error al enviar el correo' });
      }
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setExtraInput('');
    setExtraList([]);
    setResult(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalBox}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Ionicons name="mail" size={18} color="#FFF" />
            <Text style={styles.modalTitle}>ENVIAR REPORTE POR CORREO</Text>
            <Pressable onPress={handleClose} hitSlop={10}>
              <Ionicons name="close" size={20} color="#FFF" />
            </Pressable>
          </View>

          <View style={styles.modalBody}>
            {/* Unidad */}
            <View style={styles.modalInfo}>
              <Text style={styles.modalInfoLabel}>Unidad</Text>
              <Text style={styles.modalInfoValue}>{plates || 'N/A'}</Text>
            </View>

            {/* Destinatario fijo */}
            <Text style={styles.sectionLabel}>DESTINATARIO PRINCIPAL (siempre incluido)</Text>
            <View style={styles.fixedEmail}>
              <Ionicons name="shield-checkmark-outline" size={14} color="#10B981" />
              <Text style={styles.fixedEmailText}>{DEFAULT_EMAIL}</Text>
            </View>

            {/* Agregar correos extra */}
            <Text style={[styles.sectionLabel, { marginTop: 14 }]}>AGREGAR DESTINATARIOS ADICIONALES</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.emailInput}
                placeholder="correo@ejemplo.com"
                placeholderTextColor="#9CA3AF"
                value={extraInput}
                onChangeText={setExtraInput}
                keyboardType="email-address"
                autoCapitalize="none"
                onSubmitEditing={addEmail}
                returnKeyType="done"
              />
              <Pressable style={styles.addBtn} onPress={addEmail}>
                <Ionicons name="add" size={18} color="#FFF" />
              </Pressable>
            </View>

            {/* Lista de extras */}
            {extraList.length > 0 && (
              <View style={styles.extraList}>
                {extraList.map(e => (
                  <View key={e} style={styles.extraChip}>
                    <Text style={styles.extraChipText}>{e}</Text>
                    <Pressable onPress={() => removeEmail(e)} hitSlop={8}>
                      <Ionicons name="close-circle" size={16} color="#EF4444" />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            {/* Resumen */}
            <View style={styles.summaryBox}>
              <Ionicons name="people-outline" size={14} color="#374151" />
              <Text style={styles.summaryText}>
                {1 + extraList.length} destinatario{1 + extraList.length > 1 ? 's' : ''} en total
              </Text>
            </View>

            {/* Resultado */}
            {result && (
              <View style={[styles.resultBox, { borderColor: result.ok ? '#10B981' : '#EF4444', backgroundColor: result.ok ? '#F0FDF4' : '#FEF2F2' }]}>
                <Ionicons name={result.ok ? 'checkmark-circle' : 'alert-circle'} size={16} color={result.ok ? '#10B981' : '#EF4444'} />
                <Text style={[styles.resultText, { color: result.ok ? '#065F46' : '#991B1B' }]}>{result.msg}</Text>
              </View>
            )}
          </View>

          {/* Botones */}
          <View style={styles.modalFooter}>
            <Pressable style={styles.cancelBtn} onPress={handleClose} disabled={sending}>
              <Text style={styles.cancelBtnText}>CANCELAR</Text>
            </Pressable>
            <Pressable
              style={[styles.sendBtn, sending && { opacity: 0.6 }]}
              onPress={result?.ok ? handleClose : handleSend}
              disabled={sending}
            >
              {sending
                ? <ActivityIndicator size="small" color="#FFF" />
                : <Ionicons name={result?.ok ? 'checkmark' : 'send'} size={16} color="#FFF" />
              }
              <Text style={styles.sendBtnText}>
                {sending ? 'ENVIANDO...' : result?.ok ? 'CERRAR' : 'ENVIAR REPORTE'}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Pantalla Principal ─────────────────────────────────────────────────────
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

  // Modal email
  const [emailModal, setEmailModal] = useState<{ visible: boolean; recordId: string; plates: string }>({
    visible: false, recordId: '', plates: '',
  });

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
    const normalize = (s: string) => s?.replace(/[^A-Z0-9]/g, '').toUpperCase() || '';

    const safeRecords = Array.isArray(allRecords) ? allRecords : [];
    const safeTickets = Array.isArray(allTickets) ? allTickets : [];
    const safeInsps = Array.isArray(allInspections) ? allInspections : [];

    let source: any[] = [];

    const recordsPlates = new Set(safeRecords.map(r => normalize(r.entry?.placas_unidad)));
    const ticketPlates = new Set(safeTickets.map(tk => normalize(tk.placas_unidad)));

    if (activeTab === 'caseta') {
      const virtuals = safeInsps
        .filter(i => !recordsPlates.has(normalize(i.placas_unidad)))
        .map(i => ({
           id: i.id, _is_virtual: true, status: 'inspeccionado', created_at: i.created_at,
           entry: { placas_unidad: i.placas_unidad, chofer_nombre: i.inspector_nombre, compania_transporte: i.compania_transportista, fecha_entrada: i.created_at, numero_caja: i.numero_trailer, sello_entrada: i.numero_precinto }
        }));
      source = [...safeRecords, ...virtuals];
    } else if (activeTab === 'inspeccion') {
      source = safeInsps;
    } else if (activeTab === 'embarque') {
      const pendingShipping = safeInsps
        .filter(i => !ticketPlates.has(normalize(i.placas_unidad)))
        .map(i => ({
          id: `p-${i.id}`,
          _is_pending: true,
          placas_unidad: i.placas_unidad,
          cliente: 'PENDIENTE DE DESPACHO',
          operador: i.inspector_nombre,
          created_at: i.created_at
        }));
      source = [...safeTickets, ...pendingShipping];
    }

    if (!q) return source;
    return source.filter((item: any) => {
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

      let fullRecord = item.entry && !item._is_virtual ? item : null;
      let matchTicket = allTickets.find(tk => norm(tk.placas_unidad) === normPlates);
      let matchInsps = allInspections.filter(i => i.record_id === item.id || norm(i.placas_unidad) === normPlates);

      if (!item._is_virtual && item.id && !item.id.startsWith('p-')) {
        try {
          const consolidated = await apiCall<any>(`/report/consolidated/${item.id}`, { token });
          if (consolidated) {
            fullRecord = consolidated.caseta || fullRecord;
            if (consolidated.inspections && consolidated.inspections.length > 0) matchInsps = consolidated.inspections;
            if (consolidated.embarque) matchTicket = consolidated.embarque;
          }
        } catch {
          if (!fullRecord) fullRecord = await apiCall<any>(`/vehicle-records/${item.id}`, { token }).catch(() => null);
        }
      } else if (!fullRecord) {
        fullRecord = await apiCall<any>(`/vehicle-records/${item.id}`, { token }).catch(() => null);
      }

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

  // Obtener el record_id real para un item del panel maestro
  const getRecordIdForEmail = (item: any): { recordId: string; plates: string } => {
    const plates = item.placas_unidad || item.entry?.placas_unidad || '';
    const norm = (s: string) => s?.replace(/[^A-Z0-9]/g, '').toUpperCase() || '';
    // Si el item tiene ID de registro real
    if (!item._is_virtual && !item._is_pending && item.id && !item.id.startsWith('p-') && item.entry) {
      return { recordId: item.id, plates };
    }
    // Buscar registro por placas
    const matched = allRecords.find(r => norm(r.entry?.placas_unidad) === norm(plates));
    return { recordId: matched?.id || item.id || '', plates };
  };

  const handleEmail = (item: any) => {
    const { recordId, plates } = getRecordIdForEmail(item);
    if (!recordId) {
      Alert.alert('Sin registro', 'No se encontró un registro de caseta para esta unidad. El correo requiere un folio completo.');
      return;
    }
    setEmailModal({ visible: true, recordId, plates });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <MainHeader title="NAF" subtitle="SUPERVISOR DEL PANEL" />

      {/* Modal de correo */}
      <EmailModal
        visible={emailModal.visible}
        recordId={emailModal.recordId}
        plates={emailModal.plates}
        token={token || ''}
        onClose={() => setEmailModal({ visible: false, recordId: '', plates: '' })}
      />

      <ScrollView
        stickyHeaderIndices={[1]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchEverything} />}
      >
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
            <TabBtn label="EMBARQUE" icon="bus" active={activeTab === 'embarque'} on={() => setActiveTab('embarque')} />
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
              onEmail={() => handleEmail(item)}
              loadingPdf={reportLoading === item.id}
              router={router}
              records={allRecords}
              tickets={allTickets}
              inspections={allInspections}
            />
          ))}
          {filteredData.length === 0 && !loading && (
            <Text style={styles.empty}>Sin registros para mostrar</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Tab Button ──────────────────────────────────────────────────────────────
function TabBtn({ label, icon, active, on }: any) {
  return (
    <Pressable style={[styles.tab, active && styles.tabActive]} onPress={on}>
      {({ pressed }) => (
        <Ionicons name={icon} size={18} color={active ? '#FFF' : '#333'} />
      )}
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

// ─── Master Row ──────────────────────────────────────────────────────────────
function MasterRow({ item, type, t, onPdf, onEmail, loadingPdf, router, records, tickets, inspections }: any) {
  const normalize = (s: string) => s?.replace(/[^A-Z0-9]/g, '').toUpperCase() || '';
  const plates = item.placas_unidad || item.entry?.placas_unidad || 'S/P';
  const normPlates = normalize(plates);
  const subtitle = item.entry?.chofer_nombre || item.chofer_nombre || item.inspector_nombre || item.cliente || '-';
  const company = item.entry?.compania_transporte || item.compania_transportista || '-';

  const relatedRecord = type === 'caseta' ? (item._is_virtual ? null : item) : records.find((r: any) => normalize(r.entry?.placas_unidad) === normPlates);
  const isFull = (relatedRecord?.entry?.tipo_unidad === 'full') || (item.inspection_type === '19_puntos' && item.numero_trailer?.includes('-2'));

  const relatedInsps = inspections.filter((i: any) => i.record_id === relatedRecord?.id || normalize(i.placas_unidad) === normPlates);
  const matchTicket = tickets.find((tk: any) => normalize(tk.placas_unidad) === normPlates);

  const recordInspCount = (relatedRecord?.inspection_ids?.length || 0) + (relatedRecord?.inspection_id && !relatedRecord?.inspection_ids?.includes(relatedRecord.inspection_id) ? 1 : 0);
  const localInspCount = relatedInsps.length;
  const totalInspCount = Math.max(recordInspCount, localInspCount);
  const inspectionComplete = isFull ? totalInspCount >= 2 : totalInspCount >= 1;

  const hasTicket = !!(relatedRecord?.has_shipping_ticket || relatedRecord?.shipping_ticket_id || matchTicket);

  const steps = {
    entry: !!relatedRecord || item._is_virtual,
    inspection: inspectionComplete,
    shipping: hasTicket,
    exit: relatedRecord?.status?.toLowerCase() === 'salida'
  };

  const rawStatus = relatedRecord?.status || (inspectionComplete ? 'inspeccionado' : 'entrada');
  const status = rawStatus.toUpperCase();

  // El botón de email se activa si hay registro real (no virtual/pending)
  const canEmail = !item._is_pending && (!!relatedRecord || (!item._is_virtual && item.entry));

  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>
          {plates} {item.numero_trailer ? `· ${item.numero_trailer}` : ''}{' '}
          {item._is_virtual || item._is_pending ? '(HISTÓRICO)' : ''}
        </Text>
        <Text style={styles.rowSub}>{subtitle} {company !== '-' ? `· ${company}` : ''}</Text>

        <View style={{ marginVertical: 10 }}>
          <ProcessTracker steps={steps} compact />
        </View>

        <View style={styles.rowActions}>
          <Pressable
            style={styles.actionLink}
            onPress={() => {
              if (type === 'inspeccion') router.push(`/inspection/${item.id}`);
              else if (type === 'embarque') router.push(`/embarque/${item.id}`);
              else router.push(`/caseta/${relatedRecord?.id || item.id}`);
            }}
          >
            <Ionicons name="create-outline" size={14} color="#333" />
            <Text style={styles.actionLinkText}>
              {type === 'inspeccion' ? 'EDITAR INSPECCIÓN' : type === 'embarque' ? 'EDITAR TICKET' : 'EDITOR CASETA'}
            </Text>
          </Pressable>

          <Pressable style={styles.pdfBtn} onPress={onPdf} disabled={loadingPdf}>
            <Ionicons name="eye-outline" size={16} color="#FFF" />
            <Text style={styles.pdfBtnText}>VER REPORTE (PDF)</Text>
            {loadingPdf && <ActivityIndicator size="small" color="#FFF" style={{ marginLeft: 5 }} />}
          </Pressable>

          {/* BOTÓN DE CORREO — funcional */}
          <Pressable
            style={[styles.emailBtn, !canEmail && styles.emailBtnDisabled]}
            onPress={canEmail ? onEmail : undefined}
            disabled={!canEmail}
          >
            <Ionicons name="mail-outline" size={14} color={canEmail ? '#0A2540' : '#9CA3AF'} />
            <Text style={[styles.emailBtnText, !canEmail && { color: '#9CA3AF' }]}>ENVIAR CORREO</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.statusSide}>
        <View style={[styles.statusChip, {
          backgroundColor: steps.exit ? '#10B981'
            : status === 'INSPECCIONADO' ? '#0284C7'
            : status === 'ENTRADA' ? '#F59E0B'
            : '#6B7280'
        }]}>
          <Text style={styles.statusChipText}>
            {steps.exit ? 'SALIÓ' : status === 'INSPECCIONADO' ? 'INSPECCIÓN OK' : status}
          </Text>
        </View>
        <View style={[styles.statusChip, { backgroundColor: inspectionComplete ? '#10B981' : '#94A3B8', marginTop: 4 }]}>
          <Text style={styles.statusChipText}>{inspectionComplete ? 'INSP. COMPLETA' : 'SIN INSPECCIÓN'}</Text>
        </View>
        <Pressable style={styles.deleteBtn}>
          <Ionicons name="trash-outline" size={18} color={colors.error} />
        </Pressable>
        <Text style={styles.dateText}>{new Date(item.created_at || item.entry?.fecha_entrada).toLocaleDateString()}</Text>
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F3F4F6' },
  // Admin
  adminBox: { backgroundColor: '#DBEAFE', padding: 15, margin: 10, borderWidth: 2, borderColor: '#1E40AF' },
  adminTitle: { fontWeight: '900', fontSize: 11, color: '#1E40AF', marginBottom: 10, letterSpacing: 1 },
  adminRow: { flexDirection: 'row', gap: 10 },
  adminBtn: { flex: 1, backgroundColor: '#FFF', padding: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#BFDBFE' },
  adminBtnText: { fontWeight: '900', fontSize: 9, color: '#1E40AF' },
  // Header/Tabs
  headerFixed: { backgroundColor: '#FFF', borderBottomWidth: 2, borderBottomColor: '#000' },
  tabRow: { flexDirection: 'row' },
  tab: { flex: 1, padding: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRightWidth: 1, borderRightColor: '#EEE' },
  tabActive: { backgroundColor: '#0A2540', borderBottomWidth: 4, borderBottomColor: '#F59E0B' },
  tabText: { fontWeight: '900', fontSize: 11, color: '#333' },
  tabTextActive: { color: '#FFF' },
  searchCont: { padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: '#EEE' },
  search: { flex: 1, height: 40, fontSize: 14, fontWeight: '600' },
  // Rows
  row: { backgroundColor: '#FFF', padding: 15, marginBottom: 12, borderWidth: 2, borderColor: '#000', flexDirection: 'row' },
  rowTitle: { fontWeight: '900', fontSize: 15 },
  rowSub: { color: '#6B7280', fontSize: 12, marginTop: 2, fontWeight: '600' },
  rowActions: { flexDirection: 'row', gap: 10, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' },
  actionLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionLinkText: { fontWeight: '900', fontSize: 9, textDecorationLine: 'underline' },
  pdfBtn: { backgroundColor: '#0A2540', paddingHorizontal: 12, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 6 },
  pdfBtnText: { color: '#FFF', fontWeight: '900', fontSize: 9 },
  emailBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1.5, borderColor: '#0A2540', borderRadius: 2 },
  emailBtnDisabled: { borderColor: '#D1D5DB' },
  emailBtnText: { fontWeight: '900', fontSize: 9, color: '#0A2540' },
  statusSide: { alignItems: 'flex-end', width: 100 },
  statusChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 2, width: '100%', alignItems: 'center' },
  statusChipText: { color: '#FFF', fontWeight: '900', fontSize: 9 },
  dateText: { fontSize: 9, color: '#666', marginTop: 10, textAlign: 'right' },
  deleteBtn: { marginTop: 10, padding: 5 },
  empty: { textAlign: 'center', marginTop: 50, color: '#6B7280', fontWeight: '700' },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalBox: { backgroundColor: '#FFF', width: '100%', maxWidth: 480, borderRadius: 4, overflow: 'hidden', borderWidth: 2, borderColor: '#0A2540' },
  modalHeader: { backgroundColor: '#0A2540', flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  modalTitle: { flex: 1, color: '#FFF', fontWeight: '900', fontSize: 13, letterSpacing: 1 },
  modalBody: { padding: 18 },
  modalInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F3F4F6', padding: 10, marginBottom: 14, borderRadius: 3 },
  modalInfoLabel: { fontWeight: '900', fontSize: 10, color: '#6B7280' },
  modalInfoValue: { fontWeight: '900', fontSize: 14, color: '#0A2540' },
  sectionLabel: { fontWeight: '900', fontSize: 9, color: '#374151', letterSpacing: 1, marginBottom: 6 },
  fixedEmail: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#10B981', padding: 10, borderRadius: 3 },
  fixedEmailText: { fontSize: 12, fontWeight: '700', color: '#065F46' },
  inputRow: { flexDirection: 'row', gap: 8 },
  emailInput: { flex: 1, borderWidth: 1.5, borderColor: '#D1D5DB', borderRadius: 3, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, fontWeight: '600' },
  addBtn: { backgroundColor: '#0A2540', width: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 3 },
  extraList: { marginTop: 10, gap: 6 },
  extraChip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', padding: 8, borderRadius: 3 },
  extraChipText: { fontSize: 12, fontWeight: '600', color: '#1E40AF', flex: 1 },
  summaryBox: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, backgroundColor: '#F9FAFB', padding: 8, borderRadius: 3 },
  summaryText: { fontSize: 11, fontWeight: '700', color: '#374151' },
  resultBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, borderWidth: 1, padding: 10, borderRadius: 3 },
  resultText: { flex: 1, fontSize: 12, fontWeight: '600' },
  modalFooter: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  cancelBtn: { flex: 1, padding: 14, alignItems: 'center', borderRightWidth: 1, borderRightColor: '#E5E7EB' },
  cancelBtnText: { fontWeight: '900', fontSize: 12, color: '#6B7280' },
  sendBtn: { flex: 2, padding: 14, backgroundColor: '#0A2540', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  sendBtnText: { color: '#FFF', fontWeight: '900', fontSize: 12 },
});

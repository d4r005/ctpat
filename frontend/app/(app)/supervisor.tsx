import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, RefreshControl, Platform,
  ActivityIndicator, Alert, ScrollView, Modal, KeyboardAvoidingView, FlatList,
  useWindowDimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { useTranslation } from 'react-i18next';
import { useInspections } from '@/src/context/InspectionContext';
import { useAuth } from '@/src/context/AuthContext';
import { supabase } from '@/src/api/supabase';
import { colors, spacing, radius, shadows } from '@/src/constants/theme';
import { generateConsolidatedReportHtml } from '@/src/utils/reportGenerator';
import ProcessTracker from '@/src/components/ProcessTracker';
import MainHeader from '@/src/components/MainHeader';

const isWeb = Platform.OS === 'web';
type TabType = 'caseta' | 'inspeccion' | 'embarque';

// ─── Modal de Envío de Correo ───────────────────────────────────────────────
function EmailModal({ visible, recordId, plates, token, onClose }: {
  visible: boolean; recordId: string; plates: string; token: string; onClose: () => void;
}) {
  const { t } = useTranslation();
  const DEFAULT_EMAIL = 'd.trujillo@brancoindustries.com';
  const [extraInput, setExtraInput] = useState('');
  const [extraList, setExtraList] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

  const addEmail = () => {
    const e = extraInput.trim().toLowerCase();
    if (!isValidEmail(e)) { Alert.alert(t('email_invalido_title'), t('email_invalido_msg')); return; }
    if (e === DEFAULT_EMAIL.toLowerCase()) { Alert.alert(t('ya_incluido_title'), t('ya_incluido_msg')); return; }
    if (extraList.includes(e)) { Alert.alert(t('duplicado_title'), t('duplicado_msg')); return; }
    setExtraList(prev => [...prev, e]); setExtraInput('');
  };

  const removeEmail = (e: string) => setExtraList(prev => prev.filter(x => x !== e));

  const handleSend = async () => {
    setSending(true); setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('send-report-email', {
        body: { record_id: recordId, extra_emails: extraList }
      });
      if (error) throw error;
      setResult({ ok: true, msg: data?.message || t('reporte_en_camino') });
    } catch (e: any) { setResult({ ok: false, msg: e.message || t('error_enviar_correo') }); }
    finally { setSending(false); }
  };

  const handleClose = () => { setExtraInput(''); setExtraList([]); setResult(null); onClose(); };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.modalBox}>
          <View style={s.modalHeader}>
            <Ionicons name="mail" size={18} color="#FFFFFF" />
            <Text style={s.modalTitle}>{t('enviar_reporte_correo').toUpperCase()}</Text>
            <Pressable onPress={handleClose} hitSlop={10}>
              <Ionicons name="close" size={20} color="#FFFFFF" />
            </Pressable>
          </View>
          <View style={s.modalBody}>
            <View style={s.modalInfoRow}>
              <Text style={s.modalInfoLabel}>{t('unidad')}</Text>
              <Text style={s.modalInfoValue}>{plates || 'N/A'}</Text>
            </View>
            <Text style={s.sectionLabel}>{t('destinatario_principal_desc').toUpperCase()}</Text>
            <View style={s.fixedEmailChip}>
              <Ionicons name="shield-checkmark" size={14} color={colors.success} />
              <Text style={s.fixedEmailText}>{DEFAULT_EMAIL}</Text>
            </View>
            <Text style={[s.sectionLabel, { marginTop: 14 }]}>{t('agregar_destinatarios').toUpperCase()}</Text>
            <View style={s.inputRow}>
              <TextInput style={s.emailInput} placeholder="correo@ejemplo.com" placeholderTextColor={colors.mutedLight}
                value={extraInput} onChangeText={setExtraInput} keyboardType="email-address" autoCapitalize="none"
                onSubmitEditing={addEmail} returnKeyType="done" />
              <Pressable style={s.addBtn} onPress={addEmail}>
                <Ionicons name="add" size={18} color="#FFFFFF" />
              </Pressable>
            </View>
            {extraList.length > 0 && (
              <View style={s.extraList}>
                {extraList.map(e => (
                  <View key={e} style={s.extraChip}>
                    <Text style={s.extraChipText}>{e}</Text>
                    <Pressable onPress={() => removeEmail(e)} hitSlop={8}>
                      <Ionicons name="close-circle" size={16} color={colors.error} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
            <View style={s.summaryBox}>
              <Ionicons name="people" size={14} color={colors.mutedDark} />
              <Text style={s.summaryText}>{t('destinatarios_total', { count: 1 + extraList.length })}</Text>
            </View>
            {result && (
              <View style={[s.resultBox, { borderColor: result.ok ? colors.success : colors.error, backgroundColor: result.ok ? colors.successSurface : colors.errorSurface }]}>
                <Ionicons name={result.ok ? 'checkmark-circle' : 'alert-circle'} size={16} color={result.ok ? colors.success : colors.error} />
                <Text style={[s.resultText, { color: result.ok ? colors.success : colors.error }]}>{result.msg}</Text>
              </View>
            )}
          </View>
          <View style={s.modalFooter}>
            <Pressable style={s.cancelBtn} onPress={handleClose} disabled={sending}>
              <Text style={s.cancelBtnText}>{t('cancelar').toUpperCase()}</Text>
            </Pressable>
            <Pressable style={[s.sendBtn, sending && { opacity: 0.6 }]} onPress={result?.ok ? handleClose : handleSend} disabled={sending}>
              {sending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name={result?.ok ? 'checkmark' : 'send'} size={16} color="#FFFFFF" />}
              <Text style={s.sendBtnText}>{sending ? t('enviando').toUpperCase() : result?.ok ? t('cerrar').toUpperCase() : t('enviar_reporte').toUpperCase()}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── DuplicatesModal ─────────────────────────────────────────────────────────
function DuplicatesModal({ visible, token, onClose, onMerged }: { visible: boolean; token: string; onClose: () => void; onMerged: () => void; }) {
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<any[]>([]);
  const [merging, setMerging] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from('vehicle_records').select('*');
      if (error) throw error;
      const recordMap: Record<string, any[]> = {};
      (data || []).forEach(r => {
        const p = (r.plates || '').toUpperCase();
        if (!recordMap[p]) recordMap[p] = [];
        recordMap[p].push(r);
      });
      const dupGroups = Object.entries(recordMap)
        .filter(([_, recs]) => recs.length > 1)
        .map(([plates, recs]) => ({
          canon: plates,
          records: recs.map(r => ({ id: r.id, placas: r.plates, chofer: r.entry_data?.chofer_nombre,
            status: r.status, created_at: r.created_at, has_shipping_ticket: !!r.shipping_ticket_id }))
        }));
      setGroups(dupGroups);
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setLoading(false); }
  }, [token]);

  React.useEffect(() => { if (visible) load(); }, [visible, load]);

  const handleMerge = (keepId: string, removeId: string, keepPlates: string, removePlates: string) => {
    Alert.alert('Fusionar registros',
      `Se conservará "${keepPlates}" y se le pasarán todas las inspecciones de "${removePlates}". El duplicado se eliminará. ¿Continuar?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Fusionar', style: 'destructive', onPress: async () => {
          setMerging(removeId);
          try {
            await supabase.from('inspections').update({ record_id: keepId }).eq('record_id', removeId);
            await supabase.from('vehicle_records').delete().eq('id', removeId);
            await load(); onMerged();
          } catch (e: any) { Alert.alert('Error', e.message); }
          finally { setMerging(null); }
        }}
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
        <View style={s.dupHeader}>
          <Pressable onPress={onClose} style={s.dupBackBtn}><Ionicons name="arrow-back" size={22} color={colors.onSurface} /></Pressable>
          <Text style={s.dupTitle}>Posibles duplicados por OCR</Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Text style={s.dupDesc}>
            Se agrupan registros cuya placa difiere solo en un carácter fácilmente confundido por OCR
            (Z/2, O/0, I/1, S/5, B/8, G/6). Elige cuál placa conservar — el otro registro se fusiona en ese y se elimina.
          </Text>
          {loading && <ActivityIndicator style={{ marginTop: 20 }} color={colors.brandPrimary} />}
          {!loading && groups.length === 0 && (
            <View style={s.dupEmpty}>
              <Ionicons name="checkmark-circle" size={40} color={colors.success} />
              <Text style={s.dupEmptyText}>No se encontraron duplicados por confusión de OCR 🎉</Text>
            </View>
          )}
          {groups.map((g) => (
            <View key={g.canon} style={s.dupGroup}>
              {g.records.map((r: any) => (
                <View key={r.id} style={s.dupRecord}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.dupPlates}>{r.placas}</Text>
                    <Text style={s.dupMeta}>{r.chofer || '-'} · {r.status} · {r.has_shipping_ticket ? 'con ticket' : 'sin ticket'}</Text>
                    <Text style={s.dupDate}>{new Date(r.created_at).toLocaleString()}</Text>
                  </View>
                  <Pressable disabled={merging === r.id} style={s.dupMergeBtn} onPress={() => {
                    const other = g.records.find((x: any) => x.id !== r.id);
                    if (other) handleMerge(r.id, other.id, r.placas, other.placas);
                  }}>
                    {merging === r.id ? <ActivityIndicator size={12} color="#FFFFFF" /> : <Text style={s.dupMergeBtnText}>Conservar</Text>}
                  </Pressable>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Tab Button ──────────────────────────────────────────────────────────────
function TabBtn({ label, icon, active, on, isMCI }: any) {
  const Icon = isMCI ? MaterialCommunityIcons : Ionicons;
  return (
    <Pressable
      style={({ pressed }) => [s.tab, active && s.tabActive, pressed && !active && { backgroundColor: colors.surfaceTertiary }]}
      onPress={on}
    >
      <Icon name={icon} size={18} color={active ? '#FFFFFF' : colors.mutedDark} />
      <Text style={[s.tabText, active && s.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

// ─── Master Row ──────────────────────────────────────────────────────────────
function MasterRow({ item, type, t, onPdf, onEmail, loadingPdf, router, records, tickets, inspections, isAdmin, token, onDeleted }: any) {
  const [deleting, setDeleting] = useState(false);
  const normalize = (s: string) => s?.replace(/[^A-Z0-9]/g, '').toUpperCase() || '';
  const getDate = (s: string) => s?.substring(0, 10) || '';
  const plates = item.plates || item.placas_unidad || item.entry?.placas_unidad || 'S/P';
  const normPlates = normalize(plates);
  const itemDate = getDate(item.created_at || item.entry?.fecha_entrada);
  const subtitle = item.entry?.chofer_nombre || item.chofer_nombre || item.inspector_nombre || item.cliente || '-';
  const company = item.entry?.compania_transporte || item.compania_transportista || '-';

  const relatedRecord = type === 'caseta' ? (item._is_virtual ? null : item) : records.find((r: any) => normalize(r.entry?.placas_unidad) === normPlates && getDate(r.created_at) === itemDate);
  const isFull = (relatedRecord?.entry?.tipo_unidad === 'full') || (item.inspection_type === '19_puntos' && item.numero_trailer?.includes('-2'));
  const isDescarga = relatedRecord?.entry?.condicion_carga === 'descarga';
  const showShipping = !isFull && !isDescarga;

  const relatedInsps = inspections.filter((i: any) => i.record_id === relatedRecord?.id || (normalize(i.placas_unidad) === normPlates && getDate(i.created_at) === itemDate));
  const matchTicket = tickets.find((tk: any) => normalize(tk.placas_unidad) === normPlates && getDate(tk.created_at) === itemDate);
  const recordInspCount = (relatedRecord?.inspection_ids?.length || 0) + (relatedRecord?.inspection_id && !relatedRecord?.inspection_ids?.includes(relatedRecord.inspection_id) ? 1 : 0);
  const totalInspCount = Math.max(recordInspCount, relatedInsps.length);
  const inspectionComplete = isFull ? totalInspCount >= 2 : totalInspCount >= 1;
  const hasTicket = !!(relatedRecord?.has_shipping_ticket || relatedRecord?.shipping_ticket_id || matchTicket);

  const steps = {
    entry: !!relatedRecord || item._is_virtual,
    inspection: inspectionComplete,
    shipping: hasTicket,
    exit: relatedRecord?.status?.toLowerCase() === 'salida' || item.status?.toLowerCase() === 'salida' || !!(item.exit?.fecha_salida)
  };

  const rawStatus = relatedRecord?.status || (inspectionComplete ? 'inspeccionado' : 'entrada');
  const status = rawStatus.toUpperCase();
  const canEmail = !item._is_pending && (!!relatedRecord || (!item._is_virtual && item.entry));
  const canGenerateTicket = !item._is_pending && inspectionComplete && !hasTicket && showShipping;
  const linkedInspectionId = relatedRecord?.inspection_id || relatedInsps[0]?.id || (type === 'inspeccion' ? item.id : '');

  const handleGenerateTicket = () => {
    router.push({
      pathname: '/embarque/nuevo',
      params: {
        record_id: relatedRecord?.id || '', inspection_id: linkedInspectionId || '',
        placas: plates !== 'S/P' ? plates : '', compania: relatedRecord?.entry?.compania_transporte || '',
        trailer: relatedRecord?.entry?.numero_caja || '', sello: relatedRecord?.entry?.sello_entrada || '',
        operador: relatedRecord?.entry?.chofer_nombre || '', destino: relatedRecord?.entry?.destino || '',
      },
    });
  };

  const canDelete = isAdmin && !item._is_virtual && !item._is_pending && !!item.id;

  const handleDelete = () => {
    if (!canDelete || deleting) return;
    Alert.alert(t('eliminar_proceso_title') || 'Eliminar proceso',
      (t('eliminar_proceso_msg', { plates }) as string) || `¿Seguro que quieres eliminar el proceso de la unidad ${plates}? No se puede deshacer.`,
      [
        { text: t('cancelar') || 'Cancelar', style: 'cancel' },
        { text: t('eliminar') || 'Eliminar', style: 'destructive', onPress: async () => {
          setDeleting(true);
          try {
            const table = type === 'inspeccion' ? 'inspections' : type === 'embarque' ? 'shipping_tickets' : 'vehicle_records';
            const { error } = await supabase.from(table).delete().eq('id', item.id);
            if (error) throw error;
            onDeleted?.();
          } catch (e: any) { Alert.alert(t('error') || 'Error', e.message); }
          finally { setDeleting(false); }
        }}
      ]
    );
  };

  const statusColor = steps.exit ? colors.success : status === 'INSPECCIONADO' ? colors.info : status === 'ENTRADA' ? colors.warning : colors.mutedLight;
  const statusSurface = steps.exit ? colors.successSurface : status === 'INSPECCIONADO' ? colors.infoSurface : status === 'ENTRADA' ? colors.warningSurface : colors.surfaceTertiary;
  const statusLabel = steps.exit ? t('salio').toUpperCase() : status === 'INSPECCIONADO' ? t('inspeccion_ok').toUpperCase() : status === 'ENTRADA' ? t('entrada').toUpperCase() : status;

  return (
    <View style={s.masterRow}>
      <View style={{ flex: 1 }}>
        <View style={s.masterRowTop}>
          <Text style={s.masterPlates}>
            {plates} {item.numero_trailer ? `· ${item.numero_trailer}` : ''}{' '}
            {item._is_virtual || item._is_pending ? `(${t('historico').toUpperCase()})` : ''}
          </Text>
          <View style={[s.statusBadge, { backgroundColor: statusSurface }]}>
            <View style={[s.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[s.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>
        <Text style={s.masterSub}>{subtitle} {company !== '-' ? `· ${company}` : ''}</Text>
        <View style={{ marginVertical: 10 }}>
          <ProcessTracker steps={steps} compact showShipping={showShipping} />
        </View>
        <View style={s.masterActions}>
          <Pressable style={s.actionBtn} onPress={() => {
            if (type === 'inspeccion') { router.push(`/inspection/${item.id}`); }
            else if (type === 'embarque') {
              if (item._is_pending_ticket) {
                router.push({ pathname: '/embarque/nuevo', params: {
                  inspection_id: item.id.replace('p-', ''), record_id: relatedRecord?.id || '',
                  placas: item.placas_unidad || '', compania: relatedRecord?.entry?.compania_transporte || '',
                  trailer: relatedRecord?.entry?.numero_caja || '', sello: relatedRecord?.entry?.sello_entrada || '',
                  operador: item.operador || relatedRecord?.entry?.chofer_nombre || '', destino: relatedRecord?.entry?.destino || '',
                }});
              } else { router.push(`/embarque/${item.id}`); }
            } else {
              const targetId = item.record_id || relatedRecord?.id || (item._is_virtual ? null : item.id);
              if (targetId) { router.push(`/caseta/${targetId}`); }
              else if (item._is_virtual) {
                router.push({ pathname: '/caseta/nuevo', params: {
                  placas: item.entry?.placas_unidad || '', chofer: item.entry?.chofer_nombre || '',
                  compania: item.entry?.compania_transporte || '', tractor: item.entry?.numero_tractor || '',
                  caja: item.entry?.numero_caja || '', sello: item.entry?.sello_entrada || '',
                }});
              } else { router.push(`/caseta/${item.id}`); }
            }
          }}>
            <Ionicons name="create-outline" size={14} color={colors.mutedDark} />
            <Text style={s.actionBtnText}>{type === 'inspeccion' ? t('editar_inspeccion').toUpperCase() : type === 'embarque' ? t('editar_ticket').toUpperCase() : ((item._is_virtual && !relatedRecord) ? t('registrar_entrada').toUpperCase() : t('editor_caseta').toUpperCase())}</Text>
          </Pressable>

          <Pressable style={s.pdfBtn} onPress={onPdf} disabled={loadingPdf}>
            <Ionicons name="eye-outline" size={15} color="#FFFFFF" />
            <Text style={s.pdfBtnText}>{t('ver_reporte_pdf').toUpperCase()}</Text>
            {loadingPdf && <ActivityIndicator size="small" color="#FFFFFF" style={{ marginLeft: 5 }} />}
          </Pressable>

          <Pressable style={[s.emailBtn, !canEmail && s.emailBtnDisabled]} onPress={canEmail ? onEmail : undefined} disabled={!canEmail}>
            <Ionicons name="mail-outline" size={14} color={canEmail ? colors.brandPrimary : colors.mutedLight} />
            <Text style={[s.emailBtnText, !canEmail && { color: colors.mutedLight }]}>{t('enviar_correo_caps').toUpperCase()}</Text>
          </Pressable>

          {canGenerateTicket && (
            <Pressable style={s.ticketBtn} onPress={handleGenerateTicket}>
              <Ionicons name="cube-outline" size={14} color="#FFFFFF" />
              <Text style={s.ticketBtnText}>{(t('generar_ticket_caps') || 'GENERAR TICKET').toUpperCase()}</Text>
            </Pressable>
          )}
        </View>
      </View>

      <View style={s.masterSide}>
        {type === 'embarque' && (
          <View style={[s.sideBadge, { backgroundColor: item._is_pending_ticket ? colors.warningSurface : colors.successSurface, marginBottom: 4 }]}>
            <Text style={[s.sideBadgeText, { color: item._is_pending_ticket ? colors.warning : colors.success }]}>
              {item._is_pending_ticket ? t('pendiente').toUpperCase() : t('realizados').toUpperCase()}
            </Text>
          </View>
        )}
        <View style={[s.sideBadge, { backgroundColor: inspectionComplete ? colors.successSurface : colors.surfaceTertiary }]}>
          <Text style={[s.sideBadgeText, { color: inspectionComplete ? colors.success : colors.mutedLight }]}>{inspectionComplete ? t('insp_completa').toUpperCase() : t('sin_inspeccion').toUpperCase()}</Text>
        </View>
        {canDelete && (
          <Pressable style={s.deleteBtn} onPress={handleDelete} disabled={deleting}>
            {deleting ? <ActivityIndicator size="small" color={colors.error} /> : <Ionicons name="trash-outline" size={16} color={colors.error} />}
          </Pressable>
        )}
        <Text style={s.masterDate}>{new Date(item.created_at || item.entry?.fecha_entrada).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' })}</Text>
      </View>
    </View>
  );
}

// ─── Pantalla Principal ─────────────────────────────────────────────────────
export default function Supervisor() {
  const { user, token } = useAuth();
  const router = useRouter();
  const { allInspections, refreshAll: refreshInspections, loading: inspLoading } = useInspections();
  const { t, i18n } = useTranslation();
  const { width } = useWindowDimensions();
  const isDesktop = isWeb && width >= 1080;

  const isAdminOrSup = user?.role === 'admin' || user?.role === 'supervisor' ||
    ['d.trujillo@brancoindustries.com', 'd4r005@gmail.com'].includes(user?.email || '');

  React.useEffect(() => {
    if (user && !isAdminOrSup) router.replace('/inicio');
  }, [user, isAdminOrSup, router]);

  if (user && !isAdminOrSup) return null;

  const [activeTab, setActiveTab] = useState<TabType>('caseta');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [allRecords, setAllRecords] = useState<any[]>([]);
  const [allTickets, setAllTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [forceSyncing, setForceSyncing] = useState(false);
  const [query, setQuery] = useState('');
  const [reportLoading, setReportLoading] = useState<string | null>(null);
  const [emailModal, setEmailModal] = useState<{ visible: boolean; recordId: string; plates: string }>({ visible: false, recordId: '', plates: '' });
  const [duplicatesModalVisible, setDuplicatesModalVisible] = useState(false);

  React.useEffect(() => {
    if (activeTab === 'inspeccion' && token) refreshInspections();
  }, [activeTab, token, refreshInspections]);

  const fetchEverything = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [recsRes, ticksRes] = await Promise.all([
        supabase.from('vehicle_records').select('*').order('created_at', { ascending: false }),
        supabase.from('shipping_tickets').select('*').order('created_at', { ascending: false })
      ]);
      await refreshInspections();
      setAllRecords(recsRes.data?.map(r => ({ ...r, entry: r.entry_data, exit: r.exit_data })) || []);
      setAllTickets(ticksRes.data?.map(t => ({ ...t, ...t.data })) || []);
    } catch (e) { console.error("Error loading master data", e); }
    finally { setLoading(false); }
  }, [token, refreshInspections]);

  useFocusEffect(useCallback(() => { fetchEverything(); }, [fetchEverything]));

  const handleRepair = async () => {
    setSyncing(true);
    try {
      const { data: orphans, error: errOrp } = await supabase.from('inspections').select('*').is('record_id', null);
      if (errOrp) throw errOrp;
      let reconstructed = 0;
      const normalize = (s: string) => s?.replace(/[^A-Z0-9]/g, '').toUpperCase() || '';
      const getDate = (s: string) => s?.substring(0, 10) || '';
      for (const insp of (orphans || [])) {
        const normP = normalize(insp.plates);
        const date = getDate(insp.created_at);
        const match = allRecords.find(r => normalize(r.entry?.placas_unidad) === normP && getDate(r.created_at) === date);
        if (match) { await supabase.from('inspections').update({ record_id: match.id }).eq('id', insp.id); reconstructed++; }
      }
      Alert.alert(t('auditoria_finalizada_title'), t('auditoria_finalizada_msg', { reconstructed, total_records: allRecords.length }));
      await fetchEverything();
    } catch (e: any) { Alert.alert(t('error'), e.message); }
    finally { setSyncing(false); }
  };

  const handleDeepRepair = () => {
    Alert.alert('🔧 Reparación Profunda', 'Esto analizará y corregirá vínculos rotos e inspecciones huérfanas. ¿Continuar?',
      [{ text: 'Cancelar', style: 'cancel' },
       { text: 'Reparar', style: 'destructive', onPress: async () => { setSyncing(true); try { await handleRepair(); Alert.alert('✅ Reparación Completada', 'Se intentaron vincular todas las inspecciones huérfanas.'); } catch (e: any) { Alert.alert('Error', e.message); } finally { setSyncing(false); } } }]
    );
  };

  const handleForceSync = () => {
    Alert.alert('🔄 Forzar Sincronización', 'Esto refrescará los datos locales desde Supabase. ¿Continuar?',
      [{ text: 'Cancelar', style: 'cancel' },
       { text: 'Sincronizar', onPress: async () => { setForceSyncing(true); try { await fetchEverything(); Alert.alert('✅ Sincronización Completada', 'Los datos han sido actualizados.'); } catch (e: any) { Alert.alert('Error', e.message); } finally { setForceSyncing(false); } } }]
    );
  };

  const filteredData = useMemo(() => {
    const q = query.toLowerCase().trim();
    const normalize = (s: string) => s?.replace(/[^A-Z0-9]/g, '').toUpperCase() || '';
    const getDate = (s: string) => s?.substring(0, 10) || '';
    const safeRecords = Array.isArray(allRecords) ? allRecords : [];
    const safeTickets = Array.isArray(allTickets) ? allTickets : [];
    const safeInsps = Array.isArray(allInspections) ? allInspections : [];
    let source: any[] = [];
    const todayStr = new Date().toLocaleDateString('en-CA');
    const activeDateStr = selectedDate || todayStr;

    if (activeTab === 'caseta') {
      const dayRecords = safeRecords.filter(r => getDate(r.created_at) === activeDateStr);
      const dayInsps = safeInsps.filter(i => getDate(i.created_at) === activeDateStr);
      const recordsByPlateDate = new Set(dayRecords.map(r => `${normalize(r.entry?.placas_unidad)}|${getDate(r.created_at)}`));
      const recordsById = new Set(dayRecords.map(r => r.id));
      const virtuals = dayInsps.filter(i => {
        const normP = normalize(i.placas_unidad);
        const date = getDate(i.created_at);
        if (i.record_id && recordsById.has(i.record_id)) return false;
        if (recordsByPlateDate.has(`${normP}|${date}`)) return false;
        return true;
      }).map(i => ({ ...i, _is_virtual: true, status: 'inspeccionado', created_at: i.created_at,
        entry: { placas_unidad: i.placas_unidad, chofer_nombre: i.inspector_nombre, compania_transporte: i.compania_transportista, fecha_entrada: i.created_at, numero_caja: i.numero_trailer, sello_entrada: i.numero_precinto }
      }));
      source = [...dayRecords, ...virtuals];
    } else if (activeTab === 'inspeccion') {
      source = safeInsps.filter(i => getDate(i.created_at) === activeDateStr);
    } else if (activeTab === 'embarque') {
      const dayTickets = safeTickets.filter(tk => getDate(tk.created_at) === activeDateStr);
      const dayInsps = safeInsps.filter(i => getDate(i.created_at) === activeDateStr);
      const dayTicketPlatesDate = new Set(dayTickets.map(tk => `${normalize(tk.placas_unidad)}|${getDate(tk.created_at)}`));
      const pendingShipping = dayInsps.filter(i => !dayTicketPlatesDate.has(`${normalize(i.placas_unidad)}|${getDate(i.created_at)}`))
        .map(i => ({ id: `p-${i.id}`, _is_pending_ticket: true, placas_unidad: i.placas_unidad, cliente: t('pendiente_despacho').toUpperCase(), operador: i.inspector_nombre, created_at: i.created_at }));
      source = [...dayTickets, ...pendingShipping];
    }
    if (!q) return source;
    return source.filter((item: any) => {
      const plates = (item.placas_unidad || item.entry?.placas_unidad || '').toLowerCase();
      const name = (item.chofer_nombre || item.entry?.chofer_nombre || item.inspector_nombre || item.cliente || '').toLowerCase();
      return plates.includes(q) || name.includes(q);
    });
  }, [activeTab, query, allRecords, allInspections, allTickets, i18n.language, selectedDate]);

  const handlePdf = async (item: any) => {
    setReportLoading(item.id);
    try {
      const normalize = (s: string) => s?.replace(/[^A-Z0-9]/g, '').toUpperCase() || '';
      const getDate = (s: string) => s?.substring(0, 10) || '';
      const plates = item.placas_unidad || item.entry?.placas_unidad;
      const normPlates = normalize(plates);
      const itemDate = getDate(item.created_at || item.entry?.fecha_entrada);
      const matchTicket = allTickets.find(tk => normalize(tk.placas_unidad) === normPlates && getDate(tk.created_at) === itemDate);
      const matchInsps = allInspections.filter(i => i.record_id === item.id || (normalize(i.placas_unidad) === normPlates && getDate(i.created_at) === itemDate));
      const html = generateConsolidatedReportHtml({ inspection: matchInsps[0] || { points: [] } as any, inspections: matchInsps, caseta: item.entry ? item : null, embarque: matchTicket });
      await outputPdf(html);
    } catch (e: any) { Alert.alert(t('error'), e.message); }
    finally { setReportLoading(null); }
  };

  const outputPdf = async (html: string) => {
    if (Platform.OS === 'web') { const win = window.open('', '_blank'); win?.document.write(html); win?.document.close(); setTimeout(() => win?.print(), 500); }
    else { const { uri } = await Print.printToFileAsync({ html }); await Sharing.shareAsync(uri); }
  };

  const getRecordIdForEmail = (item: any): { recordId: string; plates: string } => {
    const plates = item.placas_unidad || item.entry?.placas_unidad || '';
    const norm = (s: string) => s?.replace(/[^A-Z0-9]/g, '').toUpperCase() || '';
    if (!item._is_virtual && !item._is_pending && item.id && !item.id.startsWith('p-') && item.entry) return { recordId: item.id, plates };
    const matched = allRecords.find(r => norm(r.entry?.placas_unidad) === norm(plates));
    return { recordId: matched?.id || item.id || '', plates };
  };

  const handleEmail = (item: any) => {
    const { recordId, plates } = getRecordIdForEmail(item);
    if (!recordId) { Alert.alert(t('sin_registro_title'), t('sin_registro_msg')); return; }
    setEmailModal({ visible: true, recordId, plates });
  };

  const adminTools = [
    { icon: 'link', label: t('vincular_huerfanos').toUpperCase(), color: colors.brandPrimary, surface: colors.brandTertiary, onPress: handleRepair, disabled: syncing, loading: syncing },
    { icon: 'people', label: t('usuarios_caps').toUpperCase(), color: colors.info, surface: colors.infoSurface, onPress: () => router.push('/(app)/usuarios'), disabled: false, loading: false },
    { icon: 'git-merge', label: 'DUPLICADOS POR OCR (FUSIONAR)', color: colors.warning, surface: colors.warningSurface, onPress: () => setDuplicatesModalVisible(true), disabled: false, loading: false },
    { icon: 'build', label: 'REPARACIÓN PROFUNDA (VÍNCULOS + FECHAS)', color: colors.error, surface: colors.errorSurface, onPress: handleDeepRepair, disabled: syncing, loading: syncing },
    { icon: 'cloud-upload', label: 'FORZAR SYNC OTROS DISPOSITIVOS', color: colors.success, surface: colors.successSurface, onPress: handleForceSync, disabled: forceSyncing, loading: forceSyncing },
    { icon: 'bar-chart', label: `${t('kpis')} / ${t('reporte_analitica').toUpperCase()}`, color: '#4338CA', surface: '#E0E7FF', onPress: () => router.push('/(app)/analitica'), disabled: false, loading: false },
  ];

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <MainHeader title="NAF" subtitle={t('panel').toUpperCase()} />

      <EmailModal visible={emailModal.visible} recordId={emailModal.recordId} plates={emailModal.plates} token={token || ''} onClose={() => setEmailModal({ visible: false, recordId: '', plates: '' })} />
      <DuplicatesModal visible={duplicatesModalVisible} token={token || ''} onClose={() => setDuplicatesModalVisible(false)} onMerged={fetchEverything} />

      <ScrollView stickyHeaderIndices={[1]} refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchEverything} tintColor={colors.brandPrimary} />}>
        {/* Admin tools */}
        <View style={s.adminGrid}>
          <Text style={s.adminLabel}>{t('admin_tools').toUpperCase()}</Text>
          <View style={s.adminCardRow}>
            {adminTools.map((tool, i) => (
              <Pressable key={i} style={({ pressed }) => [s.adminCard, pressed && { opacity: 0.88 }]} onPress={tool.onPress} disabled={tool.disabled}>
                <View style={[s.adminCardIcon, { backgroundColor: tool.surface }]}>
                  {tool.loading ? <ActivityIndicator size={14} color={tool.color} /> : <Ionicons name={tool.icon as any} size={16} color={tool.color} />}
                </View>
                <Text style={[s.adminCardText, { color: tool.color }]}>{tool.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Tabs + search */}
        <View style={s.stickyHeader}>
          <View style={s.tabRow}>
            <TabBtn label={t('caseta').toUpperCase()} icon="business" active={activeTab === 'caseta'} on={() => setActiveTab('caseta')} />
            <TabBtn label={t('inspeccion').toUpperCase()} icon="clipboard" active={activeTab === 'inspeccion'} on={() => setActiveTab('inspeccion')} />
            <TabBtn label={t('embarque').toUpperCase()} icon="truck-fast" active={activeTab === 'embarque'} on={() => setActiveTab('embarque')} isMCI />
          </View>
          <View style={s.dateRow}>
            <Ionicons name="calendar-outline" size={16} color={colors.muted} />
            <Pressable style={s.dateChip} onPress={() => {
              const base = selectedDate || new Date().toLocaleDateString('en-CA');
              const d = new Date(base + 'T12:00:00'); d.setDate(d.getDate() - 1);
              setSelectedDate(d.toLocaleDateString('en-CA'));
            }}>
              <Ionicons name="chevron-back" size={14} color={colors.onSurface} />
            </Pressable>
            <Text style={s.dateLabel}>
              {(() => {
                const todayStr = new Date().toLocaleDateString('en-CA');
                const active = selectedDate || todayStr;
                if (active === todayStr) return 'HOY · ' + new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }).toUpperCase();
                return new Date(active + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase();
              })()}
            </Text>
            <Pressable style={s.dateChip} onPress={() => {
              const base = selectedDate || new Date().toLocaleDateString('en-CA');
              const d = new Date(base + 'T12:00:00'); d.setDate(d.getDate() + 1);
              const todayStr = new Date().toLocaleDateString('en-CA');
              if (d.toLocaleDateString('en-CA') > todayStr) { setSelectedDate(''); } else { setSelectedDate(d.toLocaleDateString('en-CA')); }
            }}>
              <Ionicons name="chevron-forward" size={14} color={colors.onSurface} />
            </Pressable>
            {selectedDate && (
              <Pressable style={s.dateReset} onPress={() => setSelectedDate('')}>
                <Ionicons name="close" size={12} color={colors.muted} />
              </Pressable>
            )}
          </View>
          <View style={s.searchCont}>
            <View style={s.searchWrap}>
              <Ionicons name="search" size={16} color={colors.mutedLight} />
              <TextInput style={s.searchInput} placeholder={t('buscar_placeholder')} placeholderTextColor={colors.mutedLight} value={query} onChangeText={setQuery} />
              {query ? <Pressable onPress={() => setQuery('')} hitSlop={8}><Ionicons name="close-circle" size={16} color={colors.mutedLight} /></Pressable> : null}
            </View>
          </View>
        </View>

        {/* Data */}
        <View style={s.dataContainer}>
          {loading ? (
            <View style={s.loadingWrap}><ActivityIndicator size="large" color={colors.brandPrimary} /></View>
          ) : filteredData.length === 0 ? (
            <View style={s.emptyWrap}>
              <Ionicons name="documents-outline" size={40} color={colors.mutedLight} />
              <Text style={s.emptyText}>{t('no_hay_actividad') || 'Sin registros para mostrar'}</Text>
            </View>
          ) : (
            filteredData.map((item: any) => (
              <MasterRow key={item.id} item={item} type={activeTab} t={t} onPdf={() => handlePdf(item)} onEmail={() => handleEmail(item)}
                loadingPdf={reportLoading === item.id} router={router} records={allRecords} tickets={allTickets} inspections={allInspections}
                isAdmin={isAdminOrSup} token={token || ''} onDeleted={fetchEverything} />
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },

  // Admin tools
  adminGrid: { padding: 24 },
  adminLabel: { fontSize: 10, fontWeight: '900', color: colors.muted, letterSpacing: 2, marginBottom: 12, textTransform: 'uppercase' },
  adminCardRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  adminCard: {
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
    ...shadows.xs, flexGrow: 1, flexBasis: '47%',
  },
  adminCardIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  adminCardText: { fontSize: 11, fontWeight: '800', color: colors.onSurface, letterSpacing: 0.3, flexShrink: 1 },

  // Sticky header (tabs + date + search)
  stickyHeader: { backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: colors.border, ...shadows.sm },
  tabRow: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 16 },
  tab: {
    flex: 1, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 12, marginBottom: 12,
  },
  tabActive: { backgroundColor: colors.brandPrimary, ...shadows.xs },
  tabText: { fontWeight: '700', fontSize: 13, color: colors.mutedDark },
  tabTextActive: { color: '#FFFFFF', fontWeight: '800' },

  dateRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 24, backgroundColor: colors.surfaceTertiary,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  dateChip: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center'
  },
  dateLabel: { fontSize: 13, fontWeight: '800', color: colors.onSurface, letterSpacing: 1, flex: 1, textAlign: 'center' },
  dateReset: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },

  searchCont: { padding: 16 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, paddingHorizontal: 16, height: 46,
  },
  searchInput: { flex: 1, color: colors.onSurface, fontSize: 15, fontWeight: '600' },

  // Data
  dataContainer: { padding: 24, paddingBottom: 64 },
  loadingWrap: { alignItems: 'center', paddingVertical: 64 },
  emptyWrap: { alignItems: 'center', paddingVertical: 64 },
  emptyText: { color: colors.muted, fontWeight: '700', marginTop: 16, fontSize: 15 },

  masterRow: {
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.border,
    borderRadius: 16, padding: 20, marginBottom: 16, flexDirection: 'row', gap: 16, ...shadows.sm,
  },
  masterRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  masterPlates: { fontSize: 18, fontWeight: '900', color: colors.onSurface, flex: 1, letterSpacing: -0.5 },
  masterSub: { color: colors.muted, fontSize: 12, marginTop: 2, fontWeight: '600' },
  masterActions: { flexDirection: 'row', gap: 10, marginTop: 16, alignItems: 'center', flexWrap: 'wrap' },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: colors.surfaceTertiary, borderRadius: 10, borderWidth: 1, borderColor: colors.border
  },
  actionBtnText: { fontSize: 10, fontWeight: '800', color: colors.onSurface, letterSpacing: 0.5, textTransform: 'uppercase' },
  pdfBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: colors.brandPrimary, borderRadius: 10, ...shadows.xs
  },
  pdfBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' },
  emailBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1.5, borderColor: colors.brandPrimary, borderRadius: 10
  },
  emailBtnDisabled: { borderColor: colors.border, opacity: 0.5 },
  emailBtnText: { fontWeight: '800', fontSize: 10, color: colors.brandPrimary, letterSpacing: 0.5, textTransform: 'uppercase' },
  ticketBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: colors.warning, borderRadius: 10, ...shadows.xs
  },
  ticketBtnText: { fontWeight: '800', fontSize: 10, color: '#FFFFFF', letterSpacing: 0.5, textTransform: 'uppercase' },

  masterSide: { alignItems: 'flex-end', width: 110, gap: 6 },
  sideBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, width: '100%', alignItems: 'center' },
  sideBadgeText: { fontWeight: '900', fontSize: 9, letterSpacing: 0.5 },
  deleteBtn: { marginTop: 8, width: 36, height: 36, borderRadius: 10, backgroundColor: colors.errorSurface, alignItems: 'center', justifyContent: 'center' },
  masterDate: { fontSize: 10, color: colors.muted, marginTop: 8, fontWeight: '700', textAlign: 'right' },

  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },

  // Email modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox: { backgroundColor: '#FFFFFF', width: '100%', maxWidth: 500, borderRadius: 24, overflow: 'hidden', ...shadows.lg },
  modalHeader: { backgroundColor: colors.brandPrimary, flexDirection: 'row', alignItems: 'center', padding: 24, gap: 12 },
  modalTitle: { flex: 1, color: '#FFFFFF', fontWeight: '800', fontSize: 16, letterSpacing: 0.5 },
  modalBody: { padding: 24 },
  modalInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surfaceTertiary, padding: 16, marginBottom: 20, borderRadius: 12 },
  modalInfoLabel: { fontWeight: '800', fontSize: 10, color: colors.muted, letterSpacing: 1, textTransform: 'uppercase' },
  modalInfoValue: { fontWeight: '900', fontSize: 16, color: colors.onSurface },
  sectionLabel: { fontWeight: '900', fontSize: 10, color: colors.mutedDark, letterSpacing: 1.5, marginBottom: 8, textTransform: 'uppercase' },
  fixedEmailChip: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.successSurface, borderWidth: 1, borderColor: colors.success + '20', padding: 12, borderRadius: 12 },
  fixedEmailText: { fontSize: 13, fontWeight: '700', color: colors.success },
  inputRow: { flexDirection: 'row', gap: 10 },
  emailInput: {
    flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, fontWeight: '600',
    backgroundColor: colors.surfaceTertiary, color: colors.onSurface
  },
  addBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center', ...shadows.xs },
  extraList: { marginTop: 12, gap: 8 },
  extraChip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.infoSurface, borderWidth: 1, borderColor: colors.info + '10',
    padding: 10, borderRadius: 10
  },
  extraChipText: { fontSize: 13, fontWeight: '600', color: colors.info, flex: 1 },
  summaryBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, backgroundColor: colors.surfaceTertiary, padding: 12, borderRadius: 12 },
  summaryText: { fontSize: 12, fontWeight: '700', color: colors.mutedDark },
  resultBox: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, borderWidth: 1, padding: 14, borderRadius: 12 },
  resultText: { flex: 1, fontSize: 13, fontWeight: '700' },
  modalFooter: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.divider, padding: 16, gap: 12 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  cancelBtnText: { fontWeight: '800', fontSize: 14, color: colors.muted },
  sendBtn: { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: colors.brandPrimary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...shadows.xs },
  sendBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14, letterSpacing: 0.5 },
});

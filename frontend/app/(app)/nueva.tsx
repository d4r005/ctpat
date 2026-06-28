import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput, RefreshControl,
  ActivityIndicator, ScrollView, Platform, Alert, Image, KeyboardAvoidingView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useInspections, Inspection } from '@/src/context/InspectionContext';
import { useAuth } from '@/src/context/AuthContext';
import { apiCall } from '@/src/api/client';
import { colors, spacing, typography } from '@/src/constants/theme';
import ProcessTracker from '@/src/components/ProcessTracker';
import MainHeader from '@/src/components/MainHeader';
import { getInspectionPoints } from '@/src/constants/inspectionPoints';
import BarcodeScanner from '@/src/components/BarcodeScanner';
import Signature from '@/src/components/SignaturePad';
import * as ImagePicker from 'expo-image-picker';

const TOTAL_STEPS = 4;

export default function InspeccionDashboard() {
  const router = useRouter();
  const { token, user } = useAuth();
  const { t } = useTranslation();
  const { inspections, refresh: refreshInsps, loading: loadingInsps, saveInspection } = useInspections();

  const [records, setRecords] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [loadingExtra, setLoadingExtra] = useState(false);
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [unitFilter, setUnitFilter] = useState<'todos' | 'sencillo' | 'full'>('todos');

  // Estados del Formulario
  const [selectedType, setSelectedType] = useState<'19_puntos' | '9_puntos_contenedor' | null>(null);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<any>({
    compania: '', placas: '', trailer: '', precinto: '', precintoNA: false, selloAlta: '', selloVerificado: false,
    points: [], actSospechosa: '', inspectorNombre: user?.name || '', inspectorFirma: '', record_id: ''
  });

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoadingExtra(true);
    try {
      const [r, tick] = await Promise.all([
        apiCall<any[]>('/vehicle-records', { token }),
        apiCall<any[]>('/shipping-tickets', { token }),
        refreshInsps()
      ]);
      setRecords(r);
      setTickets(tick);
    } catch (e) {
      console.error("Error loading dashboard data", e);
    } finally {
      setLoadingExtra(false);
    }
  }, [token, refreshInsps]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const pendingRecords = useMemo(() => {
    return records.filter(r => {
      if (r.status === 'salida') return false;
      const isFull = r.entry?.tipo_unidad === 'full';
      const doneIds = Array.isArray(r.inspection_ids) ? r.inspection_ids : (r.inspection_id ? [r.inspection_id] : []);
      const match = isFull ? doneIds.length < 2 : doneIds.length === 0;
      if (!match) return false;
      if (unitFilter === 'todos') return true;
      return r.entry?.tipo_unidad === unitFilter;
    });
  }, [records, unitFilter]);

  const combinedData = useMemo(() => {
    const q = query.toLowerCase().trim();
    const pendingMapped = pendingRecords.map(r => ({ ...r, _is_pending_insp: true }));
    const combined = [...pendingMapped, ...inspections];

    return combined.filter(i => {
      const plates = i._is_pending_insp ? i.entry.placas_unidad : i.placas_unidad;
      const name = i._is_pending_insp ? i.entry.chofer_nombre : i.inspector_nombre;
      return (plates?.toLowerCase() || "").includes(q) || (name?.toLowerCase() || "").includes(q);
    }).sort((a, b) => {
      const dateA = new Date(a.created_at || a.entry?.fecha_entrada || 0).getTime();
      const dateB = new Date(b.created_at || b.entry?.fecha_entrada || 0).getTime();
      return dateB - dateA;
    });
  }, [query, pendingRecords, inspections]);

  const handleStartInspection = (record?: any, typeOverride?: any) => {
    if (record) {
      const isFull = record.entry?.tipo_unidad === 'full';
      const doneCount = Array.isArray(record.inspection_ids) ? record.inspection_ids.length : (record.inspection_id ? 1 : 0);

      setFormData({
        ...formData,
        record_id: record.id,
        isFull,
        inspectionsDone: doneCount,
        numero_caja_2: record.entry.numero_caja_2,
        sello_entrada_2: record.entry.sello_entrada_2,
        compania: record.entry.compania_transporte || '',
        placas: record.entry.placas_unidad || '',
        trailer: (isFull && doneCount === 1) ? (record.entry.numero_caja_2 || '') : (record.entry.numero_caja || ''),
        selloAlta: (isFull && doneCount === 1) ? (record.entry.sello_entrada_2 || '') : (record.entry.sello_entrada || ''),
      });
    } else {
      setFormData({
        compania: '', placas: '', trailer: '', precinto: '', precintoNA: false, selloAlta: '', selloVerificado: false,
        points: [], actSospechosa: '', inspectorNombre: user?.name || '', inspectorFirma: '', record_id: '',
        isFull: false, inspectionsDone: 0
      });
    }
    if (typeOverride) setSelectedType(typeOverride);
    setShowForm(true);
    setStep(0);
  };

  if (showForm) {
     return <InspectionWizard
              type={selectedType}
              onClose={() => { setShowForm(false); setSelectedType(null); loadData(); }}
              initialData={formData}
              t={t}
              saveInspection={saveInspection}
              user={user}
            />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <MainHeader title="NAF" subtitle={t('inspeccion').toUpperCase()} />

      <View style={styles.headerActions}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('buscar_placeholder')}
            value={query}
            onChangeText={setQuery}
          />
        </View>
        <Pressable style={styles.newBtn} onPress={() => handleStartInspection()}>
          <Ionicons name="add" size={24} color="#FFF" />
        </Pressable>
      </View>

      <View style={styles.filterRow}>
        {(['todos', 'sencillo', 'full'] as const).map((f) => (
          <Pressable key={f} onPress={() => setUnitFilter(f)} style={[styles.filterChip, unitFilter === f && styles.filterChipActive]}>
            <Text style={[styles.filterChipText, unitFilter === f && { color: '#FFF' }]}>{f.toUpperCase()}</Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={combinedData}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={loadingExtra || loadingInsps} onRefresh={loadData} tintColor={colors.brandPrimary} />}
        renderItem={({ item }) => {
          if (item._is_pending_insp) {
            return (
              <View style={[styles.row, { borderLeftWidth: 4, borderLeftColor: colors.warning }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{item.entry.placas_unidad} {item.entry.tipo_unidad === 'full' ? '(FULL)' : ''}</Text>
                  <Text style={styles.rowSub}>{item.entry.chofer_nombre} · {item.entry.compania_transporte}</Text>
                  <View style={{ marginVertical: 8 }}>
                    <ProcessTracker steps={{ entry: true, inspection: false, shipping: !!item.has_shipping_ticket, exit: false }} compact />
                  </View>
                  <Pressable style={styles.actionBtn} onPress={() => handleStartInspection(item)}>
                    <Ionicons name="clipboard-outline" size={16} color={colors.brandPrimary} />
                    <Text style={styles.actionText}>{t('inspeccionar').toUpperCase()}</Text>
                  </Pressable>
                </View>
                <View style={[styles.statusChip, { backgroundColor: colors.warning }]}>
                  <Text style={styles.statusChipText}>{t('pendiente').toUpperCase()}</Text>
                </View>
              </View>
            );
          }

          const normalize = (s: string) => s?.replace(/[^A-Z0-9]/g, '').toUpperCase() || '';
          const relatedRecord = records.find(r => r.id === item.record_id || normalize(r.entry?.placas_unidad) === normalize(item.placas_unidad));
          const hasTicket = tickets.some(tick => normalize(tick.placas_unidad) === normalize(item.placas_unidad));

          return (
            <Pressable style={styles.row} onPress={() => router.push(`/inspection/${item.id}`)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.placas_unidad} · {item.numero_trailer}</Text>
                <Text style={styles.rowSub}>{item.inspector_nombre}</Text>
                <View style={{ marginVertical: 8 }}>
                  <ProcessTracker
                    steps={{
                      entry: !!relatedRecord,
                      inspection: true,
                      shipping: hasTicket,
                      exit: relatedRecord?.status === 'salida'
                    }}
                    compact
                  />
                </View>
                <Text style={styles.rowDate}>{new Date(item.created_at).toLocaleString()}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <View style={[styles.statusChip, { backgroundColor: item.status_general === 'bueno' ? colors.success : colors.error }]}>
                  <Text style={styles.statusChipText}>{item.status_general === 'bueno' ? t('bueno') : t('falla')}</Text>
                </View>
                <View style={[styles.statusChip, { backgroundColor: item.approval_status === 'aprobada' ? colors.success : item.approval_status === 'rechazada' ? colors.error : colors.warning }]}>
                  <Text style={styles.statusChipText}>{t(item.approval_status || 'pendiente').toUpperCase()}</Text>
                </View>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>{t('no_hay_registros')}</Text></View>}
      />
    </SafeAreaView>
  );
}

// Implementación del Wizard de Inspección integrada
function InspectionWizard({ type, onClose, initialData, t, saveInspection, user }: any) {
  const [selectedType, setSelectedType] = useState(type);
  const [step, setStep] = useState(0);
  const [data, setData] = useState(initialData);
  const [points, setPoints] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [showSig, setShowSig] = useState(false);
  const sigRef = React.useRef<any>(null);

  React.useEffect(() => {
    if (selectedType) {
      const def = getInspectionPoints(selectedType);
      setPoints(def.map(p => ({ number: p.number, name: p.name, estado: '', comentarios: '', photo: '' })));
    }
  }, [selectedType]);

  const canNext = () => {
    if (step === 0) return data.placas && data.trailer;
    if (step === 1) return points.every(p => p.estado !== '' && (p.estado !== 'malo' || p.photo));
    if (step === 3) return data.inspectorFirma;
    return true;
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      const res = await saveInspection({
        ...data,
        inspection_type: selectedType,
        points,
        fecha_hora: new Date().toISOString(),
      });

      if (data.isFull && data.inspectionsDone === 0) {
        Alert.alert(
          t('inspeccion_guardada'),
          t('unidad_full_segunda_inspeccion_msg') || "Esta es una unidad FULL. ¿Deseas realizar la segunda inspección ahora?",
          [
            { text: t('mas_tarde') || "Más tarde", onPress: () => onClose() },
            {
              text: t('si_continuar') || "Sí, continuar",
              onPress: () => {
                // Reset for second box
                setData({
                  ...data,
                  trailer: data.numero_caja_2 || '',
                  selloAlta: data.sello_entrada_2 || '',
                  inspectionsDone: 1
                });
                setStep(0);
                setPoints(points.map(p => ({ ...p, estado: '', comentarios: '', photo: '' })));
              }
            }
          ]
        );
      } else {
        onClose();
      }
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  };

  if (!selectedType) {
    return (
      <SafeAreaView style={styles.safe}>
        <MainHeader showBack onBack={onClose} title="NAF" subtitle={t('nueva_inspeccion').toUpperCase()} />
        <View style={{ padding: 20, gap: 15 }}>
          <Pressable style={[styles.typeCard, { backgroundColor: colors.brandPrimary }]} onPress={() => setSelectedType('19_puntos')}>
            <Ionicons name="car-sport" size={32} color="#FFF" />
            <Text style={styles.typeTitle}>{t('inspeccion_19_puntos').toUpperCase()}</Text>
          </Pressable>
          <Pressable style={[styles.typeCard, { backgroundColor: colors.info }]} onPress={() => setSelectedType('9_puntos_contenedor')}>
            <Ionicons name="cube" size={32} color="#FFF" />
            <Text style={styles.typeTitle}>{t('inspeccion_9_puntos').toUpperCase()}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.progressHeader}>
         <Pressable onPress={onClose} style={{ padding: 10 }}><Ionicons name="close" size={24} color="#FFF" /></Pressable>
         <Text style={{ color: "#FFF", fontWeight: '900' }}>{selectedType.replace('_', ' ').toUpperCase()} - PASO {step+1}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
          {step === 0 && (
            <View>
              <Text style={styles.label}>{t('placas').toUpperCase()}</Text>
              <TextInput style={styles.input} value={data.placas} onChangeText={v => setData({...data, placas: v.toUpperCase()})} autoCapitalize="characters" />
              <Text style={styles.label}>{t('trailer').toUpperCase()}</Text>
              <TextInput style={styles.input} value={data.trailer} onChangeText={v => setData({...data, trailer: v.toUpperCase()})} autoCapitalize="characters" />
            </View>
          )}
          {step === 1 && (
            <View>
              <Text style={{ fontWeight: '900', marginBottom: 10 }}>PUNTOS DE INSPECCIÓN ({points.filter(p=>p.estado!=='').length}/{points.length})</Text>
              {points.map((p, idx) => (
                <View key={p.number} style={{ marginBottom: 15, padding: 10, backgroundColor: '#F5F5F5', borderWidth: 1, borderColor: '#DDD' }}>
                  <Text style={{ fontWeight: '700' }}>{p.number}. {p.name}</Text>
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 5 }}>
                    <Pressable onPress={() => { const n = [...points]; n[idx].estado = 'bueno'; setPoints(n); }} style={{ flex: 1, padding: 8, backgroundColor: p.estado === 'bueno' ? colors.success : '#FFF', borderWidth: 1 }}>
                      <Text style={{ textAlign: 'center', fontWeight: '900', color: p.estado === 'bueno' ? '#FFF' : '#333' }}>BUENO</Text>
                    </Pressable>
                    <Pressable onPress={() => { const n = [...points]; n[idx].estado = 'malo'; setPoints(n); }} style={{ flex: 1, padding: 8, backgroundColor: p.estado === 'malo' ? colors.error : '#FFF', borderWidth: 1 }}>
                      <Text style={{ textAlign: 'center', fontWeight: '900', color: p.estado === 'malo' ? '#FFF' : '#333' }}>FALLA</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}
          {/* ... Resto de pasos (Firma, etc) ... */}
      </ScrollView>
      <View style={styles.wizardFooter}>
         {step > 0 && <Pressable style={styles.wizBtnSec} onPress={() => setStep(step-1)}><Text style={{fontWeight:'900'}}>ATRÁS</Text></Pressable>}
         <Pressable
           style={[styles.wizBtnPri, !canNext() && { opacity: 0.5 }]}
           onPress={() => step < 3 ? setStep(step+1) : handleFinish()}
           disabled={!canNext() || saving}
         >
           {saving ? <ActivityIndicator color="#FFF" /> : <Text style={{fontWeight:'900', color:'#FFF'}}>{step === 3 ? 'GUARDAR' : 'SIGUIENTE'}</Text>}
         </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerActions: { flexDirection: 'row', padding: spacing.md, gap: spacing.sm, alignItems: 'center', marginTop: -10 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.borderStrong, paddingHorizontal: spacing.md, height: 48 },
  searchInput: { flex: 1, padding: spacing.sm, fontSize: 14, color: colors.onSurface },
  newBtn: { width: 48, height: 48, backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center', borderRadius: 4 },
  filterRow: { flexDirection: 'row', paddingHorizontal: spacing.md, gap: 8, marginBottom: 5 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  filterChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  filterChipText: { fontSize: 10, fontWeight: '900', color: colors.muted },
  row: { backgroundColor: colors.surfaceSecondary, borderWidth: 2, borderColor: colors.borderStrong, padding: spacing.md, marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center' },
  rowTitle: { fontWeight: '900', fontSize: 16, color: colors.onSurface },
  rowSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  rowDate: { fontSize: 9, color: colors.muted, marginTop: 4 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, backgroundColor: colors.brandPrimary + '11', padding: 8, alignSelf: 'flex-start' },
  actionText: { fontWeight: '900', fontSize: 10, color: colors.brandPrimary },
  statusChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 2 },
  statusChipText: { color: '#FFF', fontWeight: '900', fontSize: 9 },
  typeCard: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md, borderRadius: 4, minHeight: 80 },
  typeTitle: { color: '#FFF', fontWeight: '900', fontSize: 16 },
  progressHeader: { backgroundColor: colors.brandPrimary, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 10 },
  empty: { alignItems: 'center', padding: spacing.xxxl },
  emptyText: { color: colors.muted, fontWeight: '700' },
  label: { fontSize: 11, fontWeight: '900', color: colors.muted, marginBottom: 5 },
  input: { borderWidth: 2, borderColor: colors.borderStrong, padding: 10, marginBottom: 15, backgroundColor: '#FFF' },
  wizardFooter: { flexDirection: 'row', padding: 15, borderTopWidth: 1, borderColor: '#EEE', gap: 10 },
  wizBtnPri: { flex: 1, backgroundColor: colors.brandPrimary, padding: 15, alignItems: 'center', borderRadius: 4 },
  wizBtnSec: { flex: 1, backgroundColor: '#EEE', padding: 15, alignItems: 'center', borderRadius: 4 },
});

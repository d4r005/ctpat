import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput, RefreshControl,
  ActivityIndicator, ScrollView, Platform, Alert, Image, KeyboardAvoidingView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useInspections, InspectionPayload } from '@/src/context/InspectionContext';
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
  const params = useLocalSearchParams<{
    record_id?: string;
    compania?: string;
    placas?: string;
    trailer?: string;
    sello?: string;
    chofer?: string;
  }>();
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

  useFocusEffect(useCallback(() => {
    loadData();
    // Si viene de parámetros (ej. desde caseta), abrir formulario directamente
    if (params.record_id && !showForm) {
      handleStartInspection({
        id: params.record_id,
        entry: {
          placas_unidad: params.placas,
          numero_caja: params.trailer,
          sello_entrada: params.sello,
          compania_transporte: params.compania,
          chofer_nombre: params.chofer,
          tipo_unidad: params.trailer?.includes('-2') ? 'full' : 'sencillo' // Heurística básica
        }
      });
    }
  }, [loadData, params.record_id]));

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

// Implementación COMPLETA del Wizard de Inspección
function InspectionWizard({ type, onClose, initialData, t, saveInspection, user }: any) {
  const [selectedType, setSelectedType] = useState(type);
  const [step, setStep] = useState(0);
  const [data, setData] = useState(initialData);
  const [points, setPoints] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [showSig, setShowSig] = useState(false);
  const [scanner, setScanner] = useState<{ visible: boolean, field: string }>({ visible: false, field: '' });
  const sigRef = React.useRef<any>(null);

  React.useEffect(() => {
    if (selectedType) {
      const def = getInspectionPoints(selectedType);
      setPoints(def.map(p => ({ number: p.number, name: p.name, estado: '', comentarios: '', photo: '' })));
    }
  }, [selectedType]);

  const canNext = () => {
    if (step === 0) return data.placas && data.trailer;
    if (step === 1) return points.every(p => p.estado !== '');
    if (step === 2) return points.filter(p => p.estado === 'malo').every(p => p.comentarios && p.photo);
    if (step === 3) return data.inspectorFirma;
    return true;
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      const res = await saveInspection({
        inspection_type: selectedType,
        compania_transportista: data.compania,
        placas_unidad: data.placas,
        numero_trailer: data.trailer,
        numero_precinto: data.precintoNA ? 'N/A' : data.precinto,
        sello_alta_seguridad: data.selloAlta,
        sello_verificado: data.selloVerificado,
        points: points,
        actividad_sospechosa: data.actSospechosa,
        inspector_nombre: data.inspectorNombre,
        inspector_firma: data.inspectorFirma,
        fecha_hora: new Date().toISOString(),
        client_uuid: '', // context takes care if empty
        record_id: data.record_id
      } as InspectionPayload);

      if (data.isFull && data.inspectionsDone === 0) {
        Alert.alert(
          t('inspeccion_guardada'),
          t('unidad_full_segunda_inspeccion_msg') || "Esta es una unidad FULL. ¿Deseas realizar la segunda inspección ahora?",
          [
            { text: t('mas_tarde') || "Más tarde", onPress: () => onClose() },
            {
              text: t('si_continuar') || "Sí, continuar",
              onPress: () => {
                // Reset para la segunda caja
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

  const pickPointPhoto = async (idx: number) => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { alert(t('acceso_restringido')); return; }
    const r = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      quality: 0.2,
      base64: true
    });
    if (!r.canceled && r.assets[0]?.base64) {
      const n = [...points];
      n[idx].photo = `data:image/jpeg;base64,${r.assets[0].base64}`;
      setPoints(n);
    }
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
              <Text style={styles.label}>{t('compañia').toUpperCase()}</Text>
              <TextInput style={styles.input} value={data.compania} onChangeText={v => setData({...data, compania: v.toUpperCase()})} />

              <Text style={styles.label}>{t('placas').toUpperCase()}</Text>
              <View style={styles.inputRow}>
                <TextInput style={[styles.input, { flex: 1 }]} value={data.placas} onChangeText={v => setData({...data, placas: v.toUpperCase()})} />
                <Pressable style={styles.scanBtn} onPress={() => setScanner({ visible: true, field: 'placas' })}><Ionicons name="barcode" size={24} color="#FFF" /></Pressable>
              </View>

              <Text style={styles.label}>{t('trailer').toUpperCase()}</Text>
              <View style={styles.inputRow}>
                <TextInput style={[styles.input, { flex: 1 }]} value={data.trailer} onChangeText={v => setData({...data, trailer: v.toUpperCase()})} />
                <Pressable style={styles.scanBtn} onPress={() => setScanner({ visible: true, field: 'trailer' })}><Ionicons name="barcode" size={24} color="#FFF" /></Pressable>
              </View>

              <Text style={styles.label}>{t('sello_alta_seguridad').toUpperCase()}</Text>
              <View style={styles.inputRow}>
                <TextInput style={[styles.input, { flex: 1 }]} value={data.selloAlta} onChangeText={v => setData({...data, selloAlta: v.toUpperCase()})} />
                <Pressable style={styles.scanBtn} onPress={() => setScanner({ visible: true, field: 'selloAlta' })}><Ionicons name="barcode" size={24} color="#FFF" /></Pressable>
              </View>

              <Pressable style={styles.checkRow} onPress={() => setData({...data, selloVerificado: !data.selloVerificado})}>
                <View style={[styles.checkbox, data.selloVerificado && styles.checkboxOn]}>
                  {data.selloVerificado && <Ionicons name="checkmark" size={18} color="#FFF" />}
                </View>
                <Text style={styles.checkLabel}>SELLO VERIFICADO (VER, TIRAR, TORCER)</Text>
              </Pressable>
            </View>
          )}

          {step === 1 && (
            <View>
              <Text style={{ fontWeight: '900', marginBottom: 10, letterSpacing: 1 }}>{t('puntos_inspeccion').toUpperCase()} ({points.filter(p=>p.estado!=='').length}/{points.length})</Text>
              {points.map((p, idx) => (
                <View key={p.number} style={styles.pointRow}>
                  <Text style={styles.pointName}>{p.number}. {p.name}</Text>
                  <View style={styles.toggleRow}>
                    <Pressable onPress={() => { const n = [...points]; n[idx].estado = 'bueno'; setPoints(n); }} style={[styles.toggleBtn, p.estado === 'bueno' && { backgroundColor: colors.success }]}>
                      <Text style={[styles.toggleText, p.estado === 'bueno' && { color: '#FFF' }]}>{t('bueno').toUpperCase()}</Text>
                    </Pressable>
                    <Pressable onPress={() => { const n = [...points]; n[idx].estado = 'malo'; setPoints(n); }} style={[styles.toggleBtn, p.estado === 'malo' && { backgroundColor: colors.error }]}>
                      <Text style={[styles.toggleText, p.estado === 'malo' && { color: '#FFF' }]}>{t('falla').toUpperCase()}</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}

          {step === 2 && (
            <View>
              <Text style={{ fontWeight: '900', marginBottom: 15, letterSpacing: 1 }}>{t('detalles_fallas').toUpperCase()}</Text>
              {points.filter(p => p.estado === 'malo').map((p, idx) => {
                const originalIdx = points.findIndex(orig => orig.number === p.number);
                return (
                  <View key={p.number} style={styles.failCard}>
                    <Text style={styles.failTitle}>{p.number}. {p.name}</Text>
                    <TextInput
                      style={styles.failInput}
                      placeholder={t('comentarios_falla')}
                      value={p.comentarios}
                      onChangeText={v => { const n = [...points]; n[originalIdx].comentarios = v; setPoints(n); }}
                    />
                    <Pressable style={styles.photoBtn} onPress={() => pickPointPhoto(originalIdx)}>
                      {p.photo ? (
                        <Image source={{ uri: p.photo }} style={styles.photoPreview} />
                      ) : (
                        <View style={styles.photoCta}>
                          <Ionicons name="camera" size={24} color={colors.brandPrimary} />
                          <Text style={styles.photoText}>{t('tomar_foto_evidencia')}</Text>
                        </View>
                      )}
                    </Pressable>
                  </View>
                );
              })}
              {points.filter(p => p.estado === 'malo').length === 0 && (
                <View style={styles.center}><Text style={{ color: colors.muted }}>{t('no_hay_fallas')}</Text></View>
              )}
            </View>
          )}

          {step === 3 && (
            <View>
              <Text style={styles.label}>{t('actividad_sospechosa').toUpperCase()}</Text>
              <TextInput
                style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                multiline
                placeholder={t('describa_actividad_sospechosa')}
                value={data.actSospechosa}
                onChangeText={v => setData({...data, actSospechosa: v})}
              />

              <Text style={styles.label}>{t('nombre_inspector').toUpperCase()}</Text>
              <TextInput style={styles.input} value={data.inspectorNombre} onChangeText={v => setData({...data, inspectorNombre: v})} />

              <Text style={styles.label}>{t('firma_inspector').toUpperCase()}</Text>
              <Pressable style={styles.sigArea} onPress={() => setShowSig(true)}>
                {data.inspectorFirma ? (
                  <Image source={{ uri: data.inspectorFirma }} style={{ width: '100%', height: '100%', resizeMode: 'contain' }} />
                ) : (
                  <Text style={{ color: colors.muted, fontWeight: '700' }}>{t('toca_para_firmar')}</Text>
                )}
              </Pressable>
            </View>
          )}
      </ScrollView>

      <View style={styles.wizardFooter}>
         {step > 0 && <Pressable style={styles.wizBtnSec} onPress={() => setStep(step-1)}><Text style={styles.wizBtnText}>{t('atras').toUpperCase()}</Text></Pressable>}
         <Pressable
           style={[styles.wizBtnPri, !canNext() && { opacity: 0.5 }]}
           onPress={() => step < 3 ? setStep(step+1) : handleFinish()}
           disabled={!canNext() || saving}
         >
           {saving ? <ActivityIndicator color="#FFF" /> : <Text style={[styles.wizBtnText, { color: '#FFF' }]}>{step === 3 ? t('finalizar').toUpperCase() : t('siguiente').toUpperCase()}</Text>}
         </Pressable>
      </View>

      <BarcodeScanner
        visible={scanner.visible}
        title={`ESCANEAR ${scanner.field.toUpperCase()}`}
        onClose={() => setScanner({ visible: false, field: '' })}
        onScan={(val) => { setData({...data, [scanner.field]: val}); setScanner({ visible: false, field: '' }); }}
      />

      {showSig && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('firma_inspector').toUpperCase()}</Text>
            <View style={styles.sigCanvasCont}>
              <Signature
                ref={sigRef}
                onOK={(sig) => { setData({...data, inspectorFirma: sig}); setShowSig(false); }}
                webStyle={`.m-signature-pad--footer{display:none;}`}
              />
            </View>
            <View style={styles.modalActions}>
              <Pressable style={styles.wizBtnSec} onPress={() => setShowSig(false)}><Text>{t('cancelar').toUpperCase()}</Text></Pressable>
              <Pressable style={styles.wizBtnPri} onPress={() => sigRef.current?.readSignature()}><Text style={{ color: '#FFF' }}>{t('guardar_firma').toUpperCase()}</Text></Pressable>
            </View>
          </View>
        </View>
      )}
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
  label: { fontSize: 11, fontWeight: '900', color: colors.onSurfaceTertiary, marginBottom: 5, letterSpacing: 1 },
  input: { borderWidth: 2, borderColor: colors.borderStrong, padding: 10, marginBottom: 15, backgroundColor: '#FFF', fontSize: 16 },
  inputRow: { flexDirection: 'row', marginBottom: 15, gap: 10 },
  scanBtn: { width: 50, height: 50, backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 5, marginBottom: 20 },
  checkbox: { width: 24, height: 24, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: colors.success, borderColor: colors.success },
  checkLabel: { fontWeight: '900', fontSize: 10, color: colors.onSurface },
  pointRow: { padding: 10, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
  pointName: { fontWeight: '700', fontSize: 14, marginBottom: 8 },
  toggleRow: { flexDirection: 'row', gap: 10 },
  toggleBtn: { flex: 1, padding: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center', backgroundColor: '#FFF' },
  toggleText: { fontWeight: '900', fontSize: 11, color: colors.onSurface },
  failCard: { padding: 15, backgroundColor: '#FFF', borderWidth: 2, borderColor: colors.error, marginBottom: 15 },
  failTitle: { fontWeight: '900', fontSize: 14, color: colors.error, marginBottom: 10 },
  failInput: { borderWidth: 1, borderColor: colors.border, padding: 10, marginBottom: 10 },
  photoBtn: { height: 150, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', backgroundColor: '#F9F9F9', justifyContent: 'center', alignItems: 'center' },
  photoPreview: { width: '100%', height: '100%', resizeMode: 'cover' },
  photoCta: { alignItems: 'center' },
  photoText: { fontWeight: '700', fontSize: 10, color: colors.brandPrimary, marginTop: 5 },
  sigArea: { height: 120, borderWidth: 2, borderColor: colors.borderStrong, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', marginTop: 5 },
  wizardFooter: { flexDirection: 'row', padding: 15, borderTopWidth: 2, borderColor: colors.borderStrong, gap: 10, backgroundColor: colors.surfaceSecondary },
  wizBtnPri: { flex: 1, backgroundColor: colors.brandPrimary, padding: 15, alignItems: 'center', justifyContent: 'center' },
  wizBtnSec: { flex: 1, backgroundColor: '#FFF', borderWidth: 2, borderColor: colors.borderStrong, padding: 15, alignItems: 'center', justifyContent: 'center' },
  wizBtnText: { fontWeight: '900', fontSize: 12 },
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20, zIndex: 100 },
  modalCard: { backgroundColor: '#FFF', padding: 20, borderWidth: 2, borderColor: colors.borderStrong },
  modalTitle: { fontWeight: '900', marginBottom: 15 },
  sigCanvasCont: { height: 300, borderWidth: 1, borderColor: '#EEE', marginBottom: 20 },
  modalActions: { flexDirection: 'row', gap: 10 }
});

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
import { sanitizePlate } from '@/src/utils/text';
import Signature from '@/src/components/SignaturePad';
import * as ImagePicker from 'expo-image-picker';
import { compressImage } from '@/src/utils/image';
import { compressImage } from '@/src/utils/image';

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

  // AI OCR state
  const [isScanning, setIsScanning] = useState(false);

  const handleScanIA = async () => {
    try {
      // Se solicita el permiso de cámara explícitamente antes de abrir el
      // picker. En web (navegador) launchCameraAsync NO solicita el permiso
      // por sí solo de forma confiable, así que sin este chequeo el picker
      // podía fallar en silencio (canceled) sin mostrar ningún error.
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permiso requerido', 'Se necesita acceso a la cámara para escanear con IA.');
        return;
      }
      const r = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.4,
        base64: true,
      });

      if (!r.canceled && r.assets[0]?.base64) {
        setIsScanning(true);
        const res = await apiCall('/ocr/analyze', {
          method: 'POST',
          token,
          body: { image_b64: r.assets[0].base64, mime_type: r.assets[0].mimeType || 'image/jpeg', context: 'inspection' }
        });

        if (res.error) {
          if (res.error === 'UNSUPPORTED_FORMAT_HEIC') Alert.alert('Formato no soportado', 'La foto se guardó en formato HEIC (típico de iPhone). Cambia el ajuste de tu cámara a "Más compatible" (JPEG) en Configuración > Cámara > Formatos, o intenta de nuevo.');
          else Alert.alert('Error', 'No se pudo procesar el documento físico.');
        } else {
          // Iniciar inspección con los datos extraídos
          const hasMeasures = res.measures && (res.measures.alto || res.measures.ancho || res.measures.largo || res.measures.capacidad);

          setFormData({
            ...formData,
            placas: sanitizePlate(res.placas_unidad || ''),
            compania: (res.compania_transportista || '').toUpperCase(),
            status_general: res.status_general || 'bueno',
            ...(hasMeasures ? {
              measures: {
                alto: (res.measures.alto || '').toString(),
                ancho: (res.measures.ancho || '').toString(),
                largo: (res.measures.largo || '').toString(),
                capacidad: (res.measures.capacidad || '').toString(),
              }
            } : {}),
          });

          if (res.points && Array.isArray(res.points)) {
            // Guardamos los puntos extraídos temporalmente para que el Wizard los use
            setFormData((prev: any) => ({ ...prev, _ai_points: res.points }));
          }

          // Si el documento traía medidas de la unidad, se precargan y se abre directo en el paso de medidas (9 puntos contenedor)
          setSelectedType(hasMeasures ? '9_puntos_contenedor' : '19_puntos');
          setShowForm(true);
          Alert.alert('Escaneo Exitoso', hasMeasures ? 'Datos de inspección y medidas de la unidad recuperados.' : 'Datos de inspección recuperados.');
        }
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setIsScanning(false);
    }
  };

  // Estados del Formulario
  const [selectedType, setSelectedType] = useState<'19_puntos' | '9_puntos_contenedor' | null>(null);
  const [formData, setFormData] = useState<any>({
    compania: '', placas: '', trailer: '', precinto: '', precintoNA: false, selloAlta: '', selloVerificado: false,
    points: [], actSospechosa: '', inspectorNombre: user?.name || '', inspectorFirma: '', record_id: '',
    box_type: '',
    measures: { alto: '', ancho: '', largo: '', capacidad: '' },
    guard_name: '',
    guard_signature: ''
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
        placas: sanitizePlate(record.entry.placas_unidad || ''),
        trailer: (isFull && doneCount === 1) ? (record.entry.numero_caja_2 || '') : (record.entry.numero_caja || ''),
        selloAlta: (isFull && doneCount === 1) ? (record.entry.sello_entrada_2 || '') : (record.entry.sello_entrada || ''),
      });
    } else {
      setFormData({
        compania: '', placas: '', trailer: '', precinto: '', precintoNA: false, selloAlta: '', selloVerificado: false,
        points: [], actSospechosa: '', inspectorNombre: user?.name || '', inspectorFirma: '', record_id: '',
        isFull: false, inspectionsDone: 0,
        box_type: '',
        measures: { alto: '', ancho: '', largo: '', capacidad: '' },
        guard_name: '',
        guard_signature: ''
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
      <View style={styles.topHeader}>
        <MainHeader title="NAF" subtitle={t('inspeccion').toUpperCase()} />
      </View>

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

        <Pressable
          onPress={handleScanIA}
          disabled={isScanning}
          style={styles.scanActionBtn}
        >
           {isScanning ? (
             <ActivityIndicator size="small" color={colors.brandPrimary} />
           ) : (
             <View style={styles.scanInner}>
               <Ionicons name="scan-circle" size={24} color={colors.brandSecondary} />
               <Text style={styles.scanActionText}>IA</Text>
             </View>
           )}
        </Pressable>

        <Pressable style={styles.newBtn} onPress={() => handleStartInspection()}>
          <Ionicons name="add" size={24} color="#FFF" />
        </Pressable>
      </View>

      <View style={styles.filterRow}>
        {(['todos', 'sencillo', 'full'] as const).map((f) => (
          <Pressable key={f} onPress={() => setUnitFilter(f)} style={[styles.filterChip, unitFilter === f && styles.filterChipActive]}>
            <Text style={[styles.filterChipText, unitFilter === f && { color: '#FFF' }]}>{t(f).toUpperCase()}</Text>
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

const BOX_TYPES = [
  { id: '53', label: '53" (Largo)', alto: '2.82', ancho: '2.54', largo: '15.9', capacidad: '113' },
  { id: '48', label: '48" (Corto)', alto: '2.82', ancho: '2.54', largo: '14.48', capacidad: '103' },
  { id: '28', label: '28" (Torton)', alto: '2.82', ancho: '2.54', largo: '8.33', capacidad: '59' },
  { id: '15', label: '15" (3 ton)', alto: '2.12', ancho: '2.25', largo: '2.5', capacidad: '11' },
  { id: '8', label: '8" (Nissan)', alto: '1.44', ancho: '1.6', largo: '2.5', capacidad: '5' },
];

// Implementación COMPLETA del Wizard de Inspección
function InspectionWizard({ type, onClose, initialData, t, saveInspection, user }: any) {
  const [selectedType, setSelectedType] = useState(type);
  const [step, setStep] = useState(0);
  const [data, setData] = useState(initialData);
  const [points, setPoints] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [showSig, setShowSig] = useState(false);
  const [sigTarget, setSigTarget] = useState<'inspector' | 'guard'>('inspector');
  const [inspectorOpcion, setInspectorOpcion] = useState<'MARIO AGUILAR' | 'ADELAIDO SAENZ' | 'OTRO' | ''>('');
  const [scanner, setScanner] = useState<{ visible: boolean, field: string }>({ visible: false, field: '' });
  const sigRef = React.useRef<any>(null);

  React.useEffect(() => {
    if (selectedType) {
      const def = getInspectionPoints(selectedType);

      // Si venimos de un escaneo de IA, intentar mapear los resultados
      if (data._ai_points) {
        setPoints(def.map(p => {
          const aiMatch = data._ai_points.find((ap: any) => ap.number === p.number);
          return {
            number: p.number,
            name: p.name,
            estado: aiMatch?.estado || 'bueno',
            comentarios: aiMatch?.comentarios || '',
            photo: ''
          };
        }));
      } else {
        setPoints(def.map(p => ({ number: p.number, name: p.name, estado: '', comentarios: '', photo: '' })));
      }
    }
  }, [selectedType, data._ai_points]);

  const canNext = () => {
    if (step === 0) return data.placas && data.trailer;
    if (step === 1) return data.box_type && data.measures?.alto && data.measures?.ancho;
    if (step === 2) return points.every(p => p.estado !== '');
    if (step === 3) return points.filter(p => p.estado === 'malo').every(p => p.comentarios && p.photo);
    if (step === 4) return data.inspectorFirma;
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
        record_id: data.record_id,
        box_type: data.box_type,
        measures: data.measures,
        guard_name: data.guard_name,
        guard_signature: data.guard_signature
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
    Alert.alert(
      t('seleccionar_origen'),
      t('seleccionar_origen_desc') || "Selecciona de dónde cargar la evidencia",
      [
        {
          text: t('camara'),
          onPress: async () => {
            const perm = await ImagePicker.requestCameraPermissionsAsync();
            if (!perm.granted) { alert(t('acceso_restringido')); return; }
            const r = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.2, base64: true });
            if (!r.canceled && r.assets[0]?.base64) {
              const b64 = await compressImage(`data:image/jpeg;base64,${r.assets[0].base64}`);
              const n = [...points];
              n[idx].photo = b64;
              setPoints(n);
            }
          }
        },
        {
          text: t('galeria'),
          onPress: async () => {
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) { alert(t('acceso_restringido')); return; }
            const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.2, base64: true });
            if (!r.canceled && r.assets[0]?.base64) {
              const b64 = await compressImage(`data:image/jpeg;base64,${r.assets[0].base64}`);
              const n = [...points];
              n[idx].photo = b64;
              setPoints(n);
            }
          }
        },
        {
          text: "URL (DRIVE/WEB)",
          onPress: () => {
            Alert.prompt(
              "Ingresar URL",
              "Pega el enlace de Google Drive o Imagen Web",
              [
                { text: t('cancelar'), style: 'cancel' },
                {
                  text: t('agregar'),
                  onPress: (url) => {
                    if (url) {
                      const n = [...points];
                      n[idx].photo = url;
                      setPoints(n);
                    }
                  }
                }
              ]
            );
          }
        },
        { text: t('cancelar'), style: 'cancel' }
      ]
    );
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
              <TextInput
                style={styles.input}
                autoCapitalize="characters"
                autoCorrect={false}
                value={data.compania}
                onChangeText={v => setData({...data, compania: v.toUpperCase()})}
              />

              <Text style={styles.label}>{t('placas').toUpperCase()}</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  value={data.placas}
                  onChangeText={v => setData({...data, placas: sanitizePlate(v)})}
                />
                <Pressable style={styles.scanBtn} onPress={() => setScanner({ visible: true, field: 'placas' })}><Ionicons name="barcode" size={24} color="#FFF" /></Pressable>
              </View>

              <Text style={styles.label}>{t('trailer').toUpperCase()}</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  value={data.trailer}
                  onChangeText={v => setData({...data, trailer: v.toUpperCase()})}
                />
                <Pressable style={styles.scanBtn} onPress={() => setScanner({ visible: true, field: 'trailer' })}><Ionicons name="barcode" size={24} color="#FFF" /></Pressable>
              </View>

              <Text style={styles.label}>{t('sello_alta_seguridad').toUpperCase()}</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  value={data.selloAlta}
                  onChangeText={v => setData({...data, selloAlta: v.toUpperCase()})}
                />
                <Pressable style={styles.scanBtn} onPress={() => setScanner({ visible: true, field: 'selloAlta' })}><Ionicons name="barcode" size={24} color="#FFF" /></Pressable>
              </View>

              <Pressable style={styles.checkRow} onPress={() => setData({...data, selloVerificado: !data.selloVerificado})}>
                <View style={[styles.checkbox, data.selloVerificado && styles.checkboxOn]}>
                  {data.selloVerificado && <Ionicons name="checkmark" size={18} color="#FFF" />}
                </View>
                <Text style={styles.checkLabel}>{t('sello_verificado_completo').toUpperCase()}</Text>
              </Pressable>
            </View>
          )}

          {step === 1 && (
            <View>
              <Text style={styles.label}>{t('tipo_caja') || 'TIPO DE CAJA'}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 15 }}>
                {BOX_TYPES.map(box => (
                  <Pressable
                    key={box.id}
                    onPress={() => setData({ ...data, box_type: box.id, measures: { alto: box.alto, ancho: box.ancho, largo: box.largo, capacidad: box.capacidad } })}
                    style={[styles.boxChip, data.box_type === box.id && styles.boxChipActive]}
                  >
                    <Text style={[styles.boxChipText, data.box_type === box.id && { color: '#FFF' }]}>{box.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Text style={styles.label}>{t('medidas_entrada_salida') || 'MEDIDAS ENTRADA / SALIDA'}</Text>
              <View style={styles.measuresGrid}>
                <View style={styles.measureCol}>
                  <Text style={styles.measureLabel}>{t('alto') || 'ALTO'}</Text>
                  <TextInput
                    style={styles.measureInput}
                    keyboardType="decimal-pad"
                    value={data.measures?.alto}
                    onChangeText={v => setData({...data, measures: { ...data.measures, alto: v }})}
                  />
                </View>
                <View style={styles.measureCol}>
                  <Text style={styles.measureLabel}>{t('ancho') || 'ANCHO'}</Text>
                  <TextInput
                    style={styles.measureInput}
                    keyboardType="decimal-pad"
                    value={data.measures?.ancho}
                    onChangeText={v => setData({...data, measures: { ...data.measures, ancho: v }})}
                  />
                </View>
                <View style={styles.measureCol}>
                  <Text style={styles.measureLabel}>{t('largo') || 'LARGO'}</Text>
                  <TextInput
                    style={styles.measureInput}
                    keyboardType="decimal-pad"
                    value={data.measures?.largo}
                    onChangeText={v => setData({...data, measures: { ...data.measures, largo: v }})}
                  />
                </View>
                <View style={styles.measureCol}>
                  <Text style={styles.measureLabel}>{t('capacidad') || 'CAPACIDAD'} (m³)</Text>
                  <TextInput
                    style={styles.measureInput}
                    keyboardType="decimal-pad"
                    value={data.measures?.capacidad}
                    onChangeText={v => setData({...data, measures: { ...data.measures, capacidad: v }})}
                  />
                </View>
              </View>
              {data.box_type && (
                <View style={styles.standardMeasuresBox}>
                  <Text style={styles.standardTitle}>{t('medidas_estandar') || 'MEDIDAS ESTÁNDAR'} ({data.box_type}")</Text>
                  {BOX_TYPES.find(b => b.id === data.box_type) && (
                    <Text style={styles.standardValue}>
                      {BOX_TYPES.find(b => b.id === data.box_type)?.alto} x {BOX_TYPES.find(b => b.id === data.box_type)?.ancho} x {BOX_TYPES.find(b => b.id === data.box_type)?.largo} · {BOX_TYPES.find(b => b.id === data.box_type)?.capacidad}m³
                    </Text>
                  )}
                </View>
              )}
            </View>
          )}

          {step === 2 && (
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

          {step === 3 && (
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
                      autoCapitalize="characters"
                      autoCorrect={false}
                      value={p.comentarios}
                      onChangeText={v => { const n = [...points]; n[originalIdx].comentarios = v.toUpperCase(); setPoints(n); }}
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

          {step === 4 && (
            <View>
              <Text style={styles.label}>{t('actividad_sospechosa').toUpperCase()}</Text>
              <TextInput
                style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                multiline
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder={t('describa_actividad_sospechosa')}
                value={data.actSospechosa}
                onChangeText={v => setData({...data, actSospechosa: v.toUpperCase()})}
              />

              <Text style={styles.label}>{t('nombre_inspector').toUpperCase()}</Text>
              <View style={[styles.optionsRow, { marginBottom: spacing.sm }]}>
                {(['MARIO AGUILAR', 'ADELAIDO SAENZ', 'OTRO'] as const).map((o) => (
                  <Pressable
                    key={o}
                    onPress={() => {
                      setInspectorOpcion(o);
                      if (o !== 'OTRO') setData({ ...data, inspectorNombre: o });
                      else setData({ ...data, inspectorNombre: '' });
                    }}
                    style={[styles.optionChip, inspectorOpcion === o && styles.optionChipActive]}
                  >
                    <Text style={[styles.optionText, inspectorOpcion === o && styles.optionTextActive]}>{o}</Text>
                  </Pressable>
                ))}
              </View>
              {(inspectorOpcion === 'OTRO' || !inspectorOpcion) && (
                <TextInput
                  style={styles.input}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  value={data.inspectorNombre}
                  onChangeText={v => setData({...data, inspectorNombre: v.toUpperCase()})}
                  placeholder={t('nombre_completo_placeholder')}
                />
              )}

              <Text style={styles.label}>{t('firma_inspector').toUpperCase()}</Text>
              <Pressable style={styles.sigArea} onPress={() => { setSigTarget('inspector'); setShowSig(true); }}>
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
           onPress={() => step < 4 ? setStep(step+1) : handleFinish()}
           disabled={!canNext() || saving}
         >
           {saving ? <ActivityIndicator color="#FFF" /> : <Text style={[styles.wizBtnText, { color: '#FFF' }]}>{step === 4 ? t('finalizar').toUpperCase() : t('siguiente').toUpperCase()}</Text>}
         </Pressable>
      </View>

      <BarcodeScanner
        visible={scanner.visible}
        title={`ESCANEAR ${scanner.field.toUpperCase()}`}
        onClose={() => setScanner({ visible: false, field: '' })}
        onScan={(val) => { setData({...data, [scanner.field]: scanner.field === 'placas' ? sanitizePlate(val) : val.toUpperCase()}); setScanner({ visible: false, field: '' }); }}
      />

      {showSig && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('firma_inspector').toUpperCase()}</Text>
            <View style={styles.sigCanvasCont}>
              <Signature
                ref={sigRef}
                onOK={(sig) => {
                   if (sigTarget === 'inspector') setData({...data, inspectorFirma: sig});
                   else setData({...data, guard_signature: sig});
                   setShowSig(false);
                }}
                onEmpty={() => alert(t('firma_vacia'))}
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
  topHeader: {},
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerActions: { flexDirection: 'row', padding: spacing.md, gap: spacing.sm, alignItems: 'center', marginTop: -10 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.borderStrong, paddingHorizontal: spacing.sm, height: 48 },
  searchInput: { flex: 1, padding: spacing.xs, fontSize: 13, color: colors.onSurface },
  scanActionBtn: {
    height: 48,
    paddingHorizontal: 8,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanInner: { alignItems: 'center' },
  scanActionText: { fontSize: 8, fontWeight: '900', color: colors.brandSecondary, marginTop: -2 },
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
  modalActions: { flexDirection: 'row', gap: 10 },
  boxChip: { paddingHorizontal: 15, paddingVertical: 10, borderWidth: 2, borderColor: colors.borderStrong, backgroundColor: '#FFF', marginRight: 10 },
  boxChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  boxChipText: { fontWeight: '900', fontSize: 12, color: colors.onSurface },
  measuresGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 15 },
  measureCol: { width: '47%' },
  measureLabel: { fontSize: 10, fontWeight: '900', color: colors.muted, marginBottom: 5 },
  measureInput: { borderWidth: 2, borderColor: colors.borderStrong, padding: 8, backgroundColor: '#FFF', fontSize: 14, fontWeight: '700' },
  standardMeasuresBox: { padding: 10, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#CBD5E1', marginBottom: 20 },
  standardTitle: { fontSize: 10, fontWeight: '900', color: '#64748B', marginBottom: 2 },
  standardValue: { fontSize: 13, fontWeight: '900', color: '#1E293B' },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  optionChip: { borderWidth: 2, borderColor: colors.borderStrong, paddingHorizontal: spacing.md, paddingVertical: 8, flexShrink: 0 },
  optionChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  optionText: { fontWeight: '900', fontSize: 11, color: colors.onSurface, letterSpacing: 1 },
  optionTextActive: { color: colors.onBrandPrimary },
});

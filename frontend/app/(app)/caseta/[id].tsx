import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  ActivityIndicator, KeyboardAvoidingView, Platform, Image, Alert, TouchableOpacity
} from 'react-native';
import { useIsTablet } from '@/src/hooks/useIsTablet';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Signature from '@/src/components/SignaturePad';
import { apiCall } from '@/src/api/client';
import { supabase } from '@/src/api/supabase';
import { useAuth } from '@/src/context/AuthContext';
import { useInspections } from '@/src/context/InspectionContext';
import { colors, spacing, typography } from '@/src/constants/theme';
import { sanitizePlate } from '@/src/utils/text';
import { useTranslation } from 'react-i18next';
import { compressImage } from '@/src/utils/image';

export default function CasetaDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const isTablet = useIsTablet();
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const { patchVehicleExit, updateVehicleRecord } = useInspections();

  const [rec, setRec] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<{ notFound: boolean; message: string } | null>(null);
  const [showExit, setShowExit] = useState(false);
  const [editEntry, setEditEntry] = useState(false);
  const [showSig, setShowSig] = useState(false);
  // Qué firma se está capturando en el modal compartido -- ANTES se usaba
  // 'showExit' (si la sección de SALIDA está expandida) para decidirlo, lo
  // cual no tiene nada que ver con qué botón de firma se tocó: si la sección
  // de salida ya estaba abierta (pasa automático si el registro ya tiene
  // salida), editar la firma del CHOFER terminaba sobrescribiendo la firma
  // del GUARDIA en su lugar -- por eso 'no se podía cambiar' la del chofer.
  const [sigTarget, setSigTarget] = useState<'entry' | 'exit'>('entry');
  const sigRef = React.useRef<any>(null);
  // Botones rapidos de nombre para el guardia que registra la SALIDA --
  // mismo patron ya usado para el guardia de caseta (entrada) y el de
  // embarque, para no tener que escribir el nombre a mano cada vez.
  const [guardiaSalidaOpcion, setGuardiaSalidaOpcion] = useState<'MARIO AGUILAR' | 'ADELAIDO SAENZ' | 'OTRO' | ''>('');

  const isAdmin = user?.role === 'admin' || user?.role === 'supervisor' || ['d.trujillo@brancoindustries.com', 'd4r005@gmail.com'].includes(user?.email || '');
  // Borrar sólo la salida (deshacer) es una acción destructiva reservada a
  // admin real — a diferencia de "isAdmin" arriba, que también incluye
  // supervisor para edición normal.
  const isRealAdmin = user?.role === 'admin' || ['d.trujillo@brancoindustries.com', 'd4r005@gmail.com'].includes(user?.email || '');
  const [deletingExit, setDeletingExit] = useState(false);

  const [entryForm, setEntryForm] = useState<any>(null);
  const [exitData, setExitData] = useState<any>({
    hora_apertura_cortina: '',
    hora_cierre_cortina: '',
    cortina_salida: '',
    sello_salida: '',
    sello_salida_2: '',
    condicion_salida: '',
    destino: '',
    numero_tractor_salida: '',
    numero_caja_salida: '',
    numero_caja_salida_2: '',
    placas_unidad_salida: '',
    placas_caja_salida: '',
    pallets: '',
    cajas: '',
    bultos: '',
    sello_vvtt_estado: '',
    sello_vvtt_foto: '',
    sello_vvtt_estado_2: '',
    sello_vvtt_foto_2: '',
    guardia_salida_nombre: '',
  });

  const load = async () => {
    if (!token || !id) return;
    setLoading(true);
    setLoadError(null);
    try {
      // 1. Fetch main vehicle record
      const { data, error } = await supabase
        .from('vehicle_records')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      if (data) {
        const mappedRec = {
          ...data,
          entry: data.entry_data,
          exit: data.exit_data,
          status: data.exit_data ? 'salida' : (data.inspection_id ? 'inspeccionado' : 'entrada')
        };
        setRec(mappedRec);
        setEntryForm(JSON.parse(JSON.stringify(data.entry_data)));

        // --- Lógica de Autollenado de Salida ---
        let ticketData: any = null;
        try {
          // Find ticket where data contains record_id = id
          const { data: tickets, error: ticketErr } = await supabase
            .from('shipping_tickets')
            .select('*')
            .filter('data->>record_id', 'eq', id);

          if (!ticketErr && tickets && tickets.length > 0) {
            ticketData = tickets[0].data;
          }
        } catch (e) {
          console.log("No se encontró ticket de embarque para autollenado");
        }

        if (mappedRec.exit) {
          const autoSello = mappedRec.entry?.condicion_carga === 'descarga' && !mappedRec.exit?.sello_vvtt_estado
            ? { sello_vvtt_estado: 'SELLO ROTO' }
            : {};
          setExitData((prev: any) => ({ ...prev, ...mappedRec.exit, ...autoSello }));
          setShowExit(true);
        } else {
          const isDescarga = mappedRec.entry?.condicion_carga === 'descarga';
          setExitData((prev: any) => ({
            ...prev,
            sello_vvtt_estado: isDescarga ? 'SELLO ROTO' : '',
            placas_unidad_salida: mappedRec.entry?.placas_unidad || '',
            placas_caja_salida: mappedRec.entry?.placas_caja || '',
            numero_tractor_salida: mappedRec.entry?.numero_tractor || '',
            numero_caja_salida: mappedRec.entry?.numero_caja || '',
            numero_caja_salida_2: mappedRec.entry?.numero_caja_2 || '',
            destino: mappedRec.entry?.destino || '',
            sello_salida: ticketData?.numero_sello || '',
            pallets: ticketData?.numero_pallets || '',
            cajas: ticketData?.cajas || '',
            bultos: ticketData?.bultos || '',
          }));
        }
      }
    } catch (e: any) {
      console.error("Error loading record:", e);
      const msg = e?.message || '';
      const notFound = msg.includes('PGRST116') || msg.includes('404'); // PGRST116 is single() not found
      setLoadError({ notFound, message: msg || t('error_cargar_datos') });
      if (notFound) {
        Alert.alert(t('error'), t('error_cargar_datos'));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id, token]);

  const handleUpdateEntry = async () => {
    setSaving(true);
    try {
      await updateVehicleRecord(id as string, entryForm);
      setEditEntry(false);
      load();
      Alert.alert(t('exito'), t('registro_actualizado'));
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveExit = async () => {
    if (!exitData.guardia_salida_nombre || !exitData.condicion_salida) {
      Alert.alert(t('error'), t('completar_datos_salida'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...exitData,
        fecha_salida: exitData.fecha_salida || new Date().toISOString(),
      };
      await patchVehicleExit(id as string, payload);
      Alert.alert(t('exito'), t('salida_registrada'));
      load();
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteExit = () => {
    if (deletingExit) return;
    Alert.alert(
      t('eliminar_proceso_title') || 'Eliminar salida',
      `${t('eliminar_salida_msg') || '¿Seguro que quieres eliminar la salida registrada de esta unidad? La entrada e inspección se conservan. No se puede deshacer.'}`,
      [
        { text: t('cancelar') || 'Cancelar', style: 'cancel' },
        {
          text: t('eliminar') || 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            setDeletingExit(true);
            try {
              const { error } = await supabase
                .from('vehicle_records')
                .update({ exit_data: null })
                .eq('id', id);

              if (error) throw error;

              setExitData({
                cortina_salida: '', sello_salida: '', sello_salida_2: '', condicion_salida: '',
                numero_tractor_salida: '', numero_caja_salida: '', numero_caja_salida_2: '',
                guardia_salida_nombre: '',
              } as any);
              setShowExit(false);
              await load();
              Alert.alert(t('exito') || 'Listo', t('salida_eliminada_msg') || 'La salida fue eliminada.');
            } catch (e: any) {
              Alert.alert(t('error') || 'Error', e.message);
            } finally {
              setDeletingExit(false);
            }
          },
        },
      ]
    );
  };

  const pickPhoto = async (section: 'entry' | 'exit', field: string) => {
    Alert.alert(
      t('seleccionar_origen'),
      t('seleccionar_origen_desc'),
      [
        {
          text: t('camara'),
          onPress: async () => {
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.3,
              base64: true,
            });
            if (!result.canceled && result.assets[0].base64) {
              const b64 = await compressImage(`data:image/jpeg;base64,${result.assets[0].base64}`);
              if (section === 'entry') setEntryForm((prev: any) => ({ ...prev, [field]: b64 }));
              else setExitData((prev: any) => ({ ...prev, [field]: b64 }));
            }
          }
        },
        {
          text: t('galeria'),
          onPress: async () => {
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.3,
              base64: true,
            });
            if (!result.canceled && result.assets[0].base64) {
              const b64 = await compressImage(`data:image/jpeg;base64,${result.assets[0].base64}`);
              if (section === 'entry') setEntryForm((prev: any) => ({ ...prev, [field]: b64 }));
              else setExitData((prev: any) => ({ ...prev, [field]: b64 }));
            }
          }
        },
        {
          text: "URL (DRIVE/WEB)",
          onPress: () => {
            Alert.prompt(
              "Ingresar URL",
              "Pega el enlace directo de la imagen o Google Drive",
              [
                { text: t('cancelar'), style: 'cancel' },
                {
                  text: t('agregar'),
                  onPress: (url) => {
                    if (url) {
                      if (section === 'entry') setEntryForm((prev: any) => ({ ...prev, [field]: url }));
                      else setExitData((prev: any) => ({ ...prev, [field]: url }));
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

  const removePhoto = (section: 'entry' | 'exit', field: string) => {
    if (section === 'entry') {
      setEntryForm((prev: any) => ({ ...prev, [field]: '' }));
    } else {
      setExitData((prev: any) => ({ ...prev, [field]: '' }));
    }
  };

  if (loading) return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>
    </SafeAreaView>
  );

  if (!rec) return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </Pressable>
        <Text style={styles.topTitle}>{t('registro').toUpperCase()}</Text>
      </View>
      <View style={styles.center}>
        {loadError && !loadError.notFound ? (
          <>
            <Ionicons name="cloud-offline-outline" size={40} color={colors.muted} style={{ marginBottom: spacing.md }} />
            <Text style={{ textAlign: 'center', marginBottom: spacing.md, paddingHorizontal: spacing.lg, fontWeight: '700', color: colors.onSurface }}>
              {t('no_pudo_cargar_registro')}
            </Text>
            <Pressable onPress={load} style={{ backgroundColor: colors.brandPrimary, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 4 }}>
              <Text style={{ color: '#FFF', fontWeight: '900', letterSpacing: 1 }}>{(t('reintentar') || 'REINTENTAR').toUpperCase()}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Ionicons name="search-outline" size={48} color={colors.muted} style={{ marginBottom: spacing.md }} />
            <Text style={{ textAlign: 'center', marginBottom: spacing.xxl, paddingHorizontal: spacing.lg, fontWeight: '700', color: colors.onSurface }}>
              {t('no_hay_registros')}
            </Text>
            <Pressable onPress={() => router.back()} style={{ borderWidth: 2, borderColor: colors.brandPrimary, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 4 }}>
              <Text style={{ color: colors.brandPrimary, fontWeight: '900', letterSpacing: 1 }}>{t('atras').toUpperCase()}</Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );

  const isFull = rec.entry?.tipo_unidad === 'full';
  const entryPlates = rec.entry?.placas_unidad || 'S/P';
  const inspectionsDone = Array.isArray(rec.inspection_ids) ? rec.inspection_ids.length : (rec.inspection_id ? 1 : 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </Pressable>
        <Text style={styles.topTitle}>{t('registro').toUpperCase()}: {entryPlates}</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[styles.scroll, isTablet && styles.scrollTablet]}>
          {/* SECCIÓN ENTRADA */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="log-in" size={20} color="#FFF" />
              <Text style={styles.sectionTitle}>{t('entrada_datos_unidad').toUpperCase()}</Text>
              {isAdmin && (
                <TouchableOpacity onPress={() => editEntry ? handleUpdateEntry() : setEditEntry(true)} style={styles.headerAction}>
                  <Text style={styles.headerActionText}>{editEntry ? t('guardar').toUpperCase() : t('editar').toUpperCase()}</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.sectionBody}>
              <View style={styles.grid}>
                <EditableItem label={t('placas')} value={entryForm.placas_unidad} onEdit={editEntry ? (v:any)=>setEntryForm((prev: any) => ({ ...prev, placas_unidad: sanitizePlate(v) })) : null} />
                <EditableItem label={t('chofer')} value={entryForm.chofer_nombre} onEdit={editEntry ? (v:any)=>setEntryForm((prev: any) => ({ ...prev, chofer_nombre: v })) : null} />
                <EditableItem label={t('compania')} value={entryForm.compania_transporte} onEdit={editEntry ? (v:any)=>setEntryForm((prev: any) => ({ ...prev, compania_transporte: v })) : null} />
                <EditableItem label={t('tractor')} value={entryForm.numero_tractor} onEdit={editEntry ? (v:any)=>setEntryForm((prev: any) => ({ ...prev, numero_tractor: v })) : null} />
              </View>

              <View style={styles.subSection}>
                <Text style={styles.subTitle}>{t('caja').toUpperCase()}</Text>
                <View style={styles.grid}>
                  <EditableItem label={t('numero_caja_caps')} value={entryForm.numero_caja} onEdit={editEntry ? (v:any)=>setEntryForm((prev: any) => ({ ...prev, numero_caja: v })) : null} />
                  <EditableItem label={t('placas_caja_caps')} value={entryForm.placas_caja} onEdit={editEntry ? (v:any)=>setEntryForm((prev: any) => ({ ...prev, placas_caja: sanitizePlate(v) })) : null} />
                  <EditableItem label={t('sello').toUpperCase()} value={entryForm.sello_entrada} onEdit={editEntry ? (v:any)=>setEntryForm((prev: any) => ({ ...prev, sello_entrada: v })) : null} />
                </View>
              </View>

              {isFull && (
                <View style={styles.subSection}>
                  <Text style={styles.subTitle}>{t('caja').toUpperCase()}</Text>
                  <View style={styles.grid}>
                    <EditableItem label={t('numero_caja_caps')} value={entryForm.numero_caja_2} onEdit={editEntry ? (v:any)=>setEntryForm((prev: any) => ({ ...prev, numero_caja_2: v })) : null} />
                    <EditableItem label={t('sello').toUpperCase()} value={entryForm.sello_entrada_2} onEdit={editEntry ? (v:any)=>setEntryForm((prev: any) => ({ ...prev, sello_entrada_2: v })) : null} />
                  </View>
                </View>
              )}

              {/* DATOS ADICIONALES — frecuentemente vacíos en registros históricos reconstruidos */}
              <View style={styles.subSection}>
                <Text style={styles.subTitle}>{t('datos_adicionales').toUpperCase()}</Text>
                <View style={styles.grid}>
                  <EditableItem label={t('destino_caps')} value={entryForm.destino} onEdit={editEntry ? (v:any)=>setEntryForm((prev: any) => ({ ...prev, destino: v })) : null} />
                  <EditableItem label={t('condicion_carga').toUpperCase()} value={entryForm.condicion_carga} onEdit={editEntry ? (v:any)=>setEntryForm((prev: any) => ({ ...prev, condicion_carga: v })) : null} />
                  <EditableItem label={t('orden_compra').toUpperCase()} value={entryForm.numero_orden_compra} onEdit={editEntry ? (v:any)=>setEntryForm((prev: any) => ({ ...prev, numero_orden_compra: v })) : null} />
                  <EditableItem label={t('licencia_conductor').toUpperCase()} value={entryForm.licencia_conductor} onEdit={editEntry ? (v:any)=>setEntryForm((prev: any) => ({ ...prev, licencia_conductor: v })) : null} />
                </View>
                <View style={{ marginTop: spacing.sm }}>
                  <Text style={styles.infoLabel}>{t('descripcion_carga').toUpperCase()}</Text>
                  {editEntry ? (
                    <TextInput
                      style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
                      value={entryForm.descripcion_carga || ''}
                      onChangeText={(v) => setEntryForm((prev: any) => ({ ...prev, descripcion_carga: v.toUpperCase() }))}
                      multiline
                    />
                  ) : (
                    <Text style={styles.infoValue}>{entryForm.descripcion_carga || '-'}</Text>
                  )}
                </View>
              </View>

              {/* FOTOS ENTRADA */}
              <View style={styles.subSection}>
                <Text style={styles.subTitle}>{t('evidencia_fotografica').toUpperCase()}</Text>
                <View style={styles.photoGrid}>
                   <PhotoThumbnail label={t('frente')} uri={entryForm.foto_frente_unidad} onPick={editEntry ? ()=>pickPhoto('entry', 'foto_frente_unidad') : null} onRemove={editEntry ? ()=>removePhoto('entry', 'foto_frente_unidad') : null} />
                   <PhotoThumbnail label={t('atras')} uri={entryForm.foto_atras_caja} onPick={editEntry ? ()=>pickPhoto('entry', 'foto_atras_caja') : null} onRemove={editEntry ? ()=>removePhoto('entry', 'foto_atras_caja') : null} />
                   <PhotoThumbnail label={t('id_chofer')} uri={entryForm.foto_id_chofer} onPick={editEntry ? ()=>pickPhoto('entry', 'foto_id_chofer') : null} onRemove={editEntry ? ()=>removePhoto('entry', 'foto_id_chofer') : null} />
                </View>
              </View>

              <View style={styles.subSection}>
                <Text style={styles.subTitle}>{t('firmas').toUpperCase()}</Text>
                <View style={styles.grid}>
                   <View style={{ flex: 1 }}>
                     <Text style={styles.infoLabel}>{t('firma_operador')}</Text>
                     <Pressable style={styles.sigBoxSmall} onPress={editEntry ? () => { setSigTarget('entry'); setShowSig(true); } : undefined}>
                        {entryForm.firma_operador ? (
                          <>
                            <Image source={{ uri: entryForm.firma_operador }} style={{ width: '100%', height: 60, resizeMode: 'contain' }} />
                            {editEntry && (
                              <Pressable style={styles.removeBtnSig} onPress={() => setEntryForm((prev: any) => ({ ...prev, firma_operador: '' }))}>
                                <Ionicons name="trash" size={16} color={colors.error} />
                              </Pressable>
                            )}
                          </>
                        ) : (
                          <Text style={styles.sigPlaceholderSmall}>{t('toca_para_firmar')}</Text>
                        )}
                     </Pressable>
                   </View>
                </View>
              </View>

              <View style={styles.metaRow}>
                <Text style={styles.metaText}>{t('fecha')}: {new Date(rec.entry?.fecha_entrada || rec.created_at).toLocaleString()}</Text>
                <Text style={styles.metaText}>{t('guardia')}: {rec.entry?.guardia_caseta_nombre}</Text>
              </View>
            </View>
          </View>

          {/* SECCIÓN INSPECCIONES */}
          <View style={styles.section}>
            <View style={[styles.sectionHeader, { backgroundColor: colors.info }]}>
              <Ionicons name="clipboard" size={20} color="#FFF" />
              <Text style={styles.sectionTitle}>{t('inspeccion').toUpperCase()}</Text>
            </View>
            <View style={styles.sectionBody}>
              <Text style={styles.infoText}>
                {isFull ? t('unidad_full_inspecciones_msg', { count: inspectionsDone }) : t('inspecciones_realizadas', { count: inspectionsDone })}
              </Text>

              {rec.inspection_ids?.length > 0 && (
                <View style={{ marginBottom: 15 }}>
                  {rec.inspection_ids.map((iid: string, idx: number) => (
                    <Pressable key={iid} style={styles.inspectionLink} onPress={() => router.push(`/inspection/${iid}`)}>
                      <Ionicons name="document-text" size={16} color={colors.info} />
                      <Text style={styles.inspectionLinkText}>{t('ver_inspeccion')} {idx + 1}</Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.muted} style={{ marginLeft: 'auto' }} />
                    </Pressable>
                  ))}
                </View>
              )}

              <View style={styles.btnRow}>
                <Pressable
                  style={[styles.actionBtn, { backgroundColor: colors.brandPrimary }]}
                  onPress={() => router.push(`/(app)/nueva?record_id=${rec.id}&placas=${rec.entry?.placas_unidad || ""}&trailer=${rec.entry?.numero_caja || ""}&sello=${rec.entry?.sello_entrada || ""}`)}
                >
                  <Ionicons name="add-circle" size={20} color="#FFF" />
                  <Text style={styles.actionBtnText}>{t('inspeccionar').toUpperCase()} {isFull ? '1' : ''}</Text>
                </Pressable>

                {isFull && (
                  <Pressable
                    style={[styles.actionBtn, { backgroundColor: colors.brandSecondary }]}
                    onPress={() => router.push(`/(app)/nueva?record_id=${rec.id}&placas=${rec.entry?.placas_unidad || ""}&trailer=${rec.entry?.numero_caja_2 || ""}&sello=${rec.entry?.sello_entrada_2 || ""}`)}
                  >
                    <Ionicons name="add-circle" size={20} color="#FFF" />
                    <Text style={styles.actionBtnText}>{t('inspeccionar').toUpperCase()} 2</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>

          {/* SECCIÓN TICKET EMBARQUE */}
          <View style={styles.section}>
            <View style={[styles.sectionHeader, { backgroundColor: '#FF8C00' }]}>
              <Ionicons name="cube" size={20} color="#FFF" />
              <Text style={styles.sectionTitle}>TICKET EMBARQUE</Text>
            </View>
            <View style={styles.sectionBody}>
              {rec.has_shipping_ticket || rec.shipping_ticket_id ? (
                <Pressable
                  style={[styles.inspectionLink]}
                  onPress={() => router.push(`/embarque/${rec.shipping_ticket_id}`)}
                >
                  <Ionicons name="document-text" size={16} color="#FF8C00" />
                  <Text style={[styles.inspectionLinkText, { color: '#FF8C00' }]}>Ver Ticket de Embarque</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} style={{ marginLeft: 'auto' }} />
                </Pressable>
              ) : (
                <Pressable
                  style={[styles.actionBtn, { backgroundColor: '#FF8C00' }]}
                  onPress={() => router.push(
                    `/(app)/embarque/nuevo?record_id=${rec.id}&placas=${rec.entry?.placas_unidad || ''}&compania=${rec.entry?.compania_transporte || ''}&operador=${rec.entry?.chofer_nombre || ''}&trailer=${rec.entry?.numero_caja || ''}&economico=${rec.entry?.numero_tractor || ''}&hora_llegada=${rec.entry?.hora_llegada || ''}&orden_compra=${rec.entry?.numero_orden_compra || ''}`
                  )}
                >
                  <Ionicons name="add-circle" size={20} color="#FFF" />
                  <Text style={styles.actionBtnText}>GENERAR TICKET EMBARQUE</Text>
                </Pressable>
              )}
            </View>
          </View>

          {/* SECCIÓN SALIDA */}
          <View style={styles.section}>
            <Pressable
              style={[styles.sectionHeader, { backgroundColor: rec.status === 'salida' ? colors.success : colors.warning }]}
              onPress={() => setShowExit(!showExit)}
            >
              <Ionicons name="log-out" size={20} color="#FFF" />
              <Text style={styles.sectionTitle}>{t('registrador_salida').toUpperCase()}</Text>
              {rec.status === 'salida' && isRealAdmin && (
                <Pressable
                  onPress={(e) => { e.stopPropagation(); handleDeleteExit(); }}
                  style={{ marginLeft: 'auto', marginRight: spacing.sm, padding: 4 }}
                  disabled={deletingExit}
                >
                  {deletingExit ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="trash-outline" size={20} color="#FFF" />}
                </Pressable>
              )}
              <Ionicons name={showExit ? "chevron-up" : "chevron-down"} size={20} color="#FFF" style={rec.status === 'salida' && isRealAdmin ? undefined : { marginLeft: 'auto' }} />
            </Pressable>

            {showExit && (
              <View style={styles.sectionBody}>
                <Text style={styles.fieldLabel}>{t('nombre_guardia_caseta')} *</Text>
                <View style={[styles.optionsRow, { marginBottom: spacing.sm }]}>
                  {(['MARIO AGUILAR', 'ADELAIDO SAENZ', 'OTRO'] as const).map((o) => (
                    <Pressable
                      key={o}
                      onPress={() => {
                        setGuardiaSalidaOpcion(o);
                        setExitData((prev: any) => ({ ...prev, guardia_salida_nombre: o !== 'OTRO' ? o : '' }));
                      }}
                      style={[styles.optionChip, guardiaSalidaOpcion === o && styles.optionChipActive]}
                    >
                      <Text style={[styles.optionText, guardiaSalidaOpcion === o && styles.optionTextActive]}>{o}</Text>
                    </Pressable>
                  ))}
                </View>
                {(guardiaSalidaOpcion === 'OTRO' || !guardiaSalidaOpcion) && (
                  <TextInput
                    style={styles.input}
                    value={exitData.guardia_salida_nombre}
                    autoCapitalize="characters"
                    onChangeText={(v) => setExitData((prev: any) => ({ ...prev, guardia_salida_nombre: v.toUpperCase() }))}
                    placeholder={t('nombre_guardia').toUpperCase()}
                  />
                )}

                <Text style={styles.fieldLabel}>{t('condicion_salida_label')} *</Text>
                <View style={styles.optionsRow}>
                  {['VACIA', 'CARGADA', 'CONSOLIDADO', 'OTRO'].map(opt => (
                    <Pressable
                      key={opt}
                      style={[styles.optionChip, exitData.condicion_salida === opt && styles.optionChipActive]}
                      onPress={() => setExitData((prev: any) => ({ ...prev, condicion_salida: opt }))}
                    >
                      <Text style={[styles.optionText, exitData.condicion_salida === opt && styles.optionTextActive]}>{opt}</Text>
                    </Pressable>
                  ))}
                </View>

                <View style={styles.grid}>
                   <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>{t('placas')}</Text>
                      <TextInput
                        style={styles.input}
                        value={exitData.placas_unidad_salida}
                        autoCorrect={false}
                        spellCheck={false}
                        placeholder={entryForm.placas_unidad}
                        onChangeText={(v) => setExitData((prev: any) => ({ ...prev, placas_unidad_salida: sanitizePlate(v) }))}
                      />
                   </View>
                   <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>{t('placas_caja_caps')}</Text>
                      <TextInput
                        style={styles.input}
                        value={exitData.placas_caja_salida}
                        autoCorrect={false}
                        spellCheck={false}
                        placeholder={entryForm.placas_caja}
                        onChangeText={(v) => setExitData((prev: any) => ({ ...prev, placas_caja_salida: sanitizePlate(v) }))}
                      />
                   </View>
                </View>

                <View style={styles.grid}>
                   <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>{t('sello_salida_label')}{isFull ? ' 1' : ''}</Text>
                      <TextInput
                        style={styles.input}
                        value={exitData.sello_salida}
                        autoCorrect={false}
                        spellCheck={false}
                        autoCapitalize="characters"
                        onChangeText={(v) => setExitData((prev: any) => ({ ...prev, sello_salida: v.toUpperCase() }))}
                      />
                   </View>
                   {isFull && (
                     <View style={{ flex: 1 }}>
                        <Text style={styles.fieldLabel}>{t('sello_salida_label')} 2</Text>
                        <TextInput
                          style={styles.input}
                          value={exitData.sello_salida_2}
                          autoCorrect={false}
                          spellCheck={false}
                          autoCapitalize="characters"
                          onChangeText={(v) => setExitData((prev: any) => ({ ...prev, sello_salida_2: v.toUpperCase() }))}
                        />
                     </View>
                   )}
                </View>

                {isFull && (
                  <>
                    <Text style={styles.fieldLabel}>Caja Salida 2</Text>
                    <TextInput
                      style={styles.input}
                      value={exitData.numero_caja_salida_2}
                      autoCorrect={false}
                      spellCheck={false}
                      autoCapitalize="characters"
                      onChangeText={(v) => setExitData((prev: any) => ({ ...prev, numero_caja_salida_2: v.toUpperCase() }))}
                    />
                  </>
                )}

                <View style={styles.grid}>
                   <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>Pallets</Text>
                      <TextInput
                        style={styles.input}
                        value={exitData.pallets}
                        keyboardType="numeric"
                        onChangeText={(v) => setExitData((prev: any) => ({ ...prev, pallets: v }))}
                      />
                   </View>
                   <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>Cajas</Text>
                      <TextInput
                        style={styles.input}
                        value={exitData.cajas}
                        keyboardType="numeric"
                        onChangeText={(v) => setExitData((prev: any) => ({ ...prev, cajas: v }))}
                      />
                   </View>
                   <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>Bultos</Text>
                      <TextInput
                        style={styles.input}
                        value={exitData.bultos}
                        keyboardType="numeric"
                        onChangeText={(v) => setExitData((prev: any) => ({ ...prev, bultos: v }))}
                      />
                   </View>
                </View>

                <Text style={styles.fieldLabel}>{rec.entry?.condicion_carga === 'descarga' ? 'SELLO ROTO' : t('inspeccion_sellos_vvtt')}</Text>
                <View style={styles.grid}>
                   <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>
                        {rec.entry?.condicion_carga === 'descarga' ? 'NÚMERO DE SELLO ROTO' : `Sello VVTT Estado${isFull ? ' 1' : ''}`}
                      </Text>
                      <TextInput
                        style={styles.input}
                        value={exitData.sello_vvtt_estado}
                        autoCorrect={false}
                        spellCheck={false}
                        autoCapitalize="characters"
                        placeholder={rec.entry?.condicion_carga === 'descarga' ? 'EJ: 123456' : ''}
                        onChangeText={(v) => setExitData((prev: any) => ({ ...prev, sello_vvtt_estado: v.toUpperCase() }))}
                      />
                   </View>
                   {isFull && (
                     <View style={{ flex: 1 }}>
                        <Text style={styles.fieldLabel}>Sello VVTT Estado 2</Text>
                        <TextInput
                          style={styles.input}
                          value={exitData.sello_vvtt_estado_2}
                          autoCorrect={false}
                          spellCheck={false}
                          autoCapitalize="characters"
                          onChangeText={(v) => setExitData((prev: any) => ({ ...prev, sello_vvtt_estado_2: v.toUpperCase() }))}
                        />
                     </View>
                   )}
                </View>
                <View style={styles.photoGrid}>
                  {/* Una descarga siempre termina SIN el sello VVTT intacto (se rompe
                      para poder abrir la caja) -- la evidencia esperada en ese caso es
                      la foto del SELLO ROTO, no "sello VVTT" (que implicaría intacto). */}
                  <PhotoThumbnail label={(entryForm?.condicion_carga === 'descarga' ? t('foto_sello_roto') : t('foto_sello_vvtt')) + (isFull ? " 1" : "")} uri={exitData.sello_vvtt_foto} onPick={()=>pickPhoto('exit', 'sello_vvtt_foto')} onRemove={()=>removePhoto('exit', 'sello_vvtt_foto')} />
                  {isFull && <PhotoThumbnail label={(entryForm?.condicion_carga === 'descarga' ? t('foto_sello_roto') : t('foto_sello_vvtt')) + " 2"} uri={exitData.sello_vvtt_foto_2} onPick={()=>pickPhoto('exit', 'sello_vvtt_foto_2')} onRemove={()=>removePhoto('exit', 'sello_vvtt_foto_2')} />}
                </View>

                <Text style={styles.fieldLabel}>{t('firma_guardia')}</Text>
                <Pressable style={styles.sigBox} onPress={() => { setSigTarget('exit'); setShowSig(true); }}>
                  {exitData.firma_guardia ? (
                    <>
                      <Image source={{ uri: exitData.firma_guardia }} style={{ width: '100%', height: 100, resizeMode: 'contain' }} />
                      <Pressable style={styles.removeBtnSig} onPress={() => setExitData((prev: any) => ({ ...prev, firma_guardia: '' }))}>
                        <Ionicons name="trash" size={24} color={colors.error} />
                      </Pressable>
                    </>
                  ) : (
                    <Text style={styles.sigPlaceholder}>{t('toca_para_firmar')}</Text>
                  )}
                </Pressable>

                <Pressable
                  style={[styles.saveBtn, saving && { opacity: 0.5 }]}
                  onPress={handleSaveExit}
                  disabled={saving}
                >
                  {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>{t('guardar_salida').toUpperCase()}</Text>}
                </Pressable>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {showSig && (
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('firma').toUpperCase()}</Text>
            <View style={styles.sigContainer}>
              <Signature
                ref={sigRef}
                onOK={(sig) => {
                  if (sigTarget === 'exit') setExitData((prev: any) => ({ ...prev, firma_guardia: sig }));
                  else setEntryForm((prev: any) => ({ ...prev, firma_operador: sig }));
                  setShowSig(false);
                }}
                onEmpty={() => alert(t('firma_vacia'))}
                webStyle={`.m-signature-pad--footer{display:none;}`}
              />
            </View>
            <View style={styles.modalBtns}>
              <Pressable style={styles.modalBtn} onPress={() => setShowSig(false)}><Text>{t('cancelar')}</Text></Pressable>
              <Pressable style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={() => sigRef.current?.readSignature()}>
                <Text style={{ color: '#FFF' }}>{t('guardar')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

function EditableItem({ label, value, onEdit }: any) {
  return (
    <View style={styles.infoItem}>
      <Text style={styles.infoLabel}>{label}</Text>
      {onEdit ? (
        <TextInput style={styles.editInput} value={value} autoCorrect={false} spellCheck={false} onChangeText={(v) => onEdit(v.toUpperCase())} />
      ) : (
        <Text style={styles.infoValue}>{value || '-'}</Text>
      )}
    </View>
  );
}

function PhotoThumbnail({ label, uri, onPick, onRemove }: any) {
  return (
    <View style={styles.thumbWrapper}>
      <Text style={styles.thumbLabel}>{label}</Text>
      <Pressable style={styles.thumbBox} onPress={onPick} disabled={!onPick}>
        {uri ? (
          <>
            <Image source={{ uri }} style={styles.thumbImg} />
            {onRemove && (
              <Pressable style={styles.removeBtn} onPress={onRemove}>
                <Ionicons name="close-circle" size={24} color={colors.error} />
              </Pressable>
            )}
          </>
        ) : (
          <View style={styles.thumbPlaceholder}>
            <Ionicons name="camera" size={24} color={colors.muted} />
            <Text style={styles.thumbPlaceholderText}>N/A</Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: { backgroundColor: colors.brandPrimary, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 15 },
  backBtn: { padding: 5 },
  topTitle: { color: '#FFF', fontWeight: '900', fontSize: 16, letterSpacing: 1 },
  scroll: { padding: spacing.md, gap: spacing.md, paddingBottom: 100 },
  scrollTablet: { maxWidth: 860, alignSelf: 'center', width: '100%' },
  section: { backgroundColor: '#FFF', borderWidth: 2, borderColor: colors.borderStrong, overflow: 'hidden' },
  sectionHeader: { backgroundColor: colors.brandPrimary, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionTitle: { color: '#FFF', fontWeight: '900', fontSize: 12, letterSpacing: 1, flex: 1 },
  sectionBody: { padding: spacing.md },
  headerAction: { backgroundColor: colors.brandSecondary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 2 },
  headerActionText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  infoItem: { flex: 1, minWidth: '45%' },
  infoLabel: { fontSize: 10, color: colors.muted, fontWeight: '700' },
  infoValue: { fontSize: 13, fontWeight: '900', color: colors.onSurface },
  editInput: { borderWidth: 1, borderColor: '#DDD', padding: 5, fontSize: 12, backgroundColor: '#F9F9F9', marginTop: 2 },
  subSection: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#EEE' },
  subTitle: { fontSize: 11, fontWeight: '900', color: colors.brandPrimary, marginBottom: 10 },
  photoGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  thumbWrapper: { width: '30%', minWidth: 90 },
  thumbLabel: { fontSize: 8, fontWeight: '900', color: colors.muted, marginBottom: 4, textAlign: 'center' },
  thumbBox: { height: 90, borderWidth: 1, borderColor: '#DDD', borderRadius: 4, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center' },
  thumbImg: { width: '100%', height: '100%', resizeMode: 'cover', borderRadius: 4 },
  thumbPlaceholder: { alignItems: 'center' },
  thumbPlaceholderText: { fontSize: 9, color: colors.muted, fontWeight: '900', marginTop: 2 },
  removeBtn: { position: 'absolute', top: -5, right: -5, backgroundColor: '#FFF', borderRadius: 12 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, borderTopWidth: 1, borderTopColor: '#EEE', paddingTop: 10 },
  metaText: { fontSize: 10, color: colors.muted },
  infoText: { fontSize: 12, color: colors.onSurface, marginBottom: 15, fontWeight: '700' },
  inspectionLink: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, backgroundColor: '#F0F9FF', borderWidth: 1, borderColor: '#BAE6FD', marginBottom: 5 },
  inspectionLinkText: { fontSize: 12, fontWeight: '900', color: colors.info },
  btnRow: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 4 },
  actionBtnText: { color: '#FFF', fontWeight: '900', fontSize: 12 },
  fieldLabel: { fontSize: 11, fontWeight: '900', color: colors.onSurface, marginTop: 15, marginBottom: 5 },
  input: { borderWidth: 2, borderColor: colors.borderStrong, padding: 10, fontSize: 14, backgroundColor: '#F9F9F9' },
  optionsRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  optionChip: { paddingHorizontal: 15, paddingVertical: 8, borderWidth: 2, borderColor: colors.borderStrong, backgroundColor: '#FFF' },
  optionChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  optionText: { fontWeight: '900', fontSize: 11, color: colors.muted },
  optionTextActive: { color: '#FFF' },
  sigBox: { height: 100, borderWidth: 2, borderColor: colors.borderStrong, marginTop: 5, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF' },
  sigPlaceholder: { color: colors.muted, fontWeight: '700' },
  sigBoxSmall: { height: 60, borderWidth: 1, borderColor: colors.border, marginTop: 5, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9F9F9' },
  sigPlaceholderSmall: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  removeBtnSig: { position: 'absolute', top: 5, right: 5, padding: 5, backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 15 },
  saveBtn: { backgroundColor: colors.success, padding: 15, alignItems: 'center', marginTop: 25, borderRadius: 4 },
  saveBtnText: { color: '#FFF', fontWeight: '900', letterSpacing: 1 },
  modal: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20, zIndex: 100 },
  modalContent: { backgroundColor: '#FFF', padding: 20, borderRadius: 8 },
  modalTitle: { fontWeight: '900', fontSize: 16, marginBottom: 15 },
  sigContainer: { height: 300, borderWidth: 1, borderColor: '#DDD', marginBottom: 15 },
  modalBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  modalBtn: { padding: 10, paddingHorizontal: 20 },
  modalBtnPrimary: { backgroundColor: colors.brandPrimary, borderRadius: 4 },
});


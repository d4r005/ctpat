import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator, Platform, TextInput, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as ImagePicker from 'expo-image-picker';
import Signature from '@/src/components/SignaturePad';
import { useInspections, Inspection, InspectionPoint } from '@/src/context/InspectionContext';
import { useAuth } from '@/src/context/AuthContext';
import { colors, spacing, typography } from '@/src/constants/theme';
import { sanitizePlate } from '@/src/utils/text';
import { getInspectionPoints } from '@/src/constants/inspectionPoints';

import { useTranslation } from 'react-i18next';

export default function InspectionDetail() {
  const { id, edit } = useLocalSearchParams<{ id: string, edit?: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { getById, approveInspection, rejectInspection, updateInspection } = useInspections();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.email?.toLowerCase().includes('d.trujillo') || user?.email?.toLowerCase().includes('d4r005');
  const [insp, setInsp] = useState<Inspection | undefined>(undefined);
  const [generating, setGenerating] = useState(false);
  const [isEditing, setIsEditing] = useState(edit === 'true' && isAdmin);
  const [editData, setEditData] = useState<Partial<Inspection>>({});
  const [approvalNote, setApprovalNote] = useState('');
  const [approvalName, setApprovalName] = useState(user?.name || '');
  const [approvalSignature, setApprovalSignature] = useState('');
  const [showSigModal, setShowSigModal] = useState(false);
  const [acting, setActing] = useState(false);
  const [sigModalConfig, setSigModalConfig] = useState<{ title: string, onSave: (sig: string) => void }>({
    title: 'Firma del Supervisor',
    onSave: (sig) => setApprovalSignature(sig)
  });
  const isSupervisor = user?.role === 'supervisor';

  const canEdit = isAdmin; // Solo administrador puede editar/modificar/borrar

  useEffect(() => {
    if (id) {
      const data = getById(id);
      setInsp(data);
      if (data) setEditData(data);
    }
  }, [id, getById]);

  const handleSaveEdit = async () => {
    if (!id) return;

    // Validación: Si hay puntos con falla, la foto es obligatoria
    const points = editData.points || insp?.points || [];
    const missingPhoto = points.find(p => p.estado === 'malo' && !p.photo);
    if (missingPhoto) {
      alert(`${t('punto')} ${missingPhoto.number} ${t('con_falla')}. ${t('foto_obligatoria_falla')}`);
      return;
    }

    setActing(true);
    try {
      await updateInspection(id, editData);
      setInsp(getById(id));
      setIsEditing(false);
      alert(t('inspeccion_guardada'));
    } catch (e: any) { alert(e.message); }
    finally { setActing(false); }
  };

  const pickPointPhoto = async (idx: number) => {
    Alert.alert(
      t('seleccionar_origen'),
      t('seleccionar_origen_desc'),
      [
        {
          text: t('camara'),
          onPress: async () => {
            const perm = await ImagePicker.requestCameraPermissionsAsync();
            if (!perm.granted) { alert(t('acceso_restringido')); return; }
            const r = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.5, base64: true });
            if (!r.canceled && r.assets[0]?.base64) {
              const newPoints = [...(editData.points || insp?.points || [])];
              newPoints[idx] = { ...newPoints[idx], photo: `data:image/jpeg;base64,${r.assets[0].base64}` };
              setEditData({ ...editData, points: newPoints });
            }
          }
        },
        {
          text: t('galeria'),
          onPress: async () => {
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) { alert(t('acceso_restringido')); return; }
            const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.5, base64: true });
            if (!r.canceled && r.assets[0]?.base64) {
              const newPoints = [...(editData.points || insp?.points || [])];
              newPoints[idx] = { ...newPoints[idx], photo: `data:image/jpeg;base64,${r.assets[0].base64}` };
              setEditData({ ...editData, points: newPoints });
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
                      const newPoints = [...(editData.points || insp?.points || [])];
                      newPoints[idx] = { ...newPoints[idx], photo: url };
                      setEditData({ ...editData, points: newPoints });
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

  const removePointPhoto = (idx: number) => {
    const newPoints = [...(editData.points || insp?.points || [])];
    newPoints[idx] = { ...newPoints[idx], photo: '' };
    setEditData({ ...editData, points: newPoints });
  };

  const handleApprove = async () => {
    if (!id) return;
    if (!approvalSignature) {
      alert(t('firma_supervisor') + " " + t('es_obligatoria'));
      return;
    }
    setActing(true);
    try {
      await approveInspection(id, approvalNote.trim(), approvalName.trim(), approvalSignature);
      alert(t('inspeccion_guardada'));
      // Redirigir al panel de supervisor para continuar con otras tareas
      router.replace('/(app)/supervisor');
    } catch (e: any) { alert(e.message); }
    finally { setActing(false); }
  };

  const handleReject = async () => {
    if (!id) return;
    if (!approvalNote.trim()) {
      alert(t('nota_obligatoria_rechazo'));
      return;
    }
    if (!approvalSignature) {
      alert(t('firma_supervisor') + " " + t('es_obligatoria'));
      return;
    }
    setActing(true);
    try {
      await rejectInspection(id, approvalNote.trim(), approvalName.trim(), approvalSignature);
      alert(t('inspeccion_rechazada') || 'Inspección rechazada');
      // Redirigir al panel de supervisor
      router.replace('/(app)/supervisor');
    } catch (e: any) { alert(e.message); }
    finally { setActing(false); }
  };

  if (!insp) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.brandPrimary} />
          <Text style={{ marginTop: spacing.md, color: colors.muted }}>{t('cargando_datos')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const buildHtml = (i: Inspection) => {
    const pointRows = i.points
      .map(
        (p) => `<tr>
          <td style="padding:6px;border:1px solid #999;">${p.number}</td>
          <td style="padding:6px;border:1px solid #999;">${p.name}</td>
          <td style="padding:6px;border:1px solid #999;background:${p.estado === 'bueno' ? '#dcfce7' : p.estado === 'malo' ? '#fee2e2' : '#fff'};font-weight:bold;text-transform:uppercase;">${p.estado || 'N/A'}</td>
          <td style="padding:6px;border:1px solid #999;">${p.comentarios || '-'}${p.photo ? `<br/><img src="${p.photo}" style="max-width:280px;max-height:180px;margin-top:6px;border:1px solid #999;" />` : ''}</td>
        </tr>`
      )
      .join('');
    const inspectorImg = i.inspector_firma ? `<img src="${i.inspector_firma}" style="height:80px;border:1px solid #999;background:#fff;" />` : '<div style="height:80px;border:1px dashed #999;"></div>';
    const guardImg = i.guard_signature ? `<img src="${i.guard_signature}" style="height:80px;border:1px solid #999;background:#fff;" />` : '<div style="height:80px;border:1px dashed #999;"></div>';
    const appSigImg = i.approved_by_signature ? `<img src="${i.approved_by_signature}" style="height:80px;border:1px solid #999;background:#fff;" />` : '<div style="height:80px;border:1px dashed #999;"></div>';

    const headerColor = i.status_general === 'bueno' ? '#16A34A' : '#DC2626';

    const dimensionsHtml = i.box_type ? `
      <h2 style="background:#0A2540;color:#fff;padding:6px;margin-top:20px;">${(t('dimensiones_caja') || 'DIMENSIONES DE LA CAJA').toUpperCase()}</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:6px;border:1px solid #999;width:35%;"><b>${(t('tipo_caja') || 'TIPO DE CAJA').toUpperCase()}</b></td><td style="padding:6px;border:1px solid #999;">${i.box_type}"</td></tr>
        <tr><td style="padding:6px;border:1px solid #999;"><b>${(t('alto') || 'ALTO').toUpperCase()}</b></td><td style="padding:6px;border:1px solid #999;">${i.measures?.alto || '-'}</td></tr>
        <tr><td style="padding:6px;border:1px solid #999;"><b>${(t('ancho') || 'ANCHO').toUpperCase()}</b></td><td style="padding:6px;border:1px solid #999;">${i.measures?.ancho || '-'}</td></tr>
        <tr><td style="padding:6px;border:1px solid #999;"><b>${(t('largo') || 'LARGO').toUpperCase()}</b></td><td style="padding:6px;border:1px solid #999;">${i.measures?.largo || '-'}</td></tr>
        <tr><td style="padding:6px;border:1px solid #999;"><b>${(t('capacidad') || 'CAPACIDAD').toUpperCase()}</b></td><td style="padding:6px;border:1px solid #999;">${i.measures?.capacidad || '-'} m³</td></tr>
      </table>
    ` : '';

    return `
<!DOCTYPE html><html><head><meta charset="utf-8"><title>Inspección NAF</title></head>
<body style="font-family:Arial,sans-serif;color:#09090B;padding:20px;font-size:11px;">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;border-bottom:3px solid #0A2540;padding-bottom:10px;">
    <div style="display:flex;flex-direction:column;">
      <div style="background-color:#0A2540;color:white;padding:8px 15px;display:inline-block;font-weight:900;font-size:28px;letter-spacing:2px;position:relative;">
        NAF
        <div style="position:absolute;right:-40px;top:50%;height:3px;background-color:white;width:40px;"></div>
      </div>
      <div style="color:#0A2540;font-size:12px;font-weight:bold;margin-top:5px;letter-spacing:0.5px;">North America Flooring</div>
    </div>
    <div style="text-align:right;">
      <h1 style="margin:0;font-size:20px;color:#0A2540;">${t('inspeccion').toUpperCase()} ${i.points.length} ${t('puntos').toUpperCase()}</h1>
      <p style="margin:5px 0 0 0;font-size:10px;color:#666;">${t('generado')}: ${new Date().toLocaleString()}</p>
    </div>
  </div>

  <div style="background-color:${headerColor}; color:white; padding:10px; text-align:center; font-weight:bold; font-size:14px; margin-bottom:20px;">
    ${t('estado').toUpperCase()}: ${t(i.status_general === 'bueno' ? 'aprobada' : 'falla').toUpperCase()}
  </div>

  <h2 style="background:#0A2540;color:#fff;padding:6px;margin-top:20px;">${t('datos_generales')}</h2>
  <table style="width:100%;border-collapse:collapse;">
    <tr><td style="padding:6px;border:1px solid #999;width:35%;"><b>${t('compania_transportista_caps')}</b></td><td style="padding:6px;border:1px solid #999;">${i.compania_transportista}</td></tr>
    <tr><td style="padding:6px;border:1px solid #999;"><b>${t('placas_unidad_caps')}</b></td><td style="padding:6px;border:1px solid #999;">${i.placas_unidad}</td></tr>
    <tr><td style="padding:6px;border:1px solid #999;"><b>${t('numero_trailer_caps')}</b></td><td style="padding:6px;border:1px solid #999;">${i.numero_trailer}</td></tr>
    <tr><td style="padding:6px;border:1px solid #999;"><b>${t('numero_precinto_caps')}</b></td><td style="padding:6px;border:1px solid #999;">${i.numero_precinto}</td></tr>
    <tr><td style="padding:6px;border:1px solid #999;"><b>${t('sello_alta_seguridad_caps')}</b></td><td style="padding:6px;border:1px solid #999;">${i.sello_alta_seguridad}</td></tr>
    <tr><td style="padding:6px;border:1px solid #999;"><b>${t('sello_verificado_msg')}</b></td><td style="padding:6px;border:1px solid #999;">${i.sello_verificado ? t('si') : t('no')}</td></tr>
    <tr><td style="padding:6px;border:1px solid #999;"><b>${t('fecha_hora')}</b></td><td style="padding:6px;border:1px solid #999;">${new Date(i.fecha_hora || i.created_at).toLocaleString()}</td></tr>
    <tr><td style="padding:6px;border:1px solid #999;"><b>${t('estado')}</b></td><td style="padding:6px;border:1px solid #999;background:${i.status_general === 'bueno' ? '#dcfce7' : '#fee2e2'};font-weight:bold;">${t(i.status_general === 'bueno' ? 'bueno' : 'malo').toUpperCase()}</td></tr>
  </table>

  ${dimensionsHtml}

  <h2 style="background:#0A2540;color:#fff;padding:6px;margin-top:20px;">${t('inspeccion').toUpperCase()} — ${i.points.length} ${t('puntos')}</h2>
  <table style="width:100%;border-collapse:collapse;">
    <tr style="background:#E4E4E7;font-weight:bold;">
      <td style="padding:6px;border:1px solid #999;width:5%;">#</td>
      <td style="padding:6px;border:1px solid #999;width:35%;">${t('puntos')}</td>
      <td style="padding:6px;border:1px solid #999;width:15%;">${t('estado')}</td>
      <td style="padding:6px;border:1px solid #999;width:45%;">${t('observaciones')}</td>
    </tr>
    ${pointRows}
  </table>

  <h2 style="background:#0A2540;color:#fff;padding:6px;margin-top:20px;">${t('actividad_sospechosa')}</h2>
  <p style="border:1px solid #999;padding:10px;min-height:40px;">${i.actividad_sospechosa || t('sin_reporte') || 'Sin reporte.'}</p>

  <h2 style="background:#0A2540;color:#fff;padding:6px;margin-top:20px;">${t('firmas')}</h2>
  <table style="width:100%;border-collapse:collapse;">
    <tr>
      <td style="padding:10px;border:1px solid #999;width:33%;vertical-align:top;">
        <b>${t('guardia_seguridad') || "GUARDIA DE SEGURIDAD"}:</b><br/>${i.guard_name || '-'}<br/><br/>${guardImg}
      </td>
      <td style="padding:10px;border:1px solid #999;width:33%;vertical-align:top;">
        <b>${t('inspeccion_realizada_por') || "INSPECCIÓN REALIZADA POR"}:</b><br/>${i.inspector_nombre}<br/><br/>${inspectorImg}
      </td>
      <td style="padding:10px;border:1px solid #999;width:34%;vertical-align:top;">
        <b>${t('aprobacion_rechazo_por') || "APROBACIÓN / RECHAZO POR"}:</b><br/>${i.approved_by_name || '-'}<br/><br/>${appSigImg}
      </td>
    </tr>
  </table>
</body></html>`;
  };

  const handleExportPDF = async () => {
    setGenerating(true);
    try {
      const html = buildHtml(insp);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (Platform.OS === 'web') {
        // On web, just open
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri);
        }
      } else {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: t('compartir_inspeccion_naf') });
        }
      }
    } catch (e: any) {
      alert(e.message || 'Error al generar PDF');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']} testID="inspection-detail">
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(app)/supervisor')}
          style={{ padding: 10, marginLeft: -10 }}
          testID="detail-back"
        >
          <Ionicons name="arrow-back" size={28} color={colors.onBrandPrimary} />
        </Pressable>
        <Text style={styles.topTitle}>{isEditing ? t('editar_inspeccion') : t('inspeccion')}</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {canEdit && !isEditing && (
            <Pressable onPress={() => setIsEditing(true)}>
              <Ionicons name="create-outline" size={24} color="#FFF" />
            </Pressable>
          )}
          {isEditing ? (
            <Pressable onPress={handleSaveEdit} disabled={acting}>
              {acting ? <ActivityIndicator size={20} color="#FFF" /> : <Ionicons name="save" size={24} color="#FFF" />}
            </Pressable>
          ) : (
            <Pressable onPress={handleExportPDF} disabled={generating}>
              {generating ? <ActivityIndicator size={20} color="#FFF" /> : <Ionicons name="download" size={24} color="#FFF" />}
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.statusBanner, { backgroundColor: insp.status_general === 'bueno' ? colors.success : colors.error }]}>
          <Ionicons name={insp.status_general === 'bueno' ? 'checkmark-circle' : 'warning'} size={28} color="#FFF" />
          <View style={{ marginLeft: spacing.md, flex: 1 }}>
            <Text style={styles.statusTitle}>{insp.status_general === 'bueno' ? t('inspeccion_aprobada').toUpperCase() : t('inspeccion_con_fallas').toUpperCase()}</Text>
            <Text style={styles.statusSub}>{insp.points.filter((p) => p.estado === 'malo').length} {t('punto').toLowerCase()}(s) {t('con_falla').toLowerCase()}</Text>
          </View>
          {insp.approval_status && insp.approval_status !== 'pendiente' && (
            <View style={[styles.approvBadge, { backgroundColor: insp.approval_status === 'aprobada' ? colors.success : colors.error, borderColor: '#FFF' }]}>
              <Text style={styles.approvBadgeText}>{t(insp.approval_status).toUpperCase()}</Text>
            </View>
          )}
        </View>

        {insp.approval_status && insp.approval_status !== 'pendiente' && (
          <View style={styles.approvalInfo} testID="approval-info">
            <Text style={styles.approvalLabel}>
              {insp.approval_status === 'aprobada' ? t('aprobada_por').toUpperCase() : t('rechazada_por').toUpperCase()}
            </Text>
            <Text style={styles.approvalValue}>{insp.approved_by_name}</Text>
            {insp.approved_at ? <Text style={styles.approvalDate}>{new Date(insp.approved_at).toLocaleString()}</Text> : null}
            {insp.approval_note ? (
              <>
                <Text style={[styles.approvalLabel, { marginTop: spacing.sm }]}>{t('nota').toUpperCase()}</Text>
                <Text style={styles.approvalValue}>{insp.approval_note}</Text>
              </>
            ) : null}
          </View>
        )}

        {(isSupervisor || isAdmin) && (insp.approval_status || 'pendiente') === 'pendiente' && (
          <View style={styles.approvalActionBox} testID="approval-action-box">
            <Text style={styles.sectionTitleLocal}>{t('accion_supervisor').toUpperCase()}</Text>

            <Text style={styles.approvalLabel}>{t('nombre_supervisor_caps')}</Text>
            <TextInput
              style={[styles.noteInput, { minHeight: 48, marginBottom: spacing.md }]}
              value={approvalName}
              onChangeText={(v) => setApprovalName(v.toUpperCase())}
              placeholder={t('nombre_supervisor_placeholder')}
            />

            <Text style={styles.approvalLabel}>{t('nota').toUpperCase()}</Text>
            <TextInput
              testID="approval-note-input"
              style={styles.noteInput}
              placeholder={t('nota_placeholder_rechazo')}
              placeholderTextColor={colors.muted}
              value={approvalNote}
              onChangeText={(v) => setApprovalNote(v.toUpperCase())}
              multiline
            />

            <Pressable testID="approval-firma-btn" style={styles.signatureBox} onPress={() => {
              setSigModalConfig({
                title: t('firma_supervisor'),
                onSave: (sig) => setApprovalSignature(sig)
              });
              setShowSigModal(true);
            }}>
              {approvalSignature ? (
                <Text style={styles.signatureDone}>{t('firma_capturada_msg')}</Text>
              ) : (
                <Text style={styles.signatureCta}>{t('toca_para_firmar_aprobacion')}</Text>
              )}
            </Pressable>

            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <Pressable testID="approval-approve-btn" style={[styles.actionBtn, { backgroundColor: colors.success }]} onPress={handleApprove} disabled={acting}>
                {acting ? <ActivityIndicator color="#FFF" /> : <><Ionicons name="checkmark-circle" size={20} color="#FFF" /><Text style={styles.actionBtnText}>{t('aprobar').toUpperCase()}</Text></>}
              </Pressable>
              <Pressable testID="approval-reject-btn" style={[styles.actionBtn, { backgroundColor: colors.error }]} onPress={handleReject} disabled={acting}>
                {acting ? <ActivityIndicator color="#FFF" /> : <><Ionicons name="close-circle" size={20} color="#FFF" /><Text style={styles.actionBtnText}>{t('rechazar').toUpperCase()}</Text></>}
              </Pressable>
            </View>
          </View>
        )}

        <Section title={t('datos_generales').toUpperCase()}>
          {isAdmin && isEditing && (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>{t('tipo_inspeccion') || 'Tipo Inspección'}</Text>
              <Pressable
                style={{ flex: 1, backgroundColor: colors.brandTertiary, padding: 8, borderRadius: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: colors.brandPrimary }}
                onPress={() => {
                  const currentType = editData.inspection_type || insp.inspection_type;
                  const nextType = currentType === '9_puntos_contenedor' ? '19_puntos' : '9_puntos_contenedor';
                  const nextPoints = getInspectionPoints(nextType).map(p => ({ ...p, estado: 'bueno', comentarios: '', photo: '' }));
                  setEditData({ ...editData, inspection_type: nextType, points: nextPoints });
                }}
              >
                <Text style={{ color: colors.brandPrimary, fontWeight: '900', fontSize: 13 }}>
                  {(editData.inspection_type || insp.inspection_type) === '9_puntos_contenedor' ? t('inspeccion_9_puntos').toUpperCase() : t('inspeccion_19_puntos').toUpperCase()}
                </Text>
                <Ionicons name="swap-horizontal" size={18} color={colors.brandPrimary} />
              </Pressable>
            </View>
          )}
          <Row label={t('compania')} value={insp.compania_transportista || ''} isEdit={isEditing} onEdit={(v) => setEditData({...editData, compania_transportista: v})} />
          <Row label={t('placas')} value={insp.placas_unidad} isEdit={isEditing} onEdit={(v) => setEditData({...editData, placas_unidad: sanitizePlate(v)})} />
          <Row label={t('trailer')} value={insp.numero_trailer} isEdit={isEditing} onEdit={(v) => setEditData({...editData, numero_trailer: v})} />
          <Row label={t('precinto')} value={insp.numero_precinto || ''} isEdit={isEditing} onEdit={(v) => setEditData({...editData, numero_precinto: v})} />
          <Row label={t('sello_alta_seguridad_label') || "Sello Alta Seg."} value={insp.sello_alta_seguridad || ''} isEdit={isEditing} onEdit={(v) => setEditData({...editData, sello_alta_seguridad: v})} />
          <Row label={t('sello_verificado_label') || "Sello Verificado"} value={insp.sello_verificado ? t('si') : t('no')} />
          <Row label={t('fecha_hora')} value={new Date(insp.fecha_hora || insp.created_at).toLocaleString()} />
        </Section>

        {insp.box_type ? (
          <Section title={t('dimensiones_caja') || 'DIMENSIONES DE LA CAJA'}>
            <Row label={t('tipo_caja') || "Tipo de Caja"} value={`${insp.box_type}"`} />
            <Row label={t('alto') || "Alto"} value={insp.measures?.alto || '-'} />
            <Row label={t('ancho') || "Ancho"} value={insp.measures?.ancho || '-'} />
            <Row label={t('largo') || "Largo"} value={insp.measures?.largo || '-'} />
            <Row label={t('capacidad') || "Capacidad"} value={`${insp.measures?.capacidad || '-'} m³`} />
          </Section>
        ) : null}

        <Section title={t('puntos_inspeccion')}>
          {(isEditing ? editData.points : insp.points)?.map((p, idx) => (
            <View key={p.number} style={styles.pointRow} testID={`detail-point-${p.number}`}>
              <Text style={styles.pointNum}>{p.number}.</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.pointName}>{p.name}</Text>
                {p.comentarios ? <Text style={styles.pointComment}>{p.comentarios}</Text> : null}

                {isEditing && p.estado === 'malo' && !p.photo && (
                  <Text style={{ color: colors.error, fontSize: 10, fontWeight: '900', marginTop: 4 }}>
                    {t('foto_obligatoria_falla')}
                  </Text>
                )}

                <View style={{ marginTop: 8 }}>
                  {p.photo ? (
                    <View>
                      <Image source={{ uri: p.photo }} style={styles.pointPhoto} testID={`detail-point-${p.number}-photo`} />
                      {isEditing && (
                        <Pressable onPress={() => removePointPhoto(idx)} style={{ position: 'absolute', top: 5, right: 5, backgroundColor: '#FFF', borderRadius: 12 }}>
                          <Ionicons name="close-circle" size={24} color={colors.error} />
                        </Pressable>
                      )}
                    </View>
                  ) : (isEditing && p.estado === 'malo') ? (
                    <Pressable
                      onPress={() => pickPointPhoto(idx)}
                      style={[styles.pointPhoto, { borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }]}
                    >
                      <Ionicons name="camera" size={32} color={colors.brandPrimary} />
                      <Text style={{ fontSize: 10, color: colors.brandPrimary, fontWeight: '900', marginTop: 4 }}>{t('agregar_foto')}</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
              <View style={[styles.pointChip, { backgroundColor: p.estado === 'bueno' ? colors.success : p.estado === 'malo' ? colors.error : colors.muted }]}>
                <Text style={styles.pointChipText}>{(p.estado === 'bueno' ? t('bueno') : p.estado === 'malo' ? t('malo') : 'NA').toUpperCase()}</Text>
              </View>
            </View>
          ))}
        </Section>

        <Section title={t('actividad_sospechosa').toUpperCase()}>
          {isEditing ? (
            <TextInput
              style={[styles.noteInput, { minHeight: 100 }]}
              multiline
              value={editData.actividad_sospechosa || insp.actividad_sospechosa}
              onChangeText={(v) => setEditData({ ...editData, actividad_sospechosa: v.toUpperCase() })}
            />
          ) : (
            <Text style={styles.bodyText}>{insp.actividad_sospechosa || t('sin_reporte')}</Text>
          )}
        </Section>

        <Section title={t('firmas').toUpperCase()}>
          {insp.guard_name ? (
            <View style={{ marginBottom: 20 }}>
              <Text style={styles.label}>{t('guardia_seguridad') || "GUARDIA DE SEGURIDAD"}</Text>
              <Text style={styles.value}>{insp.guard_name}</Text>
              <View style={styles.firmaWrap}>
                {insp.guard_signature ? (
                  <Image
                    source={{ uri: insp.guard_signature }}
                    style={{ width: '100%', height: 100, resizeMode: 'contain', backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border }}
                  />
                ) : (
                  <View style={[styles.firmaWrap, { borderStyle: 'dashed', borderWidth: 1, height: 100, justifyContent: 'center', alignItems: 'center' }]}>
                    <Text style={{ color: colors.muted }}>{t('sin_firma')}</Text>
                  </View>
                )}
                <Text style={[styles.firmaLabel, { marginTop: 4, color: colors.muted }]}>{(t('firma_guardia') || "FIRMA DEL GUARDIA").toUpperCase()}</Text>
              </View>
            </View>
          ) : null}

          <Text style={styles.label}>{t('inspector').toUpperCase()}</Text>
          {isEditing ? (
            <TextInput
              style={[styles.value, { borderBottomWidth: 1, borderBottomColor: colors.border }]}
              value={editData.inspector_nombre || insp.inspector_nombre}
              onChangeText={(v) => setEditData({ ...editData, inspector_nombre: v.toUpperCase() })}
            />
          ) : (
            <Text style={styles.value}>{insp.inspector_nombre}</Text>
          )}

          <View style={styles.firmaWrap}>
            { (isEditing ? (editData.inspector_firma || insp.inspector_firma) : insp.inspector_firma) ? (
              <>
                <Image
                  source={{ uri: isEditing ? (editData.inspector_firma || insp.inspector_firma) : insp.inspector_firma }}
                  style={{ width: '100%', height: 100, resizeMode: 'contain', backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border }}
                />
                {isEditing && (
                  <Pressable style={styles.removeBtnSig} onPress={() => setEditData({ ...editData, inspector_firma: '' })}>
                    <Ionicons name="trash" size={20} color={colors.error} />
                  </Pressable>
                )}
              </>
            ) : (
              <View style={[styles.firmaWrap, { borderStyle: 'dashed', borderWidth: 1, height: 100, justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ color: colors.muted }}>{t('sin_firma')}</Text>
              </View>
            )}

            {isEditing && (
              <Pressable
                style={[styles.actionBtn, { backgroundColor: colors.brandPrimary, marginTop: 8 }]}
                onPress={() => {
                  setSigModalConfig({
                    title: t('editar_firma_inspector'),
                    onSave: (sig) => setEditData({ ...editData, inspector_firma: sig })
                  });
                  setShowSigModal(true);
                }}
              >
                <Ionicons name="brush" size={20} color="#FFF" />
                <Text style={styles.actionBtnText}>{t('cambiar_firma_inspector')}</Text>
              </Pressable>
            )}
            <Text style={[styles.firmaLabel, { marginTop: 4 }]}>{t('firma_inspector').toUpperCase()}</Text>
          </View>

          {(insp.approved_by_signature || isEditing) ? (
            <>
              <Text style={[styles.label, { marginTop: spacing.md }]}>{t('aprobacion_rechazo_por') || "APROBACIÓN / RECHAZO POR"}</Text>
              {isEditing ? (
                <TextInput
                  style={[styles.value, { borderBottomWidth: 1, borderBottomColor: colors.border }]}
                  value={editData.approved_by_name || insp.approved_by_name}
                  onChangeText={(v) => setEditData({ ...editData, approved_by_name: v.toUpperCase() })}
                />
              ) : (
                <Text style={styles.value}>{insp.approved_by_name || '-'}</Text>
              )}

              <View style={styles.firmaWrap}>
                { (isEditing ? (editData.approved_by_signature || insp.approved_by_signature) : insp.approved_by_signature) ? (
                  <>
                    <Image
                      source={{ uri: isEditing ? (editData.approved_by_signature || insp.approved_by_signature) : insp.approved_by_signature }}
                      style={{ width: '100%', height: 100, resizeMode: 'contain', backgroundColor: '#fff', borderColor: (isEditing ? (editData.approval_status || insp.approval_status) : insp.approval_status) === 'aprobada' ? colors.success : colors.error, borderWidth: 1 }}
                    />
                    {isEditing && (
                      <Pressable style={styles.removeBtnSig} onPress={() => setEditData({ ...editData, approved_by_signature: '' })}>
                        <Ionicons name="trash" size={20} color={colors.error} />
                      </Pressable>
                    )}
                  </>
                ) : (
                  <View style={[styles.firmaWrap, { borderStyle: 'dashed', borderWidth: 1, height: 100, justifyContent: 'center', alignItems: 'center' }]}>
                    <Text style={{ color: colors.muted }}>{t('sin_firma')}</Text>
                  </View>
                )}

                {isEditing && (
                  <Pressable
                    style={[styles.actionBtn, { backgroundColor: colors.brandPrimary, marginTop: 8 }]}
                    onPress={() => {
                      setSigModalConfig({
                        title: t('editar_firma_supervisor'),
                        onSave: (sig) => setEditData({ ...editData, approved_by_signature: sig })
                      });
                      setShowSigModal(true);
                    }}
                  >
                    <Ionicons name="brush" size={20} color="#FFF" />
                    <Text style={styles.actionBtnText}>{t('cambiar_firma_supervisor')}</Text>
                  </Pressable>
                )}
                <Text style={[styles.firmaLabel, { color: (isEditing ? (editData.approval_status || insp.approval_status) : insp.approval_status) === 'aprobada' ? colors.success : colors.error, marginTop: 4 }]}>{t('firma_autorizacion_caps')}</Text>
              </View>
            </>
          ) : null}
        </Section>

        <Pressable
          testID="detail-export-pdf"
          style={[styles.exportBtn, generating && { opacity: 0.6 }]}
          onPress={handleExportPDF}
          disabled={generating}
        >
          {generating ? (
            <ActivityIndicator color={colors.onBrandSecondary} />
          ) : (
            <>
              <Ionicons name="document-text" size={24} color={colors.onBrandSecondary} />
              <Text style={styles.exportText}>{t('exportar_compartir_pdf')}</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
      {showSigModal && (
        <SignatureModal
          onClose={() => setShowSigModal(false)}
          onSave={(sig) => { sigModalConfig.onSave(sig); setShowSigModal(false); }}
          title={sigModalConfig.title}
          t={t}
        />
      )}
    </SafeAreaView>
  );
}

function SignatureModal({ onClose, onSave, title, t }: { onClose: () => void; onSave: (sig: string) => void; title: string, t: any }) {
  const sigRef = React.useRef<any>(null);
  const handleOK = (signature: string) => onSave(signature);
  const style = `.m-signature-pad--footer {display: none; margin: 0px;}
                 .m-signature-pad {box-shadow: none; border: 2px solid #09090B;}
                 body,html { background-color: #FFF; height: 100%; }`;
  return (
    <View style={styles.modalOverlay} testID="signature-modal">
      <View style={styles.modalCard}>
        <Text style={styles.modalTitle}>{title}</Text>
        <View style={styles.signatureCanvas}>
          <Signature
            ref={sigRef}
            onOK={handleOK}
            descriptionText={t('firme_dentro_desc')}
            clearText={t('borrar')}
            confirmText={t('guardar')}
            webStyle={style}
            autoClear={false}
            imageType="image/png"
          />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
          <Pressable style={[styles.secondaryBtn, { flex: 1 }]} onPress={onClose} testID="signature-cancel">
            <Text style={styles.secondaryBtnText}>{t('cancelar_caps')}</Text>
          </Pressable>
          <Pressable
            style={[styles.primaryBtn, { flex: 1 }]}
            onPress={() => sigRef.current?.readSignature()}
            testID="signature-save"
          >
            <Text style={styles.primaryBtnText}>{t('guardar_firma_caps')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Row({ label, value, isEdit, onEdit }: { label: string; value: string; isEdit?: boolean; onEdit?: (v: string) => void }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {isEdit && onEdit ? (
        <TextInput
          autoCapitalize="characters"
          style={[styles.rowValue, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 4 }]}
          value={value}
          onChangeText={(text) => onEdit(text.toUpperCase())}
        />
      ) : (
        <Text style={styles.rowValue}>{value}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: {
    backgroundColor: colors.brandPrimary, padding: spacing.md, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
  },
  topTitle: { color: colors.onBrandPrimary, fontWeight: '900', fontSize: typography.sizes.lg, letterSpacing: 1 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  statusBanner: { padding: spacing.lg, flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  statusTitle: { color: '#FFF', fontWeight: '900', fontSize: typography.sizes.base, letterSpacing: 1 },
  statusSub: { color: '#FFF', fontSize: typography.sizes.sm, opacity: 0.9, marginTop: 2 },
  section: { marginBottom: spacing.lg },
  sectionTitle: {
    backgroundColor: colors.brandPrimary, color: colors.onBrandPrimary,
    padding: spacing.sm, fontWeight: '900', letterSpacing: 1, fontSize: 12,
  },
  sectionBody: { backgroundColor: colors.surfaceSecondary, borderWidth: 2, borderColor: colors.borderStrong, borderTopWidth: 0 },
  row: { flexDirection: 'row', padding: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowLabel: { width: 120, fontWeight: '700', color: colors.onSurfaceTertiary, fontSize: typography.sizes.sm },
  rowValue: { flex: 1, color: colors.onSurface, fontSize: typography.sizes.sm, fontWeight: '700' },
  pointRow: { flexDirection: 'row', padding: spacing.sm, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.divider },
  pointNum: { width: 28, fontWeight: '900', color: colors.muted },
  pointName: { color: colors.onSurface, fontWeight: '700', fontSize: typography.sizes.sm },
  pointComment: { color: colors.error, fontSize: typography.sizes.sm, marginTop: 4 },
  modalOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(9,9,11,0.85)', justifyContent: 'center', padding: spacing.lg, zIndex: 100,
  },
  rowInspector: { color: colors.onSurfaceTertiary, fontSize: typography.sizes.sm, marginTop: 4 },

  pointPhoto: { width: '100%', height: 180, marginTop: 8, borderWidth: 2, borderColor: colors.error, resizeMode: 'cover' },
  pointChip: { paddingHorizontal: spacing.sm, paddingVertical: 4, marginLeft: spacing.sm },
  pointChipText: { color: '#FFF', fontWeight: '900', fontSize: 10, letterSpacing: 1 },
  bodyText: { padding: spacing.md, color: colors.onSurface },
  label: { fontSize: 11, fontWeight: '900', color: colors.muted, letterSpacing: 1, paddingHorizontal: spacing.md, paddingTop: spacing.md },
  value: { padding: spacing.md, color: colors.onSurface, fontWeight: '700', fontSize: typography.sizes.lg, paddingTop: 4 },
  firmaWrap: { padding: spacing.md, paddingTop: 0 },
  firmaImagePlaceholder: { borderWidth: 2, borderColor: colors.success, padding: spacing.md, alignItems: 'center' },
  firmaLabel: { color: colors.success, fontWeight: '900', letterSpacing: 1, fontSize: 11 },
  exportBtn: {
    backgroundColor: colors.brandSecondary, padding: spacing.lg, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.lg, minHeight: 64,
  },
  exportText: { color: colors.onBrandSecondary, fontWeight: '900', letterSpacing: 1, fontSize: typography.sizes.base },
  approvBadge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderWidth: 2 },
  approvBadgeText: { color: '#FFF', fontWeight: '900', fontSize: 10, letterSpacing: 1 },
  approvalInfo: { borderWidth: 2, borderColor: colors.borderStrong, padding: spacing.md, backgroundColor: colors.surfaceSecondary, marginBottom: spacing.lg },
  approvalLabel: { fontSize: 10, fontWeight: '900', color: colors.muted, letterSpacing: 1 },
  approvalValue: { fontWeight: '700', color: colors.onSurface, marginTop: 4 },
  approvalDate: { color: colors.muted, fontSize: typography.sizes.sm, marginTop: 2 },
  approvalActionBox: { borderWidth: 2, borderColor: colors.brandPrimary, padding: spacing.md, backgroundColor: colors.brandTertiary, marginBottom: spacing.lg },
  sectionTitleLocal: { fontWeight: '900', color: colors.onBrandTertiary, letterSpacing: 1, marginBottom: spacing.sm },
  noteInput: {
    borderWidth: 2, borderColor: colors.borderStrong, padding: spacing.sm, backgroundColor: colors.surfaceSecondary,
    minHeight: 70, textAlignVertical: 'top', color: colors.onSurface,
  },
  actionBtn: { flex: 1, padding: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 52 },
  actionBtnText: { color: '#FFF', fontWeight: '900', letterSpacing: 1 },
  removeBtnSig: { position: 'absolute', top: 5, right: 5, padding: 5, backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 15 },
  signatureBox: {
    borderWidth: 2, borderColor: colors.borderStrong, padding: spacing.lg,
    backgroundColor: colors.surfaceSecondary, alignItems: 'center', marginTop: spacing.sm, minHeight: 72, justifyContent: 'center',
  },
  signatureCta: { color: colors.muted, fontWeight: '700', letterSpacing: 1 },
  signatureDone: { color: colors.success, fontWeight: '900', letterSpacing: 1 },
  modalCard: { backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderWidth: 2, borderColor: colors.borderStrong },
  modalTitle: { fontWeight: '900', fontSize: typography.sizes.lg, color: colors.onSurface, marginBottom: spacing.md, letterSpacing: 1 },
  signatureCanvas: { height: 280 },
  primaryBtn: { flex: 1, backgroundColor: colors.brandPrimary, padding: spacing.md, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  primaryBtnText: { color: colors.onBrandPrimary, fontWeight: '900', letterSpacing: 1 },
  secondaryBtn: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.borderStrong, padding: spacing.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  secondaryBtnText: { color: colors.onSurface, fontWeight: '900', letterSpacing: 1 },
});

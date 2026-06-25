import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator, Platform, TextInput, Image } from 'react-native';
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

export default function InspectionDetail() {
  const { id, edit } = useLocalSearchParams<{ id: string, edit?: string }>();
  const router = useRouter();
  const { getById, approveInspection, rejectInspection, updateInspection } = useInspections();
  const { user } = useAuth();
  const [insp, setInsp] = useState<Inspection | undefined>(undefined);
  const [generating, setGenerating] = useState(false);
  const [isEditing, setIsEditing] = useState(edit === 'true');
  const [editData, setEditData] = useState<Partial<Inspection>>({});
  const [approvalNote, setApprovalNote] = useState('');
  const [approvalName, setApprovalName] = useState(user?.name || '');
  const [approvalSignature, setApprovalSignature] = useState('');
  const [showSigModal, setShowSigModal] = useState(false);
  const [acting, setActing] = useState(false);
  const isSupervisor = user?.role === 'supervisor';
  const isAdmin = user?.role === 'admin' || user?.email?.toLowerCase().includes('d.trujillo') || user?.email?.toLowerCase().includes('d4r005');

  useEffect(() => {
    if (id) {
      const data = getById(id);
      setInsp(data);
      if (data) setEditData(data);
    }
  }, [id, getById]);

  const handleSaveEdit = async () => {
    if (!id) return;
    setActing(true);
    try {
      await updateInspection(id, editData);
      setInsp(getById(id));
      setIsEditing(false);
      alert('Cambios guardados correctamente');
    } catch (e: any) { alert(e.message); }
    finally { setActing(false); }
  };

  const pickPointPhoto = async (idx: number) => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { alert('Se necesita acceso a la cámara'); return; }
      const r = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.5, base64: true });
      if (!r.canceled && r.assets[0]?.base64) {
        const newPoints = [...(editData.points || insp?.points || [])];
        newPoints[idx] = { ...newPoints[idx], photo: `data:image/jpeg;base64,${r.assets[0].base64}` };
        setEditData({ ...editData, points: newPoints });
      }
    } catch (e: any) { alert(e.message || 'Error al obtener foto'); }
  };

  const removePointPhoto = (idx: number) => {
    const newPoints = [...(editData.points || insp?.points || [])];
    newPoints[idx] = { ...newPoints[idx], photo: '' };
    setEditData({ ...editData, points: newPoints });
  };

  const handleApprove = async () => {
    if (!id) return;
    if (!approvalSignature) {
      alert('La firma del supervisor es obligatoria');
      return;
    }
    setActing(true);
    try {
      await approveInspection(id, approvalNote.trim(), approvalName.trim(), approvalSignature);
      setInsp(getById(id));
      setApprovalNote('');
      setApprovalSignature('');
    } catch (e: any) { alert(e.message); }
    finally { setActing(false); }
  };

  const handleReject = async () => {
    if (!id) return;
    if (!approvalNote.trim()) {
      alert('Por favor agrega una nota explicando el rechazo');
      return;
    }
    if (!approvalSignature) {
      alert('La firma del supervisor es obligatoria');
      return;
    }
    setActing(true);
    try {
      await rejectInspection(id, approvalNote.trim(), approvalName.trim(), approvalSignature);
      setInsp(getById(id));
      setApprovalNote('');
      setApprovalSignature('');
    } catch (e: any) { alert(e.message); }
    finally { setActing(false); }
  };

  if (!insp) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.brandPrimary} />
          <Text style={{ marginTop: spacing.md, color: colors.muted }}>Cargando inspección...</Text>
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
    const appSigImg = i.approved_by_signature ? `<img src="${i.approved_by_signature}" style="height:80px;border:1px solid #999;background:#fff;" />` : '<div style="height:80px;border:1px dashed #999;"></div>';

    const headerColor = i.status_general === 'bueno' ? '#16A34A' : '#DC2626';

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
      <h1 style="margin:0;font-size:20px;color:#0A2540;">INSPECCIÓN ${i.points.length} PUNTOS</h1>
      <p style="margin:5px 0 0 0;font-size:10px;color:#666;">Generado: ${new Date().toLocaleString('es-MX')}</p>
    </div>
  </div>

  <div style="background-color:${headerColor}; color:white; padding:10px; text-align:center; font-weight:bold; font-size:14px; margin-bottom:20px;">
    ESTADO DE INSPECCIÓN: ${i.status_general.toUpperCase()}
  </div>

  <h2 style="background:#0A2540;color:#fff;padding:6px;margin-top:20px;">Datos Generales</h2>
  <table style="width:100%;border-collapse:collapse;">
    <tr><td style="padding:6px;border:1px solid #999;width:35%;"><b>Compañía Transportista</b></td><td style="padding:6px;border:1px solid #999;">${i.compania_transportista}</td></tr>
    <tr><td style="padding:6px;border:1px solid #999;"><b>Placas de la Unidad</b></td><td style="padding:6px;border:1px solid #999;">${i.placas_unidad}</td></tr>
    <tr><td style="padding:6px;border:1px solid #999;"><b>Número Tráiler/Contenedor</b></td><td style="padding:6px;border:1px solid #999;">${i.numero_trailer}</td></tr>
    <tr><td style="padding:6px;border:1px solid #999;"><b>Número de Precinto</b></td><td style="padding:6px;border:1px solid #999;">${i.numero_precinto}</td></tr>
    <tr><td style="padding:6px;border:1px solid #999;"><b>Sello de Alta Seguridad</b></td><td style="padding:6px;border:1px solid #999;">${i.sello_alta_seguridad}</td></tr>
    <tr><td style="padding:6px;border:1px solid #999;"><b>Sello Verificado</b></td><td style="padding:6px;border:1px solid #999;">${i.sello_verificado ? 'SÍ' : 'NO'}</td></tr>
    <tr><td style="padding:6px;border:1px solid #999;"><b>Fecha y Hora</b></td><td style="padding:6px;border:1px solid #999;">${new Date(i.fecha_hora).toLocaleString('es-MX')}</td></tr>
    <tr><td style="padding:6px;border:1px solid #999;"><b>Estado General</b></td><td style="padding:6px;border:1px solid #999;background:${i.status_general === 'bueno' ? '#dcfce7' : '#fee2e2'};font-weight:bold;">${i.status_general.toUpperCase()}</td></tr>
  </table>

  <h2 style="background:#0A2540;color:#fff;padding:6px;margin-top:20px;">Examen de Inspección — 19 Puntos</h2>
  <table style="width:100%;border-collapse:collapse;">
    <tr style="background:#E4E4E7;font-weight:bold;">
      <td style="padding:6px;border:1px solid #999;width:5%;">#</td>
      <td style="padding:6px;border:1px solid #999;width:35%;">Punto</td>
      <td style="padding:6px;border:1px solid #999;width:15%;">Estado</td>
      <td style="padding:6px;border:1px solid #999;width:45%;">Comentarios</td>
    </tr>
    ${pointRows}
  </table>

  <h2 style="background:#0A2540;color:#fff;padding:6px;margin-top:20px;">Actividad Sospechosa</h2>
  <p style="border:1px solid #999;padding:10px;min-height:40px;">${i.actividad_sospechosa || 'Sin reporte de actividad sospechosa.'}</p>

  <h2 style="background:#0A2540;color:#fff;padding:6px;margin-top:20px;">Firmas</h2>
  <table style="width:100%;border-collapse:collapse;">
    <tr>
      <td style="padding:10px;border:1px solid #999;width:50%;vertical-align:top;">
        <b>INSPECCIÓN REALIZADA POR:</b><br/>${i.inspector_nombre}<br/><br/>${inspectorImg}
      </td>
      <td style="padding:10px;border:1px solid #999;width:50%;vertical-align:top;">
        <b>APROBACIÓN / RECHAZO POR:</b><br/>${i.approved_by_name || '-'}<br/><br/>${appSigImg}
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
          await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Compartir Inspección NAF' });
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
        <Pressable onPress={() => router.back()} testID="detail-back">
          <Ionicons name="arrow-back" size={24} color={colors.onBrandPrimary} />
        </Pressable>
        <Text style={styles.topTitle}>{isEditing ? 'Editar Inspección' : 'Inspección'}</Text>
        {isEditing ? (
          <Pressable onPress={handleSaveEdit} disabled={acting}>
            {acting ? <ActivityIndicator size={20} color="#FFF" /> : <Ionicons name="save" size={24} color="#FFF" />}
          </Pressable>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.statusBanner, { backgroundColor: insp.status_general === 'bueno' ? colors.success : colors.error }]}>
          <Ionicons name={insp.status_general === 'bueno' ? 'checkmark-circle' : 'warning'} size={28} color="#FFF" />
          <View style={{ marginLeft: spacing.md, flex: 1 }}>
            <Text style={styles.statusTitle}>{insp.status_general === 'bueno' ? 'INSPECCIÓN APROBADA' : 'INSPECCIÓN CON FALLAS'}</Text>
            <Text style={styles.statusSub}>{insp.points.filter((p) => p.estado === 'malo').length} punto(s) con falla</Text>
          </View>
          {insp.approval_status && insp.approval_status !== 'pendiente' && (
            <View style={[styles.approvBadge, { backgroundColor: insp.approval_status === 'aprobada' ? colors.success : colors.error, borderColor: '#FFF' }]}>
              <Text style={styles.approvBadgeText}>{insp.approval_status.toUpperCase()}</Text>
            </View>
          )}
        </View>

        {insp.approval_status && insp.approval_status !== 'pendiente' && (
          <View style={styles.approvalInfo} testID="approval-info">
            <Text style={styles.approvalLabel}>
              {insp.approval_status === 'aprobada' ? 'APROBADA POR' : 'RECHAZADA POR'}
            </Text>
            <Text style={styles.approvalValue}>{insp.approved_by_name}</Text>
            {insp.approved_at ? <Text style={styles.approvalDate}>{new Date(insp.approved_at).toLocaleString('es-MX')}</Text> : null}
            {insp.approval_note ? (
              <>
                <Text style={[styles.approvalLabel, { marginTop: spacing.sm }]}>NOTA</Text>
                <Text style={styles.approvalValue}>{insp.approval_note}</Text>
              </>
            ) : null}
          </View>
        )}

        {(isSupervisor || isAdmin) && (insp.approval_status || 'pendiente') === 'pendiente' && (
          <View style={styles.approvalActionBox} testID="approval-action-box">
            <Text style={styles.sectionTitleLocal}>ACCIÓN DE SUPERVISOR</Text>

            <Text style={styles.approvalLabel}>NOMBRE DEL SUPERVISOR</Text>
            <TextInput
              style={[styles.noteInput, { minHeight: 48, marginBottom: spacing.md }]}
              value={approvalName}
              onChangeText={setApprovalName}
              placeholder="Nombre del supervisor"
            />

            <Text style={styles.approvalLabel}>NOTA</Text>
            <TextInput
              testID="approval-note-input"
              style={styles.noteInput}
              placeholder="Nota (obligatoria para rechazar)"
              placeholderTextColor={colors.muted}
              value={approvalNote}
              onChangeText={setApprovalNote}
              multiline
            />

            <Pressable testID="approval-firma-btn" style={styles.signatureBox} onPress={() => setShowSigModal(true)}>
              {approvalSignature ? (
                <Text style={styles.signatureDone}>FIRMA CAPTURADA ✓ (Tocar para volver a firmar)</Text>
              ) : (
                <Text style={styles.signatureCta}>Toca para firmar aprobación/rechazo</Text>
              )}
            </Pressable>

            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <Pressable testID="approval-approve-btn" style={[styles.actionBtn, { backgroundColor: colors.success }]} onPress={handleApprove} disabled={acting}>
                {acting ? <ActivityIndicator color="#FFF" /> : <><Ionicons name="checkmark-circle" size={20} color="#FFF" /><Text style={styles.actionBtnText}>APROBAR</Text></>}
              </Pressable>
              <Pressable testID="approval-reject-btn" style={[styles.actionBtn, { backgroundColor: colors.error }]} onPress={handleReject} disabled={acting}>
                {acting ? <ActivityIndicator color="#FFF" /> : <><Ionicons name="close-circle" size={20} color="#FFF" /><Text style={styles.actionBtnText}>RECHAZAR</Text></>}
              </Pressable>
            </View>
          </View>
        )}

        <Section title="DATOS GENERALES">
          <Row label="Compañía" value={insp.compania_transportista} isEdit={isEditing} onEdit={(v) => setEditData({...editData, compania_transportista: v})} />
          <Row label="Placas" value={insp.placas_unidad} isEdit={isEditing} onEdit={(v) => setEditData({...editData, placas_unidad: v})} />
          <Row label="Tráiler" value={insp.numero_trailer} isEdit={isEditing} onEdit={(v) => setEditData({...editData, numero_trailer: v})} />
          <Row label="Precinto" value={insp.numero_precinto} isEdit={isEditing} onEdit={(v) => setEditData({...editData, numero_precinto: v})} />
          <Row label="Sello Alta Seg." value={insp.sello_alta_seguridad} isEdit={isEditing} onEdit={(v) => setEditData({...editData, sello_alta_seguridad: v})} />
          <Row label="Sello Verificado" value={insp.sello_verificado ? 'SÍ' : 'NO'} />
          <Row label="Fecha y Hora" value={new Date(insp.fecha_hora).toLocaleString('es-MX')} />
        </Section>

        <Section title="PUNTOS DE INSPECCIÓN">
          {(isEditing ? editData.points : insp.points)?.map((p, idx) => (
            <View key={p.number} style={styles.pointRow} testID={`detail-point-${p.number}`}>
              <Text style={styles.pointNum}>{p.number}.</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.pointName}>{p.name}</Text>
                {p.comentarios ? <Text style={styles.pointComment}>{p.comentarios}</Text> : null}

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
                  ) : isEditing ? (
                    <Pressable
                      onPress={() => pickPointPhoto(idx)}
                      style={[styles.pointPhoto, { borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }]}
                    >
                      <Ionicons name="camera" size={32} color={colors.brandPrimary} />
                      <Text style={{ fontSize: 10, color: colors.brandPrimary, fontWeight: '900', marginTop: 4 }}>AGREGAR FOTO</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
              <View style={[styles.pointChip, { backgroundColor: p.estado === 'bueno' ? colors.success : p.estado === 'malo' ? colors.error : colors.muted }]}>
                <Text style={styles.pointChipText}>{(p.estado || 'NA').toUpperCase()}</Text>
              </View>
            </View>
          ))}
        </Section>

        <Section title="ACTIVIDAD SOSPECHOSA">
          <Text style={styles.bodyText}>{insp.actividad_sospechosa || 'Sin reporte.'}</Text>
        </Section>

        <Section title="FIRMAS">
          <Text style={styles.label}>INSPECTOR</Text>
          <Text style={styles.value}>{insp.inspector_nombre}</Text>
          {insp.inspector_firma ? (
            <View style={styles.firmaWrap}>
              <View style={styles.firmaImagePlaceholder}>
                <Text style={styles.firmaLabel}>FIRMA CAPTURADA</Text>
              </View>
            </View>
          ) : null}
          {insp.approved_by_signature ? (
            <>
              <Text style={[styles.label, { marginTop: spacing.md }]}>APROBACIÓN / RECHAZO POR</Text>
              <Text style={styles.value}>{insp.approved_by_name}</Text>
              <View style={styles.firmaWrap}>
                <View style={[styles.firmaImagePlaceholder, { borderColor: insp.approval_status === 'aprobada' ? colors.success : colors.error }]}>
                  <Text style={[styles.firmaLabel, { color: insp.approval_status === 'aprobada' ? colors.success : colors.error }]}>FIRMA SUPERVISOR</Text>
                </View>
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
              <Text style={styles.exportText}>EXPORTAR Y COMPARTIR PDF</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
      {showSigModal && (
        <SignatureModal
          onClose={() => setShowSigModal(false)}
          onSave={(sig) => { setApprovalSignature(sig); setShowSigModal(false); }}
          title="Firma del Supervisor"
        />
      )}
    </SafeAreaView>
  );
}

function SignatureModal({ onClose, onSave, title }: { onClose: () => void; onSave: (sig: string) => void; title: string }) {
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
            descriptionText="Firme dentro del recuadro"
            clearText="Borrar"
            confirmText="Guardar"
            webStyle={style}
            autoClear={false}
            imageType="image/png"
          />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
          <Pressable style={[styles.secondaryBtn, { flex: 1 }]} onPress={onClose} testID="signature-cancel">
            <Text style={styles.secondaryBtnText}>CANCELAR</Text>
          </Pressable>
          <Pressable
            style={[styles.primaryBtn, { flex: 1 }]}
            onPress={() => sigRef.current?.readSignature()}
            testID="signature-save"
          >
            <Text style={styles.primaryBtnText}>GUARDAR FIRMA</Text>
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
          style={[styles.rowValue, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 4 }]}
          value={value}
          onChangeText={onEdit}
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

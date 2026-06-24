import { Inspection } from '../context/InspectionContext';

export interface ReportData {
  inspection: Inspection;
  caseta?: any;
  embarque?: any;
}

export const generateConsolidatedReportHtml = (data: ReportData, lang: 'es' | 'zh') => {
  const { inspection: i, caseta, embarque } = data;
  const isZh = lang === 'zh';

  // CORRECCIÓN: Detectamos 19 o 9 puntos basado en la longitud de points o tipo explícito
  const is9Points = i.inspection_type === '9_puntos_contenedor' || (i.points && i.points.length <= 10);
  const numPoints = is9Points ? '9' : '19';

  // Determinamos si es carga o descarga basado en la condición de entrada
  const isDescarga = caseta?.entry?.condicion_carga?.toLowerCase() === 'descarga';

  const t = {
    title: isZh ? '综合报告' : 'REPORTE CONSOLIDADO',
    subtitle: isZh ? '注册、检查和运输' : 'Registro, Inspección y Embarque',
    generated: isZh ? '生成日期' : 'Generado',
    sectionCaseta: isZh ? '1. 门卫室记录 (进出)' : '1. REGISTRO DE CASETA (ENTRADA/SALIDA)',
    sectionInspection: isZh ? `2. C-TPAT ${numPoints} 点检查` : `2. INSPECCIÓN C-TPAT (${numPoints} PUNTOS)`,
    sectionShipping: isZh ? '3. 运输单 (出库)' : '3. TICKET DE EMBARQUE (DESPACHO)',
    generalData: isZh ? '基本信息' : 'Datos Generales',
    plates: isZh ? '车牌号' : 'Placas',
    driver: isZh ? '司机姓名' : 'Nombre del Chofer',
    company: isZh ? '运输公司' : 'Compañía',
    trailer: isZh ? '拖车编号' : 'Número de Tráiler',
    entryDate: isZh ? '进场时间' : 'Fecha Entrada',
    exitDate: isZh ? '出场时间' : 'Fecha Salida',
    status: isZh ? '状态' : 'Estado',
    inspector: isZh ? '检查员' : 'Inspector',
    supervisor: isZh ? '主管' : 'Supervisor',
    result: isZh ? '检查结果' : 'Resultado',
    good: isZh ? '良好' : 'BUENO',
    bad: isZh ? '故障' : 'FALLA',
    approved: isZh ? '已批准' : 'APROBADA',
    rejected: isZh ? '已拒绝' : 'RECHAZADA',
    pending: isZh ? '待定' : 'PENDIENTE',
    comments: isZh ? '备注' : 'Comentarios',
    signatures: isZh ? '签字' : 'Firmas',
    seal: isZh ? '封条' : 'Sello',
    customer: isZh ? '客户' : 'Cliente',
    pallets: isZh ? '托盘数量' : 'Pallets',
    noData: isZh ? '无相关记录' : 'No se encontró registro vinculado.',
    movType: isZh ? '作业类型' : 'Tipo de Movimiento',
    carga: isZh ? '装货 (Carga)' : 'CARGA',
    descarga: isZh ? '卸货 (Descarga)' : 'DESCARGA',
    photos: isZh ? '照片证据' : 'EVIDENCIA FOTOGRÁFICA',
    point: isZh ? '检查点' : 'Punto',
    storekeeper: isZh ? '仓管员' : 'Almacenista',
    guard: isZh ? '保安' : 'Guardia',
    noShipTicket: isZh ? '卸货作业无运输单' : 'Operación de DESCARGA: No requiere ticket de embarque de salida.',
    license: isZh ? '驾驶证' : 'Licencia',
    tractor: isZh ? '牵头' : 'Tractor',
    destination: isZh ? '目的地' : 'Destino',
  };

  const getPhotoHtml = (url: string, label: string) => {
    if (!url || !url.startsWith('data:image')) return '';
    return `
      <div style="display:inline-block; width:30%; margin:1%; vertical-align:top; border:1px solid #eee; padding:5px; background:#f9fafb;">
        <p style="margin:0 0 5px 0; font-size:8px; font-weight:bold; color:#666; text-transform:uppercase;">${label}</p>
        <img src="${url}" style="width:100%; height:120px; object-fit:cover; border:1px solid #ddd;" />
      </div>
    `;
  };

  const inspectionRows = i.points.map(p => `
    <tr>
      <td style="padding:5px;border:1px solid #ddd;width:30px;">${p.number}</td>
      <td style="padding:5px;border:1px solid #ddd;">${p.name}</td>
      <td style="padding:5px;border:1px solid #ddd;font-weight:bold;color:${p.estado === 'bueno' ? '#16a34a' : (p.estado === 'malo' ? '#dc2626' : '#999')}">${p.estado === 'bueno' ? t.good : (p.estado === 'malo' ? t.bad : 'N/A')}</td>
      <td style="padding:5px;border:1px solid #ddd;">${p.comentarios || '-'}</td>
    </tr>
  `).join('');

  const inspectionPhotos = i.points
    .filter(p => p.photo)
    .map(p => getPhotoHtml(p.photo!, `${t.point} ${p.number}`))
    .join('');

  const casetaHtml = caseta ? `
    <table style="width:100%;border-collapse:collapse;margin-bottom:10px;">
      <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;width:30%;"><b>${t.movType}</b></td><td style="padding:8px;border:1px solid #ddd;font-weight:bold;color:#0A2540;">${isDescarga ? t.descarga : t.carga}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;width:30%;"><b>${t.plates}</b></td><td style="padding:8px;border:1px solid #ddd;">${caseta.entry.placas_unidad}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;"><b>${t.driver}</b></td><td style="padding:8px;border:1px solid #ddd;">${caseta.entry.chofer_nombre}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;"><b>${t.license}</b></td><td style="padding:8px;border:1px solid #ddd;">${caseta.entry.licencia_conductor || '-'}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;"><b>${t.company}</b></td><td style="padding:8px;border:1px solid #ddd;">${caseta.entry.compania_transporte}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;"><b>${t.tractor}</b></td><td style="padding:8px;border:1px solid #ddd;">${caseta.entry.numero_tractor || '-'}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;"><b>${t.entryDate}</b></td><td style="padding:8px;border:1px solid #ddd;">${new Date(caseta.entry.fecha_entrada).toLocaleString(isZh ? 'zh-CN' : 'es-MX')}</td></tr>
      ${caseta.exit ? `
      <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;"><b>${t.exitDate}</b></td><td style="padding:8px;border:1px solid #ddd;">${new Date(caseta.exit.fecha_salida).toLocaleString(isZh ? 'zh-CN' : 'es-MX')}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;"><b>${t.seal} (Salida)</b></td><td style="padding:8px;border:1px solid #ddd;">${caseta.exit.sello_salida || '-'}</td></tr>
      ` : ''}
    </table>
    <div style="margin-bottom:20px;">
      ${getPhotoHtml(caseta.entry.foto_frente_unidad, 'FRONTAL')}
      ${getPhotoHtml(caseta.entry.foto_atras_caja, 'TRASERA')}
      ${getPhotoHtml(caseta.entry.foto_id_chofer, 'ID CHOFER')}
      ${caseta.exit ? getPhotoHtml(caseta.exit.sello_vvtt_foto, 'SELLO VVTT') : ''}
    </div>
  ` : `<p style="color:#666;font-style:italic;">${t.noData}</p>`;

  // Si es descarga, usualmente no hay ticket de embarque de salida.
  const shippingSection = (!isDescarga && embarque) ? `
    <div class="section-title">${t.sectionShipping}</div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:10px;">
      <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;width:30%;"><b>${t.customer}</b></td><td style="padding:8px;border:1px solid #ddd;">${embarque.cliente}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;"><b>${t.pallets}</b></td><td style="padding:8px;border:1px solid #ddd;">${embarque.numero_pallets}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;"><b>${t.seal}</b></td><td style="padding:8px;border:1px solid #ddd;">${embarque.numero_sello}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;"><b>${t.storekeeper}</b></td><td style="padding:8px;border:1px solid #ddd;">${embarque.almacenista}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;"><b>${t.destination}</b></td><td style="padding:8px;border:1px solid #ddd;">${embarque.observaciones?.replace('Destino: ', '') || '-'}</td></tr>
    </table>
    <div style="margin-bottom:20px;">
      ${getPhotoHtml(embarque.foto_inicio_carga, 'INICIO CARGA')}
      ${getPhotoHtml(embarque.foto_media_carga, 'MEDIA CARGA')}
      ${getPhotoHtml(embarque.foto_final_carga, 'FINAL CARGA')}
    </div>
  ` : isDescarga ? `<div class="section-title">${t.sectionShipping}</div><p style="color:#666;font-style:italic;padding:10px;">${t.noShipTicket}</p>` : '';

  const approvalStatusLabel = i.approval_status === 'aprobada' ? t.approved : (i.approval_status === 'rechazada' ? t.rejected : t.pending);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1a1a1a; padding: 20px; font-size: 11px; }
    .header { border-bottom: 4px solid #0A2540; padding-bottom: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
    .section-title { background: #0A2540; color: #fff; padding: 6px 10px; margin-top: 20px; margin-bottom: 10px; font-size: 12px; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; }
    b { color: #0A2540; }
    .status-badge { display: inline-block; padding: 4px 8px; font-weight: bold; color: white; border-radius: 3px; }
    .bg-success { background-color: #16a34a; }
    .bg-error { background-color: #dc2626; }
    .bg-warning { background-color: #f59e0b; }
    .signature-box { border: 1px solid #ddd; height: 70px; margin-top: 5px; background: #fafafa; }
    .img-sig { height: 60px; display: block; margin: 5px auto; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div style="background:#0A2540; color:white; padding:10px 20px; font-size:24px; font-weight:900; display:inline-block;">NAF</div>
      <div style="font-weight:bold; margin-top:5px; font-size:12px;">North America Flooring</div>
    </div>
    <div style="text-align:right">
      <h1 style="margin:0; font-size:18px; color:#0A2540;">${t.title}</h1>
      <p style="margin:0; color:#666;">${t.generated}: ${new Date().toLocaleString(isZh ? 'zh-CN' : 'es-MX')}</p>
    </div>
  </div>

  <div class="section-title">${t.sectionCaseta}</div>
  ${casetaHtml}

  <div class="section-title">${t.sectionInspection}</div>
  <table style="width:100%;border-collapse:collapse;margin-bottom:15px;">
    <tr>
      <td style="padding:8px;border:1px solid #ddd;background:#f9fafb;width:30%;"><b>${t.result}</b></td>
      <td style="padding:8px;border:1px solid #ddd;">
        <span class="status-badge ${i.status_general === 'bueno' ? 'bg-success' : 'bg-error'}">${i.status_general === 'bueno' ? t.good : t.bad}</span>
      </td>
    </tr>
    <tr>
      <td style="padding:8px;border:1px solid #ddd;background:#f9fafb;"><b>${t.status}</b></td>
      <td style="padding:8px;border:1px solid #ddd;">
        <span class="status-badge ${i.approval_status === 'aprobada' ? 'bg-success' : (i.approval_status === 'rechazada' ? 'bg-error' : 'bg-warning')}">${approvalStatusLabel}</span>
      </td>
    </tr>
    <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;"><b>${t.inspector}</b></td><td style="padding:8px;border:1px solid #ddd;">${i.inspector_nombre}</td></tr>
  </table>

  <table style="width:100%;border-collapse:collapse;margin-bottom:10px;">
    <tr style="background:#f1f5f9; font-weight:bold;">
      <td style="padding:5px;border:1px solid #ddd;width:30px;">#</td>
      <td style="padding:5px;border:1px solid #ddd;">${t.point}</td>
      <td style="padding:5px;border:1px solid #ddd;width:80px;">${t.status}</td>
      <td style="padding:5px;border:1px solid #ddd;">${t.comments}</td>
    </tr>
    ${inspectionRows}
  </table>

  ${inspectionPhotos ? `
    <div style="margin-top:10px; margin-bottom:20px;">
      <p style="font-weight:bold; color:#0A2540; margin-bottom:5px;">${t.photos} (INSPECCIÓN)</p>
      ${inspectionPhotos}
    </div>
  ` : ''}

  ${shippingSection}

  <div style="margin-top:30px;">
    <table style="width:100%; border-collapse:collapse;">
      <tr>
        <td style="width:50%; padding-right:10px; vertical-align:top;">
          <b>${t.inspector}:</b> ${i.inspector_nombre}
          <div class="signature-box">
            ${i.inspector_firma ? `<img src="${i.inspector_firma}" class="img-sig" />` : ''}
          </div>
        </td>
        <td style="width:50%; padding-left:10px; vertical-align:top;">
          <b>${t.supervisor}:</b> ${i.approved_by_name || '-'}
          <div class="signature-box">
            ${i.approved_by_signature ? `<img src="${i.approved_by_signature}" class="img-sig" />` : ''}
          </div>
        </td>
      </tr>
    </table>
  </div>

  <div style="margin-top:40px; border-top:1px solid #eee; padding-top:10px; text-align:center; color:#999; font-size:10px;">
    &copy; ${new Date().getFullYear()} Branco Industries - SRIUC System
  </div>
</body>
</html>
`;
};

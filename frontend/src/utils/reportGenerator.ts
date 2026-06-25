import { Inspection } from '../context/InspectionContext';

interface ReportData {
  inspection: Inspection;
  caseta: any;
  embarque?: any;
}

export const generateConsolidatedReportHtml = (data: ReportData, _lang?: string) => {
  const { inspection, caseta, embarque } = data;

  const p = {
    title: 'REPORTE CONSOLIDADO / 综合报告',
    subtitle: 'Registro, Inspección y Embarque / 注册、检查和运输',
    generated: 'Generado / 生成日期',
    sectionCaseta: '1. REGISTRO DE CASETA / 门卫室记录',
    sectionInspection: '2. INSPECCIÓN C-TPAT / C-TPAT 检查',
    sectionShipping: '3. TICKET DE EMBARQUE / 运输单',
    plates: 'Placas / 车牌号',
    driver: 'Nombre del Chofer / 司机姓名',
    company: 'Compañía / 运输公司',
    entryDate: 'Fecha Entrada / 进场时间',
    exitDate: 'Fecha Salida / 出场时间',
    status: 'Estado / 状态',
    inspector: 'Inspector / 检查员',
    supervisor: 'Supervisor / 主管',
    result: 'Resultado / 检查结果',
    good: 'BUENO / 良好',
    bad: 'FALLA / 故障',
    approved: 'APROBADA / 已批准',
    rejected: 'RECHAZADA / 已拒绝',
    pending: 'PENDIENTE / 待定',
    comments: 'Comentarios / 备注',
    seal: 'Sello / 封条',
    customer: 'Cliente / 客户',
    pallets: 'Pallets / 托盘数量',
    noData: 'No se encontró registro vinculado / 无相关记录'
  };

  const inspectionRows = inspection.points.map(t => `
    <tr>
      <td style="padding:5px;border:1px solid #ddd;width:30px;">${t.number}</td>
      <td style="padding:5px;border:1px solid #ddd;">${t.name}</td>
      <td style="padding:5px;border:1px solid #ddd;font-weight:bold;color:${t.estado === 'bueno' ? '#16a34a' : '#dc2626'}">${t.estado === 'bueno' ? p.good : (t.estado === 'malo' ? p.bad : 'N/A')}</td>
      <td style="padding:5px;border:1px solid #ddd;">${t.comentarios || '-'}</td>
    </tr>
  `).join('');

  const casetaHtml = caseta ? `
    <table style="width:100%;border-collapse:collapse;margin-bottom:10px;">
      <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;width:40%;"><b>${p.plates}</b></td><td style="padding:8px;border:1px solid #ddd;">${caseta.entry.placas_unidad}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;"><b>${p.driver}</b></td><td style="padding:8px;border:1px solid #ddd;">${caseta.entry.chofer_nombre}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;"><b>${p.company}</b></td><td style="padding:8px;border:1px solid #ddd;">${caseta.entry.compania_transporte}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;"><b>${p.entryDate}</b></td><td style="padding:8px;border:1px solid #ddd;">${new Date(caseta.entry.fecha_entrada).toLocaleString()}</td></tr>
      ${caseta.exit ? `<tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;"><b>${p.exitDate}</b></td><td style="padding:8px;border:1px solid #ddd;">${new Date(caseta.exit.fecha_salida).toLocaleString()}</td></tr>` : ''}
    </table>
    <div style="margin-top: 10px; display: flex; gap: 20px;">
      ${caseta.entry.firma_operador ? `<div><p style="font-size:8px; margin:0; color:#666;">FIRMA CONDUCTOR (ENTRADA) / 司机签字:</p><img src="${caseta.entry.firma_operador}" style="height:60px; border-bottom:1px solid #0A2540;" /></div>` : ''}
      ${caseta.exit?.firma_guardia ? `<div><p style="font-size:8px; margin:0; color:#666;">FIRMA GUARDIA (SALIDA) / 警卫签字:</p><img src="${caseta.exit.firma_guardia}" style="height:60px; border-bottom:1px solid #0A2540;" /></div>` : ''}
    </div>
  ` : `<p style="color:#666;font-style:italic;">${p.noData}</p>`;

  const shippingHtml = embarque ? `
    <table style="width:100%;border-collapse:collapse;margin-bottom:10px;">
      <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;width:40%;"><b>${p.customer}</b></td><td style="padding:8px;border:1px solid #ddd;">${embarque.cliente}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;"><b>${p.pallets}</b></td><td style="padding:8px;border:1px solid #ddd;">${embarque.numero_pallets}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;"><b>${p.seal}</b></td><td style="padding:8px;border:1px solid #ddd;">${embarque.numero_sello}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;"><b>Almacenista / 仓管员</b></td><td style="padding:8px;border:1px solid #ddd;">${embarque.almacenista}</td></tr>
    </table>
    <div style="margin-top: 10px; display: flex; gap: 20px;">
      ${embarque.firma_almacenista ? `<div><p style="font-size:8px; margin:0; color:#666;">FIRMA ALMACENISTA / 仓管员签字:</p><img src="${embarque.firma_almacenista}" style="height:60px; border-bottom:1px solid #0A2540;" /></div>` : ''}
      ${embarque.firma_guardia ? `<div><p style="font-size:8px; margin:0; color:#666;">FIRMA GUARDIA / 警卫签字:</p><img src="${embarque.firma_guardia}" style="height:60px; border-bottom:1px solid #0A2540;" /></div>` : ''}
    </div>
  ` : `<p style="color:#666;font-style:italic;">${p.noData}</p>`;

  const approvalStatusLabel = inspection.approval_status === 'aprobada' ? p.approved : (inspection.approval_status === 'rechazada' ? p.rejected : p.pending);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1a1a1a; padding: 20px; font-size: 11px; line-height: 1.4; }
    .header { border-bottom: 3px solid #0A2540; padding-bottom: 10px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: flex-end; }
    .section-title { background: #0A2540; color: #fff; padding: 6px 10px; margin-top: 20px; margin-bottom: 8px; font-size: 13px; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; }
    b { color: #0A2540; }
    .status-badge { display: inline-block; padding: 3px 6px; font-weight: bold; color: white; border-radius: 3px; font-size: 10px; }
    .bg-success { background-color: #16a34a; }
    .bg-error { background-color: #dc2626; }
    .bg-warning { background-color: #f59e0b; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div style="background:#0A2540; color:white; padding:8px 15px; font-size:20px; font-weight:900; display:inline-block;">NAF</div>
      <div style="font-weight:bold; margin-top:3px; font-size:10px;">North America Flooring</div>
    </div>
    <div style="text-align:right">
      <h1 style="margin:0; font-size:16px; color:#0A2540;">${p.title}</h1>
      <p style="margin:0; color:#666;">${p.generated}: ${new Date().toLocaleString()}</p>
    </div>
  </div>

  <div class="section-title">${p.sectionCaseta}</div>
  ${casetaHtml}

  <div class="section-title">${p.sectionInspection}</div>
  <table style="width:100%;border-collapse:collapse;margin-bottom:10px;">
    <tr>
      <td style="padding:6px;border:1px solid #ddd;background:#f9fafb;width:40%;"><b>${p.result}</b></td>
      <td style="padding:6px;border:1px solid #ddd;">
        <span class="status-badge ${inspection.status_general === 'bueno' ? 'bg-success' : 'bg-error'}">${inspection.status_general === 'bueno' ? p.good : p.bad}</span>
      </td>
    </tr>
    <tr>
      <td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>${p.status}</b></td>
      <td style="padding:6px;border:1px solid #ddd;">
        <span class="status-badge ${inspection.approval_status === 'aprobada' ? 'bg-success' : inspection.approval_status === 'rechazada' ? 'bg-error' : 'bg-warning'}">${approvalStatusLabel}</span>
      </td>
    </tr>
    <tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>${p.inspector}</b></td><td style="padding:6px;border:1px solid #ddd;">${inspection.inspector_nombre}</td></tr>
  </table>

  <table style="width:100%;border-collapse:collapse;">
    <tr style="background:#f1f5f9; font-weight:bold;">
      <td style="padding:4px;border:1px solid #ddd;width:30px;">#</td>
      <td style="padding:4px;border:1px solid #ddd;">Punto / 检查点</td>
      <td style="padding:4px;border:1px solid #ddd;width:100px;">${p.status}</td>
      <td style="padding:4px;border:1px solid #ddd;">${p.comments}</td>
    </tr>
    ${inspectionRows}
  </table>

  <div style="margin-top: 15px; display: flex; gap: 20px;">
    ${inspection.inspector_firma ? `<div><p style="font-size:8px; margin:0; color:#666;">FIRMA INSPECTOR / 检查员签字:</p><img src="${inspection.inspector_firma}" style="height:60px; border-bottom:1px solid #0A2540;" /></div>` : ''}
    ${inspection.approved_by_signature ? `<div><p style="font-size:8px; margin:0; color:#666;">FIRMA AUTORIZACIÓN / 授权签字:</p><img src="${inspection.approved_by_signature}" style="height:60px; border-bottom:1px solid #0A2540;" /></div>` : ''}
  </div>

  <div class="section-title">${p.sectionShipping}</div>
  ${shippingHtml}

  <div style="margin-top:30px; border-top:1px solid #eee; padding-top:10px; text-align:center; color:#999; font-size:9px;">
    &copy; ${new Date().getFullYear()} Branco Industries - SRIUC System / 版权所有
  </div>
</body>
</html>
  `;
};

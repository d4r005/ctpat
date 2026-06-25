import { Inspection } from '../context/InspectionContext';

interface ReportData {
  inspection: Inspection;
  caseta: any;
  embarque?: any;
}

const REGLAS = [
  { es: '1. No romper el sello hasta que la cortina asignada esté abierta y el almacenista responsable esté presente.', zh: '1. 在指定的卸货门打开且负责的仓库人员到场之前，请勿破坏封条。' },
  { es: '2. No pasar materiales/equipos ajenos a NAF por la cortina.', zh: '2. 请勿通过卸货门运送不属于 NAF 的材料/设备。' },
  { es: '3. Prohibido brincar rampas y entrar al almacén sin autorización.', zh: '3. 禁止未经授权跳过坡道或进入仓库。' },
  { es: '4. Prohibidos drogas, armas, agentes biológicos, aerosoles, cámaras de video/foto, pornografía y bebidas alcohólicas.', zh: '4. 禁止携带毒品、武器、生物制剂、气雾剂、摄相机、色情制品和酒精饮料。' },
  { es: '5. Prohibido dar propinas, premios o incentivos al personal de seguridad/almacén NAF.', zh: '5. 禁止向 NAF 安保或仓库人员提供小费、奖品或奖励。' },
  { es: '6. No menores de edad ni personal ajeno a NAF en el patio de maniobras.', zh: '6. 禁止未成年人或非 NAF 人员进入操作场区。' },
  { es: '7. Prohibido tirar basura en el patio de maniobras.', zh: '7. 禁止在操作场区乱扔垃圾。' },
  { es: '8. Velocidad máxima 10 km/h.', zh: '8. 最高时速 10 公里/小时。' },
];

const DECLARACIONES = [
  { es: '1. Declaro NO transportar drogas, agentes biológicos, bioterrorismo, municiones, armas, contrabando ni personas indocumentadas.', zh: '1. 我声明不运输毒品、生物制剂、生物恐怖主义物品、弹药、武器、走私品或无证人员。' },
  { es: '2. Declaro estar en condición física adecuada y buen estado de salud.', zh: '2. 我声明身体状况良好，健康状态佳。' },
  { es: '3. Declaro NO haber consumido alcohol o drogas recientemente y NO estar bajo su influencia.', zh: '3. 我声明最近没有饮酒或吸毒，且不受其影响。' },
  { es: '4. Declaro que al estar en instalaciones NAF he leído, entendido y aceptado plenamente estas instrucciones.', zh: '4. 我声明在 NAF 设施内已阅读、理解并完全接受这些指令。' },
];

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

  const rulesHtml = REGLAS.map(r => `<div style="margin-bottom:2px;">${r.es} <br/><span style="color:#666;">${r.zh}</span></div>`).join('');
  const declsHtml = DECLARACIONES.map(d => `<div style="margin-bottom:2px;">${d.es} <br/><span style="color:#666;">${d.zh}</span></div>`).join('');

  const casetaHtml = caseta ? `
    <table style="width:100%;border-collapse:collapse;margin-bottom:10px;">
      <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;width:40%;"><b>${p.plates}</b></td><td style="padding:8px;border:1px solid #ddd;">${caseta.entry.placas_unidad}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;"><b>${p.driver}</b></td><td style="padding:8px;border:1px solid #ddd;">${caseta.entry.chofer_nombre}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;"><b>${p.company}</b></td><td style="padding:8px;border:1px solid #ddd;">${caseta.entry.compania_transporte}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;"><b>${p.entryDate}</b></td><td style="padding:8px;border:1px solid #ddd;">${new Date(caseta.entry.fecha_entrada).toLocaleString()}</td></tr>
      ${caseta.exit ? `<tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;"><b>${p.exitDate}</b></td><td style="padding:8px;border:1px solid #ddd;">${new Date(caseta.exit.fecha_salida).toLocaleString()}</td></tr>` : ''}
    </table>

    <div style="background: #f1f5f9; padding: 10px; border: 1px solid #ddd; margin-bottom: 10px; font-size: 8px;">
      <p style="margin: 0 0 5px 0; font-weight: bold; color: #0A2540;">REGLAMENTO Y SEGURIDAD / 安全条例:</p>
      ${rulesHtml}
      <p style="margin: 10px 0 5px 0; font-weight: bold; color: #0A2540;">DECLARACIONES / 司机声明:</p>
      ${declsHtml}
      <p style="margin-top: 10px; font-weight: bold; color: #16a34a;">ACEPTADO / 已接受 ✓</p>
    </div>

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
      <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;"><b>Guardia / 警卫</b></td><td style="padding:8px;border:1px solid #ddd;">${embarque.nombre_guardia || '-'}</td></tr>
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
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1a1a1a; padding: 20px; font-size: 10px; line-height: 1.3; }
    .header { border-bottom: 3px solid #0A2540; padding-bottom: 10px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: flex-end; }
    .section-title { background: #0A2540; color: #fff; padding: 6px 10px; margin-top: 15px; margin-bottom: 8px; font-size: 12px; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; }
    b { color: #0A2540; }
    .status-badge { display: inline-block; padding: 3px 6px; font-weight: bold; color: white; border-radius: 3px; font-size: 9px; }
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
    <tr>
      <td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>${p.inspector}</b></td>
      <td style="padding:6px;border:1px solid #ddd;">
        ${inspection.inspector_nombre}<br/>
        ${inspection.inspector_firma ? `<img src="${inspection.inspector_firma}" style="height:45px; margin-top:5px; border-bottom:1px solid #0A2540;" />` : ''}
      </td>
    </tr>
    ${inspection.approved_by_name ? `
    <tr>
      <td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>${p.supervisor}</b></td>
      <td style="padding:6px;border:1px solid #ddd;">
        ${inspection.approved_by_name}<br/>
        ${inspection.approved_by_signature ? `<img src="${inspection.approved_by_signature}" style="height:45px; margin-top:5px; border-bottom:1px solid #0A2540;" />` : ''}
      </td>
    </tr>` : ''}
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

  <div class="section-title">${p.sectionShipping}</div>
  ${shippingHtml}

  <div style="margin-top:30px; border-top:1px solid #eee; padding-top:10px; text-align:center; color:#999; font-size:9px;">
    &copy; ${new Date().getFullYear()} Branco Industries - SRIUC System / 版权所有
  </div>
</body>
</html>
  `;
};

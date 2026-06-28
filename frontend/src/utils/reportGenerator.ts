import { Inspection } from '../context/InspectionContext';
import { INSPECTION_POINTS_19, INSPECTION_POINTS_9 } from '../constants/inspectionPoints';

interface ReportData {
  inspection: Inspection;
  inspections?: Inspection[];
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
  const { inspection: i, inspections, caseta, embarque } = data;

  // Use all provided inspections if available (for FULL units), otherwise just the primary one
  const activeInspections = inspections && inspections.length > 0 ? inspections : [i];

  const p = {
    title: 'REPORTE CONSOLIDADO / 综合报告',
    subtitle: 'Registro, Inspección y Embarque / 注册、检查和运输',
    generated: 'Generado / 生成日期',
    sectionCaseta: '1. REGISTRO DE CASETA / 门卫室记录',
    sectionInspection: `2. INSPECCIÓN C-TPAT (${activeInspections[0].points.length} PUNTOS) / C-TPAT 检查`,
    sectionShipping: '3. TICKET DE EMBARQUE / 运输单',
    sectionPhotos: 'EVIDENCIA FOTOGRÁFICA / 照片证据',
    plates: 'Placas / 车牌号',
    driver: 'Nombre del Chofer / 司机姓名',
    company: 'Compañía / 运输公司',
    license: 'Licencia / 驾驶证',
    tractor: 'Tractor / 牵引车',
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
    destination: 'Destino / 目的地',
    noData: 'No se encontró registro vinculado / 无相关记录'
  };

  const getPhotoHtml = (url: string, label: string) => {
    if (!url || !url.startsWith('data:image')) return '';
    return `
      <div style="display:inline-block; width:30%; margin:1%; vertical-align:top; border:1px solid #eee; padding:5px; background:#FFFFFF; text-align:center;">
        <p style="margin:0 0 5px 0; font-size:7px; font-weight:bold; color:#666; text-transform:uppercase;">${label}</p>
        <img src="${url}" style="width:100%; height:100px; object-fit:cover; border:1px solid #ddd; background-color:#FFFFFF;" />
      </div>
    `;
  };

  const inspectionRows = i.points.map(t => {
    // Buscar el punto original para obtener el nombre bilingüe
    const allDefs = [...INSPECTION_POINTS_19, ...INSPECTION_POINTS_9];
    const def = allDefs.find(d => d.number === t.number);
    const bilingualName = def ? `${def.name_es} / ${def.name_zh}` : t.name;

    return `
    <tr>
      <td style="padding:5px;border:1px solid #ddd;width:30px;">${t.number}</td>
      <td style="padding:5px;border:1px solid #ddd;">${bilingualName}</td>
      <td style="padding:5px;border:1px solid #ddd;font-weight:bold;color:${t.estado === 'bueno' ? '#16a34a' : '#dc2626'}">${t.estado === 'bueno' ? p.good : (t.estado === 'malo' ? p.bad : 'N/A')}</td>
      <td style="padding:5px;border:1px solid #ddd;">${t.comentarios || '-'}</td>
    </tr>
  `}).join('');

  const inspectionPhotos = i.points
    .filter(p => p.photo)
    .map(p => getPhotoHtml(p.photo!, `PUNTO ${p.number}`))
    .join('');

  const rulesHtml = REGLAS.map(r => `<div style="margin-bottom:2px;">${r.es} <br/><span style="color:#666;">${r.zh}</span></div>`).join('');
  const declsHtml = DECLARACIONES.map(d => `<div style="margin-bottom:2px;">${d.es} <br/><span style="color:#666;">${d.zh}</span></div>`).join('');

  const casetaHtml = caseta ? `
    <table style="width:100%;border-collapse:collapse;margin-bottom:10px;">
      <tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;width:40%;"><b>${p.plates}</b></td><td style="padding:6px;border:1px solid #ddd;">${caseta.entry.placas_unidad}</td></tr>
      <tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>${p.driver}</b></td><td style="padding:6px;border:1px solid #ddd;">${caseta.entry.chofer_nombre}</td></tr>
      <tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>${p.license}</b></td><td style="padding:6px;border:1px solid #ddd;">${caseta.entry.licencia_conductor || '-'}</td></tr>
      <tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>${p.company}</b></td><td style="padding:6px;border:1px solid #ddd;">${caseta.entry.compania_transporte}</td></tr>
      <tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>${p.tractor}</b></td><td style="padding:6px;border:1px solid #ddd;">${caseta.entry.numero_tractor || '-'}</td></tr>

      <tr style="background:#f1f5f9;"><td colspan="2" style="padding:5px; font-weight:bold;">CAJA 1 / 货箱 1</td></tr>
      <tr><td style="padding:6px;border:1px solid #ddd;"><b>${p.company} 1</b></td><td style="padding:6px;border:1px solid #ddd;">${caseta.entry.compania_caja}</td></tr>
      <tr><td style="padding:6px;border:1px solid #ddd;"><b>${p.tractor} 1</b></td><td style="padding:6px;border:1px solid #ddd;">${caseta.entry.numero_caja}</td></tr>
      <tr><td style="padding:6px;border:1px solid #ddd;"><b>${p.seal} 1</b></td><td style="padding:6px;border:1px solid #ddd;">${caseta.entry.sello_entrada}</td></tr>

      ${caseta.entry.tipo_unidad === 'full' ? `
      <tr style="background:#f1f5f9;"><td colspan="2" style="padding:5px; font-weight:bold;">CAJA 2 / 货箱 2</td></tr>
      <tr><td style="padding:6px;border:1px solid #ddd;"><b>${p.company} 2</b></td><td style="padding:6px;border:1px solid #ddd;">${caseta.entry.compania_caja_2}</td></tr>
      <tr><td style="padding:6px;border:1px solid #ddd;"><b>${p.tractor} 2</b></td><td style="padding:6px;border:1px solid #ddd;">${caseta.entry.numero_caja_2}</td></tr>
      <tr><td style="padding:6px;border:1px solid #ddd;"><b>${p.seal} 2</b></td><td style="padding:6px;border:1px solid #ddd;">${caseta.entry.sello_entrada_2}</td></tr>
      ` : ''}

      <tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>${p.entryDate}</b></td><td style="padding:6px;border:1px solid #ddd;">${new Date(caseta.entry.fecha_entrada).toLocaleString()}</td></tr>
      ${caseta.exit ? `
        <tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>${p.exitDate}</b></td><td style="padding:6px;border:1px solid #ddd;">${new Date(caseta.exit.fecha_salida).toLocaleString()}</td></tr>
        ${caseta.entry.condicion_carga !== 'descarga' ? `
          <tr><td style="padding:6px;border:1px solid #ddd;"><b>${p.seal} (Salida 1)</b></td><td style="padding:6px;border:1px solid #ddd;">${caseta.exit.sello_salida || '-'}</td></tr>
          ${caseta.entry.tipo_unidad === 'full' ? `<tr><td style="padding:6px;border:1px solid #ddd;"><b>${p.seal} (Salida 2)</b></td><td style="padding:6px;border:1px solid #ddd;">${caseta.exit.sello_salida_2 || '-'}</td></tr>` : ''}
        ` : ''}
      ` : ''}
    </table>

    <div style="background: #f1f5f9; padding: 10px; border: 1px solid #ddd; margin-bottom: 10px; font-size: 8px;">
      <p style="margin: 0 0 5px 0; font-weight: bold; color: #0A2540;">REGLAMENTO Y SEGURIDAD / 安全条例:</p>
      ${rulesHtml}
      <p style="margin: 10px 0 5px 0; font-weight: bold; color: #0A2540;">DECLARACIONES / 司机声明:</p>
      ${declsHtml}
      <p style="margin-top: 10px; font-weight: bold; color: #16a34a;">ACEPTADO / 已接受 ✓</p>
      ${caseta.entry.firma_operador ? `<div style="margin-top:5px;"><img src="${caseta.entry.firma_operador}" style="height:60px; border-bottom:1px solid #0A2540;" /></div>` : ''}
    </div>

    <div style="margin-bottom:15px;">
      ${getPhotoHtml(caseta.entry.foto_frente_unidad, 'FRONTAL')}
      ${getPhotoHtml(caseta.entry.foto_atras_caja, 'TRASERA 1')}
      ${caseta.entry.tipo_unidad === 'full' ? getPhotoHtml(caseta.entry.foto_atras_caja_2, 'TRASERA 2') : ''}
      ${getPhotoHtml(caseta.entry.foto_id_chofer, 'ID CHOFER')}
      ${caseta.exit && caseta.entry.condicion_carga !== 'descarga' ? getPhotoHtml(caseta.exit.sello_vvtt_foto, 'VVTT 1') : ''}
      ${caseta.exit && caseta.entry.condicion_carga !== 'descarga' && caseta.entry.tipo_unidad === 'full' ? getPhotoHtml(caseta.exit.sello_vvtt_foto_2, 'VVTT 2') : ''}
    </div>
  ` : `<p style="color:#666;font-style:italic;">${p.noData}</p>`;

  const shippingHtml = embarque ? `
    <table style="width:100%;border-collapse:collapse;margin-bottom:10px;">
      <tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;width:40%;"><b>${p.customer}</b></td><td style="padding:6px;border:1px solid #ddd;">${embarque.cliente}</td></tr>
      <tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>Pallets / 托盘数量</b></td><td style="padding:6px;border:1px solid #ddd;">${embarque.numero_pallets}</td></tr>
      <tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>${p.seal}</b></td><td style="padding:6px;border:1px solid #ddd;">${embarque.numero_sello}</td></tr>
      <tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>${p.destination}</b></td><td style="padding:6px;border:1px solid #ddd;">${embarque.observaciones?.replace('Destino: ', '') || '-'}</td></tr>
      <tr>
        <td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>Almacenista / 仓管员</b></td>
        <td style="padding:6px;border:1px solid #ddd;">
          ${embarque.almacenista}<br/>
          ${embarque.firma_almacenista ? `<img src="${embarque.firma_almacenista}" style="height:50px; margin-top:5px; border-bottom:1px solid #0A2540;" />` : ''}
        </td>
      </tr>
      <tr>
        <td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>Guardia / 警卫</b></td>
        <td style="padding:6px;border:1px solid #ddd;">
          ${embarque.nombre_guardia || '-'}<br/>
          ${embarque.firma_guardia ? `<img src="${embarque.firma_guardia}" style="height:50px; margin-top:5px; border-bottom:1px solid #0A2540;" />` : ''}
        </td>
      </tr>
    </table>

    <div style="margin-bottom:15px;">
      ${getPhotoHtml(embarque.foto_inicio_carga, 'INICIO CARGA')}
      ${getPhotoHtml(embarque.foto_media_carga, 'MEDIA CARGA')}
      ${getPhotoHtml(embarque.foto_final_carga, 'FINAL CARGA')}
    </div>
  ` : `<p style="color:#666;font-style:italic;">${p.noData}</p>`;

  const approvalStatusLabel = i.approval_status === 'aprobada' ? p.approved : (i.approval_status === 'rechazada' ? p.rejected : p.pending);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1a1a1a; padding: 20px; font-size: 10px; line-height: 1.3; background-color: #FFFFFF; }
    .header { border-bottom: 3px solid #0A2540; padding-bottom: 10px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: flex-end; background-color: #FFFFFF; }
    .section-title { background: #0A2540; color: #fff; padding: 6px 10px; margin-top: 15px; margin-bottom: 8px; font-size: 12px; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; background-color: #FFFFFF; }
    td { background-color: #FFFFFF; }
    b { color: #0A2540; }
    img { background-color: #FFFFFF; }
    .status-badge { display: inline-block; padding: 3px 6px; font-weight: bold; color: white; border-radius: 3px; font-size: 9px; }
    .bg-success { background-color: #16a34a; }
    .bg-error { background-color: #dc2626; }
    .bg-warning { background-color: #f59e0b; }
  </style>
</head>
<body style="background-color: #FFFFFF;">
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
  ${activeInspections.map((insp, idx) => {
    const rows = insp.points.map(t => {
      const allDefs = [...INSPECTION_POINTS_19, ...INSPECTION_POINTS_9];
      const def = allDefs.find(d => d.number === t.number);
      const bilingualName = def ? `${def.name_es} / ${def.name_zh}` : t.name;

      return `
      <tr>
        <td style="padding:4px;border:1px solid #ddd;width:30px;">${t.number}</td>
        <td style="padding:4px;border:1px solid #ddd;">${bilingualName}</td>
        <td style="padding:4px;border:1px solid #ddd;font-weight:bold;color:${t.estado === 'bueno' ? '#16a34a' : '#dc2626'}">${t.estado === 'bueno' ? p.good : (t.estado === 'malo' ? p.bad : 'N/A')}</td>
        <td style="padding:4px;border:1px solid #ddd;">${t.comentarios || '-'}</td>
      </tr>
    `}).join('');

    const currentAppStatus = insp.approval_status === 'aprobada' ? p.approved : (insp.approval_status === 'rechazada' ? p.rejected : p.pending);

    return `
      <div style="margin-bottom:20px; border:1px solid #0A2540; padding:10px;">
        <p style="font-weight:bold; background:#eee; padding:5px; margin-top:0;">
          ${insp.inspection_type === '9_puntos_contenedor' ? '9 PUNTOS' : '19 PUNTOS'} - ${insp.numero_trailer}
        </p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:10px;">
          <tr>
            <td style="padding:6px;border:1px solid #ddd;background:#f9fafb;width:40%;"><b>${p.result}</b></td>
            <td style="padding:6px;border:1px solid #ddd;">
              <span class="status-badge ${insp.status_general === 'bueno' ? 'bg-success' : 'bg-error'}">${insp.status_general === 'bueno' ? p.good : p.bad}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>${p.status}</b></td>
            <td style="padding:6px;border:1px solid #ddd;">
              <span class="status-badge ${insp.approval_status === 'aprobada' ? 'bg-success' : insp.approval_status === 'rechazada' ? 'bg-error' : 'bg-warning'}">${currentAppStatus}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>${p.inspector}</b></td>
            <td style="padding:6px;border:1px solid #ddd;">${insp.inspector_nombre}</td>
          </tr>
        </table>

        <table style="width:100%;border-collapse:collapse;margin-bottom:10px;">
          <tr style="background:#f1f5f9; font-weight:bold;">
            <td style="padding:4px;border:1px solid #ddd;width:30px;">#</td>
            <td style="padding:4px;border:1px solid #ddd;">Punto / 检查点</td>
            <td style="padding:4px;border:1px solid #ddd;width:100px;">${p.status}</td>
            <td style="padding:4px;border:1px solid #ddd;">${p.comments}</td>
          </tr>
          ${rows}
        </table>

        <div style="margin-top:10px;">
          ${insp.points.filter(p => p.photo).map(p => getPhotoHtml(p.photo!, `PUNTO ${p.number}`)).join('')}
        </div>
      </div>
    `;
  }).join('')}

  ${caseta.entry.condicion_carga !== 'descarga' ? `
    <div class="section-title">${p.sectionShipping}</div>
    ${shippingHtml}
  ` : ''}

  <div style="margin-top:30px; border-top:1px solid #eee; padding-top:10px; text-align:center; color:#999; font-size:9px;">
    &copy; ${new Date().getFullYear()} Branco Industries - SRIUC System / 版权所有
  </div>
</body>
</html>
  `;
};

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

const safeDate = (d: any): string => {
  try { return d ? new Date(d).toLocaleString('es-MX') : '-'; } catch { return '-'; }
};

/** Renderiza un cuadro de firma inline (dentro de tabla o donde se necesite) */
const inlineSig = (imgSrc: string | undefined, label: string, name?: string) => `
  <div style="text-align:center; padding:6px 10px; min-width:130px;">
    <div style="height:60px; display:flex; align-items:flex-end; justify-content:center; background:#FFF; border-bottom:2px solid #0A2540; margin-bottom:3px; min-width:120px;">
      ${imgSrc && (imgSrc.startsWith('data:image') || imgSrc.startsWith('http'))
        ? `<img src="${imgSrc}" style="max-height:56px; max-width:150px; object-fit:contain;" />`
        : `<div style="width:120px; height:55px; background:#f5f5f5; display:flex; align-items:center; justify-content:center; color:#bbb; font-size:7px; border:1px dashed #ccc;">Sin firma</div>`
      }
    </div>
    <p style="margin:0; font-weight:bold; font-size:7.5px; color:#0A2540; text-transform:uppercase;">${label}</p>
    ${name ? `<p style="margin:1px 0 0 0; font-size:7px; color:#555;">${name}</p>` : ''}
  </div>
`;

const getPhotoHtml = (url: string | undefined, label: string) => {
  if (!url || (!url.startsWith('data:image') && !url.startsWith('http'))) return '';
  return `
    <div style="display:inline-block; width:30%; margin:1%; vertical-align:top; border:1px solid #eee; padding:5px; background:#FFF; text-align:center;">
      <p style="margin:0 0 4px 0; font-size:7px; font-weight:bold; color:#666; text-transform:uppercase;">${label}</p>
      <img src="${url}" style="width:100%; height:100px; object-fit:cover; border:1px solid #ddd;" />
    </div>
  `;
};

export const generateConsolidatedReportHtml = (data: ReportData, _lang?: string) => {
  const { inspection: i, inspections, caseta, embarque } = data;

  const activeInspections: Inspection[] = (inspections && inspections.length > 0)
    ? inspections
    : (i && i.points && i.points.length > 0 ? [i] : []);

  const hasInspections = activeInspections.length > 0;
  const firstInsp = activeInspections[0];

  const labels = {
    title: 'REPORTE CONSOLIDADO / 综合报告',
    generated: 'Generado / 生成日期',
    sectionCaseta: '1. REGISTRO DE CASETA / 门卫室记录',
    sectionInspection: '2. INSPECCIÓN C-TPAT / C-TPAT 检查',
    sectionShipping: '3. TICKET DE EMBARQUE / 运输单',
    plates: 'Placas / 车牌号',
    driver: 'Chofer / 司机姓名',
    license: 'Licencia / 驾驶证',
    company: 'Compañía / 运输公司',
    tractor: 'Tractor / 牵引车',
    box: 'Caja / 货箱',
    seal: 'Sello / 封条',
    entryDate: 'Fecha Entrada / 进场时间',
    exitDate: 'Fecha Salida / 出场时间',
    result: 'Resultado / 检查结果',
    status: 'Estado / 状态',
    inspector: 'Inspector / 检查员',
    supervisor: 'Supervisor aprueba / 主管批准',
    good: 'BUENO / 良好',
    bad: 'FALLA / 故障',
    approved: 'APROBADA / 已批准',
    rejected: 'RECHAZADA / 已拒绝',
    pending: 'PENDIENTE / 待定',
    comments: 'Comentarios / 备注',
    noData: 'Sin registro vinculado / 无相关记录',
    noInspection: 'No hay inspecciones digitales vinculadas a esta unidad. El proceso puede estar pendiente de sincronización. / 该车辆没有关联的数字检验记录。',
  };

  const rulesHtml = REGLAS.map(r =>
    `<div style="margin-bottom:3px;">${r.es}<br/><span style="color:#666;">${r.zh}</span></div>`
  ).join('');

  const declsHtml = DECLARACIONES.map(d =>
    `<div style="margin-bottom:3px;">${d.es}<br/><span style="color:#666;">${d.zh}</span></div>`
  ).join('');

  // ─────────────────────────────────────────────────────────────────────────────
  // SECCIÓN 1 — CASETA
  // Firma del operador: va dentro del bloque de reglamento, debajo de "ACEPTADO"
  // ─────────────────────────────────────────────────────────────────────────────
  const casetaHtml = caseta ? `
    <table style="width:100%;border-collapse:collapse;margin-bottom:10px;">
      <tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;width:40%;"><b>${labels.plates}</b></td><td style="padding:6px;border:1px solid #ddd;">${caseta.entry?.placas_unidad || '-'}</td></tr>
      <tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>${labels.driver}</b></td><td style="padding:6px;border:1px solid #ddd;">${caseta.entry?.chofer_nombre || '-'}</td></tr>
      <tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>${labels.license}</b></td><td style="padding:6px;border:1px solid #ddd;">${caseta.entry?.licencia_conductor || '-'}</td></tr>
      <tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>${labels.company}</b></td><td style="padding:6px;border:1px solid #ddd;">${caseta.entry?.compania_transporte || '-'}</td></tr>
      <tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>${labels.tractor}</b></td><td style="padding:6px;border:1px solid #ddd;">${caseta.entry?.numero_tractor || '-'}</td></tr>

      <tr style="background:#e8f0fe;"><td colspan="2" style="padding:5px;font-weight:bold;color:#0A2540;">CAJA 1 / 货箱 1</td></tr>
      <tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>Empresa Caja / 货箱公司</b></td><td style="padding:6px;border:1px solid #ddd;">${caseta.entry?.compania_caja || '-'}</td></tr>
      <tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>${labels.box} 1</b></td><td style="padding:6px;border:1px solid #ddd;">${caseta.entry?.numero_caja || '-'}</td></tr>
      <tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>${labels.seal} Entrada</b></td><td style="padding:6px;border:1px solid #ddd;">${caseta.entry?.sello_entrada || '-'}</td></tr>

      ${caseta.entry?.tipo_unidad === 'full' ? `
      <tr style="background:#e8f0fe;"><td colspan="2" style="padding:5px;font-weight:bold;color:#0A2540;">CAJA 2 / 货箱 2</td></tr>
      <tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>Empresa Caja 2</b></td><td style="padding:6px;border:1px solid #ddd;">${caseta.entry?.compania_caja_2 || '-'}</td></tr>
      <tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>${labels.box} 2</b></td><td style="padding:6px;border:1px solid #ddd;">${caseta.entry?.numero_caja_2 || '-'}</td></tr>
      <tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>${labels.seal} Entrada 2</b></td><td style="padding:6px;border:1px solid #ddd;">${caseta.entry?.sello_entrada_2 || '-'}</td></tr>
      ` : ''}

      <tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>Guardia Caseta / 门卫</b></td><td style="padding:6px;border:1px solid #ddd;">${caseta.entry?.guardia_caseta_nombre || '-'}</td></tr>
      <tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>Condición Carga / 货物状态</b></td><td style="padding:6px;border:1px solid #ddd;">${caseta.entry?.condicion_carga || '-'}</td></tr>
      <tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>${labels.entryDate}</b></td><td style="padding:6px;border:1px solid #ddd;">${safeDate(caseta.entry?.fecha_entrada)}</td></tr>

      ${caseta.exit ? `
        <tr style="background:#e8f0fe;"><td colspan="2" style="padding:5px;font-weight:bold;color:#0A2540;">DATOS DE SALIDA / 出场数据</td></tr>
        <tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>${labels.exitDate}</b></td><td style="padding:6px;border:1px solid #ddd;">${safeDate(caseta.exit.fecha_salida)}</td></tr>
        <tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>Condición Salida</b></td><td style="padding:6px;border:1px solid #ddd;">${caseta.exit.condicion_salida || '-'}</td></tr>
        <tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>${labels.seal} Salida 1</b></td><td style="padding:6px;border:1px solid #ddd;">${caseta.exit.sello_salida || '-'}</td></tr>
        ${caseta.entry?.tipo_unidad === 'full' ? `<tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>${labels.seal} Salida 2</b></td><td style="padding:6px;border:1px solid #ddd;">${caseta.exit.sello_salida_2 || '-'}</td></tr>` : ''}
        ${caseta.exit.numero_caja_salida ? `<tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>${labels.box} Salida 1</b></td><td style="padding:6px;border:1px solid #ddd;">${caseta.exit.numero_caja_salida}</td></tr>` : ''}
        ${caseta.exit.numero_caja_salida_2 ? `<tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>${labels.box} Salida 2</b></td><td style="padding:6px;border:1px solid #ddd;">${caseta.exit.numero_caja_salida_2}</td></tr>` : ''}
        <tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>Guardia Salida / 出场警卫</b></td><td style="padding:6px;border:1px solid #ddd;">${caseta.exit.guardia_salida_nombre || '-'}</td></tr>
      ` : ''}
    </table>

    <!-- REGLAMENTO + FIRMA DEL OPERADOR debajo de ACEPTADO -->
    <div style="background:#f1f5f9;padding:10px;border:1px solid #ddd;margin-bottom:12px;font-size:8px;">
      <p style="margin:0 0 5px 0;font-weight:bold;color:#0A2540;">REGLAMENTO Y SEGURIDAD / 安全条例:</p>
      ${rulesHtml}
      <p style="margin:10px 0 5px 0;font-weight:bold;color:#0A2540;">DECLARACIONES DEL OPERADOR / 司机声明:</p>
      ${declsHtml}
      <p style="margin-top:8px;font-weight:bold;color:#16a34a;font-size:9px;">✓ ACEPTADO / 已接受</p>

      <!-- FIRMA DEL OPERADOR — va aquí, justo debajo de ACEPTADO -->
      <div style="margin-top:10px;display:flex;align-items:flex-end;gap:20px;">
        ${inlineSig(
          caseta.entry?.firma_operador,
          'Firma del Operador / 司机签字',
          caseta.entry?.chofer_nombre || ''
        )}
      </div>
    </div>

    <!-- FOTOS CASETA -->
    <div style="margin-bottom:15px;">
      ${getPhotoHtml(caseta.entry?.foto_frente_unidad, 'FRONTAL UNIDAD')}
      ${getPhotoHtml(caseta.entry?.foto_atras_caja, 'TRASERA CAJA 1')}
      ${caseta.entry?.tipo_unidad === 'full' ? getPhotoHtml(caseta.entry?.foto_atras_caja_2, 'TRASERA CAJA 2') : ''}
      ${getPhotoHtml(caseta.entry?.foto_id_chofer, 'ID CHOFER')}
      ${caseta.exit ? getPhotoHtml(caseta.exit.sello_vvtt_foto, 'SELLO VVTT 1') : ''}
      ${caseta.exit && caseta.entry?.tipo_unidad === 'full' ? getPhotoHtml(caseta.exit.sello_vvtt_foto_2, 'SELLO VVTT 2') : ''}
    </div>
  ` : `<p style="color:#666;font-style:italic;padding:10px;border:1px dashed #ddd;">${labels.noData}</p>`;

  // ─────────────────────────────────────────────────────────────────────────────
  // SECCIÓN 2 — INSPECCIONES
  // Firma del Inspector y del Supervisor: dentro de la tabla de la inspección
  // en la fila correspondiente a su nombre, en la celda de la derecha
  // ─────────────────────────────────────────────────────────────────────────────
  const inspectionSectionHtml = !hasInspections
    ? `<div style="padding:15px;border:2px dashed #f59e0b;background:#fffbeb;color:#92400e;border-radius:4px;margin-bottom:10px;">
        <p style="margin:0;font-weight:bold;font-size:10px;">⚠️ ${labels.noInspection}</p>
        <p style="margin:6px 0 0 0;font-size:9px;color:#b45309;">Placas registradas: ${caseta?.entry?.placas_unidad || 'N/D'}</p>
       </div>`
    : activeInspections.map((insp) => {
        const allDefs = [...INSPECTION_POINTS_19, ...INSPECTION_POINTS_9];

        const rows = (insp.points || []).map(pt => {
          const def = allDefs.find(d => d.number === pt.number);
          const bilingualName = def ? `${def.name_es} / ${def.name_zh}` : pt.name;
          return `
          <tr>
            <td style="padding:4px;border:1px solid #ddd;width:30px;text-align:center;">${pt.number}</td>
            <td style="padding:4px;border:1px solid #ddd;">${bilingualName}</td>
            <td style="padding:4px;border:1px solid #ddd;font-weight:bold;color:${pt.estado === 'bueno' ? '#16a34a' : pt.estado === 'malo' ? '#dc2626' : '#666'};">
              ${pt.estado === 'bueno' ? labels.good : pt.estado === 'malo' ? labels.bad : 'N/A'}
            </td>
            <td style="padding:4px;border:1px solid #ddd;">${pt.comentarios || '-'}
              ${pt.photo && (pt.photo.startsWith('data:image') || pt.photo.startsWith('http'))
                ? `<br/><img src="${pt.photo}" style="max-height:90px;max-width:220px;object-fit:contain;border:1px solid #ddd;margin-top:3px;" />`
                : ''}
            </td>
          </tr>
          `;
        }).join('');

        const approvalColor = insp.approval_status === 'aprobada' ? '#16a34a'
          : insp.approval_status === 'rechazada' ? '#dc2626' : '#f59e0b';
        const approvalLabel = insp.approval_status === 'aprobada' ? labels.approved
          : insp.approval_status === 'rechazada' ? labels.rejected : labels.pending;

        const supervisorName = (insp as any).approved_by_name || (insp as any).approved_by || '';
        const supervisorSig  = (insp as any).approved_by_signature || (insp as any).approved_sig || '';

        return `
        <div style="margin-bottom:20px;border:1px solid #0A2540;padding:10px;page-break-inside:avoid;">
          <p style="font-weight:bold;background:#e8f0fe;padding:6px;margin:-10px -10px 10px -10px;color:#0A2540;border-bottom:2px solid #0A2540;">
            ${insp.inspection_type === '9_puntos_contenedor' ? '9 PUNTOS / 9点检查' : '19 PUNTOS / 19点检查'}
            — ${insp.numero_trailer || '-'} — ${insp.placas_unidad || '-'}
          </p>

          <!-- Tabla resumen: resultado, aprobación, compañía, precinto, fecha -->
          <!-- Inspector y Supervisor: con firma en la celda derecha de su nombre -->
          <table style="width:100%;border-collapse:collapse;margin-bottom:10px;">
            <tr>
              <td style="padding:6px;border:1px solid #ddd;background:#f9fafb;width:38%;"><b>${labels.result}</b></td>
              <td style="padding:6px;border:1px solid #ddd;">
                <span style="background:${insp.status_general === 'bueno' ? '#16a34a' : '#dc2626'};color:#FFF;padding:2px 8px;font-weight:bold;font-size:9px;border-radius:3px;">
                  ${insp.status_general === 'bueno' ? labels.good : labels.bad}
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>Aprobación / 批准</b></td>
              <td style="padding:6px;border:1px solid #ddd;">
                <span style="background:${approvalColor};color:#FFF;padding:2px 8px;font-weight:bold;font-size:9px;border-radius:3px;">${approvalLabel}</span>
                ${(insp as any).approval_note ? `<br/><span style="font-size:8px;color:#555;margin-top:2px;display:block;">${(insp as any).approval_note}</span>` : ''}
              </td>
            </tr>
            <tr>
              <td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>Compañía / 运输公司</b></td>
              <td style="padding:6px;border:1px solid #ddd;">${(insp as any).compania_transportista || '-'}</td>
            </tr>
            <tr>
              <td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>Precinto / 铅封</b></td>
              <td style="padding:6px;border:1px solid #ddd;">${(insp as any).numero_precinto || '-'} &nbsp;|&nbsp; Sello alta seg.: ${(insp as any).sello_alta_seguridad || '-'}</td>
            </tr>
            <tr>
              <td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>Fecha Inspección / 检查日期</b></td>
              <td style="padding:6px;border:1px solid #ddd;">${safeDate((insp as any).fecha_hora || insp.created_at)}</td>
            </tr>

            <!-- INSPECTOR: nombre + firma en misma fila -->
            <tr>
              <td style="padding:6px;border:1px solid #ddd;background:#f9fafb;vertical-align:middle;"><b>${labels.inspector}</b></td>
              <td style="padding:6px;border:1px solid #ddd;">
                <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                  <span style="font-size:9px;font-weight:600;">${insp.inspector_nombre || '-'}</span>
                  ${inlineSig(insp.inspector_firma, 'Firma Inspector / 检查员签字')}
                </div>
              </td>
            </tr>

            <!-- SUPERVISOR: nombre + firma en misma fila (solo si fue aprobada/rechazada) -->
            <tr>
              <td style="padding:6px;border:1px solid #ddd;background:#f9fafb;vertical-align:middle;"><b>${labels.supervisor}</b></td>
              <td style="padding:6px;border:1px solid #ddd;">
                ${supervisorName
                  ? `<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                      <span style="font-size:9px;font-weight:600;">${supervisorName}</span>
                      ${inlineSig(supervisorSig, 'Firma Supervisor / 主管签字')}
                     </div>`
                  : `<span style="color:#aaa;font-size:8px;font-style:italic;">Pendiente de aprobación / 待批准</span>`
                }
              </td>
            </tr>
          </table>

          <!-- Tabla de puntos de inspección -->
          <table style="width:100%;border-collapse:collapse;margin-bottom:10px;">
            <tr style="background:#e8f0fe;font-weight:bold;">
              <td style="padding:4px;border:1px solid #ddd;width:30px;text-align:center;">#</td>
              <td style="padding:4px;border:1px solid #ddd;">Punto de Inspección / 检查点</td>
              <td style="padding:4px;border:1px solid #ddd;width:90px;">Estado / 状态</td>
              <td style="padding:4px;border:1px solid #ddd;">Comentarios / 备注</td>
            </tr>
            ${rows}
          </table>
        </div>
        `;
      }).join('');

  // ─────────────────────────────────────────────────────────────────────────────
  // SECCIÓN 3 — EMBARQUE
  // Firma del Almacenista y Guardia: en la celda derecha de su nombre en la tabla
  // ─────────────────────────────────────────────────────────────────────────────
  const shippingHtml = embarque ? `
    <table style="width:100%;border-collapse:collapse;margin-bottom:12px;">
      <tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;width:38%;"><b>Cliente / 客户</b></td><td style="padding:6px;border:1px solid #ddd;">${embarque.cliente || '-'}</td></tr>
      <tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>Operador / 操作员</b></td><td style="padding:6px;border:1px solid #ddd;">${embarque.operador || '-'}</td></tr>
      <tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>Línea Transporte / 运输线路</b></td><td style="padding:6px;border:1px solid #ddd;">${embarque.linea_transporte || '-'}</td></tr>
      <tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>${labels.plates}</b></td><td style="padding:6px;border:1px solid #ddd;">${embarque.placas_unidad || '-'}</td></tr>
      <tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>${labels.box}</b></td><td style="padding:6px;border:1px solid #ddd;">${embarque.numero_caja || '-'}</td></tr>
      <tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>Pallets / 托盘数量</b></td><td style="padding:6px;border:1px solid #ddd;">${embarque.numero_pallets || '-'}</td></tr>
      <tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>${labels.seal}</b></td><td style="padding:6px;border:1px solid #ddd;">${embarque.numero_sello || '-'}</td></tr>
      <tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>No. Económico / 经济号</b></td><td style="padding:6px;border:1px solid #ddd;">${embarque.numero_economico || '-'}</td></tr>
      <tr><td style="padding:6px;border:1px solid #ddd;background:#f9fafb;"><b>Observaciones / 备注</b></td><td style="padding:6px;border:1px solid #ddd;">${embarque.observaciones || '-'}</td></tr>

      <!-- ALMACENISTA: nombre + firma en misma celda -->
      <tr>
        <td style="padding:6px;border:1px solid #ddd;background:#f9fafb;vertical-align:middle;"><b>Almacenista / 仓管员</b></td>
        <td style="padding:6px;border:1px solid #ddd;">
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
            <span style="font-size:9px;font-weight:600;">${embarque.almacenista || '-'}</span>
            ${inlineSig(embarque.firma_almacenista, 'Firma Almacenista / 仓管员签字')}
          </div>
        </td>
      </tr>

      <!-- GUARDIA: nombre + firma en misma celda -->
      <tr>
        <td style="padding:6px;border:1px solid #ddd;background:#f9fafb;vertical-align:middle;"><b>Guardia / 警卫</b></td>
        <td style="padding:6px;border:1px solid #ddd;">
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
            <span style="font-size:9px;font-weight:600;">${embarque.nombre_guardia || '-'}</span>
            ${inlineSig(embarque.firma_guardia, 'Firma Guardia / 警卫签字')}
          </div>
        </td>
      </tr>
    </table>

    <!-- Fotos embarque -->
    <div style="margin-bottom:10px;">
      ${getPhotoHtml(embarque.foto_inicio_carga, 'INICIO CARGA')}
      ${getPhotoHtml(embarque.foto_media_carga, 'MEDIA CARGA')}
      ${getPhotoHtml(embarque.foto_final_carga, 'FINAL CARGA')}
    </div>
  ` : `<p style="color:#666;font-style:italic;padding:10px;border:1px dashed #ddd;">${labels.noData}</p>`;

  const isCarga = caseta?.entry?.condicion_carga !== 'descarga';

  // ─────────────────────────────────────────────────────────────────────────────
  // HTML FINAL
  // ─────────────────────────────────────────────────────────────────────────────
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Reporte Consolidado NAF</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; padding: 20px; font-size: 10px; line-height: 1.4; background: #FFF; margin: 0; }
    .header { border-bottom: 3px solid #0A2540; padding-bottom: 12px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: flex-end; }
    .section-title { background: #0A2540; color: #fff; padding: 7px 12px; margin-top: 18px; margin-bottom: 10px; font-size: 11px; font-weight: bold; letter-spacing: 0.5px; }
    table { width: 100%; border-collapse: collapse; }
    td { vertical-align: top; }
    @media print {
      body { padding: 10px; font-size: 9px; }
      .section-title { margin-top: 12px; }
      .no-break { page-break-inside: avoid; }
    }
  </style>
</head>
<body>

  <!-- HEADER -->
  <div class="header">
    <div>
      <div style="background:#0A2540;color:white;padding:8px 18px;font-size:22px;font-weight:900;display:inline-block;letter-spacing:2px;">NAF</div>
      <div style="font-weight:bold;margin-top:4px;font-size:9px;color:#555;letter-spacing:1px;">NORTH AMERICA FLOORING</div>
    </div>
    <div style="text-align:right;">
      <h1 style="margin:0;font-size:15px;color:#0A2540;font-weight:900;">${labels.title}</h1>
      <p style="margin:3px 0 0 0;color:#666;font-size:9px;">${labels.generated}: ${new Date().toLocaleString('es-MX')}</p>
      ${caseta ? `<p style="margin:2px 0 0 0;color:#0A2540;font-size:9px;font-weight:bold;">Placas: ${caseta.entry?.placas_unidad || '-'} &nbsp;|&nbsp; Chofer: ${caseta.entry?.chofer_nombre || '-'}</p>` : ''}
    </div>
  </div>

  <!-- STATUS BANNER -->
  ${hasInspections && firstInsp
    ? `<div style="padding:8px;text-align:center;font-weight:bold;font-size:12px;margin-bottom:15px;border-radius:3px;color:#FFF;
        background:${firstInsp.approval_status === 'aprobada' ? '#16a34a' : firstInsp.approval_status === 'rechazada' ? '#dc2626' : firstInsp.status_general === 'bueno' ? '#2563eb' : '#f59e0b'};">
        ${firstInsp.approval_status === 'aprobada' ? '✓ INSPECCIÓN APROBADA / 检查已批准'
          : firstInsp.approval_status === 'rechazada' ? '✗ INSPECCIÓN RECHAZADA / 检查已拒绝'
          : firstInsp.status_general === 'bueno' ? '◉ INSPECCIÓN OK — PENDIENTE APROBACIÓN / 检查正常—待批准'
          : '⚠ INSPECCIÓN CON FALLAS / 检查有故障'}
       </div>`
    : `<div style="padding:8px;text-align:center;font-weight:bold;font-size:11px;margin-bottom:15px;border-radius:3px;background:#f59e0b;color:#FFF;">
        ⚠ SIN INSPECCIÓN DIGITAL VINCULADA / 无数字检验记录
       </div>`
  }

  <!-- SECCIÓN 1: CASETA (incluye firma del operador en reglamento) -->
  <div class="section-title">${labels.sectionCaseta}</div>
  ${casetaHtml}

  <!-- SECCIÓN 2: INSPECCIÓN (firmas de inspector y supervisor en tabla) -->
  <div class="section-title">${labels.sectionInspection}</div>
  ${inspectionSectionHtml}

  <!-- SECCIÓN 3: EMBARQUE (firmas de almacenista y guardia en tabla) -->
  ${isCarga ? `
  <div class="section-title">${labels.sectionShipping}</div>
  ${shippingHtml}
  ` : `<div style="padding:8px;background:#f1f5f9;border:1px solid #ddd;color:#666;font-size:9px;margin-top:15px;">
        Unidad de descarga — no aplica ticket de embarque. / 卸货车辆 — 不适用运输单。
       </div>`}

  <!-- FOOTER -->
  <div style="margin-top:30px;border-top:1px solid #eee;padding-top:10px;text-align:center;color:#aaa;font-size:8px;">
    © ${new Date().getFullYear()} Branco Industries — Sistema SRIUC / SRIUC 系统 &nbsp;|&nbsp; Documento generado el ${new Date().toLocaleString('es-MX')}
  </div>

</body>
</html>
  `;
};

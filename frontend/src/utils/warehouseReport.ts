import { DAMAGE_SURFACES, countDamages, DamageMap } from '@/src/components/BoxDamageMap';
import {
  ChecklistState,
  CHECKLIST_FISICO_MECANICO, CHECKLIST_CUIDADO_MERCANCIA, CHECKLIST_ASEGURAMIENTO_CARGA,
} from '@/src/components/WarehouseChecklist';

/**
 * Generador del REPORTE CONSOLIDADO DE ALMACÉN (HTML → PDF).
 * Mismo estilo visual que el reporte consolidado C-TPAT (reportGenerator.ts):
 * navy #0A2540, celdas con borde, fotos con etiqueta, firmas inline.
 */

export interface WarehouseReportData {
  id?: string;
  created_at?: string;
  almacenista?: string;
  area?: string;
  cliente?: string;
  operador?: string;
  linea_transporte?: string;
  placas_unidad?: string;
  placas_caja?: string;
  numero_caja?: string;
  hora_inicio?: string;
  hora_fin?: string;
  observaciones?: string;
  foto_techo?: string;
  foto_piso?: string;
  foto_pared_izq?: string;
  foto_pared_der?: string;
  damage_map?: DamageMap;
  damage_notes?: Record<string, string>;
  materiales?: Array<{ descripcion?: string; tipo?: string; cantidad?: string; observaciones?: string; fotos?: string[] }>;
  checklist_fisico_mecanico?: ChecklistState;
  checklist_cuidado_mercancia?: ChecklistState;
  checklist_aseguramiento_carga?: ChecklistState;
  sello_numero?: string;
  firma_almacenista?: string;
  firma_supervisor?: string;
  supervisor_nombre?: string;
  [k: string]: any;
}

const safeDate = (d: any): string => {
  if (!d) return '-';
  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) return String(d);
    // Zona fija Monterrey UTC-6 — a prueba de DST/tzdata viejo
    return date.toLocaleString('es-MX', {
      timeZone: 'America/Monterrey',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false
    });
  } catch {
    return String(d);
  }
};

const validImg = (src?: string) => !!src && (src.startsWith('data:image') || src.startsWith('http'));

const inlineSig = (imgSrc: string | undefined, label: string, name?: string) => `
  <div style="text-align:center; padding:6px 10px; min-width:130px;">
    <div style="height:60px; display:flex; align-items:flex-end; justify-content:center; background:#FFF; border-bottom:2px solid #0A2540; margin-bottom:3px; min-width:120px;">
      ${validImg(imgSrc)
        ? `<img src="${imgSrc}" style="max-height:56px; max-width:150px; object-fit:contain;" />`
        : `<div style="width:120px; height:55px; background:#f5f5f5; display:flex; align-items:center; justify-content:center; color:#bbb; font-size:7px; border:1px dashed #ccc;">Sin firma</div>`
      }
    </div>
    <p style="margin:0; font-weight:bold; font-size:7.5px; color:#0A2540; text-transform:uppercase;">${label}</p>
    ${name ? `<p style="margin:1px 0 0 0; font-size:7px; color:#555;">${name}</p>` : ''}
  </div>
`;

const getPhotoHtml = (url: string | undefined, label: string) => {
  if (!validImg(url)) return '';
  return `
    <div style="display:inline-block; width:48%; margin:0.8%; vertical-align:top; border:1px solid #ddd; padding:8px; background:#FFF; text-align:center; box-sizing:border-box; border-radius:4px;">
      <p style="margin:0 0 6px 0; font-size:9px; font-weight:bold; color:#333; text-transform:uppercase; background:#f8f9fa; padding:3px;">${label}</p>
      <div style="width:100%; background:#fafafa; border:1px solid #eee; overflow:hidden; line-height:0;">
        <img src="${url}" style="width:100%; height:auto; display:block;" />
      </div>
    </div>
  `;
};

const infoCell = (label: string, value: any) => `
  <td style="border:1px solid #cbd5e1; padding:4px 6px; font-size:9px; background:#f8fafc; font-weight:bold; color:#0A2540; width:14%; white-space:nowrap;">${label}</td>
  <td style="border:1px solid #cbd5e1; padding:4px 6px; font-size:9px; color:#111;">${value ?? '-'}</td>
`;

/** Mapa de daños: réplica HTML de la caja desdoblada (BoxDamageMap) */
const SURF = {
  stroke: '#334155', fillBox: '#FFFFFF', fillDetail: '#F1F5F9', fillDark: '#334155',
  gridLine: '#E2E8F0', borderStrong: '#CBD5E1',
  bad: 'rgba(239,68,68,0.55)', badBorder: '#EF4444', badText: '#FFFFFF',
  labelBg: '#F1F5F9', labelBadBg: '#FEE2E2', labelText: '#334155', labelBadText: '#991B1B',
};

const SURFACE_LABELS_BILINGUAL: Record<string, string> = {
  frente: 'FRENTE / 前壁',
  puertas: 'PUERTAS / 车门',
  pared_izq: 'PARED IZQ. / 左侧壁',
  pared_der: 'PARED DER. / 右侧壁',
  techo: 'TECHO / 顶棚',
  piso: 'PISO / 地板',
};

// ─── Ilustraciones técnicas del remolque (idénticas a BoxDamageMap.tsx) ───

const svgFrente = () => `
<svg viewBox="0 0 200 170" width="100%" height="100%" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="45" y="8" width="110" height="28" rx="3" fill="${SURF.fillDetail}" stroke="${SURF.stroke}" stroke-width="2"/>
  ${[60, 80, 100, 120, 140].map(x => `<line x1="${x}" y1="12" x2="${x}" y2="32" stroke="${SURF.gridLine}" stroke-width="1.2"/>`).join('')}
  <rect x="15" y="34" width="170" height="110" rx="4" fill="${SURF.fillBox}" stroke="${SURF.stroke}" stroke-width="2.5"/>
  <line x1="100" y1="34" x2="100" y2="144" stroke="${SURF.gridLine}" stroke-width="1" stroke-dasharray="4,4"/>
  <rect x="15" y="144" width="170" height="6" fill="${SURF.fillDark}" opacity="0.7"/>
  <rect x="28" y="150" width="9" height="18" fill="${SURF.fillDark}"/>
  <rect x="155" y="150" width="9" height="18" fill="${SURF.fillDark}"/>
</svg>`;

const svgPuertas = () => `
<svg viewBox="0 0 200 170" width="100%" height="100%" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="15" y="15" width="170" height="140" rx="4" fill="${SURF.fillBox}" stroke="${SURF.stroke}" stroke-width="2.5"/>
  <line x1="100" y1="15" x2="100" y2="155" stroke="${SURF.stroke}" stroke-width="2"/>
  <rect x="90" y="68" width="5" height="38" rx="2" fill="${SURF.fillDark}"/>
  <rect x="105" y="68" width="5" height="38" rx="2" fill="${SURF.fillDark}"/>
  ${[30, 85, 140].map(y => `<rect x="12" y="${y}" width="7" height="14" fill="${SURF.fillDark}"/><rect x="181" y="${y}" width="7" height="14" fill="${SURF.fillDark}"/>`).join('')}
  <rect x="15" y="150" width="170" height="5" fill="${SURF.fillDark}" opacity="0.7"/>
</svg>`;

const svgSide = (mirrored?: boolean) => {
  const content = `
    <path d="M6,74 L6,50 L34,26 L64,26 L64,74 Z" fill="${SURF.fillDetail}" stroke="${SURF.stroke}" stroke-width="2"/>
    <line x1="36" y1="26" x2="20" y2="50" stroke="${SURF.stroke}" stroke-width="1.5"/>
    <rect x="2" y="74" width="66" height="9" fill="${SURF.fillDark}" opacity="0.85"/>
    <rect x="20" y="83" width="372" height="7" fill="${SURF.fillDark}" opacity="0.8"/>
    <rect x="68" y="14" width="324" height="72" rx="4" fill="${SURF.fillBox}" stroke="${SURF.stroke}" stroke-width="2.5"/>
    <line x1="68" y1="36" x2="392" y2="36" stroke="${SURF.gridLine}" stroke-width="1"/>
    <line x1="68" y1="60" x2="392" y2="60" stroke="${SURF.gridLine}" stroke-width="1"/>
    <line x1="376" y1="14" x2="376" y2="86" stroke="${SURF.gridLine}" stroke-width="1.5"/>
    <circle cx="44" cy="96" r="13" fill="${SURF.fillDark}"/>
    <circle cx="44" cy="96" r="5" fill="${SURF.fillDetail}"/>
    ${[300, 328, 356].map(cx => `<circle cx="${cx}" cy="96" r="13" fill="${SURF.fillDark}"/><circle cx="${cx}" cy="96" r="5" fill="${SURF.fillDetail}"/>`).join('')}
  `;
  return `
<svg viewBox="0 0 400 110" width="100%" height="100%" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
  ${mirrored ? `<g transform="scale(-1,1) translate(-400,0)">${content}</g>` : content}
</svg>`;
};

const svgTecho = () => `
<svg viewBox="0 0 400 100" width="100%" height="100%" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M0,38 L18,24 L18,76 L0,66 Z" fill="${SURF.fillDetail}" opacity="0.5" stroke="${SURF.stroke}" stroke-width="1" stroke-dasharray="3,3"/>
  <rect x="20" y="15" width="360" height="70" rx="6" fill="${SURF.fillBox}" stroke="${SURF.stroke}" stroke-width="2.5"/>
  <rect x="20" y="15" width="46" height="70" rx="3" fill="${SURF.fillDetail}" stroke="${SURF.stroke}" stroke-width="2"/>
  <line x1="30" y1="22" x2="30" y2="78" stroke="${SURF.gridLine}" stroke-width="1"/>
  <line x1="40" y1="22" x2="40" y2="78" stroke="${SURF.gridLine}" stroke-width="1"/>
  <line x1="50" y1="22" x2="50" y2="78" stroke="${SURF.gridLine}" stroke-width="1"/>
  ${[140, 220, 300].map(cx => `<circle cx="${cx}" cy="50" r="6" fill="none" stroke="${SURF.stroke}" stroke-width="1.5"/>`).join('')}
  <line x1="66" y1="50" x2="380" y2="50" stroke="${SURF.gridLine}" stroke-width="1" stroke-dasharray="4,4"/>
</svg>`;

const svgPiso = () => {
  const ribs = Array.from({ length: 21 }).map((_, i) => {
    const x = 30 + i * 16;
    return x > 372 ? '' : `<line x1="${x}" y1="17" x2="${x}" y2="83" stroke="${SURF.gridLine}" stroke-width="1"/>`;
  }).join('');
  return `
<svg viewBox="0 0 400 100" width="100%" height="100%" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="20" y="15" width="360" height="70" rx="6" fill="${SURF.fillBox}" stroke="${SURF.stroke}" stroke-width="2.5"/>
  ${ribs}
  <rect x="60" y="83" width="9" height="16" fill="${SURF.fillDark}"/>
  <rect x="90" y="83" width="9" height="16" fill="${SURF.fillDark}"/>
  <line x1="286" y1="85" x2="370" y2="85" stroke="${SURF.stroke}" stroke-width="2"/>
  ${[300, 328, 356].map(cx => `<circle cx="${cx}" cy="90" r="13" fill="${SURF.fillDark}"/><circle cx="${cx}" cy="90" r="5" fill="${SURF.fillDetail}"/>`).join('')}
</svg>`;
};

const illustrationFor = (key: string) => {
  switch (key) {
    case 'pared_izq': return svgSide(false);
    case 'pared_der': return svgSide(true);
    case 'techo': return svgTecho();
    case 'piso': return svgPiso();
    case 'frente': return svgFrente();
    case 'puertas': return svgPuertas();
    default: return '';
  }
};

// ─── Panel de superficie: ilustración real + rejilla de zonas dañadas ───

const surfacePanelHtml = (key: string, zones: boolean[], wide: boolean, paddingBottomPct: number) => {
  const label = SURFACE_LABELS_BILINGUAL[key] || key.toUpperCase();
  const damaged = zones.filter(Boolean).length;
  const cols = wide ? 6 : 2;
  const rows = wide ? 1 : 3;

  const gridHtml = Array.from({ length: rows }).map((_, r) => `
    <div style="flex:1; display:flex; flex-direction:row;">
      ${Array.from({ length: cols }).map((__, c) => {
        const idx = wide ? c : r * cols + c;
        const isBad = !!zones[idx];
        return `<div style="flex:1; margin:1px; display:flex; align-items:center; justify-content:center; ${isBad ? `background:${SURF.bad}; border:1px solid ${SURF.badBorder};` : ''}">
          ${isBad ? `<span style="font-size:9px; font-weight:900; color:${SURF.badText};">${idx + 1}</span>` : ''}
        </div>`;
      }).join('')}
    </div>
  `).join('');

  return `
  <div style="width:100%; margin-bottom:8px;">
    <div style="background:${damaged > 0 ? SURF.labelBadBg : SURF.labelBg}; border:1px solid ${SURF.borderStrong}; border-bottom:none; padding:4px 8px; display:flex; justify-content:space-between; align-items:center;">
      <span style="font-size:9px; font-weight:900; letter-spacing:0.5px; color:${damaged > 0 ? SURF.labelBadText : SURF.labelText};">${label}</span>
      ${damaged > 0 ? `<span style="font-size:8px; font-weight:900; color:${SURF.labelBadText};">${damaged} DAÑO(S) / ${damaged}处损坏</span>` : ''}
    </div>
    <div style="position:relative; width:100%; padding-bottom:${paddingBottomPct}%; border:1px solid ${damaged > 0 ? SURF.badBorder : SURF.borderStrong}; background:#FFFFFF; overflow:hidden;">
      <div style="position:absolute; inset:0;">${illustrationFor(key)}</div>
      <div style="position:absolute; inset:0; display:flex; flex-direction:${wide ? 'row' : 'column'};">
        ${gridHtml}
      </div>
    </div>
  </div>`;
};

const getDamageMapHtml = (map: DamageMap | undefined, notes: Record<string, string> | undefined) => {
  const zonas = (k: string) => (Array.isArray(map?.[k]) && map[k].length === 6 ? map[k] : Array(6).fill(false));

  const noteRows = DAMAGE_SURFACES
    .filter(s => (notes?.[s.key] || '').trim())
    .map(s => `<tr>${infoCell(`NOTA ${SURFACE_LABELS_BILINGUAL[s.key] || s.label}`, (notes?.[s.key] || '').trim())}</tr>`)
    .join('');

  return `
    <div style="display:flex; gap:8px;">
      <div style="flex:1;">${surfacePanelHtml('frente', zonas('frente'), false, 85)}</div>
      <div style="flex:1;">${surfacePanelHtml('puertas', zonas('puertas'), false, 85)}</div>
    </div>
    ${surfacePanelHtml('pared_izq', zonas('pared_izq'), true, 27.5)}
    ${surfacePanelHtml('pared_der', zonas('pared_der'), true, 27.5)}
    ${surfacePanelHtml('techo', zonas('techo'), true, 25)}
    ${surfacePanelHtml('piso', zonas('piso'), true, 25)}
    <div style="display:flex; gap:16px; margin:6px 2px; font-size:8px; color:#64748B; font-weight:700;">
      <span>■ ZONA OK / 正常区域</span><span style="color:#EF4444;">■ ZONA DAÑADA / 损坏区域</span>
    </div>
    ${noteRows ? `<table style="width:100%; border-collapse:collapse; margin-top:4px;">${noteRows}</table>` : ''}
  `;
};

const getChecklistHtml = (items: { key: string; label: string }[], state: ChecklistState | undefined) => {
  const rows = items.map((it) => {
    const entry = (state && state[it.key]) || { valor: '', nota: '' };
    const valor = entry.valor || '—';
    const bg = valor === 'CUMPLE' ? '#10B981' : valor === 'NO_CUMPLE' ? '#EF4444' : '#94A3B8';
    const badge = `<span style="background:${bg}; color:#FFF; font-size:8px; font-weight:900; padding:2px 8px; border-radius:3px; letter-spacing:0.5px;">${valor === 'NO_CUMPLE' ? 'NO CUMPLE' : valor}</span>`;
    const nota = entry.nota ? `<div style="font-size:8px; color:#B91C1C; margin-top:2px; font-style:italic;">${entry.nota}</div>` : '';
    return `
      <tr>
        <td style="border:1px solid #cbd5e1; padding:5px 6px; font-size:9px; width:78%;">${it.label}${nota}</td>
        <td style="border:1px solid #cbd5e1; padding:5px 6px; text-align:center; width:22%;">${badge}</td>
      </tr>
    `;
  }).join('');
  return `<table style="width:100%; border-collapse:collapse; table-layout:fixed;">${rows}</table>`;
};

const getMaterialPhotosHtml = (materiales: WarehouseReportData['materiales']) => {
  const conFotos = (materiales || []).filter(m => Array.isArray(m.fotos) && m.fotos.length > 0);
  if (conFotos.length === 0) return '';
  const blocks = conFotos.map((m, idx) => {
    const imgs = (m.fotos || []).filter(f => validImg(f)).map(f => `
      <img src="${f}" style="width:80px; height:80px; object-fit:cover; border:1px solid #ddd; border-radius:3px; margin:2px;" />
    `).join('');
    return `
      <div style="margin-bottom:6px;">
        <p style="margin:0 0 3px 0; font-size:8px; font-weight:bold; color:#0A2540;">MATERIAL ${idx + 1} — ${(m.descripcion || m.tipo || '').toUpperCase()}</p>
        <div style="display:flex; flex-wrap:wrap;">${imgs}</div>
      </div>
    `;
  }).join('');
  return `<div style="margin-top:8px;">${blocks}</div>`;
};

export const generateWarehouseReportHtml = (d: WarehouseReportData): string => {
  const totalDanos = countDamages(d.damage_map);
  const materiales = Array.isArray(d.materiales) ? d.materiales.filter(m => m && (m.descripcion || m.cantidad)) : [];
  const materialRows = materiales.map((m, idx) => `
    <tr>
      <td style="border:1px solid #cbd5e1; padding:4px 6px; font-size:9px; text-align:center;">${idx + 1}</td>
      <td style="border:1px solid #cbd5e1; padding:4px 6px; font-size:9px;">${(m.descripcion || '-').toUpperCase()}</td>
      <td style="border:1px solid #cbd5e1; padding:4px 6px; font-size:9px; text-align:center;">${(m.tipo || '-').toUpperCase()}</td>
      <td style="border:1px solid #cbd5e1; padding:4px 6px; font-size:9px; text-align:center;">${m.cantidad ?? '-'}</td>
      <td style="border:1px solid #cbd5e1; padding:4px 6px; font-size:9px;">${(m.observaciones || '-').toUpperCase()}</td>
    </tr>
  `).join('');

  const emptyRow = `<tr><td colspan="5" style="border:1px solid #cbd5e1; padding:6px; font-size:9px; text-align:center; color:#94A3B8;">SIN MATERIALES REGISTRADOS / 无材料记录</td></tr>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>Reporte de Almacén — ${d.placas_unidad || ''}</title>
<style>
  @page { size: letter portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color:#111; margin:0; padding:8px; }
</style>
</head>
<body>
  <!-- Encabezado -->
  <div style="border:2px solid #0A2540; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
    <div>
      <h1 style="margin:0; font-size:16px; color:#0A2540; letter-spacing:1px;">NAF — SRIUC</h1>
      <h2 style="margin:2px 0 0 0; font-size:12px; color:#0A2540; font-weight:normal;">Sistema de Registro e Inspección de Unidades de Carga</h2>
    </div>
    <div style="text-align:right;">
      <p style="margin:0; font-size:11px; font-weight:bold; color:#0A2540;">REPORTE DE ALMACÉN / 仓库报告</p>
      <p style="margin:2px 0 0 0; font-size:8px; color:#555;">Generado / 生成日期: ${safeDate(new Date().toISOString())}</p>
      ${d.created_at ? `<p style="margin:1px 0 0 0; font-size:8px; color:#555;">Registro / 记录时间: ${safeDate(d.created_at)}</p>` : ''}
    </div>
  </div>

  <!-- 1. Datos de la unidad -->
  <h3 style="font-size:10px; background:#0A2540; color:#FFF; padding:5px 8px; margin:10px 0 0 0; letter-spacing:1px;">1. DATOS DE UNIDAD Y ALMACÉN / 车辆及仓库信息</h3>
  <table style="width:100%; border-collapse:collapse; table-layout:fixed;">
    <tr>${infoCell('PLACAS UNIDAD / 车牌号', (d.placas_unidad || '-').toUpperCase())}${infoCell('NO. CAJA / 货箱号', (d.numero_caja || '-').toUpperCase())}${infoCell('PLACAS CAJA / 货箱车牌', (d.placas_caja || '-').toUpperCase())}</tr>
    <tr>${infoCell('OPERADOR / 操作员', (d.operador || '-').toUpperCase())}${infoCell('LÍNEA TRANSP. / 运输线路', (d.linea_transporte || '-').toUpperCase())}${infoCell('CLIENTE / 客户', (d.cliente || '-').toUpperCase())}</tr>
    <tr>${infoCell('ALMACENISTA / 仓管员', (d.almacenista || '-').toUpperCase())}${infoCell('ÁREA / 区域', (d.area || '-').toUpperCase())}${infoCell('DAÑOS TOTALES / 总损坏数', totalDanos > 0 ? `<span style="color:#B91C1C; font-weight:900;">${totalDanos} ZONA(S) / 处损坏</span>` : '0')}</tr>
    <tr>${infoCell('HORA INICIO / 开始时间', d.hora_inicio || '-')}${infoCell('HORA FIN / 结束时间', d.hora_fin || '-')}${infoCell('MATERIALES / 材料数量', `${materiales.length}`)}</tr>
  </table>

  <!-- 2. Evidencia fotográfica -->
  <h3 style="font-size:10px; background:#0A2540; color:#FFF; padding:5px 8px; margin:10px 0 0 0; letter-spacing:1px;">2. EVIDENCIA FOTOGRÁFICA DE LA CAJA / 货箱照片证据</h3>
  <div style="text-align:center;">
    ${getPhotoHtml(d.foto_techo, 'TECHO / 顶棚')}
    ${getPhotoHtml(d.foto_piso, 'PISO / 地板')}
    ${getPhotoHtml(d.foto_pared_izq, 'PARED IZQUIERDA / 左侧壁')}
    ${getPhotoHtml(d.foto_pared_der, 'PARED DERECHA / 右侧壁')}
    ${!validImg(d.foto_techo) && !validImg(d.foto_piso) && !validImg(d.foto_pared_izq) && !validImg(d.foto_pared_der)
      ? '<p style="font-size:9px; color:#94A3B8; margin:8px 0;">SIN FOTOGRAFÍAS REGISTRADAS / 无照片记录</p>' : ''}
  </div>

  <!-- 3. Mapa de daños -->
  <h3 style="font-size:10px; background:#0A2540; color:#FFF; padding:5px 8px; margin:10px 0 0 0; letter-spacing:1px;">3. MAPA DE DAÑOS DE LA CAJA / 货箱损坏图 ${totalDanos > 0 ? `<span style="background:#EF4444; padding:1px 6px; font-size:8px;">${totalDanos} ZONA(S) DAÑADA(S) / 处损坏区域</span>` : '<span style="background:#10B981; padding:1px 6px; font-size:8px;">SIN DAÑOS / 无损坏</span>'}</h3>
  <div style="padding:6px 0;">
    ${getDamageMapHtml(d.damage_map, d.damage_notes)}
  </div>

  <!-- 4. Inspección físico-mecánica -->
  <h3 style="font-size:10px; background:#0A2540; color:#FFF; padding:5px 8px; margin:10px 0 0 0; letter-spacing:1px;">4. INSPECCIÓN FÍSICO-MECÁNICA CONTENEDOR/CAJA / 集装箱/货箱机械检查</h3>
  ${getChecklistHtml(CHECKLIST_FISICO_MECANICO, d.checklist_fisico_mecanico)}

  <!-- 5. Verificación del cuidado de la mercancía -->
  <h3 style="font-size:10px; background:#0A2540; color:#FFF; padding:5px 8px; margin:10px 0 0 0; letter-spacing:1px;">5. VERIFICACIÓN DEL CUIDADO DE LA MERCANCÍA / 货物保管检查</h3>
  ${getChecklistHtml(CHECKLIST_CUIDADO_MERCANCIA, d.checklist_cuidado_mercancia)}

  <!-- 6. Aseguramiento y sujeción de la carga -->
  <h3 style="font-size:10px; background:#0A2540; color:#FFF; padding:5px 8px; margin:10px 0 0 0; letter-spacing:1px;">6. ASEGURAMIENTO Y SUJECIÓN DE LA CARGA / 货物固定与紧固</h3>
  ${getChecklistHtml(CHECKLIST_ASEGURAMIENTO_CARGA, d.checklist_aseguramiento_carga)}
  ${d.sello_numero ? `<table style="width:100%; border-collapse:collapse; margin-top:4px;"><tr>${infoCell('NO. DE SELLO / 封条编号', d.sello_numero.toUpperCase())}<td style="border:1px solid #cbd5e1;"></td></tr></table>` : ''}

  <!-- 7. Lista de verificación de material -->
  <h3 style="font-size:10px; background:#0A2540; color:#FFF; padding:5px 8px; margin:10px 0 0 0; letter-spacing:1px;">7. LISTA DE VERIFICACIÓN DE MATERIAL CARGADO / 装载材料核对清单</h3>
  <table style="width:100%; border-collapse:collapse; table-layout:fixed;">
    <tr>
      <th style="border:1px solid #cbd5e1; background:#F1F5F9; padding:4px 6px; font-size:8px; width:5%;">#</th>
      <th style="border:1px solid #cbd5e1; background:#F1F5F9; padding:4px 6px; font-size:8px; width:35%;">DESCRIPCIÓN / 描述</th>
      <th style="border:1px solid #cbd5e1; background:#F1F5F9; padding:4px 6px; font-size:8px; width:12%;">TIPO / 类型</th>
      <th style="border:1px solid #cbd5e1; background:#F1F5F9; padding:4px 6px; font-size:8px; width:10%;">CANTIDAD / 数量</th>
      <th style="border:1px solid #cbd5e1; background:#F1F5F9; padding:4px 6px; font-size:8px; width:38%;">OBSERVACIONES / 备注</th>
    </tr>
    ${materialRows || emptyRow}
  </table>
  ${getMaterialPhotosHtml(materiales)}

  <!-- 8. Observaciones generales -->
  <h3 style="font-size:10px; background:#0A2540; color:#FFF; padding:5px 8px; margin:10px 0 0 0; letter-spacing:1px;">8. OBSERVACIONES GENERALES / 总体备注</h3>
  <table style="width:100%; border-collapse:collapse;">
    <tr><td style="border:1px solid #cbd5e1; padding:6px 8px; font-size:9px; min-height:40px;">${(d.observaciones || 'SIN OBSERVACIONES / 无备注').toUpperCase()}</td></tr>
  </table>

  <!-- 9. Firmas -->
  <h3 style="font-size:10px; background:#0A2540; color:#FFF; padding:5px 8px; margin:10px 0 0 0; letter-spacing:1px;">9. VALIDACIÓN Y FIRMAS / 验证与签字</h3>
  <div style="display:flex; justify-content:space-around; border:1px solid #cbd5e1; padding:8px 4px; margin-top:4px;">
    ${inlineSig(d.firma_almacenista, 'Firma Almacenista / 仓管员签字', d.almacenista)}
    ${inlineSig(d.firma_supervisor, 'Firma Supervisor / 主管签字', d.supervisor_nombre)}
  </div>

  <p style="text-align:center; font-size:7px; color:#94A3B8; margin-top:10px;">SRIUC System — Branco Industries © 2026 · Reporte de Almacén / 仓库报告</p>
</body>
</html>`;
};

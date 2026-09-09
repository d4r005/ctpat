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
const getDamageMapHtml = (map: DamageMap | undefined, notes: Record<string, string> | undefined) => {
  const zonas = (k: string) => (Array.isArray(map?.[k]) && map[k].length === 6 ? map[k] : Array(6).fill(false));
  const panel = (k: string, label: string, width: string) => {
    const zs = zonas(k);
    const damagedCount = zs.filter(Boolean).length;
    const cells = zs.map((d, i) => `
      <td style="width:33.33%; height:34px; border:1px solid ${d ? '#EF4444' : '#cbd5e1'}; background:${d ? '#EF4444' : '#F1F5F9'}; text-align:center; font-size:9px; font-weight:bold; color:${d ? '#FFF' : '#94A3B8'};">${i + 1}</td>
    `).join('');
    return `
      <td style="padding:2px; vertical-align:top;">
        <table style="width:${width}; border-collapse:collapse; table-layout:fixed;">
          <tr><td colspan="3" style="border:1px solid #cbd5e1; background:${damagedCount > 0 ? '#FEE2E2' : '#F1F5F9'}; font-size:8px; font-weight:900; color:${damagedCount > 0 ? '#991B1B' : '#334155'}; padding:3px 4px; letter-spacing:0.5px;">${label}${damagedCount > 0 ? ` — ${damagedCount} DAÑO(S)` : ''}</td></tr>
          <tr>${cells.slice(0, 3)}</tr>
          <tr>${cells.slice(3)}</tr>
        </table>
      </td>
    `;
  };

  const noteRows = DAMAGE_SURFACES
    .filter(s => (notes?.[s.key] || '').trim())
    .map(s => `<tr>${infoCell(`NOTA ${s.label}`, (notes?.[s.key] || '').trim())}</tr>`)
    .join('');

  return `
    <table style="width:100%; border-collapse:collapse; table-layout:fixed;">
      <tr><td style="width:33.33%"></td>${panel('techo', 'TECHO', '100%')}<td style="width:33.33%"></td></tr>
      <tr>${panel('pared_izq', 'PARED IZQ.', '100%')}${panel('piso', 'PISO', '100%')}${panel('pared_der', 'PARED DER.', '100%')}</tr>
      <tr>${panel('frente', 'FRENTE', '99%')}${panel('puertas', 'PUERTAS', '99%')}<td></td></tr>
    </table>
    <div style="display:flex; gap:16px; margin:6px 2px; font-size:8px; color:#64748B; font-weight:700;">
      <span>■ ZONA OK (GRIS)</span><span style="color:#EF4444;">■ ZONA DAÑADA (ROJO)</span>
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

  const emptyRow = `<tr><td colspan="5" style="border:1px solid #cbd5e1; padding:6px; font-size:9px; text-align:center; color:#94A3B8;">SIN MATERIALES REGISTRADOS</td></tr>`;

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
      <p style="margin:0; font-size:11px; font-weight:bold; color:#0A2540;">REPORTE DE ALMACÉN</p>
      <p style="margin:2px 0 0 0; font-size:8px; color:#555;">Generado: ${safeDate(new Date().toISOString())}</p>
      ${d.created_at ? `<p style="margin:1px 0 0 0; font-size:8px; color:#555;">Registro: ${safeDate(d.created_at)}</p>` : ''}
    </div>
  </div>

  <!-- 1. Datos de la unidad -->
  <h3 style="font-size:10px; background:#0A2540; color:#FFF; padding:5px 8px; margin:10px 0 0 0; letter-spacing:1px;">1. DATOS DE UNIDAD Y ALMACÉN</h3>
  <table style="width:100%; border-collapse:collapse; table-layout:fixed;">
    <tr>${infoCell('PLACAS UNIDAD', (d.placas_unidad || '-').toUpperCase())}${infoCell('NO. CAJA', (d.numero_caja || '-').toUpperCase())}${infoCell('PLACAS CAJA', (d.placas_caja || '-').toUpperCase())}</tr>
    <tr>${infoCell('OPERADOR', (d.operador || '-').toUpperCase())}${infoCell('LÍNEA TRANSP.', (d.linea_transporte || '-').toUpperCase())}${infoCell('CLIENTE', (d.cliente || '-').toUpperCase())}</tr>
    <tr>${infoCell('ALMACENISTA', (d.almacenista || '-').toUpperCase())}${infoCell('ÁREA', (d.area || '-').toUpperCase())}${infoCell('DAÑOS TOTALES', totalDanos > 0 ? `<span style="color:#B91C1C; font-weight:900;">${totalDanos} ZONA(S)</span>` : '0')}</tr>
    <tr>${infoCell('HORA INICIO', d.hora_inicio || '-')}${infoCell('HORA FIN', d.hora_fin || '-')}${infoCell('MATERIALES', `${materiales.length}`)}</tr>
  </table>

  <!-- 2. Evidencia fotográfica -->
  <h3 style="font-size:10px; background:#0A2540; color:#FFF; padding:5px 8px; margin:10px 0 0 0; letter-spacing:1px;">2. EVIDENCIA FOTOGRÁFICA DE LA CAJA</h3>
  <div style="text-align:center;">
    ${getPhotoHtml(d.foto_techo, 'TECHO')}
    ${getPhotoHtml(d.foto_piso, 'PISO')}
    ${getPhotoHtml(d.foto_pared_izq, 'PARED IZQUIERDA')}
    ${getPhotoHtml(d.foto_pared_der, 'PARED DERECHA')}
    ${!validImg(d.foto_techo) && !validImg(d.foto_piso) && !validImg(d.foto_pared_izq) && !validImg(d.foto_pared_der)
      ? '<p style="font-size:9px; color:#94A3B8; margin:8px 0;">SIN FOTOGRAFÍAS REGISTRADAS</p>' : ''}
  </div>

  <!-- 3. Mapa de daños -->
  <h3 style="font-size:10px; background:#0A2540; color:#FFF; padding:5px 8px; margin:10px 0 0 0; letter-spacing:1px;">3. MAPA DE DAÑOS DE LA CAJA ${totalDanos > 0 ? `<span style="background:#EF4444; padding:1px 6px; font-size:8px;">${totalDanos} ZONA(S) DAÑADA(S)</span>` : '<span style="background:#10B981; padding:1px 6px; font-size:8px;">SIN DAÑOS</span>'}</h3>
  <div style="padding:6px 0;">
    ${getDamageMapHtml(d.damage_map, d.damage_notes)}
  </div>

  <!-- 4. Inspección físico-mecánica -->
  <h3 style="font-size:10px; background:#0A2540; color:#FFF; padding:5px 8px; margin:10px 0 0 0; letter-spacing:1px;">4. INSPECCIÓN FÍSICO-MECÁNICA CONTENEDOR/CAJA</h3>
  ${getChecklistHtml(CHECKLIST_FISICO_MECANICO, d.checklist_fisico_mecanico)}

  <!-- 5. Verificación del cuidado de la mercancía -->
  <h3 style="font-size:10px; background:#0A2540; color:#FFF; padding:5px 8px; margin:10px 0 0 0; letter-spacing:1px;">5. VERIFICACIÓN DEL CUIDADO DE LA MERCANCÍA</h3>
  ${getChecklistHtml(CHECKLIST_CUIDADO_MERCANCIA, d.checklist_cuidado_mercancia)}

  <!-- 6. Aseguramiento y sujeción de la carga -->
  <h3 style="font-size:10px; background:#0A2540; color:#FFF; padding:5px 8px; margin:10px 0 0 0; letter-spacing:1px;">6. ASEGURAMIENTO Y SUJECIÓN DE LA CARGA</h3>
  ${getChecklistHtml(CHECKLIST_ASEGURAMIENTO_CARGA, d.checklist_aseguramiento_carga)}
  ${d.sello_numero ? `<table style="width:100%; border-collapse:collapse; margin-top:4px;"><tr>${infoCell('NO. DE SELLO', d.sello_numero.toUpperCase())}<td style="border:1px solid #cbd5e1;"></td></tr></table>` : ''}

  <!-- 7. Lista de verificación de material -->
  <h3 style="font-size:10px; background:#0A2540; color:#FFF; padding:5px 8px; margin:10px 0 0 0; letter-spacing:1px;">7. LISTA DE VERIFICACIÓN DE MATERIAL CARGADO</h3>
  <table style="width:100%; border-collapse:collapse; table-layout:fixed;">
    <tr>
      <th style="border:1px solid #cbd5e1; background:#F1F5F9; padding:4px 6px; font-size:8px; width:5%;">#</th>
      <th style="border:1px solid #cbd5e1; background:#F1F5F9; padding:4px 6px; font-size:8px; width:35%;">DESCRIPCIÓN</th>
      <th style="border:1px solid #cbd5e1; background:#F1F5F9; padding:4px 6px; font-size:8px; width:12%;">TIPO</th>
      <th style="border:1px solid #cbd5e1; background:#F1F5F9; padding:4px 6px; font-size:8px; width:10%;">CANTIDAD</th>
      <th style="border:1px solid #cbd5e1; background:#F1F5F9; padding:4px 6px; font-size:8px; width:38%;">OBSERVACIONES</th>
    </tr>
    ${materialRows || emptyRow}
  </table>
  ${getMaterialPhotosHtml(materiales)}

  <!-- 8. Observaciones generales -->
  <h3 style="font-size:10px; background:#0A2540; color:#FFF; padding:5px 8px; margin:10px 0 0 0; letter-spacing:1px;">8. OBSERVACIONES GENERALES</h3>
  <table style="width:100%; border-collapse:collapse;">
    <tr><td style="border:1px solid #cbd5e1; padding:6px 8px; font-size:9px; min-height:40px;">${(d.observaciones || 'SIN OBSERVACIONES').toUpperCase()}</td></tr>
  </table>

  <!-- 9. Firmas -->
  <h3 style="font-size:10px; background:#0A2540; color:#FFF; padding:5px 8px; margin:10px 0 0 0; letter-spacing:1px;">9. VALIDACIÓN Y FIRMAS</h3>
  <div style="display:flex; justify-content:space-around; border:1px solid #cbd5e1; padding:8px 4px; margin-top:4px;">
    ${inlineSig(d.firma_almacenista, 'Firma Almacenista', d.almacenista)}
    ${inlineSig(d.firma_supervisor, 'Firma Supervisor', d.supervisor_nombre)}
  </div>

  <p style="text-align:center; font-size:7px; color:#94A3B8; margin-top:10px;">SRIUC System — Branco Industries © 2026 · Reporte de Almacén</p>
</body>
</html>`;
};

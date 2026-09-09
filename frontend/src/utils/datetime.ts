/**
 * Fecha/hora para SRIUC — planta NAF Escobedo, Nuevo León.
 * Zona oficial: America/Monterrey = UTC-6 FIJO (NL no aplica horario de verano desde 2022).
 *
 * Se calcula MANUALMENTE desde UTC sin depender del tzdata del dispositivo,
 * porque tablets con datos de zona horaria desactualizados aplican DST inexistente
 * y desfasan los reportes una hora.
 */
const MTY_OFFSET_MS = -6 * 3600000; // UTC-6

const pad = (n: number) => String(n).padStart(2, '0');

/** Fecha/hora en formato DD/MM/YYYY HH:MM (zona Monterrey, a prueba de DST) */
export function mtyDateTime(d: Date = new Date()): string {
  const m = new Date(d.getTime() + MTY_OFFSET_MS);
  return `${pad(m.getUTCDate())}/${pad(m.getUTCMonth() + 1)}/${m.getUTCFullYear()} ${pad(m.getUTCHours())}:${pad(m.getUTCMinutes())}`;
}

/** Hora HH:MM (zona Monterrey) */
export function mtyTime(d: Date = new Date()): string {
  const m = new Date(d.getTime() + MTY_OFFSET_MS);
  return `${pad(m.getUTCHours())}:${pad(m.getUTCMinutes())}`;
}

/** Fecha DD/MM/YYYY (zona Monterrey) */
export function mtyDate(d: Date = new Date()): string {
  const m = new Date(d.getTime() + MTY_OFFSET_MS);
  return `${pad(m.getUTCDate())}/${pad(m.getUTCMonth() + 1)}/${m.getUTCFullYear())}`.replace('))', ')');
}

/** HH:MM desde un ISO (UTC) guardado en BD — zona Monterrey */
export function mtyTimeFromISO(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return mtyTime(d);
}

/** DD/MM/YYYY HH:MM desde un ISO (UTC) guardado en BD — zona Monterrey */
export function mtyDateTimeFromISO(iso?: string | null, fallback = '-'): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return fallback;
  return mtyDateTime(d);
}

export const TIMEZONE_LABEL = 'America/Monterrey (UTC-6)';

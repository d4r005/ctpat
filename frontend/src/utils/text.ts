// Utilidades de sanitización de texto compartidas

/**
 * Normaliza un valor de placa (vehículo, caja/trailer o escolta):
 * - Convierte a mayúsculas
 * - Elimina TODO lo que no sea A-Z o 0-9 (nada de espacios, guiones, puntos, acentos, minúsculas, etc.)
 */
export function sanitizePlate(value: string): string {
  if (!value) return '';
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

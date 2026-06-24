export interface InspectionPointDef {
  number: number;
  name: string;
  description?: string;
}

export const INSPECTION_POINTS_19: InspectionPointDef[] = [
  { number: 1, name: 'Defensa' },
  { number: 2, name: 'Motor' },
  { number: 3, name: 'Neumáticos' },
  { number: 4, name: 'Piso exterior e Interior de tractor' },
  { number: 5, name: 'Tanque de combustible' },
  { number: 6, name: 'Cabina' },
  { number: 7, name: 'Tanque de aire' },
  { number: 8, name: 'Ejes' },
  { number: 9, name: 'Quinta rueda' },
  { number: 10, name: 'Por debajo de unidad' },
  { number: 11, name: 'Exterior e interior de puertas (bisagras, uniones)' },
  { number: 12, name: 'Piso interior' },
  { number: 13, name: 'Paredes laterales' },
  { number: 14, name: 'Pared frontal' },
  { number: 15, name: 'Techo interior' },
  { number: 16, name: 'Unidad de refrigeración' },
  { number: 17, name: 'Escape' },
  { number: 18, name: 'Inspección Sellos VVTT', description: 'Ver, Verificar, Tirar, Torcer' },
  { number: 19, name: 'Inspección agrícola' },
];

export const INSPECTION_POINTS_9: InspectionPointDef[] = [
  { number: 1, name: 'Afuera / debajo del contenedor' },
  { number: 2, name: 'Lateral izquierdo' },
  { number: 3, name: 'Lateral derecho' },
  { number: 4, name: 'Pared frontal' },
  { number: 5, name: 'Techo (corredizo si aplica)' },
  { number: 6, name: 'Interior y exterior de puertas' },
  { number: 7, name: 'Fuera tren de rodaje / Chasis' },
  { number: 8, name: 'Sellos Inspección VVTT', description: 'Ver, Verificar, Tirar, Torcer' },
  { number: 9, name: 'Contaminación agrícola' },
];

// Legacy alias
export const INSPECTION_POINTS = INSPECTION_POINTS_19;

export function getInspectionPoints(type: '19_puntos' | '9_puntos_contenedor'): InspectionPointDef[] {
  return type === '9_puntos_contenedor' ? INSPECTION_POINTS_9 : INSPECTION_POINTS_19;
}

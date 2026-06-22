export interface InspectionPointDef {
  number: number;
  name: string;
  description?: string;
}

export const INSPECTION_POINTS: InspectionPointDef[] = [
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
  { number: 19, name: 'Inspección agrícola (Ejes)' },
];

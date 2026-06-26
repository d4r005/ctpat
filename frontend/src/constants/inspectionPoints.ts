import i18n from '../i18n';

export interface InspectionPointDef {
  number: number;
  name: string;
  name_es: string;
  name_zh: string;
  description?: string;
}

export const INSPECTION_POINTS_19: InspectionPointDef[] = [
  { number: 1, name_es: 'Defensa', name_zh: '保险杠', name: 'Defensa' },
  { number: 2, name_es: 'Motor', name_zh: '发动机', name: 'Motor' },
  { number: 3, name_es: 'Neumáticos', name_zh: '轮胎', name: 'Neumáticos' },
  { number: 4, name_es: 'Piso exterior e Interior de tractor', name_zh: '牵引车内外地板', name: 'Piso exterior e Interior de tractor' },
  { number: 5, name_es: 'Tanque de combustible', name_zh: '油箱', name: 'Tanque de combustible' },
  { number: 6, name_es: 'Cabina', name_zh: '驾驶室', name: 'Cabina' },
  { number: 7, name_es: 'Tanque de aire', name_zh: '储气罐', name: 'Tanque de aire' },
  { number: 8, name_es: 'Ejes', name_zh: '车轴', name: 'Ejes' },
  { number: 9, name_es: 'Quinta rueda', name_zh: '第五轮', name: 'Quinta rueda' },
  { number: 10, name_es: 'Por debajo de unidad', name_zh: '单位底部', name: 'Por debajo de unidad' },
  { number: 11, name_es: 'Exterior e interior de puertas (bisagras, uniones)', name_zh: '车门内外（合页、连接处）', name: 'Exterior e interior de puertas (bisagras, uniones)' },
  { number: 12, name_es: 'Piso interior', name_zh: '内地板', name: 'Piso interior' },
  { number: 13, name_es: 'Paredes laterales', name_zh: '侧壁', name: 'Paredes laterales' },
  { number: 14, name_es: 'Pared frontal', name_zh: '前壁', name: 'Pared frontal' },
  { number: 15, name_es: 'Techo interior', name_zh: '内顶棚', name: 'Techo interior' },
  { number: 16, name_es: 'Unidad de refrigeración', name_zh: '制冷装置', name: 'Unidad de refrigeración' },
  { number: 17, name_es: 'Escape', name_zh: '排气管', name: 'Escape' },
  { number: 18, name_es: 'Inspección Sellos VVTT', name_zh: 'VVTT 封条检查', name: 'Inspección Sellos VVTT', description: 'Ver, Verificar, Tirar, Torcer' },
  { number: 19, name_es: 'Inspección agrícola', name_zh: '农业检查', name: 'Inspección agrícola' },
];

export const INSPECTION_POINTS_9: InspectionPointDef[] = [
  { number: 1, name_es: 'Pared frontal', name_zh: '前壁', name: 'Pared frontal', description: 'Verificar bloques, canales visibles y sonidos huecos.' },
  { number: 2, name_es: 'Lateral izquierdo', name_zh: '左侧壁', name: 'Lateral izquierdo', description: 'Reparaciones poco comunes y sonidos huecos.' },
  { number: 3, name_es: 'Lateral derecho', name_zh: '右侧壁', name: 'Lateral derecho', description: 'Reparaciones poco comunes y sonidos huecos.' },
  { number: 4, name_es: 'Piso (Suelo)', name_zh: '地板', name: 'Piso (Suelo)', description: 'Plano, uniforme, sin plataformas elevadas ni soldaduras raras.' },
  { number: 5, name_es: 'Techo', name_zh: '顶棚', name: 'Techo', description: 'Distancia estándar, bloques visibles y sin reparaciones externas.' },
  { number: 6, name_es: 'Puertas (Interior/Exterior)', name_zh: '车门（内外）', name: 'Puertas (Interior/Exterior)', description: 'Mecanismos fiables, pernos firmes y sin placas raras.' },
  { number: 7, name_es: 'Fuera tren de rodaje / Chasis', name_zh: '底盘/车架', name: 'Fuera tren de rodaje / Chasis', description: 'Barras de apoyo visibles, ruedas y llantas normales.' },
  { number: 8, name_es: 'Inspección Sellos VVTT', name_zh: 'VVTT 封条检查', name: 'Inspección Sellos VVTT', description: 'Ver, Verificar, Tirar, Torcer' },
  { number: 9, name_es: 'Inspección agrícola', name_zh: '农业检查', name: 'Inspección agrícola', description: 'Libre de insectos, animales, moho o contaminantes.' },
];

export function getLocalizedName(point: any): string {
    const lang = i18n.language || 'es';
    if (lang === 'zh') return point.name_zh || point.name;
    return point.name_es || point.name;
}

export function getBilingualName(point: any): string {
    return `${point.name_es || point.name} / ${point.name_zh || point.name}`;
}

export function getInspectionPoints(type: '19_puntos' | '9_puntos_contenedor'): InspectionPointDef[] {
  const points = type === '9_puntos_contenedor' ? INSPECTION_POINTS_9 : INSPECTION_POINTS_19;
  return points.map(p => ({
      ...p,
      name: getLocalizedName(p)
  }));
}

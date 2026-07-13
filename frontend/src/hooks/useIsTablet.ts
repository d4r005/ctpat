import { useWindowDimensions } from 'react-native';

/**
 * Retorna true si el ancho de pantalla es >= 768px (tablet/iPad/escritorio).
 * Usar en componentes para ajustar layout a 2 columnas o máximos de ancho.
 */
export function useIsTablet(): boolean {
  const { width } = useWindowDimensions();
  return width >= 768;
}

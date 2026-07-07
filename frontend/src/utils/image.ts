import { Platform } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Recibe una cadena base64 o una URI de imagen y la comprime/redimensiona.
 * Esto es CRÍTICO para:
 * 1. No saturar el almacenamiento local (AsyncStorage/LocalStorage) en modo offline.
 * 2. Evitar errores de timeout al subir fotos pesadas con internet lento.
 */
export async function compressImage(uri: string, maxWidth = 800): Promise<string> {
  if (!uri) return uri;

  // Si ya es una URL remota, no procesar
  if (uri.startsWith('http') && !uri.startsWith('data:image')) return uri;

  try {
    if (Platform.OS === 'web') {
      return new Promise((resolve) => {
        const img = new Image();
        img.src = uri;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > maxWidth) {
            height = (maxWidth / width) * height;
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          // Calidad 0.6 para Web
          resolve(canvas.toDataURL('image/jpeg', 0.6));
        };
        img.onerror = () => resolve(uri);
      });
    } else {
      // En Nativo (Android/iOS) usamos expo-image-manipulator
      // Redimensionamos a un máximo de 800px de ancho y calidad 0.6 (muy ligero)
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: maxWidth } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      return `data:image/jpeg;base64,${result.base64}`;
    }
  } catch (error) {
    console.error("Error al comprimir imagen:", error);
    return uri; // Fallback al original si algo falla
  }
}

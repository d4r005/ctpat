import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import SignatureScreen from 'react-native-signature-canvas';
import i18n from '@/src/i18n';

// Importación condicional para Web
let ReactSignatureCanvas: any;
if (Platform.OS === 'web') {
  ReactSignatureCanvas = require('react-signature-canvas').default;
}

interface SignaturePadProps {
  onOK: (signature: string) => void;
  onEmpty?: () => void;
  descriptionText?: string;
  clearText?: string;
  confirmText?: string;
  webStyle?: string;
  autoClear?: boolean;
  imageType?: 'image/png' | 'image/jpeg';
}

export const SignaturePad = forwardRef((props: SignaturePadProps, ref) => {
  const signatureRef = useRef<any>(null);
  const webCanvasRef = useRef<any>(null);

  useImperativeHandle(ref, () => ({
    readSignature: () => {
      if (Platform.OS === 'web' && webCanvasRef.current) {
        if (webCanvasRef.current.isEmpty()) {
          props.onEmpty?.();
          return;
        }
        const sig = webCanvasRef.current.getTrimmedCanvas().toDataURL(props.imageType || 'image/png');
        props.onOK(sig);
        return;
      }
      signatureRef.current?.readSignature();
    },
    clear: () => {
      if (Platform.OS === 'web' && webCanvasRef.current) {
        webCanvasRef.current.clear();
      } else {
        signatureRef.current?.clearSignature();
      }
    }
  }));

  if (Platform.OS === 'web') {
    return (
      <View style={styles.webContainer}>
        <ReactSignatureCanvas
          ref={webCanvasRef}
          penColor="#000"
          backgroundColor="#FFFFFF"
          canvasProps={{
            className: 'sigCanvas',
            style: {
              width: '100%',
              height: '100%',
              minHeight: '280px',
              border: '2px solid #09090B',
              backgroundColor: '#fff'
            }
          }}
        />
      </View>
    );
  }

  const defaultWebStyle = `
    .m-signature-pad { box-shadow: none; border: none; }
    .m-signature-pad--body { border: 2px solid #09090B; background-color: #FFFFFF; }
    .m-signature-pad--footer { display: none; margin: 0px; }
    body, html { background-color: #FFFFFF; }
  `;

  return (
    <View style={{ flex: 1, minHeight: 280 }}>
      <SignatureScreen
        ref={signatureRef}
        onOK={props.onOK}
        onEmpty={props.onEmpty}
        descriptionText={props.descriptionText || i18n.t('firme_dentro_desc')}
        webStyle={props.webStyle || defaultWebStyle}
        autoClear={props.autoClear ?? false}
        imageType={props.imageType || 'image/png'}
        // Fondo blanco explícito en el propio canvas (no solo CSS): sin esto,
        // el buffer del canvas queda transparente y al exportar el área vacía
        // se rellena de NEGRO en vez de blanco.
        backgroundColor="#FFFFFF"
        // FIX DEFINITIVO firma en negro (Android): antes esto alternaba
        // dinámicamente entre 'hardware' (mientras se dibuja, mejor
        // sensación táctil) y 'software' (sólo el instante de capturar,
        // vía un truco de requestAnimationFrame + setTimeout(80ms) para dar
        // tiempo a que el WebView aplicara el cambio de capa nativo antes de
        // pedir la firma). Ese timing NO es garantizado por el sistema —
        // en dispositivos más lentos o bajo carga, la captura llegaba a
        // ocurrir ANTES de que el cambio de capa surtiera efecto, y
        // entonces sí se leía la textura de GPU vacía -> PNG negro sólido.
        // Eliminamos la condición de carrera de raíz: 'software' siempre,
        // en todo momento. Es marginalmente menos fluido mientras se dibuja
        // pero garantiza que la exportación SIEMPRE sea correcta, lo cual
        // es lo que importa en una firma de cumplimiento/seguridad.
        androidLayerType={Platform.OS === 'android' ? 'software' : undefined}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  webContainer: {
    flex: 1,
    width: '100%',
    height: 300,
    backgroundColor: '#fff',
  }
});

SignaturePad.displayName = 'SignaturePad';
export default SignaturePad;

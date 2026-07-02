import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
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
  // "hardware" (por defecto de la librería) da la mejor detección de dedo/pluma
  // mientras se dibuja — es lo que usa el WebView para pintar cada trazo en
  // tiempo real. El problema es que al exportar (toDataURL) desde una capa
  // de hardware, Android a veces lee la textura de la GPU vacía y el PNG sale
  // en negro. La capa "software" exporta bien pero se siente más lenta/pierde
  // trazos mientras se dibuja. Por eso NO la dejamos fija: sólo se activa el
  // instante justo de la captura y se revierte a "hardware" enseguida para
  // que el siguiente trazo se sienta normal otra vez.
  const [captureLayer, setCaptureLayer] = useState(false);

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
      if (Platform.OS === 'android') {
        // Cambiamos momentáneamente a capa de software sólo para la captura,
        // dejamos un frame para que el WebView aplique el cambio de capa
        // nativo, y ahí sí pedimos la firma ya renderizada sobre fondo blanco.
        setCaptureLayer(true);
        requestAnimationFrame(() => {
          setTimeout(() => {
            signatureRef.current?.readSignature();
          }, 80);
        });
      } else {
        signatureRef.current?.readSignature();
      }
    },
    clear: () => {
      if (Platform.OS === 'web' && webCanvasRef.current) {
        webCanvasRef.current.clear();
      } else {
        signatureRef.current?.clearSignature();
      }
    }
  }));

  const handleOK = (sig: string) => {
    // Volvemos a capa de hardware para que el próximo trazo (si el usuario
    // vuelve a firmar/corrige) se sienta fluido y con buena detección táctil.
    if (Platform.OS === 'android') setCaptureLayer(false);
    props.onOK(sig);
  };

  const handleEmpty = () => {
    if (Platform.OS === 'android') setCaptureLayer(false);
    props.onEmpty?.();
  };

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
        onOK={handleOK}
        onEmpty={handleEmpty}
        descriptionText={props.descriptionText || i18n.t('firme_dentro_desc')}
        webStyle={props.webStyle || defaultWebStyle}
        autoClear={props.autoClear ?? false}
        imageType={props.imageType || 'image/png'}
        // Fondo blanco explícito en el propio canvas (no solo CSS): sin esto,
        // el buffer del canvas queda transparente y al exportar (sobre todo en
        // JPEG, y en algunos Android también en PNG) el área vacía se rellena
        // de NEGRO en vez de blanco — eso es lo que se veía como "firma en negro".
        backgroundColor="#FFFFFF"
        // Sólo Android alterna hardware/software (ver comentario arriba). iOS
        // no tiene este bug de captura y se queda siempre en el default.
        androidLayerType={Platform.OS === 'android' ? (captureLayer ? 'software' : 'hardware') : undefined}
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

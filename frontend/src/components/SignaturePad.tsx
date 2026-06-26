import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { Platform, View, Text } from 'react-native';

// Dynamic imports
let WebSignature: any;
let NativeSignature: any;

if (Platform.OS === 'web') {
  try {
    WebSignature = require('react-signature-canvas');
    if (WebSignature.default) WebSignature = WebSignature.default;
  } catch (e) {
    console.error('Error loading web signature canvas', e);
  }
} else {
  try {
    NativeSignature = require('react-native-signature-canvas').default;
  } catch (e) {
    console.error('Error loading native signature canvas', e);
  }
}

interface SignaturePadProps {
  onOK: (signature: string) => void;
  descriptionText?: string;
  clearText?: string;
  confirmText?: string;
  webStyle?: string;
  autoClear?: boolean;
  imageType?: string;
}

export const SignaturePad = forwardRef((props: SignaturePadProps, ref) => {
  const nativeRef = useRef<any>(null);
  const webRef = useRef<any>(null);

  useImperativeHandle(ref, () => ({
    readSignature: () => {
      if (Platform.OS === 'web') {
        if (webRef.current && !webRef.current.isEmpty()) {
          // CAPTURA WEB: Forzar fondo blanco puro en el canvas antes de exportar
          const canvas = webRef.current.getCanvas();
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = canvas.width;
          tempCanvas.height = canvas.height;
          const tempCtx = tempCanvas.getContext('2d');
          if (tempCtx) {
            tempCtx.fillStyle = '#FFFFFF';
            tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
            tempCtx.drawImage(canvas, 0, 0);
            props.onOK(tempCanvas.toDataURL('image/jpeg', 0.8));
          }
        } else {
          props.onOK('');
        }
      } else {
        nativeRef.current?.readSignature();
      }
    },
    clear: () => {
      if (Platform.OS === 'web') {
        webRef.current?.clear();
      } else {
        nativeRef.current?.clear();
      }
    }
  }));

  if (Platform.OS === 'web') {
    if (!WebSignature) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><Text>Error loading Signature Canvas</Text></View>;
    return (
      <View style={{ flex: 1, backgroundColor: '#FFF', minHeight: 280 }}>
        <WebSignature
          ref={webRef}
          backgroundColor="rgb(255,255,255)"
          canvasProps={{
            style: { width: '100%', height: '100%', minHeight: '280px', cursor: 'crosshair', backgroundColor: '#FFFFFF' }
          }}
        />
      </View>
    );
  }

  // NATIVO: Usar PNG para capturar el trazo y dejar que el servidor lo procese con fondo blanco real
  return (
    <NativeSignature
      ref={nativeRef}
      onOK={props.onOK}
      backgroundColor="#FFFFFF"
      bg="#FFFFFF"
      descriptionText={props.descriptionText}
      clearText={props.clearText}
      confirmText={props.confirmText}
      webStyle={`.m-signature-pad { background-color: #FFFFFF !important; box-shadow: none; border: none; }
                 .m-signature-pad--body { background-color: #FFFFFF !important; }
                 canvas { background-color: #FFFFFF !important; }`}
      autoClear={false}
      imageType="image/png"
    />
  );
});

SignaturePad.displayName = 'SignaturePad';
export default SignaturePad;

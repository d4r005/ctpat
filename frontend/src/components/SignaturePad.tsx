import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import SignatureScreen from 'react-native-signature-canvas';

// Importación condicional para Web
let ReactSignatureCanvas: any;
if (Platform.OS === 'web') {
  ReactSignatureCanvas = require('react-signature-canvas').default;
}

interface SignaturePadProps {
  onOK: (signature: string) => void;
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
        const sig = webCanvasRef.current.getTrimmedCanvas().toDataURL(props.imageType || 'image/png');
        props.onOK(sig);
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

  if (Platform.OS === 'web') {
    return (
      <View style={styles.webContainer}>
        <ReactSignatureCanvas
          ref={webCanvasRef}
          penColor="#000"
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
    .m-signature-pad--body { border: 2px solid #09090B; }
    .m-signature-pad--footer { display: none; margin: 0px; }
    body, html { background-color: transparent; }
  `;

  return (
    <View style={{ flex: 1, minHeight: 280 }}>
      <SignatureScreen
        ref={signatureRef}
        onOK={props.onOK}
        descriptionText={props.descriptionText || 'Firme aquí'}
        webStyle={props.webStyle || defaultWebStyle}
        autoClear={props.autoClear ?? false}
        imageType={props.imageType || 'image/png'}
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

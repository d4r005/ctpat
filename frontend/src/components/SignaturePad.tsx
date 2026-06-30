import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { View, Platform } from 'react-native';
import SignatureScreen from 'react-native-signature-canvas';

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

  useImperativeHandle(ref, () => ({
    readSignature: () => {
      signatureRef.current?.readSignature();
    },
    clear: () => {
      signatureRef.current?.clearSignature();
    }
  }));

  const handleOK = (signature: string) => {
    props.onOK(signature);
  };

  // Estilo optimizado para evitar problemas de scroll y carga en web/móvil
  const defaultWebStyle = `
    .m-signature-pad {
      box-shadow: none;
      border: none;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
    }
    .m-signature-pad--body {
      border: 2px solid #09090B;
      bottom: 0px;
    }
    .m-signature-pad--footer { display: none !important; }
    body, html {
      background-color: transparent;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
  `;

  return (
    <View style={{ height: 300, width: '100%', overflow: 'hidden', backgroundColor: '#fff' }}>
      <SignatureScreen
        ref={signatureRef}
        onOK={handleOK}
        descriptionText={props.descriptionText || 'Firme aquí'}
        clearText={props.clearText || 'Borrar'}
        confirmText={props.confirmText || 'Guardar'}
        webStyle={props.webStyle || defaultWebStyle}
        autoClear={props.autoClear ?? false}
        imageType={props.imageType || 'image/png'}
        androidHardwareAccelerationDisabled={true}
        startInLoadingState={false}
      />
    </View>
  );
});

SignaturePad.displayName = 'SignaturePad';
export default SignaturePad;

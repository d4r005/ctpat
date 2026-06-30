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
        onOK={handleOK}
        descriptionText={props.descriptionText || 'Firme aquí'}
        clearText={props.clearText || 'Borrar'}
        confirmText={props.confirmText || 'Guardar'}
        webStyle={props.webStyle || defaultWebStyle}
        autoClear={props.autoClear ?? false}
        imageType={props.imageType || 'image/png'}
        androidHardwareAccelerationDisabled={true}
      />
    </View>
  );
});

SignaturePad.displayName = 'SignaturePad';
export default SignaturePad;

import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { Platform, View } from 'react-native';

let NativeSignature: any;
let WebSignature: any;

if (Platform.OS === 'web') {
  WebSignature = require('react-signature-canvas').default;
} else {
  NativeSignature = require('react-native-signature-canvas').default;
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
          const base64 = webRef.current.getTrimmedCanvas().toDataURL('image/png');
          props.onOK(base64);
        } else {
          // If empty, just call onOK with empty string or handle as needed
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
    return (
      <View style={{ flex: 1, backgroundColor: '#FFF', minHeight: 280 }}>
        <WebSignature
          ref={webRef}
          canvasProps={{
            style: { width: '100%', height: '100%', minHeight: '280px', cursor: 'crosshair' }
          }}
        />
      </View>
    );
  }

  return (
    <NativeSignature
      ref={nativeRef}
      onOK={props.onOK}
      descriptionText={props.descriptionText}
      clearText={props.clearText}
      confirmText={props.confirmText}
      webStyle={props.webStyle}
      autoClear={props.autoClear}
      imageType={props.imageType}
    />
  );
});

SignaturePad.displayName = 'SignaturePad';
export default SignaturePad;

import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { Platform, View, Text } from 'react-native';

// Dynamic imports to avoid loading incompatible modules on different platforms
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
          // Cambiado a JPEG con calidad 0.5 para que la generación sea instantánea y el peso mínimo
          const base64 = webRef.current.getTrimmedCanvas().toDataURL('image/jpeg', 0.5);
          props.onOK(base64);
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
      <View style={{ flex: 1, backgroundColor: '#FFF', minHeight: 280, borderStyle: 'dashed', borderWidth: 1, borderColor: '#CCC' }}>
        <WebSignature
          ref={webRef}
          canvasProps={{
            style: { width: '100%', height: '100%', minHeight: '280px', cursor: 'crosshair' }
          }}
        />
      </View>
    );
  }

  if (!NativeSignature) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><Text>Native Signature not available</Text></View>;

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

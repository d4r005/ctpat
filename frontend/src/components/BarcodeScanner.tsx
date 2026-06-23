import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { colors, spacing, typography } from '@/src/constants/theme';

interface Props {
  visible: boolean;
  title: string;
  onClose: () => void;
  onScan: (value: string) => void;
}

export default function BarcodeScanner({ visible, title, onClose, onScan }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (visible) setScanned(false);
  }, [visible]);

  if (!visible) return null;

  const handleBarcode = (result: BarcodeScanningResult) => {
    if (scanned) return;
    setScanned(true);
    onScan(result.data);
  };

  const renderBody = () => {
    if (Platform.OS === 'web') {
      return (
        <View style={styles.center}>
          <Ionicons name="information-circle" size={48} color={colors.warning} />
          <Text style={styles.infoText}>
            El escáner de cámara está optimizado para dispositivos móviles.{'\n'}
            En navegador, ingresa el código manualmente.
          </Text>
        </View>
      );
    }
    if (!permission) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      );
    }
    if (!permission.granted) {
      return (
        <View style={styles.center}>
          <Ionicons name="videocam-off" size={48} color={colors.muted} />
          <Text style={styles.infoText}>Se necesita acceso a la cámara para escanear códigos.</Text>
          <Pressable
            testID="scanner-grant-permission"
            style={styles.primaryBtn}
            onPress={async () => {
              const r = await requestPermission();
              if (!r.granted && Platform.OS !== 'web') {
                // user must enable from settings
              }
            }}
          >
            <Text style={styles.primaryBtnText}>PERMITIR CÁMARA</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={{ flex: 1 }}>
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ['qr', 'code128', 'code39', 'ean13', 'ean8', 'upc_a', 'upc_e', 'codabar', 'itf14'],
          }}
          onBarcodeScanned={handleBarcode}
        />
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.reticle} />
        </View>
      </View>
    );
  };

  return (
    <View style={styles.modal} testID="scanner-modal">
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Pressable testID="scanner-close" onPress={onClose} hitSlop={12}>
          <Ionicons name="close" size={28} color={colors.onBrandPrimary} />
        </Pressable>
      </View>
      <View style={{ flex: 1, backgroundColor: '#000' }}>{renderBody()}</View>
      <View style={styles.footer}>
        <Text style={styles.footerHint}>Apunta la cámara al código de barras o QR</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  modal: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', zIndex: 1000,
  },
  header: {
    backgroundColor: colors.brandPrimary, padding: spacing.md, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
  },
  title: { color: colors.onBrandPrimary, fontWeight: '900', fontSize: typography.sizes.lg, letterSpacing: 1 },
  footer: { backgroundColor: colors.brandPrimary, padding: spacing.md, alignItems: 'center' },
  footerHint: { color: colors.onBrandPrimary, fontSize: typography.sizes.sm, opacity: 0.8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.surface },
  infoText: { textAlign: 'center', color: colors.onSurface, marginTop: spacing.md, lineHeight: 22 },
  primaryBtn: { backgroundColor: colors.brandPrimary, padding: spacing.md, marginTop: spacing.lg, paddingHorizontal: spacing.xl },
  primaryBtnText: { color: colors.onBrandPrimary, fontWeight: '900', letterSpacing: 1 },
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center',
  },
  reticle: { width: 250, height: 150, borderWidth: 3, borderColor: colors.brandSecondary },
});

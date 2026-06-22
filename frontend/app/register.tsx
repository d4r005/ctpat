import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, useRouter } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { colors, spacing, radius, typography } from '@/src/constants/theme';

export default function Register() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handle = async () => {
    setError(null);
    if (!name.trim() || !email.trim() || !password) {
      setError('Completa todos los campos');
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    setLoading(true);
    try {
      await signUp(email.trim(), password, name.trim());
      router.replace('/(app)/inicio');
    } catch (e: any) {
      setError(e.message || 'Error al registrar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Crear cuenta</Text>
          <Text style={styles.subtitle}>Registra tu cuenta de inspector</Text>

          <Text style={styles.label}>NOMBRE COMPLETO</Text>
          <TextInput
            testID="register-name-input"
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Juan Pérez"
            placeholderTextColor={colors.muted}
          />

          <Text style={styles.label}>CORREO ELECTRÓNICO</Text>
          <TextInput
            testID="register-email-input"
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="inspector@empresa.com"
            placeholderTextColor={colors.muted}
          />

          <Text style={styles.label}>CONTRASEÑA</Text>
          <TextInput
            testID="register-password-input"
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Mínimo 6 caracteres"
            placeholderTextColor={colors.muted}
          />

          {error ? (
            <View style={styles.errorBox} testID="register-error">
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            testID="register-submit-button"
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
            onPress={handle}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <Text style={styles.primaryBtnText}>REGISTRARSE</Text>
            )}
          </Pressable>

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>¿Ya tienes cuenta? </Text>
            <Link href="/login" asChild>
              <Pressable testID="register-go-login">
                <Text style={styles.link}>Inicia sesión</Text>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  container: { flexGrow: 1, padding: spacing.xl },
  title: { fontSize: typography.sizes.xxl, fontWeight: '900', color: colors.onSurface, marginTop: spacing.xl },
  subtitle: { fontSize: typography.sizes.base, color: colors.muted, marginBottom: spacing.xl },
  label: {
    fontSize: typography.sizes.sm, fontWeight: '700', color: colors.onSurfaceTertiary,
    letterSpacing: 1, marginBottom: spacing.sm, marginTop: spacing.lg,
  },
  input: {
    borderWidth: 2, borderColor: colors.borderStrong, backgroundColor: colors.surfaceSecondary,
    padding: spacing.md, fontSize: typography.sizes.lg, color: colors.onSurfaceSecondary,
    borderRadius: radius.sm,
  },
  errorBox: { backgroundColor: colors.error, padding: spacing.md, marginTop: spacing.lg },
  errorText: { color: colors.onError, fontWeight: '700' },
  primaryBtn: {
    backgroundColor: colors.brandPrimary, padding: spacing.lg, marginTop: spacing.xl,
    alignItems: 'center', minHeight: 56, justifyContent: 'center',
  },
  primaryBtnText: { color: colors.onBrandPrimary, fontWeight: '900', fontSize: typography.sizes.lg, letterSpacing: 1 },
  footerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl },
  footerText: { color: colors.muted, fontSize: typography.sizes.base },
  link: { color: colors.brandPrimary, fontWeight: '700', fontSize: typography.sizes.base },
});

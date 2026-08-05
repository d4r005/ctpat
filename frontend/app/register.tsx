import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/src/context/AuthContext';
import { colors, spacing, radius, typography, shadows } from '@/src/constants/theme';

export default function Register() {
  const router = useRouter();
  const { signUp } = useAuth();
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handle = async () => {
    setError(null);
    if (!name.trim() || !email.trim() || !password) {
      setError(t('completa_campos'));
      return;
    }
    if (password.length < 6) {
      setError(t('contrasena_corta'));
      return;
    }
    setLoading(true);
    try {
      await signUp(email.trim(), password, name.trim());
      router.replace('/(app)/inicio');
    } catch (e: any) {
      setError(e.message || t('error_registro'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.centerWrap} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <View style={styles.brandBlock}>
              <View style={styles.shieldBadge}>
                <Ionicons name="shield-checkmark" size={28} color={colors.brandSecondary} />
              </View>
              <Text style={styles.title}>{t('crear_cuenta')}</Text>
              <Text style={styles.subtitle}>{t('registra_cuenta_inspector')}</Text>
            </View>

            <View style={styles.form}>
              <Text style={styles.label}>{t('nombre_completo').toUpperCase()}</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="person-outline" size={18} color={colors.muted} style={{ marginRight: 8 }} />
                <TextInput
                  testID="register-name-input"
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder={t('nombre_completo_placeholder')}
                  placeholderTextColor={colors.mutedLight}
                />
              </View>

              <Text style={styles.label}>{t('correo_electronico').toUpperCase()}</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="mail-outline" size={18} color={colors.muted} style={{ marginRight: 8 }} />
                <TextInput
                  testID="register-email-input"
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder={t('email_placeholder')}
                  placeholderTextColor={colors.mutedLight}
                />
              </View>

              <Text style={styles.label}>{t('contrasena').toUpperCase()}</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={18} color={colors.muted} style={{ marginRight: 8 }} />
                <TextInput
                  testID="register-password-input"
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  placeholder={t('contrasena_min_chars')}
                  placeholderTextColor={colors.mutedLight}
                />
              </View>

              {error ? (
                <View style={styles.errorBox} testID="register-error">
                  <Ionicons name="alert-circle" size={16} color={colors.error} style={{ marginRight: 6 }} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <Pressable
                testID="register-submit-button"
                style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.9 }]}
                onPress={handle}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={colors.onBrandPrimary} />
                ) : (
                  <Text style={styles.primaryBtnText}>{t('registrarse').toUpperCase()}</Text>
                )}
              </Pressable>

              <View style={styles.footerRow}>
                <Text style={styles.footerText}>{t('ya_tienes_cuenta')} </Text>
                <Link href="/login" asChild>
                  <Pressable testID="register-go-login">
                    <Text style={styles.link}>{t('inicia_sesion')}</Text>
                  </Pressable>
                </Link>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  centerWrap: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  card: {
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.xl,
    paddingTop: spacing.xxl,
    borderRadius: radius.xl,
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.lg,
  },
  brandBlock: { alignItems: 'center', marginBottom: spacing.lg },
  shieldBadge: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.brandPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  title: { fontSize: typography.sizes.xxl, fontWeight: '800', color: colors.onSurface, textAlign: 'center' },
  subtitle: { fontSize: typography.sizes.base, color: colors.muted, marginTop: 4, textAlign: 'center' },
  form: { width: '100%' },
  label: {
    fontSize: typography.sizes.sm, fontWeight: '800', color: colors.onSurfaceTertiary,
    letterSpacing: 0.6, marginBottom: spacing.sm, marginTop: spacing.lg,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    height: 50,
  },
  input: { flex: 1, fontSize: typography.sizes.lg, color: colors.onSurface },
  errorBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.errorSurface, padding: spacing.md, marginTop: spacing.lg,
    borderRadius: radius.sm, borderLeftWidth: 3, borderLeftColor: colors.error,
  },
  errorText: { color: colors.error, fontWeight: '700', flexShrink: 1 },
  primaryBtn: {
    backgroundColor: colors.brandPrimary, padding: spacing.lg, marginTop: spacing.xl,
    alignItems: 'center', borderRadius: radius.pill, minHeight: 54, justifyContent: 'center',
    ...shadows.md,
  },
  primaryBtnText: { color: colors.onBrandPrimary, fontWeight: '800', fontSize: 13, letterSpacing: 1.5 },
  footerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl },
  footerText: { color: colors.muted, fontSize: typography.sizes.base },
  link: { color: colors.brandPrimary, fontWeight: '800', fontSize: typography.sizes.base },
});

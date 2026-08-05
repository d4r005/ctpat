import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/src/context/AuthContext';
import { colors, spacing, radius, typography, shadows } from '@/src/constants/theme';

const REMEMBER_KEY = 'naf_remembered_email';

export default function Login() {
  const router = useRouter();
  const { signIn } = useAuth();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadSavedEmail = async () => {
      const saved = await AsyncStorage.getItem(REMEMBER_KEY);
      if (saved) {
        setEmail(saved);
        setRememberMe(true);
      }
    };
    loadSavedEmail();
  }, []);

  const handleLogin = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError(t('ingresa_credenciales'));
      return;
    }
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      if (rememberMe) {
        await AsyncStorage.setItem(REMEMBER_KEY, email.trim());
      } else {
        await AsyncStorage.removeItem(REMEMBER_KEY);
      }
      router.replace('/(app)/inicio');
    } catch (e: any) {
      setError(e.message || t('error_sesion'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.centerWrap} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            {/* Brand mark */}
            <View style={styles.brandBlock}>
              <View style={styles.shieldBadge}>
                <Ionicons name="shield-checkmark" size={30} color={colors.brandSecondary} />
              </View>
              <Text style={styles.brandName}>NAF</Text>
              <Text style={styles.brandSub}>SRIUC</Text>
              <View style={styles.goldDivider} />
              <Text style={styles.title}>{t('sistema_registro')}</Text>
              <Text style={styles.subtitle}>{t('sistema_inspeccion_sub')}</Text>
            </View>

            <View style={styles.form}>
              <Text style={styles.label}>{t('correo_electronico').toUpperCase()}</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="person-outline" size={18} color={colors.muted} style={{ marginRight: 8 }} />
                <TextInput
                  testID="login-email-input"
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
                  testID="login-password-input"
                  style={[styles.input, { flex: 1 }]}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  placeholder="••••••••"
                  placeholderTextColor={colors.mutedLight}
                />
                <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
                  <Text style={styles.showToggle}>{showPassword ? t('ocultar') || 'Ocultar' : t('ver') || 'Ver'}</Text>
                </Pressable>
              </View>

              <Pressable
                onPress={() => setRememberMe(!rememberMe)}
                style={styles.rememberRow}
              >
                <View style={[styles.checkbox, rememberMe && styles.checkboxActive]}>
                  {rememberMe && <Ionicons name="checkmark" size={14} color={colors.onBrandPrimary} />}
                </View>
                <Text style={styles.rememberText}>{t('recordar_usuario')}</Text>
              </Pressable>

              {error ? (
                <View style={styles.errorBox} testID="login-error">
                  <Ionicons name="alert-circle" size={16} color={colors.error} style={{ marginRight: 6 }} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <Pressable
                testID="login-submit-button"
                style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.9 }]}
                onPress={handleLogin}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={colors.onBrandPrimary} />
                ) : (
                  <Text style={styles.primaryBtnText}>{t('iniciar_sesion').toUpperCase()}</Text>
                )}
              </Pressable>

              <View style={styles.footerRow}>
                <Text style={styles.footerText}>{t('no_tienes_cuenta')} </Text>
                <Link href="/register" asChild>
                  <Pressable testID="login-go-register">
                    <Text style={styles.link}>{t('registrate')}</Text>
                  </Pressable>
                </Link>
              </View>
            </View>
          </View>

          <Text style={styles.copyright}>© {new Date().getFullYear()} NAF · SRIUC — Todos los derechos reservados.</Text>
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
  brandBlock: { alignItems: 'center', marginBottom: spacing.xl },
  shieldBadge: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.brandPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  brandName: { color: colors.brandPrimary, fontSize: 30, fontWeight: '900', letterSpacing: 3 },
  brandSub: { color: colors.brandSecondary, fontSize: 13, fontWeight: '800', letterSpacing: 5, marginTop: 2 },
  goldDivider: { width: 40, height: 3, borderRadius: 2, backgroundColor: colors.brandSecondary, marginVertical: spacing.md },
  title: { fontSize: 18, fontWeight: '800', color: colors.onSurface, textAlign: 'center' },
  subtitle: { fontSize: 13, color: colors.muted, marginTop: 4, fontWeight: '500', textAlign: 'center' },
  form: { width: '100%' },
  label: {
    fontSize: 11, fontWeight: '800', color: colors.onSurfaceTertiary,
    letterSpacing: 0.6, marginBottom: 8, marginTop: spacing.lg,
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
  input: {
    flex: 1,
    fontSize: 15,
    color: colors.onSurface,
  },
  showToggle: { color: colors.brandPrimary, fontSize: 12, fontWeight: '700' },
  rememberRow: {
    flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, gap: 8,
  },
  checkbox: {
    width: 18, height: 18, borderWidth: 1.5, borderColor: colors.borderStrong, borderRadius: 4,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  rememberText: { fontSize: 13, color: colors.onSurfaceTertiary, fontWeight: '600' },
  errorBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.errorSurface, padding: spacing.md, marginTop: spacing.lg,
    borderRadius: radius.sm, borderLeftWidth: 3, borderLeftColor: colors.error,
  },
  errorText: { color: colors.error, fontWeight: '700', fontSize: 13, flexShrink: 1 },
  primaryBtn: {
    backgroundColor: colors.brandPrimary, paddingVertical: 16, marginTop: spacing.xl,
    alignItems: 'center', borderRadius: radius.pill,
    ...shadows.md,
  },
  primaryBtnText: { color: colors.onBrandPrimary, fontWeight: '800', fontSize: 13, letterSpacing: 1.5 },
  footerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl },
  footerText: { color: colors.muted, fontSize: 14, fontWeight: '500' },
  link: { color: colors.brandPrimary, fontWeight: '800', fontSize: 14 },
  copyright: { textAlign: 'center', color: colors.mutedLight, fontSize: 11, marginTop: spacing.lg },
});

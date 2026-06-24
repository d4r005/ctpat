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
import { colors, spacing, radius, typography } from '@/src/constants/theme';

const REMEMBER_KEY = 'naf_remembered_email';

export default function Login() {
  const router = useRouter();
  const { signIn } = useAuth();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={styles.logoBlock}>
              <Text style={styles.logoText}>NAF</Text>
            </View>
            <Text style={styles.title}>{t('sistema_registro')}</Text>
            <Text style={styles.subtitle}>{t('sistema_inspeccion_sub')}</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>{t('correo_electronico')}</Text>
            <TextInput
              testID="login-email-input"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="inspector@empresa.com"
              placeholderTextColor={colors.muted}
            />

            <Text style={styles.label}>{t('contrasena')}</Text>
            <TextInput
              testID="login-password-input"
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor={colors.muted}
            />

            <Pressable
              onPress={() => setRememberMe(!rememberMe)}
              style={styles.rememberRow}
            >
              <Ionicons
                name={rememberMe ? 'checkbox' : 'square-outline'}
                size={22}
                color={colors.brandPrimary}
              />
              <Text style={styles.rememberText}>{t('recordar_usuario')}</Text>
            </Pressable>

            {error ? (
              <View style={styles.errorBox} testID="login-error">
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              testID="login-submit-button"
              style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.onBrandPrimary} />
              ) : (
                <Text style={styles.primaryBtnText}>{t('iniciar_sesion')}</Text>
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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  container: { flexGrow: 1, padding: spacing.xl },
  header: { marginTop: spacing.xl, marginBottom: spacing.xxl },
  logoBlock: {
    width: 72, height: 72, backgroundColor: colors.brandPrimary,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg,
  },
  logoText: { color: colors.onBrandPrimary, fontSize: 28, fontWeight: '900', letterSpacing: 2 },
  title: { fontSize: typography.sizes.xxl, fontWeight: '900', color: colors.onSurface, marginBottom: spacing.xs },
  subtitle: { fontSize: typography.sizes.base, color: colors.muted },
  form: { flex: 1 },
  label: {
    fontSize: typography.sizes.sm, fontWeight: '700', color: colors.onSurfaceTertiary,
    letterSpacing: 1, marginBottom: spacing.sm, marginTop: spacing.lg,
  },
  input: {
    borderWidth: 2, borderColor: colors.borderStrong, backgroundColor: colors.surfaceSecondary,
    padding: spacing.md, fontSize: typography.sizes.lg, color: colors.onSurfaceSecondary,
    borderRadius: radius.sm,
  },
  rememberRow: {
    flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, gap: spacing.xs,
  },
  rememberText: {
    fontSize: typography.sizes.sm, color: colors.onSurfaceTertiary, fontWeight: '600',
  },
  errorBox: {
    backgroundColor: colors.error, padding: spacing.md, marginTop: spacing.lg, borderRadius: radius.sm,
  },
  errorText: { color: colors.onError, fontWeight: '700' },
  primaryBtn: {
    backgroundColor: colors.brandPrimary, padding: spacing.lg, marginTop: spacing.xl,
    alignItems: 'center', borderRadius: radius.sm, minHeight: 56, justifyContent: 'center',
  },
  primaryBtnText: { color: colors.onBrandPrimary, fontWeight: '900', fontSize: typography.sizes.lg, letterSpacing: 1 },
  footerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl },
  footerText: { color: colors.muted, fontSize: typography.sizes.base },
  link: { color: colors.brandPrimary, fontWeight: '700', fontSize: typography.sizes.base },
});

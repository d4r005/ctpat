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
const isWeb = Platform.OS === 'web';

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
      if (saved) { setEmail(saved); setRememberMe(true); }
    };
    loadSavedEmail();
  }, []);

  const handleLogin = async () => {
    setError(null);
    if (!email.trim() || !password) { setError(t('ingresa_credenciales')); return; }
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      if (rememberMe) await AsyncStorage.setItem(REMEMBER_KEY, email.trim());
      else await AsyncStorage.removeItem(REMEMBER_KEY);
      router.replace('/(app)/inicio');
    } catch (e: any) { setError(e.message || t('error_sesion')); }
    finally { setLoading(false); }
  };

  const renderForm = () => (
    <View style={styles.form}>
      <Text style={styles.label}>{t('correo_electronico').toUpperCase()}</Text>
      <View style={styles.inputWrapper}>
        <Ionicons name="mail-outline" size={18} color={colors.mutedLight} />
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

      <Text style={[styles.label, { marginTop: 18 }]}>{t('contrasena').toUpperCase()}</Text>
      <View style={styles.inputWrapper}>
        <Ionicons name="lock-closed-outline" size={18} color={colors.mutedLight} />
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
          <Text style={styles.showToggle}>{showPassword ? (t('ocultar') || 'Ocultar') : (t('ver') || 'Ver')}</Text>
        </Pressable>
      </View>

      <Pressable onPress={() => setRememberMe(!rememberMe)} style={styles.rememberRow}>
        <View style={[styles.checkbox, rememberMe && styles.checkboxActive]}>
          {rememberMe && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
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
        style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.92 }]}
        onPress={handleLogin}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
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
  );

  // ── WEB: Split-screen ──
  if (isWeb) {
    return (
      <View style={styles.webContainer}>
        <View style={styles.webLeftPanel}>
          <View style={styles.webBrandBlock}>
            <View style={styles.shieldBadge}>
              <Ionicons name="shield-checkmark" size={40} color={colors.brandSecondary} />
            </View>
            <Text style={styles.webBrandName}>NAF</Text>
            <Text style={styles.webBrandSub}>SRIUC</Text>
            <View style={styles.goldDivider} />
            <Text style={styles.webTagline}>{t('sistema_registro')}</Text>
            <Text style={styles.webTaglineSub}>{t('sistema_inspeccion_sub')}</Text>
          </View>
          <Text style={styles.webCopyright}>© {new Date().getFullYear()} NAF · SRIUC — Todos los derechos reservados.</Text>
        </View>

        <View style={styles.webRightPanel}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={undefined}>
            <ScrollView contentContainerStyle={styles.webFormWrap} keyboardShouldPersistTaps="handled">
              <View style={styles.webFormCard}>
                <Text style={styles.webFormTitle}>Iniciar Sesión</Text>
                <Text style={styles.webFormSubtitle}>Ingresa tus credenciales para continuar</Text>
                {renderForm()}
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </View>
    );
  }

  // ── MOBILE ──
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.centerWrap} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
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
            {renderForm()}
          </View>
          <Text style={styles.copyright}>© {new Date().getFullYear()} NAF · SRIUC — Todos los derechos reservados.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },

  // ── Mobile ──
  centerWrap: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  card: {
    backgroundColor: '#FFFFFF', padding: spacing.xl, paddingTop: 40,
    borderRadius: 20, width: '100%', maxWidth: 440, alignSelf: 'center',
    borderWidth: 1, borderColor: colors.border, ...shadows.lg,
  },
  brandBlock: { alignItems: 'center', marginBottom: spacing.xl },
  shieldBadge: {
    width: 72, height: 72, borderRadius: 18, backgroundColor: colors.brandPrimary,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md, ...shadows.sm,
  },
  brandName: { color: colors.brandPrimary, fontSize: 32, fontWeight: '900', letterSpacing: 3 },
  brandSub: { color: colors.brandSecondary, fontSize: 14, fontWeight: '800', letterSpacing: 5, marginTop: 2 },
  goldDivider: { width: 48, height: 3, borderRadius: 2, backgroundColor: colors.brandSecondary, marginVertical: spacing.md },
  title: { fontSize: 18, fontWeight: '800', color: colors.onSurface, textAlign: 'center' },
  subtitle: { fontSize: 13, color: colors.muted, marginTop: 4, fontWeight: '500', textAlign: 'center' },
  copyright: { textAlign: 'center', color: colors.mutedLight, fontSize: 11, marginTop: spacing.lg },

  // ── Web split-screen ──
  webContainer: { flex: 1, flexDirection: 'row' as any },
  webLeftPanel: {
    flex: 1, backgroundColor: colors.brandPrimary,
    justifyContent: 'center', alignItems: 'center', padding: 64,
  },
  webBrandBlock: { alignItems: 'center' },
  webBrandName: { color: '#FFFFFF', fontSize: 56, fontWeight: '900', letterSpacing: 4, marginTop: 20 },
  webBrandSub: { color: colors.brandSecondary, fontSize: 22, fontWeight: '800', letterSpacing: 10, marginTop: 4 },
  webTagline: { color: '#FFFFFF', fontSize: 20, fontWeight: '700', textAlign: 'center', marginTop: 24 },
  webTaglineSub: { color: 'rgba(255,255,255,0.55)', fontSize: 14, fontWeight: '400', textAlign: 'center', marginTop: 8 },
  webCopyright: { color: 'rgba(255,255,255,0.3)', fontSize: 11, position: 'absolute', bottom: 28 },
  webRightPanel: { flex: 1, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center', padding: 64 },
  webFormWrap: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', width: '100%' },
  webFormCard: { width: '100%', maxWidth: 420 },
  webFormTitle: { fontSize: 28, fontWeight: '800', color: colors.onSurface, letterSpacing: -0.5 },
  webFormSubtitle: { fontSize: 14, color: colors.muted, marginTop: 6, fontWeight: '500', marginBottom: 32 },

  // ── Form ──
  form: { width: '100%' },
  label: { fontSize: 11, fontWeight: '800', color: colors.mutedDark, letterSpacing: 0.8, marginBottom: 8 },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, paddingHorizontal: 14, height: 48, marginBottom: 4,
  },
  input: { flex: 1, color: colors.onSurface, fontSize: 15, fontWeight: '500' },
  showToggle: { color: colors.brandPrimary, fontSize: 13, fontWeight: '700' },
  rememberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, marginBottom: 20 },
  checkbox: {
    width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: colors.borderStrong,
    backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
  },
  checkboxActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  rememberText: { color: colors.mutedDark, fontSize: 13, fontWeight: '500' },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.errorSurface,
    borderWidth: 1, borderColor: '#FCA5A5', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16,
  },
  errorText: { color: colors.error, fontSize: 13, fontWeight: '600' },
  primaryBtn: {
    backgroundColor: colors.brandPrimary, borderRadius: 10, height: 48,
    alignItems: 'center', justifyContent: 'center', ...shadows.sm,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  footerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  footerText: { color: colors.muted, fontSize: 13, fontWeight: '500' },
  link: { color: colors.brandPrimary, fontSize: 13, fontWeight: '700' },
});

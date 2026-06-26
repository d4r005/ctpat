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
import { colors, spacing, typography } from '@/src/constants/theme';

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
        <ScrollView contentContainerStyle={styles.centerWrap} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            {/* Top Avatar Circle */}
            <View style={styles.topAvatar}>
              <Text style={styles.avatarText}>D</Text>
            </View>

            <View style={styles.header}>
              <View style={styles.logoRow}>
                <Text style={styles.logoText}>NAF</Text>
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text style={styles.title}>{t('sistema_registro')}</Text>
                </View>
              </View>
              <Text style={styles.subtitle}>{t('sistema_inspeccion_sub')}</Text>
            </View>

            <View style={styles.form}>
              <Text style={styles.label}>{t('correo_electronico').toUpperCase()}</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  testID="login-email-input"
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="ejemplo@brancoindustries.com"
                  placeholderTextColor="#A1A1AA"
                />
              </View>

              <Text style={styles.label}>{t('contrasena').toUpperCase()}</Text>
              <View style={styles.inputWrapper}>
                <View style={styles.iconInputInner}>
                   <Ionicons name="lock-closed-outline" size={20} color="#71717A" style={{ marginRight: 8 }} />
                   <TextInput
                    testID="login-password-input"
                    style={[styles.input, { borderWidth: 0, padding: 0, flex: 1 }]}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    placeholder="••••••••"
                    placeholderTextColor="#A1A1AA"
                  />
                </View>
              </View>

              <Pressable
                onPress={() => setRememberMe(!rememberMe)}
                style={styles.rememberRow}
              >
                <View style={[styles.checkbox, rememberMe && styles.checkboxActive]}>
                  {rememberMe && <Ionicons name="checkmark" size={14} color="#FFF" />}
                </View>
                <Text style={styles.rememberText}>{t('recordar_usuario')}</Text>
              </Pressable>

              {error ? (
                <View style={styles.errorBox} testID="login-error">
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
                  <ActivityIndicator color="#FFF" />
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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#E4E4E7' }, // Light gray background like the shadow area
  centerWrap: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  card: {
    backgroundColor: '#FFFFFF',
    padding: spacing.xl,
    paddingTop: spacing.xxl,
    borderRadius: 24,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    // Shadow for elevation effect
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20 },
      android: { elevation: 10 },
      web: { boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' }
    })
  },
  topAvatar: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#71717A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#FFF', fontSize: 14, fontWeight: 'bold' },
  header: { marginBottom: spacing.xl },
  logoRow: { flexDirection: 'row', alignItems: 'center' },
  logoText: { color: '#0A2540', fontSize: 32, fontWeight: '900', letterSpacing: 1 },
  title: { fontSize: 20, fontWeight: '900', color: '#0A2540', lineHeight: 24 },
  subtitle: { fontSize: 13, color: '#71717A', marginTop: 4, fontWeight: '500' },
  form: { width: '100%' },
  label: {
    fontSize: 11, fontWeight: '900', color: '#18181B',
    letterSpacing: 0.5, marginBottom: 8, marginTop: spacing.lg,
  },
  inputWrapper: {
    backgroundColor: '#EFF6FF', // Very light blue shade
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 6,
    marginBottom: spacing.xs,
  },
  input: {
    padding: spacing.md,
    fontSize: 16,
    color: '#09090B',
  },
  iconInputInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    height: 52,
  },
  rememberRow: {
    flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, gap: 8,
  },
  checkbox: {
    width: 20, height: 20, borderWidth: 2, borderColor: '#0A2540', borderRadius: 4,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxActive: { backgroundColor: '#0A2540' },
  rememberText: { fontSize: 13, color: '#18181B', fontWeight: '700' },
  errorBox: {
    backgroundColor: '#FEE2E2', padding: spacing.md, marginTop: spacing.lg, borderLeftWidth: 4, borderLeftColor: '#EF4444',
  },
  errorText: { color: '#991B1B', fontWeight: '700', fontSize: 13 },
  primaryBtn: {
    backgroundColor: '#0A2540', paddingVertical: 18, marginTop: spacing.xxl,
    alignItems: 'center', borderRadius: 40, // Rounded button like in image
    shadowColor: '#0A2540', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
  },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14, letterSpacing: 1.5 },
  footerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl },
  footerText: { color: '#71717A', fontSize: 14, fontWeight: '500' },
  link: { color: '#0A2540', fontWeight: '800', fontSize: 14, textDecorationLine: 'underline' },
});

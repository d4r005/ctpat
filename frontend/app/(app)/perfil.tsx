import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { useInspections } from '@/src/context/InspectionContext';
import { colors, spacing, typography } from '@/src/constants/theme';

export default function Perfil() {
  const { user, signOut } = useAuth();
  const { inspections, pendingCount, isOnline, syncQueue } = useInspections();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']} testID="perfil-screen">
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <Text style={styles.title}>Perfil</Text>

        <View style={styles.card}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.name?.[0]?.toUpperCase() || 'I'}</Text>
          </View>
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>

        <View style={styles.statsBlock}>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>TOTAL INSPECCIONES</Text>
            <Text style={styles.statValue}>{inspections.length}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>PENDIENTES DE SINCRONIZAR</Text>
            <Text style={[styles.statValue, pendingCount > 0 && { color: colors.warning }]}>{pendingCount}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>ESTADO</Text>
            <View style={[styles.statusDot, { backgroundColor: isOnline ? colors.success : colors.warning }]}>
              <Text style={styles.statusDotText}>{isOnline ? 'EN LÍNEA' : 'OFFLINE'}</Text>
            </View>
          </View>
        </View>

        {pendingCount > 0 && isOnline && (
          <Pressable testID="perfil-sync-button" style={styles.syncBtn} onPress={syncQueue}>
            <Ionicons name="cloud-upload" size={20} color={colors.onInfo} />
            <Text style={styles.syncBtnText}>SINCRONIZAR AHORA ({pendingCount})</Text>
          </Pressable>
        )}

        <Pressable testID="perfil-signout-button" style={styles.signOutBtn} onPress={handleSignOut}>
          <Ionicons name="log-out" size={20} color={colors.onError} />
          <Text style={styles.signOutText}>CERRAR SESIÓN</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  title: { fontSize: typography.sizes.xxl, fontWeight: '900', color: colors.onSurface, marginBottom: spacing.lg },
  card: {
    backgroundColor: colors.surfaceSecondary, borderWidth: 2, borderColor: colors.borderStrong,
    padding: spacing.xl, alignItems: 'center', marginBottom: spacing.lg,
  },
  avatar: {
    width: 72, height: 72, backgroundColor: colors.brandPrimary,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md,
  },
  avatarText: { color: colors.onBrandPrimary, fontWeight: '900', fontSize: 32 },
  name: { fontSize: typography.sizes.xl, fontWeight: '900', color: colors.onSurface },
  email: { color: colors.muted, marginTop: 4 },
  statsBlock: { backgroundColor: colors.surfaceSecondary, borderWidth: 2, borderColor: colors.borderStrong, marginBottom: spacing.lg },
  statRow: {
    padding: spacing.md, flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  statLabel: { fontSize: 11, fontWeight: '700', color: colors.onSurfaceTertiary, letterSpacing: 1 },
  statValue: { fontSize: typography.sizes.lg, fontWeight: '900', color: colors.onSurface },
  statusDot: { paddingHorizontal: spacing.sm, paddingVertical: 4 },
  statusDotText: { color: '#FFF', fontWeight: '900', fontSize: 10, letterSpacing: 1 },
  syncBtn: {
    backgroundColor: colors.info, padding: spacing.lg, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.md,
  },
  syncBtnText: { color: colors.onInfo, fontWeight: '900', letterSpacing: 1 },
  signOutBtn: {
    backgroundColor: colors.error, padding: spacing.lg, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
  },
  signOutText: { color: colors.onError, fontWeight: '900', letterSpacing: 1 },
});

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/src/context/AuthContext';
import { colors, spacing } from '@/src/constants/theme';

/**
 * Guarda de acceso por rol. Evita que un rol entre a módulos de otra área
 * (p.ej. inspector/guardia → almacén, almacenista → seguridad) incluso
 * accediendo por URL directa. Supervisor y admin pasan siempre.
 */
export default function RoleGate({
  children,
  allow,
}: {
  children: React.ReactNode;
  allow: (role?: string) => boolean;
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.center}>
        <Ionicons name="hourglass-outline" size={48} color={colors.muted} />
      </View>
    );
  }

  if (!allow(user?.role)) {
    return (
      <View style={styles.center}>
        <View style={styles.iconWrap}>
          <Ionicons name="lock-closed" size={40} color={colors.onBrandPrimary} />
        </View>
        <Text style={styles.title}>ACCESO NO AUTORIZADO</Text>
        <Text style={styles.sub}>
          Tu rol no tiene permiso para ver este módulo.
        </Text>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, padding: spacing.lg },
  iconWrap: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: colors.brandPrimary,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg,
  },
  title: { fontSize: 18, fontWeight: '900', color: colors.onSurface, letterSpacing: 1, marginBottom: spacing.sm },
  sub: { fontSize: 13, color: colors.muted, textAlign: 'center' },
});

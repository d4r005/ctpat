import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { colors, spacing } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

interface MainHeaderProps {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
}

const MainHeader: React.FC<MainHeaderProps> = ({ title, subtitle, showBack }) => {
  const { user } = useAuth();
  const router = useRouter();

  return (
    <View style={styles.brandHeader}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
        {showBack && (
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.brandLogo}>{title || 'NAF'}</Text>
          <Text style={styles.brandSubtitle}>
            {subtitle || 'Sistema de Registro e Inspección de Unidades de Carga'}
          </Text>
        </View>
      </View>
      <View style={styles.userContainer}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{user?.name?.charAt(0).toUpperCase() || 'D'}</Text>
          <View style={styles.onlineIndicator} />
        </View>
        <Text style={styles.onlineStatusText}>● ON LINE</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  brandHeader: {
    backgroundColor: colors.brandPrimary,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: spacing.xl,
  },
  backBtn: {
    marginRight: spacing.md,
    padding: 4,
  },
  brandLogo: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 2,
  },
// ... rest of styles
  brandSubtitle: {
    color: '#FFF',
    fontSize: 10,
    opacity: 0.8,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  userContainer: {
    alignItems: 'center',
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FFF',
  },
  avatarText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: colors.brandPrimary,
  },
  onlineStatusText: {
    color: colors.success,
    fontSize: 8,
    fontWeight: '900',
    marginTop: 4,
  },
});

export default MainHeader;

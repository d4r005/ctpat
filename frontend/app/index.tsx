import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { colors } from '@/src/constants/theme';

export default function Index() {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.container} testID="splash-loading">
        <ActivityIndicator size="large" color={colors.brandSecondary} />
      </View>
    );
  }

  if (token) return <Redirect href="/(app)/inicio" />;
  return <Redirect href="/login" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.brandPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

import React, { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '@/src/context/AuthContext';
import { colors } from '@/src/constants/theme';
import { View, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

export default function AppLayout() {
  const { token, loading, user } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const isAdminOrSup = user?.role === 'admin' || user?.role === 'supervisor' ||
    ['d.trujillo@brancoindustries.com', 'd4r005@gmail.com'].includes(user?.email || '');

  useEffect(() => {
    if (!loading && !token) router.replace('/login');
  }, [token, loading, router]);

  if (loading || !token) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.surface }}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopWidth: 2,
          borderTopColor: colors.borderStrong,
          height: 64 + (insets.bottom > 0 ? insets.bottom - 8 : 0),
          paddingTop: 6,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
      }}
    >
      {/* ── TABS VISIBLES ── */}
      <Tabs.Screen
        name="inicio"
        options={{
          title: t('inicio'),
          tabBarIcon: ({ color }) => <Ionicons name="home-sharp" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="historico"
        options={{
          title: t('historico'),
          tabBarIcon: ({ color }) => <Ionicons name="time-sharp" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="caseta/index"
        options={{
          title: t('caseta'),
          tabBarIcon: ({ color }) => <Ionicons name="business-sharp" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="nueva"
        options={{
          title: t('inspeccion'),
          tabBarIcon: ({ color }) => <Ionicons name="clipboard-sharp" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="embarque/index"
        options={{
          title: t('embarque'),
          tabBarIcon: ({ color }) => <MaterialCommunityIcons name="truck-fast" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="supervisor"
        options={{
          title: t('maestro').toUpperCase(),
          tabBarIcon: ({ color }) => <Ionicons name="shield-checkmark-sharp" size={22} color={color} />,
          href: isAdminOrSup ? undefined : null,
        }}
      />

      {/* ── RUTAS INTERNAS — ocultas del tab bar ── */}
      <Tabs.Screen name="caseta/nuevo" options={{ href: null }} />
      <Tabs.Screen name="caseta/[id]"  options={{ href: null }} />
      <Tabs.Screen name="embarque/nuevo" options={{ href: null }} />
      <Tabs.Screen name="embarque/[id]"  options={{ href: null }} />
      <Tabs.Screen name="chat"       options={{ href: null }} />
      <Tabs.Screen name="usuarios"   options={{ href: null }} />
      <Tabs.Screen name="analitica"  options={{ href: null }} />
      <Tabs.Screen name="perfil"     options={{ href: null }} />
      <Tabs.Screen name="inspection/[id]" options={{ href: null }} />
    </Tabs>
  );
}

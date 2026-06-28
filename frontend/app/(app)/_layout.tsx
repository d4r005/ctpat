import React, { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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
  const isAdmin = user?.role === 'admin' || user?.email === 'd.trujillo@brancoindustries.com' || user?.email === 'd4r005@gmail.com';
  const isSupervisor = user?.role === 'supervisor' || isAdmin;

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
        animation: 'none', // Desactiva animaciones pesadas en web
        lazy: true,        // Solo carga el panel cuando lo tocas
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopWidth: 2,
          borderTopColor: colors.borderStrong,
          height: 64 + (insets.bottom > 0 ? insets.bottom - 8 : 0),
          paddingTop: 6,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="inicio"
        options={{
          title: t('inicio'),
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="historico"
        options={{
          title: t('historico'),
          tabBarIcon: ({ color, size }) => <Ionicons name="list" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="caseta"
        options={{
          title: t('caseta'),
          tabBarIcon: ({ color, size }) => <Ionicons name="business" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="embarque"
        options={{
          title: t('embarque'),
          tabBarIcon: ({ color, size }) => <Ionicons name="cube" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="nueva"
        options={{
          title: t('inspeccion'),
          tabBarIcon: ({ color, size }) => <Ionicons name="add-circle" size={size + 4} color={color} />,
        }}
      />
      <Tabs.Screen
        name="supervisor"
        options={{
          title: isAdmin ? (t('panel_maestro_tabs') || t('panel')) : t('supervisor'),
          href: isSupervisor ? '/(app)/supervisor' : null,
          tabBarIcon: ({ color, size }) => <Ionicons name={isAdmin ? "shield-half" : "shield-checkmark"} size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="usuarios"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="analitica"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="caseta/[id]"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="embarque/[id]"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

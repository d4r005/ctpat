import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { apiCall } from '@/src/api/client';
import { useAuth, User } from '@/src/context/AuthContext';
import { colors, spacing, typography } from '@/src/constants/theme';

export default function Usuarios({ nested = false }: { nested?: boolean }) {
  const { user, token } = useAuth();
  const { t } = useTranslation();
  const isAdmin = user?.email?.toLowerCase().includes('d.trujillo') || user?.role === 'admin';
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'inspector' | 'supervisor' | 'admin'>('inspector');
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiCall<User[]>('/users', { token });
      setUsers(data);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const isSupervisorOrAdmin = user?.role === 'supervisor' || user?.role === 'admin';

  useEffect(() => { if (isSupervisorOrAdmin) load(); }, [token]);

  const handleToggle = async (u: User) => {
    if (u.id === user?.id) return;
    try {
      await apiCall(`/users/${u.id}/toggle-active`, { method: 'POST', token });
      await load();
    } catch (e: any) { alert(e.message); }
  };

  const handleDelete = async (u: User) => {
    if (u.id === user?.id) return;
    if (!confirm(`${t('confirmar_eliminar_usuario')} ${u.name}?`)) return;
    try {
      await apiCall(`/users/${u.id}`, { method: 'DELETE', token });
      await load();
    } catch (e: any) { alert(e.message); }
  };

  const handleEditClick = (u: User) => {
    setEditingUser(u);
    setNewName(u.name);
    setNewEmail(u.email);
    setNewRole(u.role as any);
    setNewPassword(''); // Keep password empty if not changing
    setShowCreate(true);
  };

  const handleCloseModal = () => {
    setShowCreate(false);
    setEditingUser(null);
    setNewName('');
    setNewEmail('');
    setNewPassword('');
    setNewRole('inspector');
    setError(null);
  };

  const confirm = (msg: string) => {
    if (Platform.OS === 'web') return window.confirm(msg);
    // Para simplificar en nativo usaremos alert, en producción se usaría Alert.alert
    return true;
  };

  const handleCreate = async () => {
    setError(null);
    if (!newName.trim() || !newEmail.trim()) {
      setError(t('error_nombre_correo'));
      return;
    }
    if (!editingUser && newPassword.length < 6) {
      setError(t('contrasena_corta'));
      return;
    }
    setCreating(true);
    try {
      if (editingUser) {
        await apiCall(`/users/${editingUser.id}`, {
          method: 'PATCH', token,
          body: {
            name: newName.trim().toUpperCase(), // Mayúsculas para nombres
            email: newEmail.trim().toLowerCase(),
            role: newRole,
            ...(newPassword.length >= 6 ? { password: newPassword } : {})
          },
        });
      } else {
        await apiCall('/users/create-inspector', {
          method: 'POST', token,
          body: {
            name: newName.trim().toUpperCase(), // Mayúsculas para nombres
            email: newEmail.trim().toLowerCase(),
            password: newPassword,
            role: newRole
          },
        });
      }
      handleCloseModal();
      await load();
    } catch (e: any) { setError(e.message); }
    finally { setCreating(false); }
  };

  if (!isSupervisorOrAdmin) {
    return (
      <View style={styles.center}><Text style={{ color: colors.muted }}>{t('acceso_restringido')}</Text></View>
    );
  }

  const Content = (
    <View style={{ flex: 1 }}>
      {!nested && (
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} testID="usuarios-back"><Ionicons name="arrow-back" size={24} color={colors.onSurface} /></Pressable>
          <Text style={styles.title}>{t('gestion_usuarios')}</Text>
          <Pressable testID="usuarios-add-btn" onPress={() => setShowCreate(true)}>
            <Ionicons name="person-add" size={24} color={colors.brandPrimary} />
          </Pressable>
        </View>
      )}

      {nested && (
        <View style={{ padding: spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
           <Text style={[styles.title, { fontSize: 14 }]}>{t('control_acceso')}</Text>
           <Pressable testID="usuarios-add-btn" onPress={() => setShowCreate(true)} style={{ backgroundColor: colors.brandPrimary, padding: 8 }}>
            <Ionicons name="person-add" size={18} color="#FFF" />
          </Pressable>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ padding: nested ? spacing.md : spacing.lg }}
          renderItem={({ item }) => (
            <View style={[styles.userRow, nested && { padding: spacing.sm, marginBottom: spacing.xs }]} testID={`usuario-${item.id}`}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                  <Text style={[styles.userName, nested && { fontSize: 12 }]}>{item.name}</Text>
                  {item.role === 'admin' && (
                    <View style={[styles.roleChip, { backgroundColor: colors.info }]}><Text style={styles.roleChipText}>ADMIN</Text></View>
                  )}
                  {item.role === 'supervisor' && (
                    <View style={styles.roleChip}><Text style={styles.roleChipText}>SUPER</Text></View>
                  )}
                  {!item.active && (
                    <View style={[styles.roleChip, { backgroundColor: colors.error }]}>
                      <Text style={styles.roleChipText}>{t('inactivo').toUpperCase()}</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.userEmail, nested && { fontSize: 10 }]}>{item.email}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                <Pressable
                  style={[styles.toggleBtn, { backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.sm }]}
                  onPress={() => handleEditClick(item)}
                >
                  <Ionicons name="pencil" size={14} color="#FFF" />
                </Pressable>
                {item.id !== user.id && (
                  <>
                    <Pressable
                      testID={`usuario-toggle-${item.id}`}
                      style={[styles.toggleBtn, { backgroundColor: item.active ? colors.warning : colors.success, paddingHorizontal: spacing.sm }]}
                      onPress={() => handleToggle(item)}
                    >
                      <Text style={[styles.toggleBtnText, { fontSize: 9 }]}>{item.active ? t('pausar').toUpperCase() : t('activar').toUpperCase()}</Text>
                    </Pressable>
                    {isAdmin && (
                      <Pressable
                        testID={`usuario-delete-${item.id}`}
                        style={[styles.toggleBtn, { backgroundColor: colors.error, paddingHorizontal: spacing.sm }]}
                        onPress={() => handleDelete(item)}
                      >
                        <Ionicons name="trash" size={14} color="#FFF" />
                      </Pressable>
                    )}
                  </>
                )}
              </View>
            </View>
          )}
        />
      )}

      {showCreate && (
        <View style={styles.modalOverlay} testID="create-user-modal">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', maxWidth: 480 }}>
            <ScrollView contentContainerStyle={styles.modalCard} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>{editingUser ? t('editar_usuario') : t('nuevo_usuario')}</Text>

              <Text style={styles.label}>{t('nombre')}</Text>
              <TextInput
                testID="create-user-name"
                autoCapitalize="characters"
                style={styles.input}
                value={newName}
                onChangeText={(text) => setNewName(text.toUpperCase())}
              />

              <Text style={styles.label}>{t('correo')}</Text>
              <TextInput testID="create-user-email" style={styles.input} value={newEmail} onChangeText={setNewEmail} autoCapitalize="none" keyboardType="email-address" />

              <Text style={styles.label}>{t('contrasena')} {editingUser && t('contrasena_blanco_editar')}</Text>
              <TextInput testID="create-user-password" style={styles.input} value={newPassword} onChangeText={setNewPassword} secureTextEntry />

              <Text style={styles.label}>{t('rol')}</Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {(['inspector', 'supervisor', 'admin'] as const).map((r) => (
                  <Pressable
                    key={r}
                    testID={`create-user-role-${r}`}
                    onPress={() => setNewRole(r as any)}
                    style={[styles.roleOpt, newRole === r && styles.roleOptActive]}
                  >
                    <Text style={[styles.roleOptText, newRole === r && { color: colors.onBrandPrimary }]}>{r.toUpperCase()}</Text>
                  </Pressable>
                ))}
              </View>

              {error && <Text style={{ color: colors.error, marginTop: spacing.md, fontWeight: '700' }}>{error}</Text>}

              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }}>
                <Pressable testID="create-user-cancel" style={[styles.btn, styles.btnSecondary]} onPress={handleCloseModal}>
                  <Text style={styles.btnSecondaryText}>{t('cancelar_caps')}</Text>
                </Pressable>
                <Pressable testID="create-user-submit" style={[styles.btn, styles.btnPrimary]} onPress={handleCreate} disabled={creating}>
                  {creating ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.btnPrimaryText}>{editingUser ? t('guardar').toUpperCase() : t('crear').toUpperCase()}</Text>}
                </Pressable>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      )}
    </View>
  );

  if (nested) return Content;

  return (
    <SafeAreaView style={styles.safe} edges={['top']} testID="usuarios-screen">
      {Content}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    padding: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surfaceSecondary, borderBottomWidth: 2, borderBottomColor: colors.borderStrong,
  },
  title: { fontSize: typography.sizes.lg, fontWeight: '900', color: colors.onSurface },
  userRow: {
    backgroundColor: colors.surfaceSecondary, borderWidth: 2, borderColor: colors.borderStrong,
    padding: spacing.md, marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center',
  },
  userName: { fontWeight: '900', color: colors.onSurface, fontSize: typography.sizes.base },
  userEmail: { color: colors.muted, fontSize: typography.sizes.sm, marginTop: 2 },
  roleChip: { backgroundColor: colors.brandPrimary, paddingHorizontal: 6, paddingVertical: 2 },
  roleChipText: { color: '#FFF', fontWeight: '900', fontSize: 9, letterSpacing: 1 },
  toggleBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  toggleBtnText: { color: '#FFF', fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  modalOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(9,9,11,0.85)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg, zIndex: 100,
  },
  modalCard: { backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderWidth: 2, borderColor: colors.borderStrong },
  modalTitle: { fontWeight: '900', fontSize: typography.sizes.lg, color: colors.onSurface, marginBottom: spacing.md, letterSpacing: 1 },
  label: { fontSize: 11, fontWeight: '900', color: colors.onSurfaceTertiary, letterSpacing: 1, marginBottom: 6, marginTop: spacing.md },
  input: { borderWidth: 2, borderColor: colors.borderStrong, padding: spacing.md, fontSize: typography.sizes.base, color: colors.onSurface, backgroundColor: colors.surface },
  roleOpt: { flex: 1, borderWidth: 2, borderColor: colors.borderStrong, padding: spacing.md, alignItems: 'center' },
  roleOptActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  roleOptText: { fontWeight: '900', letterSpacing: 1, color: colors.onSurface },
  btn: { flex: 1, padding: spacing.md, alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  btnPrimary: { backgroundColor: colors.brandPrimary },
  btnPrimaryText: { color: colors.onBrandPrimary, fontWeight: '900', letterSpacing: 1 },
  btnSecondary: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.borderStrong },
  btnSecondaryText: { color: colors.onSurface, fontWeight: '900', letterSpacing: 1 },
});

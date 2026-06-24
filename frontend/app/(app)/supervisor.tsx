import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput, RefreshControl, Platform,
  useWindowDimensions, Modal, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import { useTranslation } from 'react-i18next';
import { useInspections, Inspection } from '@/src/context/InspectionContext';
import { useAuth } from '@/src/context/AuthContext';
import { apiCall } from '@/src/api/client';
import { colors, spacing, typography } from '@/src/constants/theme';
import { generateConsolidatedReportHtml } from '@/src/utils/reportGenerator';

import Usuarios from './usuarios';
import Analitica from './analitica';

type TabType = 'inspecciones' | 'caseta' | 'embarque' | 'usuarios' | 'kpis';

export default function Supervisor() {
  const { user, token } = useAuth();
  const isAdmin = user?.email === 'd.trujillo@brancoindustries.com';

  const downloadConsolidatedPdf = async (item: any) => {
    try {
      setDataLoading(true);
      // Fetch full details if necessary or use item if it has enough data
      // For consolidated report, we need Inspection, Caseta and Embarque data

      const record = activeTab === 'caseta' ? item : null; // Assuming item is from filteredCaseta
      if (!record) {
        alert('Solo disponible desde la pestaña de CASETA por el momento');
        return;
      }

      const insp = allInspections.find(i => i.id === record.inspection_id);
      const ship = shippingTickets.find(s => s.inspection_id === record.inspection_id);

      if (!insp) {
        alert('No se encontró la inspección vinculada');
        return;
      }

      const reportData = { inspection: insp, caseta: record, embarque: ship };

      // Generate both Spanish and Chinese in the same PDF or separate?
      // User asked for "en español y chino", usually means both versions.
      const htmlEs = generateConsolidatedReportHtml(reportData, 'es');
      const htmlZh = generateConsolidatedReportHtml(reportData, 'zh');

      const combinedHtml = `
        ${htmlEs}
        <div style="page-break-before: always;"></div>
        ${htmlZh}
      `;

      const { uri } = await Print.printToFileAsync({ html: combinedHtml, base64: false });

      if (Platform.OS === 'web') {
        const response = await fetch(uri);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Reporte_Consolidado_${insp.placas_unidad}.pdf`;
        a.click();
      } else {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Descargar Reporte Consolidado' });
      }
    } catch (e: any) {
      alert('Error al generar PDF: ' + e.message);
    } finally {
      setDataLoading(false);
    }
  };

  if (user?.role !== 'supervisor' && !isAdmin) {
    return (
      <SafeAreaView style={styles.safe}><View style={styles.center}><Text>Acceso restringido</Text></View></SafeAreaView>
    );
  }

  const tabs: TabType[] = ['inspecciones', 'caseta', 'embarque', 'kpis'];
  if (isAdmin) tabs.push('usuarios');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
          <Text style={styles.title}>Panel Maestro</Text>
          {isAdmin && <View style={[styles.roleChip, { backgroundColor: colors.info }]}><Text style={styles.roleChipText}>ADMINISTRADOR</Text></View>}
        </View>

        {(activeTab === 'inspecciones' || activeTab === 'caseta' || activeTab === 'embarque') && (
          <>
            <View style={styles.searchRow}>
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar por placa, chofer o compañía..."
                value={query}
                onChangeText={setQuery}
                placeholderTextColor={colors.muted}
              />
              <Ionicons name="search" size={20} color={colors.muted} />
            </View>

            <View style={styles.dateRow}>
              <TextInput style={styles.dateInput} placeholder="Desde YYYY-MM-DD" value={dateFrom} onChangeText={setDateFrom} placeholderTextColor={colors.muted} />
              <TextInput style={styles.dateInput} placeholder="Hasta YYYY-MM-DD" value={dateTo} onChangeText={setDateTo} placeholderTextColor={colors.muted} />
            </View>
          </>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll}>
          <View style={styles.tabRow}>
            {tabs.map(t => (
              <Pressable
                key={t}
                style={[styles.tab, activeTab === t && styles.tabActive]}
                onPress={() => setActiveTab(t)}
              >
                <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>{t.toUpperCase()}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>

      {activeTab === 'usuarios' && <Usuarios nested />}
      {activeTab === 'kpis' && <Analitica nested />}

      {(activeTab === 'inspecciones' || activeTab === 'caseta' || activeTab === 'embarque') && (
        <FlatList
          data={activeTab === 'inspecciones' ? filteredInspections : activeTab === 'caseta' ? filteredCaseta : filteredTickets}
          keyExtractor={item => item.id}
          refreshControl={<RefreshControl refreshing={loading || dataLoading} onRefresh={loadData} />}
          contentContainerStyle={{ padding: spacing.md }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{item.placas_unidad || (activeTab === 'caseta' ? item.entry.placas_unidad : '')}</Text>
                <Text style={styles.cardSub}>
                  {activeTab === 'inspecciones' ? item.compania_transportista :
                  activeTab === 'caseta' ? item.entry.chofer_nombre : item.operador}
                </Text>
                <Text style={styles.cardDate}>{new Date(item.created_at).toLocaleString()}</Text>
              </View>

              <View style={styles.cardActions}>
                {activeTab === 'caseta' && (
                  <>
                    <Pressable style={styles.downloadBtn} onPress={() => downloadConsolidatedPdf(item)}>
                      <Ionicons name="download" size={18} color="#FFF" />
                    </Pressable>
                    <Pressable style={styles.emailBtn} onPress={() => openEmailModal(item.id)}>
                      <Ionicons name="mail" size={18} color="#FFF" />
                      <Text style={styles.emailBtnText}>ENVIAR</Text>
                    </Pressable>
                  </>
                )}
                <Pressable
                  style={styles.viewBtn}
                  onPress={() => router.push(activeTab === 'inspecciones' ? `/inspection/${item.id}` : activeTab === 'caseta' ? `/caseta/${item.id}` : `/embarque/${item.id}`)}
                >
                  <Ionicons name="eye" size={18} color={colors.onBrandPrimary} />
                </Pressable>
              </View>
            </View>
          )}
        />
      )}

      <Modal visible={showEmailModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Enviar Reporte Consolidado</Text>
            <Text style={styles.modalLabel}>Correos adicionales (separados por coma):</Text>
            <TextInput
              style={styles.emailInput}
              placeholder="ejemplo@correo.com, otro@correo.com"
              value={emailList}
              onChangeText={setEmailList}
              multiline
            />
            <View style={styles.modalButtons}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowEmailModal(false)}>
                <Text style={styles.cancelBtnText}>CANCELAR</Text>
              </Pressable>
              <Pressable style={styles.sendBtn} onPress={handleSendEmail} disabled={sendingEmail}>
                {sendingEmail ? <ActivityIndicator color="#FFF" /> : <Text style={styles.sendBtnText}>ENVIAR AHORA</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { padding: spacing.lg, backgroundColor: colors.surfaceSecondary, borderBottomWidth: 2, borderBottomColor: colors.borderStrong },
  title: { fontSize: 24, fontWeight: '900', color: colors.brandPrimary },
  searchRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: colors.borderStrong, paddingHorizontal: spacing.md, backgroundColor: colors.surface, marginBottom: spacing.sm },
  searchInput: { flex: 1, height: 44, color: colors.onSurface },
  dateRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  dateInput: { flex: 1, borderWidth: 2, borderColor: colors.borderStrong, padding: spacing.sm, height: 40, backgroundColor: colors.surface },
  tabScroll: { marginTop: spacing.sm },
  tabRow: { flexDirection: 'row', gap: spacing.sm },
  tab: { paddingVertical: 10, paddingHorizontal: spacing.md, alignItems: 'center', borderBottomWidth: 4, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.brandPrimary },
  tabText: { fontWeight: '900', fontSize: 10, color: colors.muted },
  tabTextActive: { color: colors.brandPrimary },
  card: { backgroundColor: '#FFF', borderWidth: 2, borderColor: colors.borderStrong, padding: spacing.md, marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center' },
  cardTitle: { fontWeight: '900', fontSize: 16 },
  cardSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  cardDate: { color: colors.onSurfaceTertiary, fontSize: 10, marginTop: 4 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  viewBtn: { backgroundColor: colors.brandPrimary, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  downloadBtn: { backgroundColor: colors.brandSecondary, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  emailBtn: { backgroundColor: colors.success, paddingHorizontal: 10, height: 36, flexDirection: 'row', alignItems: 'center', gap: 4 },
  emailBtnText: { color: '#FFF', fontWeight: '900', fontSize: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: spacing.xl },
  modalCard: { backgroundColor: '#FFF', padding: spacing.xl, borderWidth: 2, borderColor: colors.borderStrong },
  modalTitle: { fontWeight: '900', fontSize: 18, marginBottom: spacing.lg },
  modalLabel: { fontSize: 12, fontWeight: '700', marginBottom: 8 },
  emailInput: { borderWidth: 2, borderColor: colors.borderStrong, padding: spacing.md, minHeight: 80, textAlignVertical: 'top', marginBottom: spacing.lg },
  modalButtons: { flexDirection: 'row', gap: spacing.md },
  cancelBtn: { flex: 1, padding: spacing.md, alignItems: 'center', borderWidth: 2, borderColor: colors.borderStrong },
  cancelBtnText: { fontWeight: '900' },
  sendBtn: { flex: 1, padding: spacing.md, alignItems: 'center', backgroundColor: colors.brandPrimary },
  sendBtnText: { color: '#FFF', fontWeight: '900' },
  roleChip: { backgroundColor: colors.brandPrimary, paddingHorizontal: 8, paddingVertical: 4 },
  roleChipText: { color: '#FFF', fontWeight: '900', fontSize: 9, letterSpacing: 1 },
});


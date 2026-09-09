import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacing } from '@/src/constants/theme';

/**
 * Mapa interactivo de la caja (interior del remolque) desplegado en 2D.
 *
 * Layout tipo "caja desdoblada":
 *
 *            ┌──────────────┐
 *            │    TECHO     │
 *   ┌────────┼──────────────┼────────┐
 *   │ PARED  │              │ PARED │
 *   │  IZQ.  │     PISO     │  DER. │
 *   └────────┴──────────────┴────────┘
 *   ┌──────────────┬──────────────┐
 *   │    FRENTE    │   PUERTAS    │
 *   └──────────────┴──────────────┘
 *
 * Cada superficie tiene 6 zonas (rejilla 3x2). Tocar una zona la alterna
 * entre OK y DAÑADO (rojo). Los estados se guardan como arrays de 6 booleans.
 */

export const DAMAGE_SURFACES = [
  { key: 'techo', label: 'TECHO' },
  { key: 'piso', label: 'PISO' },
  { key: 'pared_izq', label: 'PARED IZQ.' },
  { key: 'pared_der', label: 'PARED DER.' },
  { key: 'frente', label: 'FRENTE' },
  { key: 'puertas', label: 'PUERTAS' },
] as const;

export type DamageSurfaceKey = typeof DAMAGE_SURFACES[number]['key'];
export type DamageMap = Record<string, boolean[]>;

export const emptyDamageMap = (): DamageMap => {
  const m: DamageMap = {};
  DAMAGE_SURFACES.forEach(s => { m[s.key] = Array(6).fill(false); });
  return m;
};

export const countDamages = (map: DamageMap | undefined | null): number => {
  if (!map) return 0;
  return DAMAGE_SURFACES.reduce((acc, s) => acc + (Array.isArray(map[s.key]) ? map[s.key].filter(Boolean).length : 0), 0);
};

interface Props {
  value: DamageMap;
  onChange?: (map: DamageMap) => void;
  readOnly?: boolean;
}

function SurfacePanel({ surfaceKey, label, zones, onToggleZone, readOnly }: {
  surfaceKey: string;
  label: string;
  zones: boolean[];
  onToggleZone?: (surfaceKey: string, idx: number) => void;
  readOnly?: boolean;
}) {
  const damaged = zones.filter(Boolean).length;
  return (
    <View style={styles.panelWrap}>
      <View style={[styles.panelLabel, damaged > 0 && styles.panelLabelBad]}>
        <Text style={[styles.panelLabelText, damaged > 0 && styles.panelLabelTextBad]}>{label}</Text>
        {damaged > 0 && <Text style={styles.panelLabelCount}>{damaged}</Text>}
      </View>
      <View style={[styles.grid, damaged > 0 && styles.gridBad]}>
        {Array.from({ length: 6 }).map((_, idx) => {
          const isDamaged = !!zones[idx];
          const cell = (
            <View style={[styles.cell, isDamaged && styles.cellBad]}>
              <Text style={[styles.cellNum, isDamaged && styles.cellNumBad]}>{idx + 1}</Text>
            </View>
          );
          if (readOnly || !onToggleZone) return <View key={idx} style={styles.cellTouch}>{cell}</View>;
          return (
            <Pressable
              key={idx}
              style={styles.cellTouch}
              onPress={() => onToggleZone(surfaceKey, idx)}
              accessibilityLabel={`${label} zona ${idx + 1}${isDamaged ? ' dañada' : ''}`}
            >
              {cell}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function BoxDamageMap({ value, onChange, readOnly }: Props) {
  const toggleZone = (surfaceKey: string, idx: number) => {
    if (!onChange) return;
    const next: DamageMap = { ...value };
    next[surfaceKey] = [...(next[surfaceKey] || Array(6).fill(false))];
    next[surfaceKey][idx] = !next[surfaceKey][idx];
    onChange(next);
  };

  const zonas = (k: string) => (Array.isArray(value?.[k]) && value[k].length === 6 ? value[k] : Array(6).fill(false));

  return (
    <View style={styles.container}>
      {/* Fila 1: techo centrado */}
      <View style={styles.row}>
        <View style={styles.spacer} />
        <View style={styles.midPanel}>
          <SurfacePanel surfaceKey="techo" label="TECHO" zones={zonas('techo')} onToggleZone={toggleZone} readOnly={readOnly} />
        </View>
        <View style={styles.spacer} />
      </View>

      {/* Fila 2: pared izq | piso | pared der */}
      <View style={styles.row}>
        <View style={styles.sidePanel}>
          <SurfacePanel surfaceKey="pared_izq" label="PARED IZQ." zones={zonas('pared_izq')} onToggleZone={toggleZone} readOnly={readOnly} />
        </View>
        <View style={styles.midPanel}>
          <SurfacePanel surfaceKey="piso" label="PISO" zones={zonas('piso')} onToggleZone={toggleZone} readOnly={readOnly} />
        </View>
        <View style={styles.sidePanel}>
          <SurfacePanel surfaceKey="pared_der" label="PARED DER." zones={zonas('pared_der')} onToggleZone={toggleZone} readOnly={readOnly} />
        </View>
      </View>

      {/* Fila 3: frente | puertas */}
      <View style={styles.row}>
        <View style={styles.midPanel}>
          <SurfacePanel surfaceKey="frente" label="FRENTE" zones={zonas('frente')} onToggleZone={toggleZone} readOnly={readOnly} />
        </View>
        <View style={styles.midPanel}>
          <SurfacePanel surfaceKey="puertas" label="PUERTAS" zones={zonas('puertas')} onToggleZone={toggleZone} readOnly={readOnly} />
        </View>
      </View>

      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.border }]} />
          <Text style={styles.legendText}>ZONA OK</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.error }]} />
          <Text style={styles.legendText}>ZONA DAÑADA</Text>
        </View>
      </View>
      {!readOnly && <Text style={styles.hint}>Toca una zona para marcarla como dañada</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceSecondary, padding: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  spacer: { flex: 1 },
  midPanel: { flex: 2 },
  sidePanel: { flex: 1.15 },
  panelWrap: { flex: 1 },
  panelLabel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surfaceTertiary, paddingHorizontal: spacing.sm, paddingVertical: 3, borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.borderStrong },
  panelLabelBad: { backgroundColor: colors.errorSurface },
  panelLabelText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5, color: colors.mutedDark },
  panelLabelTextBad: { color: colors.onError },
  panelLabelCount: { fontSize: 9, fontWeight: '900', color: colors.onError },
  grid: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: 1, borderColor: colors.borderStrong },
  gridBad: { borderColor: colors.error },
  cellTouch: { width: '33.333%', aspectRatio: 1, padding: 1.5 },
  cell: { flex: 1, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSecondary },
  cellBad: { backgroundColor: colors.error, borderColor: colors.error },
  cellNum: { fontSize: 10, fontWeight: '900', color: colors.mutedLight },
  cellNumBad: { color: '#FFF' },
  legendRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.xs, marginBottom: spacing.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 2 },
  legendText: { fontSize: 9, fontWeight: '800', color: colors.muted, letterSpacing: 0.5 },
  hint: { fontSize: 10, color: colors.mutedLight, textAlign: 'center' },
});

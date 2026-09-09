import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Rect, Circle, Line, Path, G } from 'react-native-svg';
import { colors, spacing } from '@/src/constants/theme';

/**
 * Mapa interactivo de daños del remolque — vistas técnicas tipo "blueprint"
 * (frente, ambos laterales, puertas/atrás, techo y piso), inspirado en las
 * ilustraciones de mockup de tráileres. Cada vista se dibuja como una
 * silueta técnica en SVG y sobre ella se sobrepone una rejilla de 6 zonas
 * tocables que se marcan en rojo cuando tienen daño.
 *
 * El PISO se muestra como una vista propia (no solo un hueco entre las
 * paredes) con nervaduras del piso y ejes/llantas visibles desde abajo,
 * distinta del TECHO (que muestra la unidad de refrigeración y respiraderos).
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

// ─────────────────────────────────────────────────────────────
// Ilustraciones técnicas (silueta del remolque por vista)
// ─────────────────────────────────────────────────────────────

const STROKE = colors.mutedDark;
const FILL_BOX = colors.surfaceSecondary;
const FILL_DETAIL = colors.surfaceTertiary;
const FILL_DARK = colors.mutedDark;

function SideTrailerArt({ mirrored }: { mirrored?: boolean }) {
  // viewBox 0 0 400 110 — cabina a la izquierda, caja a la derecha (o espejado)
  const content = (
    <>
      {/* Cabina (contexto, fuera del área tocable) */}
      <Path d="M6,74 L6,50 L34,26 L64,26 L64,74 Z" fill={FILL_DETAIL} stroke={STROKE} strokeWidth={2} />
      <Line x1="36" y1="26" x2="20" y2="50" stroke={STROKE} strokeWidth={1.5} />
      <Rect x={2} y={74} width={66} height={9} fill={FILL_DARK} opacity={0.85} />
      {/* Chasis */}
      <Rect x={20} y={83} width={372} height={7} fill={FILL_DARK} opacity={0.8} />
      {/* Caja / remolque */}
      <Rect x={68} y={14} width={324} height={72} rx={4} fill={FILL_BOX} stroke={STROKE} strokeWidth={2.5} />
      <Line x1={68} y1={36} x2={392} y2={36} stroke={colors.border} strokeWidth={1} />
      <Line x1={68} y1={60} x2={392} y2={60} stroke={colors.border} strokeWidth={1} />
      <Line x1={376} y1={14} x2={376} y2={86} stroke={colors.border} strokeWidth={1.5} />
      {/* Llantas */}
      <Circle cx={44} cy={96} r={13} fill={FILL_DARK} />
      <Circle cx={44} cy={96} r={5} fill={FILL_DETAIL} />
      {[300, 328, 356].map(cx => (
        <React.Fragment key={cx}>
          <Circle cx={cx} cy={96} r={13} fill={FILL_DARK} />
          <Circle cx={cx} cy={96} r={5} fill={FILL_DETAIL} />
        </React.Fragment>
      ))}
    </>
  );
  return (
    <Svg viewBox="0 0 400 110" width="100%" height="100%" preserveAspectRatio="none">
      {mirrored ? <G transform="scale(-1,1) translate(-400,0)">{content}</G> : content}
    </Svg>
  );
}

function TopTrailerArt() {
  // TECHO — vista superior: unidad de refrigeración + respiraderos
  return (
    <Svg viewBox="0 0 400 100" width="100%" height="100%" preserveAspectRatio="none">
      <Path d="M0,38 L18,24 L18,76 L0,66 Z" fill={FILL_DETAIL} opacity={0.5} stroke={STROKE} strokeWidth={1} strokeDasharray="3,3" />
      <Rect x={20} y={15} width={360} height={70} rx={6} fill={FILL_BOX} stroke={STROKE} strokeWidth={2.5} />
      <Rect x={20} y={15} width={46} height={70} rx={3} fill={FILL_DETAIL} stroke={STROKE} strokeWidth={2} />
      <Line x1={30} y1={22} x2={30} y2={78} stroke={colors.border} strokeWidth={1} />
      <Line x1={40} y1={22} x2={40} y2={78} stroke={colors.border} strokeWidth={1} />
      <Line x1={50} y1={22} x2={50} y2={78} stroke={colors.border} strokeWidth={1} />
      {[140, 220, 300].map(cx => (
        <Circle key={cx} cx={cx} cy={50} r={6} fill="none" stroke={STROKE} strokeWidth={1.5} />
      ))}
      <Line x1={66} y1={50} x2={380} y2={50} stroke={colors.border} strokeWidth={1} strokeDasharray="4,4" />
    </Svg>
  );
}

function FloorTrailerArt() {
  // PISO — vista inferior: nervaduras del piso + ejes/llantas + soporte de patas
  return (
    <Svg viewBox="0 0 400 100" width="100%" height="100%" preserveAspectRatio="none">
      <Rect x={20} y={15} width={360} height={70} rx={6} fill={FILL_BOX} stroke={STROKE} strokeWidth={2.5} />
      {Array.from({ length: 21 }).map((_, i) => {
        const x = 30 + i * 16;
        if (x > 372) return null;
        return <Line key={i} x1={x} y1={17} x2={x} y2={83} stroke={colors.border} strokeWidth={1} />;
      })}
      {/* Patas de apoyo (landing gear) */}
      <Rect x={60} y={83} width={9} height={16} fill={FILL_DARK} />
      <Rect x={90} y={83} width={9} height={16} fill={FILL_DARK} />
      {/* Ejes / tren de rodaje */}
      <Line x1={286} y1={85} x2={370} y2={85} stroke={STROKE} strokeWidth={2} />
      {[300, 328, 356].map(cx => (
        <React.Fragment key={cx}>
          <Circle cx={cx} cy={90} r={13} fill={FILL_DARK} />
          <Circle cx={cx} cy={90} r={5} fill={FILL_DETAIL} />
        </React.Fragment>
      ))}
    </Svg>
  );
}

function FrontTrailerArt() {
  // FRENTE — pared frontal de la caja (lado unidad de refrigeración)
  return (
    <Svg viewBox="0 0 200 170" width="100%" height="100%" preserveAspectRatio="none">
      <Rect x={45} y={8} width={110} height={28} rx={3} fill={FILL_DETAIL} stroke={STROKE} strokeWidth={2} />
      {[60, 80, 100, 120, 140].map(x => (
        <Line key={x} x1={x} y1={12} x2={x} y2={32} stroke={colors.border} strokeWidth={1.2} />
      ))}
      <Rect x={15} y={34} width={170} height={110} rx={4} fill={FILL_BOX} stroke={STROKE} strokeWidth={2.5} />
      <Line x1={100} y1={34} x2={100} y2={144} stroke={colors.border} strokeWidth={1} strokeDasharray="4,4" />
      <Rect x={15} y={144} width={170} height={6} fill={FILL_DARK} opacity={0.7} />
      <Rect x={28} y={150} width={9} height={18} fill={FILL_DARK} />
      <Rect x={155} y={150} width={9} height={18} fill={FILL_DARK} />
    </Svg>
  );
}

function RearTrailerArt() {
  // PUERTAS — puertas traseras con bisagras y manijas
  return (
    <Svg viewBox="0 0 200 170" width="100%" height="100%" preserveAspectRatio="none">
      <Rect x={15} y={15} width={170} height={140} rx={4} fill={FILL_BOX} stroke={STROKE} strokeWidth={2.5} />
      <Line x1={100} y1={15} x2={100} y2={155} stroke={STROKE} strokeWidth={2} />
      <Rect x={90} y={68} width={5} height={38} rx={2} fill={FILL_DARK} />
      <Rect x={105} y={68} width={5} height={38} rx={2} fill={FILL_DARK} />
      {[30, 85, 140].map(y => (
        <React.Fragment key={y}>
          <Rect x={12} y={y} width={7} height={14} fill={FILL_DARK} />
          <Rect x={181} y={y} width={7} height={14} fill={FILL_DARK} />
        </React.Fragment>
      ))}
      <Rect x={15} y={150} width={170} height={5} fill={FILL_DARK} opacity={0.7} />
    </Svg>
  );
}

function IllustrationFor({ surfaceKey }: { surfaceKey: string }) {
  switch (surfaceKey) {
    case 'pared_izq': return <SideTrailerArt />;
    case 'pared_der': return <SideTrailerArt mirrored />;
    case 'techo': return <TopTrailerArt />;
    case 'piso': return <FloorTrailerArt />;
    case 'frente': return <FrontTrailerArt />;
    case 'puertas': return <RearTrailerArt />;
    default: return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Panel de superficie: ilustración + rejilla tocable superpuesta
// ─────────────────────────────────────────────────────────────

const WIDE_SURFACES: DamageSurfaceKey[] = ['pared_izq', 'pared_der', 'techo', 'piso'];

function SurfacePanel({ surfaceKey, label, zones, onToggleZone, readOnly, aspectRatio }: {
  surfaceKey: string;
  label: string;
  zones: boolean[];
  onToggleZone?: (surfaceKey: string, idx: number) => void;
  readOnly?: boolean;
  aspectRatio: number;
}) {
  const damaged = zones.filter(Boolean).length;
  const wide = WIDE_SURFACES.includes(surfaceKey as DamageSurfaceKey);
  const cols = wide ? 6 : 2;
  const rows = wide ? 1 : 3;

  return (
    <View style={styles.panelWrap}>
      <View style={[styles.panelLabel, damaged > 0 && styles.panelLabelBad]}>
        <Text style={[styles.panelLabelText, damaged > 0 && styles.panelLabelTextBad]}>{label}</Text>
        {damaged > 0 && <Text style={styles.panelLabelCount}>{damaged} DAÑO(S)</Text>}
      </View>
      <View style={[styles.artWrap, { aspectRatio }, damaged > 0 && styles.artWrapBad]}>
        <View style={StyleSheet.absoluteFill}>
          <IllustrationFor surfaceKey={surfaceKey} />
        </View>
        <View style={[styles.gridOverlay, { flexDirection: wide ? 'row' : 'column' }]}>
          {Array.from({ length: rows }).map((_, r) => (
            <View key={r} style={{ flex: 1, flexDirection: 'row' }}>
              {Array.from({ length: cols }).map((__, c) => {
                const idx = wide ? c : r * cols + c;
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
          ))}
        </View>
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
      {/* Frente + Puertas (vistas cuadradas, como el mockup de referencia) */}
      <View style={styles.row}>
        <View style={styles.narrowPanel}>
          <SurfacePanel surfaceKey="frente" label="FRENTE" zones={zonas('frente')} onToggleZone={toggleZone} readOnly={readOnly} aspectRatio={200 / 170} />
        </View>
        <View style={styles.narrowPanel}>
          <SurfacePanel surfaceKey="puertas" label="PUERTAS" zones={zonas('puertas')} onToggleZone={toggleZone} readOnly={readOnly} aspectRatio={200 / 170} />
        </View>
      </View>

      {/* Laterales (vistas de perfil, anchas) */}
      <SurfacePanel surfaceKey="pared_izq" label="PARED IZQ." zones={zonas('pared_izq')} onToggleZone={toggleZone} readOnly={readOnly} aspectRatio={400 / 110} />
      <SurfacePanel surfaceKey="pared_der" label="PARED DER." zones={zonas('pared_der')} onToggleZone={toggleZone} readOnly={readOnly} aspectRatio={400 / 110} />

      {/* Techo y Piso (vistas superior/inferior, anchas) */}
      <SurfacePanel surfaceKey="techo" label="TECHO" zones={zonas('techo')} onToggleZone={toggleZone} readOnly={readOnly} aspectRatio={400 / 100} />
      <SurfacePanel surfaceKey="piso" label="PISO" zones={zonas('piso')} onToggleZone={toggleZone} readOnly={readOnly} aspectRatio={400 / 100} />

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
      {!readOnly && <Text style={styles.hint}>Toca una zona sobre el dibujo para marcarla como dañada</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceSecondary, padding: spacing.sm, gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  narrowPanel: { flex: 1 },
  panelWrap: { width: '100%' },
  panelLabel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surfaceTertiary, paddingHorizontal: spacing.sm, paddingVertical: 4, borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.borderStrong },
  panelLabelBad: { backgroundColor: colors.errorSurface },
  panelLabelText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5, color: colors.mutedDark },
  panelLabelTextBad: { color: colors.onError },
  panelLabelCount: { fontSize: 9, fontWeight: '900', color: colors.onError },
  artWrap: { width: '100%', borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, overflow: 'hidden', position: 'relative' },
  artWrapBad: { borderColor: colors.error },
  gridOverlay: { ...StyleSheet.absoluteFillObject },
  cellTouch: { flex: 1, padding: 1.5 },
  cell: { flex: 1, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  cellBad: { backgroundColor: 'rgba(239,68,68,0.55)', borderColor: colors.error },
  cellNum: { fontSize: 9, fontWeight: '900', color: 'transparent' },
  cellNumBad: { color: '#FFF' },
  legendRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 2 },
  legendText: { fontSize: 9, fontWeight: '800', color: colors.muted, letterSpacing: 0.5 },
  hint: { fontSize: 10, color: colors.mutedLight, textAlign: 'center' },
});

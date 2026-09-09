import React from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '@/src/constants/theme';

export type ChecklistValue = 'CUMPLE' | 'NO_CUMPLE' | 'N/A' | '';
export interface ChecklistEntry { valor: ChecklistValue; nota: string; }
export type ChecklistState = Record<string, ChecklistEntry>;

export interface ChecklistItemDef { key: string; label: string; }

export const emptyChecklistEntry = (): ChecklistEntry => ({ valor: '', nota: '' });

export const buildChecklistState = (items: ChecklistItemDef[]): ChecklistState => {
  const st: ChecklistState = {};
  items.forEach(i => { st[i.key] = emptyChecklistEntry(); });
  return st;
};

/** Resumen: cuántos items tienen NO_CUMPLE (para banderas visuales en listados/reportes) */
export const countNoCumple = (state: ChecklistState | undefined): number => {
  if (!state) return 0;
  return Object.values(state).filter(v => v?.valor === 'NO_CUMPLE').length;
};

interface RowProps {
  item: ChecklistItemDef;
  entry: ChecklistEntry;
  onChange: (key: string, entry: ChecklistEntry) => void;
}

function ChecklistRow({ item, entry, onChange }: RowProps) {
  const setValor = (valor: ChecklistValue) => {
    onChange(item.key, { ...entry, valor, nota: valor === 'NO_CUMPLE' ? entry.nota : entry.nota });
  };
  const setNota = (nota: string) => onChange(item.key, { ...entry, nota });

  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{item.label}</Text>
      <View style={styles.chipsRow}>
        <Pressable
          style={[styles.chip, entry.valor === 'CUMPLE' && styles.chipSuccess]}
          onPress={() => setValor('CUMPLE')}
        >
          <Ionicons name="checkmark-circle" size={14} color={entry.valor === 'CUMPLE' ? colors.onSuccess : colors.mutedLight} />
          <Text style={[styles.chipText, entry.valor === 'CUMPLE' && styles.chipTextActive]}>CUMPLE</Text>
        </Pressable>
        <Pressable
          style={[styles.chip, entry.valor === 'NO_CUMPLE' && styles.chipError]}
          onPress={() => setValor('NO_CUMPLE')}
        >
          <Ionicons name="close-circle" size={14} color={entry.valor === 'NO_CUMPLE' ? colors.onError : colors.mutedLight} />
          <Text style={[styles.chipText, entry.valor === 'NO_CUMPLE' && styles.chipTextActive]}>NO CUMPLE</Text>
        </Pressable>
        <Pressable
          style={[styles.chip, entry.valor === 'N/A' && styles.chipNeutral]}
          onPress={() => setValor('N/A')}
        >
          <Text style={[styles.chipText, entry.valor === 'N/A' && styles.chipTextActive]}>N/A</Text>
        </Pressable>
      </View>
      {entry.valor === 'NO_CUMPLE' && (
        <TextInput
          style={styles.noteInput}
          value={entry.nota}
          onChangeText={setNota}
          placeholder="Describe la no conformidad…"
          placeholderTextColor={colors.muted}
          multiline
        />
      )}
    </View>
  );
}

interface Props {
  items: ChecklistItemDef[];
  state: ChecklistState;
  onChange: (state: ChecklistState) => void;
}

export default function WarehouseChecklist({ items, state, onChange }: Props) {
  const handleChange = (key: string, entry: ChecklistEntry) => {
    onChange({ ...state, [key]: entry });
  };

  return (
    <View>
      {items.map((item) => (
        <ChecklistRow
          key={item.key}
          item={item}
          entry={state[item.key] || emptyChecklistEntry()}
          onChange={handleChange}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  rowLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.onSurface,
    marginBottom: spacing.xs,
    lineHeight: 16,
  },
  chipsRow: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: '#FFF',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  chipSuccess: { backgroundColor: colors.success, borderColor: colors.success },
  chipError: { backgroundColor: colors.error, borderColor: colors.error },
  chipNeutral: { backgroundColor: colors.mutedDark, borderColor: colors.mutedDark },
  chipText: { fontSize: 10, fontWeight: '900', color: colors.mutedLight, letterSpacing: 0.5 },
  chipTextActive: { color: '#FFF' },
  noteInput: {
    borderWidth: 1,
    borderColor: colors.warning,
    backgroundColor: colors.warningSurface,
    padding: spacing.sm,
    marginTop: spacing.sm,
    fontSize: 12,
    color: colors.onSurface,
    minHeight: 44,
    textAlignVertical: 'top',
  },
});

/** ── Definiciones de los 3 checklists solicitados ── */

export const CHECKLIST_FISICO_MECANICO: ChecklistItemDef[] = [
  { key: 'estructura_buen_estado', label: 'Estructura externa e interna en buen estado (sin hoyos, grietas o remaches sueltos)' },
  { key: 'piso_limpio_seco', label: 'Piso limpio, seco y libre de astillas, clavos expuestos o residuos químicos' },
  { key: 'puertas_cierre_funcional', label: 'Puertas y mecanismos de cierre/cerrojo funcionales' },
  { key: 'sin_olores_humedad_plagas', label: 'Ausencia de olores extraños, humedad o plagas' },
];

export const CHECKLIST_CUIDADO_MERCANCIA: ChecklistItemDef[] = [
  { key: 'palets_buen_estado', label: 'Palets/Tarimas en buen estado (sin tablas rotas o clavos salidos)' },
  { key: 'empaque_intacto', label: 'Empaque y embalaje intactos (sin abolladuras, rasgaduras o sellos violados)' },
  { key: 'marcaje_etiquetado_visible', label: 'Marcaje y etiquetado visible (símbolos de frágil, sentido de estiba, material peligroso)' },
  { key: 'peso_distribuido', label: 'Distribución uniforme del peso en el piso del remolque (sin sobrepasar ejes)' },
];

export const CHECKLIST_ASEGURAMIENTO_CARGA: ChecklistItemDef[] = [
  { key: 'barras_cintas_ajustadas', label: 'Uso de barras sujetadoras (load bars) o cintas/ratchets ajustados' },
  { key: 'bolsas_aire_esquineros', label: 'Colocación de bolsas de aire (dunnage bags) o esquineros según aplique' },
  { key: 'sello_seguridad_colocado', label: 'Traba de seguridad y colocación del sello de seguridad al finalizar el cierre' },
];

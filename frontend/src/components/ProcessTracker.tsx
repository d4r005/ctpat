import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/src/constants/theme';

interface ProcessTrackerProps {
  steps: {
    entry: boolean;
    inspection: boolean;
    shipping: boolean;
    exit: boolean;
  };
  compact?: boolean;
}

export default function ProcessTracker({ steps, compact = false }: ProcessTrackerProps) {
  const Step = ({ icon, label, completed, last = false }: any) => (
    <View style={styles.stepContainer}>
      <View style={[styles.node, completed && styles.nodeCompleted]}>
        <Ionicons
          name={completed ? 'checkmark' : icon}
          size={compact ? 12 : 16}
          color={completed ? '#FFF' : colors.muted}
        />
      </View>
      {!compact && <Text style={[styles.label, completed && styles.labelCompleted]}>{label}</Text>}
      {!last && <View style={[styles.line, completed && styles.lineCompleted]} />}
    </View>
  );

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <Step icon="business" label="ENTRADA" completed={steps.entry} />
      <Step icon="clipboard" label="INSP." completed={steps.inspection} />
      <Step icon="cube" label="EMBARQUE" completed={steps.shipping} />
      <Step icon="exit" label="SALIDA" completed={steps.exit} last />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  containerCompact: {
    paddingVertical: 0,
    gap: 4,
  },
  stepContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  node: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  nodeCompleted: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  line: {
    width: 20,
    height: 3,
    backgroundColor: colors.border,
    marginHorizontal: -2,
  },
  lineCompleted: {
    backgroundColor: colors.success,
  },
  label: {
    fontSize: 8,
    fontWeight: '900',
    color: colors.muted,
    marginLeft: 4,
    marginRight: 8,
  },
  labelCompleted: {
    color: colors.onSurface,
  },
});

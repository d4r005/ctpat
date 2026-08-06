import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, spacing, radius } from '@/src/constants/theme';

interface ProcessTrackerProps {
  steps: {
    entry: boolean;
    inspection: boolean;
    shipping: boolean;
    exit: boolean;
  };
  compact?: boolean;
  showShipping?: boolean;
  showLabels?: boolean;
}

export default function ProcessTracker({ steps, compact = false, showShipping = true, showLabels = false }: ProcessTrackerProps) {
  const { t } = useTranslation();
  const Step = ({ icon, completed, label, last = false }: any) => (
    <View style={[styles.stepWrapper, compact && styles.stepWrapperCompact]}>
      <View style={styles.stepContainer}>
        <View style={[
          styles.node,
          completed && styles.nodeCompleted,
          compact && styles.nodeCompact,
        ]}>
          <Ionicons
            name={completed ? 'checkmark' : icon}
            size={compact ? 12 : 16}
            color={completed ? '#FFF' : colors.muted}
          />
        </View>
        {!last && <View style={[
          styles.line,
          completed && styles.lineCompleted,
          compact && styles.lineCompact,
        ]} />}
      </View>
      {showLabels && label ? (
        <Text style={[
          styles.label,
          compact && styles.labelCompact,
          completed && styles.labelCompleted,
        ]}>
          {label}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <Step icon="car-outline" completed={steps.entry} label={t('entrada')} />
      <Step icon="clipboard-outline" completed={steps.inspection} label={t('inspeccion')} />
      {showShipping && (
        <Step icon="cube-outline" completed={steps.shipping} label={t('embarque')} />
      )}
      <Step icon="exit-outline" completed={steps.exit} label={t('salida')} last />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
  },
  containerCompact: {
    paddingVertical: 0,
    gap: 0,
  },
  stepWrapper: {
    alignItems: 'center',
  },
  stepWrapperCompact: {},
  stepContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  node: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  nodeCompact: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  nodeCompleted: {
    backgroundColor: '#178A4C',
    borderColor: '#178A4C',
  },
  line: {
    width: 25,
    height: 3,
    backgroundColor: '#E5E7EB',
    marginHorizontal: -1,
    borderRadius: radius.pill,
  },
  lineCompact: {
    width: 18,
  },
  lineCompleted: {
    backgroundColor: '#178A4C',
  },
  label: {
    fontSize: 7,
    color: colors.muted,
    marginTop: 2,
    textAlign: 'center',
    maxWidth: 50,
  },
  labelCompact: {
    fontSize: 6,
    maxWidth: 40,
  },
  labelCompleted: {
    color: '#178A4C',
    fontWeight: '600',
  },
});

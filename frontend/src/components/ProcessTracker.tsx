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
  const Step = ({ icon, completed, last = false }: any) => (
    <View style={styles.stepContainer}>
      <View style={[styles.node, completed && styles.nodeCompleted]}>
        <Ionicons
          name={completed ? 'checkmark' : icon}
          size={compact ? 14 : 18}
          color={completed ? '#FFF' : colors.muted}
        />
      </View>
      {!last && <View style={[styles.line, completed && styles.lineCompleted]} />}
    </View>
  );

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <Step icon="checkmark-outline" completed={steps.entry} />
      <Step icon="checkmark-outline" completed={steps.inspection} />
      <Step icon="cube-outline" completed={steps.shipping} />
      <Step icon="videocam-outline" completed={steps.exit} last />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  containerCompact: { paddingVertical: 0, gap: 0 },
  stepContainer: { flexDirection: 'row', alignItems: 'center' },
  node: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: '#D1D5DB', backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  nodeCompleted: { backgroundColor: '#10B981', borderColor: '#10B981' },
  line: { width: 25, height: 3, backgroundColor: '#E5E7EB', marginHorizontal: -1 },
  lineCompleted: { backgroundColor: '#10B981' },
});

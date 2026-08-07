import { StyleSheet, Text, View } from 'react-native';
import { palette, radius, spacing, uiType } from '../theme/tokens';

interface ProgressBarProps {
    value: number;
    max?: number;
}

export function ProgressBar({ value, max = 100 }: ProgressBarProps) {
    const ratio = Math.max(0, Math.min(1, value / max));

    return (
        <View style={styles.wrapper}>
            <View style={styles.track}>
                <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
            </View>
            <Text style={styles.label}>{Math.round(ratio * 100)}%</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        gap: spacing.sm,
    },
    track: {
        height: 10,
        borderRadius: radius.pill,
        backgroundColor: palette.subtleBg,
        overflow: 'hidden',
    },
    fill: {
        height: '100%',
        backgroundColor: palette.accent,
    },
    label: {
        ...uiType.small,
        color: palette.textSecondary,
        fontWeight: '600',
    },
});

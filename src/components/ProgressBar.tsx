import { StyleSheet, Text, View } from 'react-native';

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
        gap: 8,
    },
    track: {
        height: 10,
        borderRadius: 999,
        backgroundColor: '#e5e7eb',
        overflow: 'hidden',
    },
    fill: {
        height: '100%',
        backgroundColor: '#0f766e',
    },
    label: {
        fontSize: 12,
        color: '#475569',
        fontWeight: '600',
    },
});

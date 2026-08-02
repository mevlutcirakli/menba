import { StyleSheet, Text, View } from 'react-native';

interface TopicAccuracyItem {
    topicName: string;
    accuracy: number;
}

interface TopicAccuracyChartProps {
    items: TopicAccuracyItem[];
}

export function TopicAccuracyChart({ items }: TopicAccuracyChartProps) {
    return (
        <View style={styles.container}>
            <Text style={styles.title}>Konu Basari Ozeti</Text>
            {items.map((item) => (
                <View key={item.topicName} style={styles.row}>
                    <View style={styles.topicBlock}>
                        <View style={styles.topicLine}>
                            <Text style={styles.topic}>{item.topicName}</Text>
                            <Text style={styles.accuracy}>%{item.accuracy.toFixed(1)}</Text>
                        </View>
                        <View style={styles.track}>
                            <View style={[styles.fill, { width: `${Math.min(100, Math.max(0, item.accuracy))}%` }]} />
                        </View>
                    </View>
                </View>
            ))}
            {items.length === 0 && <Text style={styles.empty}>Henuz veri yok.</Text>}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        borderWidth: 1,
        borderColor: '#dbe4f0',
        borderRadius: 16,
        padding: 16,
        gap: 12,
        backgroundColor: '#ffffff',
    },
    title: {
        fontSize: 16,
        fontWeight: '700',
        color: '#0f172a',
    },
    row: {
        gap: 8,
    },
    topicBlock: {
        gap: 6,
    },
    topicLine: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    topic: {
        color: '#1f2937',
        fontSize: 14,
    },
    accuracy: {
        color: '#2563eb',
        fontWeight: '700',
        fontSize: 14,
    },
    track: {
        height: 8,
        borderRadius: 999,
        backgroundColor: '#e2e8f0',
        overflow: 'hidden',
    },
    fill: {
        height: '100%',
        borderRadius: 999,
        backgroundColor: '#2563eb',
    },
    empty: {
        color: '#6b7280',
        fontSize: 14,
    },
});

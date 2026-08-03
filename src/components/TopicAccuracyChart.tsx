import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { palette, radius, spacing, uiType } from '../theme/tokens';

interface TopicAccuracyItem {
    topicName: string;
    accuracy: number;
}

interface TopicAccuracyChartProps {
    items: TopicAccuracyItem[];
}

const PLOT_HEIGHT = 170;
const BAR_SLOT_WIDTH = 64;
const GRID_LINES = [100, 75, 50, 25, 0];

export function TopicAccuracyChart({ items }: TopicAccuracyChartProps) {
    return (
        <View style={styles.card}>
            <View style={styles.header}>
                <Text style={styles.title}>Konu Bazlı Ustalık Dereceleri</Text>
                <Text style={styles.headerHint}>Başarı Oranı (%)</Text>
            </View>

            {items.length === 0 ? (
                <Text style={styles.empty}>
                    Henüz veri yok. İlk testini çözdüğünde buraya konu bazlı başarı
                    grafiğin gelecek.
                </Text>
            ) : (
                <View style={styles.plotRow}>
                    {/* Y ekseni: sabit, yatay kaydirmaya dahil degil */}
                    <View style={styles.yAxis}>
                        {GRID_LINES.map((value) => (
                            <Text key={value} style={styles.yLabel}>
                                {value}
                            </Text>
                        ))}
                    </View>

                    <View style={styles.plotArea}>
                        {/* Izgara cizgileri barlarin arkasinda */}
                        <View style={styles.gridLayer} pointerEvents="none">
                            {GRID_LINES.map((value) => (
                                <View key={value} style={styles.gridLine} />
                            ))}
                        </View>

                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.barsRow}
                        >
                            {items.map((item) => {
                                const clamped = Math.min(100, Math.max(0, item.accuracy));

                                return (
                                    <View key={item.topicName} style={styles.barSlot}>
                                        <View style={styles.barTrack}>
                                            <View
                                                style={[
                                                    styles.bar,
                                                    // Sifir dogruluk da gorunur kalsin diye alt sinir
                                                    { height: Math.max(2, (clamped / 100) * PLOT_HEIGHT) },
                                                ]}
                                            />
                                        </View>
                                        <Text style={styles.barLabel} numberOfLines={1}>
                                            {item.topicName}
                                        </Text>
                                    </View>
                                );
                            })}
                        </ScrollView>
                    </View>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: palette.cardBg,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: palette.cardBorder,
        padding: spacing.md,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.sm,
        marginBottom: spacing.lg,
    },
    title: {
        ...uiType.cardTitle,
        color: palette.textPrimary,
        flexShrink: 1,
    },
    headerHint: {
        ...uiType.small,
        color: palette.textMuted,
    },
    plotRow: {
        flexDirection: 'row',
        gap: spacing.sm,
    },
    yAxis: {
        height: PLOT_HEIGHT,
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        width: 26,
    },
    yLabel: {
        ...uiType.small,
        color: palette.textMuted,
        // Etiketi ilgili izgara cizgisiyle ortalamak icin yariyi yukari al
        lineHeight: 12,
        marginTop: -6,
    },
    plotArea: {
        flex: 1,
        height: PLOT_HEIGHT + 24,
    },
    gridLayer: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        height: PLOT_HEIGHT,
        justifyContent: 'space-between',
    },
    gridLine: {
        height: 1,
        backgroundColor: palette.cardBorder,
    },
    barsRow: {
        alignItems: 'flex-end',
        gap: spacing.sm,
    },
    barSlot: {
        width: BAR_SLOT_WIDTH,
        alignItems: 'center',
    },
    barTrack: {
        height: PLOT_HEIGHT,
        justifyContent: 'flex-end',
    },
    bar: {
        width: 26,
        backgroundColor: palette.indigo600,
        borderTopLeftRadius: radius.sm,
        borderTopRightRadius: radius.sm,
    },
    barLabel: {
        ...uiType.small,
        color: palette.textMuted,
        marginTop: spacing.sm,
        textAlign: 'center',
    },
    empty: {
        ...uiType.body,
        color: palette.textSecondary,
    },
});

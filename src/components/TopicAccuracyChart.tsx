import { StyleSheet, Text, View } from 'react-native';
import { palette, radius, spacing, uiType } from '../theme/tokens';

interface TopicAccuracyItem {
    /**
     * React anahtari olarak kullaniliyor. Konu ADI kullanilamaz: liste tum
     * kaynaklardaki konulari topluyor ve "Genel Soru Bankasi" gibi adlar
     * birden fazla kaynakta ayni olabiliyor.
     */
    topicId: string;
    topicName: string;
    accuracy: number;
}

interface TopicAccuracyChartProps {
    items: TopicAccuracyItem[];
    /** Tasarimda kart en fazla 5 satir gosteriyor. */
    maxRows?: number;
}

/**
 * "Konu Bazli Basari" karti: her satirda konu adi, yatay bar ve yuzde.
 * Bar dolgusu tek renk; tasarimda basari seviyesine gore renk degismiyor.
 */
export function TopicAccuracyChart({ items, maxRows = 5 }: TopicAccuracyChartProps) {
    const rows = items.slice(0, maxRows);

    return (
        <View style={styles.card}>
            <Text style={styles.title}>Konu Bazlı Başarı</Text>

            {rows.length === 0 ? (
                <Text style={styles.empty}>
                    Henüz soru çözmedin. İlk testini tamamlayınca konu başarın burada
                    görünecek.
                </Text>
            ) : (
                rows.map((item) => {
                    const ratio = Math.max(0, Math.min(1, item.accuracy / 100));

                    return (
                        <View
                            key={item.topicId}
                            style={styles.row}
                            accessible
                            accessibilityLabel={`${item.topicName}: yüzde ${Math.round(item.accuracy)} başarı`}
                        >
                            <Text style={styles.name} numberOfLines={1}>
                                {item.topicName}
                            </Text>

                            <View style={styles.track}>
                                <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
                            </View>

                            <Text style={styles.value}>%{Math.round(item.accuracy)}</Text>
                        </View>
                    );
                })
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        gap: spacing.md,
        padding: spacing.md,
        backgroundColor: palette.cardBg,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: palette.cardBorder,
    },
    title: {
        ...uiType.sectionTitle,
        color: palette.textPrimary,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    name: {
        // Sabit genislik: barlar satirlar arasinda ayni yerden baslasin.
        width: 92,
        ...uiType.small,
        color: palette.textSecondary,
    },
    track: {
        flex: 1,
        height: 7,
        borderRadius: radius.pill,
        backgroundColor: palette.teal50,
        overflow: 'hidden',
    },
    fill: {
        height: '100%',
        borderRadius: radius.pill,
        backgroundColor: palette.accent,
    },
    value: {
        width: 38,
        textAlign: 'right',
        ...uiType.small,
        fontWeight: '700',
        color: palette.textSecondary,
    },
    empty: {
        ...uiType.small,
        color: palette.textMuted,
    },
});

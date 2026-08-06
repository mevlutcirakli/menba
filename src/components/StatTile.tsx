import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { palette, radius, spacing, uiType } from '../theme/tokens';

interface StatTileProps {
    label: string;
    value: string;
    icon: keyof typeof Ionicons.glyphMap;
}

/**
 * Ana sayfadaki 2x2 istatistik kutusu. Tasarimda ikon ve etiket ust satirda
 * yan yana, buyuk deger altta ve sola dayali.
 */
export function StatTile({ label, value, icon }: StatTileProps) {
    return (
        <View style={styles.tile}>
            <View style={styles.headRow}>
                <Ionicons name={icon} size={14} color={palette.accent} />
                <Text style={styles.label} numberOfLines={1}>
                    {label}
                </Text>
            </View>
            <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
                {value}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    tile: {
        flex: 1,
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
        backgroundColor: palette.cardBg,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: palette.cardBorder,
    },
    headRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    label: {
        flex: 1,
        ...uiType.small,
        color: palette.textSecondary,
        fontWeight: '600',
    },
    value: {
        ...uiType.statValue,
        color: palette.textPrimary,
    },
});

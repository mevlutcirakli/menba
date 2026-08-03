import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { palette, radius, spacing, uiType } from '../theme/tokens';

export type StatTone = 'indigo' | 'emerald' | 'amber';

interface StatCardProps {
    label: string;
    value: string;
    icon: keyof typeof Ionicons.glyphMap;
    tone?: StatTone;
    /** Deger metnini de tona boyar (GENEL BASARI / CALISMA SERISI gibi). */
    tintValue?: boolean;
}

const TONE = {
    indigo: { fg: palette.indigo600, bg: palette.indigoSurface },
    emerald: { fg: palette.emerald500, bg: palette.emeraldSurface },
    amber: { fg: palette.amber600, bg: palette.amberSurface },
} as const;

export function StatCard({
    label,
    value,
    icon,
    tone = 'indigo',
    tintValue = false,
}: StatCardProps) {
    const toneStyle = TONE[tone];

    return (
        <View style={styles.card}>
            <View style={styles.textBlock}>
                <Text style={styles.label} numberOfLines={1}>
                    {label}
                </Text>
                <Text
                    style={[styles.value, tintValue ? { color: toneStyle.fg } : null]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                >
                    {value}
                </Text>
            </View>

            <View style={[styles.iconWrap, { backgroundColor: toneStyle.bg }]}>
                <Ionicons name={icon} size={18} color={toneStyle.fg} />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        flex: 1,
        minWidth: 150,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.sm,
        padding: spacing.md,
        backgroundColor: palette.cardBg,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: palette.cardBorder,
    },
    textBlock: {
        flex: 1,
    },
    label: {
        ...uiType.statLabel,
        color: palette.textMuted,
        textTransform: 'uppercase',
    },
    value: {
        ...uiType.statValue,
        marginTop: spacing.xs,
        color: palette.textPrimary,
    },
    iconWrap: {
        width: 38,
        height: 38,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
});

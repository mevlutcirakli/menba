import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { palette } from '../theme/tokens';

interface ProgressRingProps {
    /** 0-100 arasi yuzde. Disarida sinirlanmasi gerekmiyor, burada kirpiliyor. */
    value: number;
    size?: number;
    strokeWidth?: number;
    color?: string;
    trackColor?: string;
}

/**
 * Kaynak kartlarindaki yuzde halkasi. Yay 12 yonunden baslasin diye tum
 * cizim -90 derece dondurulmus durumda.
 */
export function ProgressRing({
    value,
    size = 46,
    strokeWidth = 4,
    color = palette.accent,
    trackColor = palette.teal100,
}: ProgressRingProps) {
    const ratio = Math.max(0, Math.min(1, value / 100));
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;

    return (
        <View style={[styles.wrapper, { width: size, height: size }]}>
            <Svg width={size} height={size}>
                <Circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={trackColor}
                    strokeWidth={strokeWidth}
                    fill="none"
                />
                <Circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={color}
                    strokeWidth={strokeWidth}
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${circumference} ${circumference}`}
                    strokeDashoffset={circumference * (1 - ratio)}
                    // Yay tepeden baslasin: SVG'de 0 derece saat 3 yonu.
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
            </Svg>

            <View style={styles.labelWrap} pointerEvents="none">
                <Text style={[styles.label, { color, fontSize: size * 0.26 }]}>
                    {Math.round(ratio * 100)}%
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    labelWrap: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
    },
    label: {
        fontWeight: '800',
    },
});

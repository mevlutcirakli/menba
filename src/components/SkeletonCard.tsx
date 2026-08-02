import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius } from '../theme/tokens';

interface SkeletonCardProps {
    height?: number;
    style?: StyleProp<ViewStyle>;
}

export function SkeletonCard({ height = 120, style }: SkeletonCardProps) {
    const pulse = useRef(new Animated.Value(0.55)).current;

    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, {
                    toValue: 1,
                    duration: 850,
                    useNativeDriver: true,
                }),
                Animated.timing(pulse, {
                    toValue: 0.55,
                    duration: 850,
                    useNativeDriver: true,
                }),
            ])
        );

        loop.start();
        return () => {
            loop.stop();
        };
    }, [pulse]);

    return (
        <Animated.View style={[styles.card, { height, opacity: pulse }, style]}>
            <View style={styles.lineLong} />
            <View style={styles.lineShort} />
            <View style={styles.lineMedium} />
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    card: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.lg,
        backgroundColor: colors.surface,
        padding: 14,
        gap: 10,
    },
    lineLong: {
        width: '78%',
        height: 14,
        borderRadius: radius.sm,
        backgroundColor: colors.border,
    },
    lineMedium: {
        width: '64%',
        height: 12,
        borderRadius: radius.sm,
        backgroundColor: colors.border,
    },
    lineShort: {
        width: '48%',
        height: 12,
        borderRadius: radius.sm,
        backgroundColor: colors.border,
    },
});

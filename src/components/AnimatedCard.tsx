import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, StyleProp, ViewStyle } from 'react-native';

interface AnimatedCardProps {
    children: ReactNode;
    style?: StyleProp<ViewStyle>;
    delayMs?: number;
    resetKey?: string | number;
}

export function AnimatedCard({ children, style, delayMs = 0, resetKey }: AnimatedCardProps) {
    const opacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(6)).current;

    useEffect(() => {
        opacity.setValue(0);
        translateY.setValue(6);

        Animated.parallel([
            Animated.timing(opacity, {
                toValue: 1,
                duration: 170,
                delay: delayMs,
                useNativeDriver: true,
            }),
            Animated.timing(translateY, {
                toValue: 0,
                duration: 170,
                delay: delayMs,
                useNativeDriver: true,
            }),
        ]).start();
    }, [delayMs, opacity, resetKey, translateY]);

    return (
        <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
            {children}
        </Animated.View>
    );
}

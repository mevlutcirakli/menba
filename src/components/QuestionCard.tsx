import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { palette, radius, spacing } from '../theme/tokens';
import type { GeneratedQuestion } from '../types/quiz.types';

interface QuestionCardProps {
    question: GeneratedQuestion;
    onSelectOption: (option: string) => void;
    /** Ust kisimda gosterilen konu rozeti. */
    topicName?: string | null;
    /** Cevaplandiktan sonra secili ve dogru siklari isaretlemek icin. */
    selectedOption?: string | null;
    correctOption?: string | null;
    disabled?: boolean;
}

const FALLBACK_LETTERS = ['A', 'B', 'C', 'D', 'E'];

/** Sik sirasina gore giris animasyonu gecikmesi. */
const OPTION_STAGGER_MS = 45;

/**
 * Sikler Edge Function'dan "A) Metin" bicimiyle geliyor. Harfi ayirip ayri
 * kutuda gostermek icin basi ayikliyoruz; format farkli gelirse sirasindan
 * turetilen harfi kullanip metni oldugu gibi biraiyoruz.
 */
function splitOption(option: string, index: number): { letter: string; text: string } {
    const match = option.match(/^\s*([A-Ea-e])\s*[).\-:]\s*(.+)$/);

    if (match) {
        return { letter: match[1].toLocaleUpperCase('tr-TR'), text: match[2].trim() };
    }

    return {
        letter: FALLBACK_LETTERS[index] ?? String(index + 1),
        text: option.trim(),
    };
}

type OptionState = 'idle' | 'correct' | 'wrong' | 'muted';

interface OptionRowProps {
    option: string;
    index: number;
    state: OptionState;
    hasAnswered: boolean;
    disabled: boolean;
    onSelect: (option: string) => void;
    /** Soru degisince giris animasyonunu bastan oynatmak icin. */
    resetKey: string;
}

/**
 * Tek bir sik. Her sikin kendi animasyon degerleri oldugu icin ayri bilesen:
 * hook'lar map icinde cagrilamaz.
 */
function OptionRow({
    option,
    index,
    state,
    hasAnswered,
    disabled,
    onSelect,
    resetKey,
}: OptionRowProps) {
    const enter = useRef(new Animated.Value(0)).current;
    const press = useRef(new Animated.Value(0)).current;
    const reveal = useRef(new Animated.Value(0)).current;

    // Soru degistiginde sikler sirayla asagidan yukari suzulerek gelir.
    useEffect(() => {
        enter.setValue(0);
        Animated.timing(enter, {
            toValue: 1,
            duration: 260,
            delay: index * OPTION_STAGGER_MS,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [enter, index, resetKey]);

    // Cevap verildikten sonra dogru/yanlis sik hafifce buyuyup yerine oturur,
    // secilmeyenler geri plana duser.
    useEffect(() => {
        Animated.timing(reveal, {
            toValue: hasAnswered ? 1 : 0,
            duration: 240,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [hasAnswered, reveal]);

    const isToned = state === 'correct' || state === 'wrong';

    // Vurgulanan siklarda hafif bir "pop", solanlarda hafif kucultme.
    const revealScale = reveal.interpolate({
        inputRange: [0, 1],
        outputRange: [1, isToned ? 1.02 : 0.99],
    });

    const pressScale = press.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0.97],
    });

    const enterTranslate = enter.interpolate({
        inputRange: [0, 1],
        outputRange: [10, 0],
    });

    // Secilmeyen sikler cevaptan sonra solar.
    const mutedOpacity = reveal.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0.4],
    });

    return (
        <Animated.View
            style={{
                opacity: state === 'muted' ? Animated.multiply(enter, mutedOpacity) : enter,
                transform: [
                    { translateY: enterTranslate },
                    { scale: Animated.multiply(revealScale, pressScale) },
                ],
            }}
        >
            <Pressable
                onPress={() => onSelect(option)}
                disabled={disabled}
                onPressIn={() => {
                    if (disabled) {
                        return;
                    }
                    Animated.timing(press, {
                        toValue: 1,
                        duration: 90,
                        useNativeDriver: true,
                    }).start();
                }}
                onPressOut={() => {
                    Animated.timing(press, {
                        toValue: 0,
                        duration: 130,
                        useNativeDriver: true,
                    }).start();
                }}
                style={[
                    styles.option,
                    state === 'correct' ? styles.optionCorrect : null,
                    state === 'wrong' ? styles.optionWrong : null,
                ]}
            >
                <View
                    style={[
                        styles.letterBox,
                        state === 'correct' ? styles.letterBoxCorrect : null,
                        state === 'wrong' ? styles.letterBoxWrong : null,
                    ]}
                >
                    <Text style={[styles.letterText, isToned ? styles.letterTextOnTone : null]}>
                        {splitOption(option, index).letter}
                    </Text>
                </View>

                <Text
                    style={[
                        styles.optionText,
                        state === 'correct' ? styles.optionTextCorrect : null,
                        state === 'wrong' ? styles.optionTextWrong : null,
                    ]}
                >
                    {splitOption(option, index).text}
                </Text>

                {state === 'correct' ? (
                    <Ionicons name="checkmark-circle" size={22} color={palette.emerald500} />
                ) : null}
                {state === 'wrong' ? (
                    <Ionicons name="close-circle" size={22} color={palette.error} />
                ) : null}
            </Pressable>
        </Animated.View>
    );
}

export function QuestionCard({
    question,
    onSelectOption,
    topicName,
    selectedOption,
    correctOption,
    disabled = false,
}: QuestionCardProps) {
    const hasAnswered = Boolean(selectedOption);

    return (
        <View style={styles.card}>
            {topicName ? (
                <View style={styles.topicPill}>
                    <Text style={styles.topicPillText} numberOfLines={1}>
                        {topicName}
                    </Text>
                </View>
            ) : null}

            <Text style={styles.question}>{question.soru}</Text>

            <View style={styles.optionList}>
                {question.secenekler.map((option, index) => {
                    const isSelected = selectedOption === option;
                    const isCorrect = hasAnswered && correctOption === option;
                    const isWrongPick = hasAnswered && isSelected && !isCorrect;

                    const state: OptionState = isCorrect
                        ? 'correct'
                        : isWrongPick
                            ? 'wrong'
                            : hasAnswered
                                ? 'muted'
                                : 'idle';

                    return (
                        <OptionRow
                            key={option}
                            option={option}
                            index={index}
                            state={state}
                            hasAnswered={hasAnswered}
                            disabled={disabled}
                            onSelect={onSelectOption}
                            resetKey={question.soru}
                        />
                    );
                })}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: palette.cardBg,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: palette.cardBorder,
        padding: spacing.lg,
        gap: spacing.md,
    },
    topicPill: {
        alignSelf: 'flex-start',
        paddingHorizontal: 11,
        paddingVertical: 5,
        borderRadius: radius.pill,
        backgroundColor: palette.indigoSurface,
        borderWidth: 1,
        borderColor: palette.indigoBorder,
        maxWidth: '100%',
    },
    topicPillText: {
        color: palette.indigo600,
        fontSize: 12,
        fontWeight: '700',
    },
    question: {
        fontSize: 18,
        lineHeight: 26,
        fontWeight: '800',
        color: palette.textPrimary,
    },
    optionList: {
        gap: spacing.sm,
    },
    option: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.md,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.cardBorder,
        backgroundColor: palette.cardBg,
    },
    optionCorrect: {
        borderColor: palette.emerald500,
        backgroundColor: palette.emeraldSurface,
    },
    optionWrong: {
        borderColor: palette.error,
        backgroundColor: '#fef2f2',
    },
    letterBox: {
        width: 28,
        height: 28,
        borderRadius: radius.sm,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: palette.cardBorder,
        backgroundColor: palette.pageBg,
    },
    letterBoxCorrect: {
        borderColor: palette.emerald500,
        backgroundColor: palette.emerald500,
    },
    letterBoxWrong: {
        borderColor: palette.error,
        backgroundColor: palette.error,
    },
    letterText: {
        fontSize: 13,
        fontWeight: '700',
        color: palette.textSecondary,
    },
    letterTextOnTone: {
        color: palette.onDarkPrimary,
    },
    optionText: {
        flex: 1,
        fontSize: 15,
        lineHeight: 21,
        fontWeight: '600',
        color: palette.textPrimary,
    },
    optionTextCorrect: {
        color: '#065f46',
    },
    optionTextWrong: {
        color: palette.error,
    },
});

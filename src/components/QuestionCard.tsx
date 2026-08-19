import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { palette, radius, spacing } from '../theme/tokens';
import type { GeneratedQuestion } from '../types/quiz.types';

interface QuestionCardProps {
    question: GeneratedQuestion;
    onSelectOption: (option: string) => void;
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
 * turetilen harfi kullanip metni oldugu gibi birakiyoruz.
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

/**
 * Secili/dogru sik bilgisi useQuiz'den tek harf olarak geliyor ("C"), sikler
 * ise tam metin ("C) Ankara"). Eslesme bu yuzden her zaman HARF uzerinden
 * yapilmali; iki string'i dogrudan karsilastirmak hicbir zaman tutmaz.
 * Fonksiyon "C", "C)", "C) Ankara" ve tam sik metninin kendisini kabul eder.
 */
function resolveLetter(value: string | null | undefined, options: string[]): string | null {
    const trimmed = value?.trim();
    if (!trimmed) {
        return null;
    }

    // Tam sik metni geldiyse sirasindan harfi turet.
    const exactIndex = options.findIndex((option) => option.trim() === trimmed);
    if (exactIndex >= 0) {
        return splitOption(options[exactIndex], exactIndex).letter;
    }

    // Yalnizca harf ("C") ya da harf + ayrac ("C)", "C) Ankara").
    const match =
        trimmed.match(/^([A-Ea-e])\s*[).\-:]?\s*$/) ?? trimmed.match(/^([A-Ea-e])\s*[).\-:]/);

    return match ? match[1].toLocaleUpperCase('tr-TR') : null;
}

type OptionState = 'idle' | 'correct' | 'wrong' | 'muted';

interface OptionRowProps {
    /** onSelect'e geri verilecek ham deger. */
    option: string;
    /** Rozette gosterilen harf; eslesme de bunun uzerinden yapiliyor. */
    letter: string;
    /** Harf ayiklandiktan sonra kalan sik metni. */
    text: string;
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
    letter,
    text,
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
        outputRange: [1, 0.55],
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
                accessibilityRole="radio"
                accessibilityLabel={`${letter} şıkkı: ${text}`}
                // Dogru/yanlis bilgisi yalnizca renkle verilmesin.
                accessibilityHint={
                    state === 'correct'
                        ? 'Doğru cevap'
                        : state === 'wrong'
                          ? 'İşaretlediğin şık, yanlış'
                          : undefined
                }
                accessibilityState={{
                    disabled,
                    checked: state === 'correct' || state === 'wrong',
                }}
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
                {/* Tasarimda harf yalnizca isaretlenmis siklarda dolu daire
                    icinde; notr siklarda duz gri harf. */}
                {isToned ? (
                    <View
                        style={[
                            styles.letterBadge,
                            state === 'correct'
                                ? styles.letterBadgeCorrect
                                : styles.letterBadgeWrong,
                        ]}
                    >
                        <Text style={styles.letterBadgeText}>{letter}</Text>
                    </View>
                ) : (
                    <View style={styles.letterSlot}>
                        <Text style={styles.letterPlain}>{letter}</Text>
                    </View>
                )}

                <Text
                    style={[
                        styles.optionText,
                        state === 'correct' ? styles.optionTextCorrect : null,
                        state === 'wrong' ? styles.optionTextWrong : null,
                    ]}
                >
                    {text}
                </Text>

                {state === 'correct' ? (
                    <Ionicons name="checkmark-circle" size={20} color={palette.success} />
                ) : null}
                {state === 'wrong' ? (
                    <Ionicons name="close-circle" size={20} color={palette.danger} />
                ) : null}
            </Pressable>
        </Animated.View>
    );
}

export function QuestionCard({
    question,
    onSelectOption,
    selectedOption,
    correctOption,
    disabled = false,
}: QuestionCardProps) {
    const selectedLetter = resolveLetter(selectedOption, question.secenekler);
    const correctLetter = resolveLetter(correctOption, question.secenekler);
    const hasAnswered = selectedLetter !== null;

    return (
        <View style={styles.wrapper}>
            <View style={styles.questionBox}>
                <Text style={styles.question}>{question.soru}</Text>
            </View>

            <View style={styles.optionList}>
                {question.secenekler.map((option, index) => {
                    const { letter, text } = splitOption(option, index);

                    const isCorrect = hasAnswered && correctLetter === letter;
                    const isWrongPick =
                        hasAnswered && selectedLetter === letter && !isCorrect;

                    const state: OptionState = isCorrect
                        ? 'correct'
                        : isWrongPick
                          ? 'wrong'
                          : hasAnswered
                            ? 'muted'
                            : 'idle';

                    return (
                        <OptionRow
                            // Sik METNI anahtar olarak kullanilamaz: modelden
                            // ayni metinli iki sik gelebiliyor ve React o
                            // durumda satirlari karistiriyor.
                            key={`${index}-${letter}`}
                            option={option}
                            letter={letter}
                            text={text}
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
    wrapper: {
        gap: spacing.md,
    },
    questionBox: {
        backgroundColor: palette.subtleBg,
        borderRadius: radius.lg,
        padding: spacing.md,
    },
    question: {
        fontSize: 15,
        lineHeight: 23,
        fontWeight: '600',
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
        borderColor: palette.success,
        backgroundColor: palette.successSurface,
    },
    optionWrong: {
        borderColor: palette.danger,
        backgroundColor: palette.dangerSurface,
    },
    letterSlot: {
        width: 24,
        alignItems: 'center',
    },
    letterPlain: {
        fontSize: 14,
        fontWeight: '600',
        color: palette.textMuted,
    },
    letterBadge: {
        width: 24,
        height: 24,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
    },
    letterBadgeCorrect: {
        backgroundColor: palette.success,
    },
    letterBadgeWrong: {
        backgroundColor: palette.danger,
    },
    letterBadgeText: {
        fontSize: 12,
        fontWeight: '800',
        color: palette.onDarkPrimary,
    },
    optionText: {
        flex: 1,
        fontSize: 15,
        lineHeight: 21,
        fontWeight: '500',
        color: palette.textPrimary,
    },
    optionTextCorrect: {
        color: palette.teal900,
        fontWeight: '700',
    },
    optionTextWrong: {
        color: palette.danger,
        fontWeight: '700',
    },
});

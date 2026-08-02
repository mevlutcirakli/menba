import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { GeneratedQuestion } from '../types/quiz.types';

interface QuestionCardProps {
    question: GeneratedQuestion;
    onSelectOption: (option: string) => void;
}

export function QuestionCard({ question, onSelectOption }: QuestionCardProps) {
    return (
        <View style={styles.card}>
            <Text style={styles.question}>{question.soru}</Text>
            {question.secenekler.map((option) => (
                <Pressable
                    key={option}
                    style={({ pressed }) => [styles.option, pressed ? styles.optionPressed : null]}
                    onPress={() => onSelectOption(option)}
                >
                    <Text style={styles.optionText}>{option}</Text>
                </Pressable>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 12,
        padding: 16,
        gap: 10,
        backgroundColor: '#ffffff',
    },
    question: {
        fontSize: 18,
        fontWeight: '600',
        color: '#0f172a',
    },
    option: {
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 10,
        paddingVertical: 10,
        paddingHorizontal: 12,
        backgroundColor: '#ffffff',
    },
    optionPressed: {
        borderColor: '#0f766e',
        backgroundColor: '#f0fdfa',
    },
    optionText: {
        fontSize: 15,
        color: '#111827',
    },
});

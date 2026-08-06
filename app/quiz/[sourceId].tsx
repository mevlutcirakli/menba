import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { AnimatedCard } from '../../src/components/AnimatedCard';
import { ProgressRing } from '../../src/components/ProgressRing';
import { SkeletonCard } from '../../src/components/SkeletonCard';
import { useQuiz } from '../../src/hooks/useQuiz';
import { supabase } from '../../src/services/supabase';
import { palette, radius, spacing, uiType } from '../../src/theme/tokens';

interface QuizUiSessionState {
    selectedTopicId: string | null;
    newTopicName: string;
}

interface TopicCounts {
    questionCount: number;
    solvedCount: number;
}

const quizUiStateBySource = new Map<string, QuizUiSessionState>();

export default function QuizBySourceScreen() {
    const router = useRouter();
    const { sourceId } = useLocalSearchParams<{ sourceId: string }>();
    const { source, topics, recommendedTopicId, isLoading, error, refresh } = useQuiz(sourceId);
    const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
    const [newTopicName, setNewTopicName] = useState('');
    const [countsByTopicId, setCountsByTopicId] = useState<Record<string, TopicCounts>>({});
    const [flowNotice, setFlowNotice] = useState<string | null>(null);
    const [deletingTopicId, setDeletingTopicId] = useState<string | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const trimmedNewTopicName = newTopicName.trim();

    const { totalQuestionCount, totalSolvedCount } = useMemo(() => {
        let total = 0;
        let solved = 0;
        for (const counts of Object.values(countsByTopicId)) {
            total += counts.questionCount;
            solved += counts.solvedCount;
        }
        return { totalQuestionCount: total, totalSolvedCount: solved };
    }, [countsByTopicId]);

    useEffect(() => {
        if (!sourceId) {
            return;
        }

        const cached = quizUiStateBySource.get(sourceId);
        if (!cached) {
            setSelectedTopicId(null);
            setNewTopicName('');
            return;
        }

        setSelectedTopicId(cached.selectedTopicId);
        setNewTopicName(cached.newTopicName);
    }, [sourceId]);

    useEffect(() => {
        if (!sourceId) {
            return;
        }

        quizUiStateBySource.set(sourceId, { selectedTopicId, newTopicName });
    }, [newTopicName, selectedTopicId, sourceId]);

    useEffect(() => {
        if (!recommendedTopicId) {
            return;
        }

        setSelectedTopicId((prev) => {
            if (prev && topics.some((topic) => topic.id === prev)) {
                return prev;
            }

            return recommendedTopicId;
        });
    }, [recommendedTopicId, topics]);

    // Uyari yalnizca kullanici secimi degistirince temizlenir. Onceden
    // `flowNotice` de bagimliliktaydi: uyari set edilir edilmez efekt tekrar
    // kosup hemen siliyordu, bu yuzden butonlar hicbir sey yapmiyor gibi
    // gorunuyordu.
    useEffect(() => {
        setFlowNotice(null);
    }, [newTopicName, selectedTopicId]);

    useEffect(() => {
        if (topics.length === 0) {
            setCountsByTopicId({});
            return;
        }

        let cancelled = false;

        const loadTopicCounts = async () => {
            const topicIds = topics.map((topic) => topic.id);
            const { data: questionRows } = await supabase
                .from('questions')
                .select('id, topic_id')
                .in('topic_id', topicIds);

            if (cancelled) {
                return;
            }

            const topicIdByQuestionId = new Map<string, string>();
            const nextCounts: Record<string, TopicCounts> = {};
            for (const topic of topics) {
                nextCounts[topic.id] = { questionCount: 0, solvedCount: 0 };
            }

            for (const row of questionRows ?? []) {
                topicIdByQuestionId.set(row.id, row.topic_id);
                const bucket = nextCounts[row.topic_id];
                if (bucket) {
                    bucket.questionCount += 1;
                }
            }

            // Ayni soru birden fazla kez cevaplanmis olabilir; "cozuldu"
            // sayisi benzersiz soru kimligi uzerinden hesaplaniyor.
            const questionIds = Array.from(topicIdByQuestionId.keys());
            if (questionIds.length > 0) {
                const { data: logRows } = await supabase
                    .from('question_logs')
                    .select('question_id')
                    .in('question_id', questionIds);

                if (cancelled) {
                    return;
                }

                const solvedQuestionIds = new Set(
                    (logRows ?? []).map((row) => row.question_id)
                );

                for (const questionId of solvedQuestionIds) {
                    const topicId = topicIdByQuestionId.get(questionId);
                    if (!topicId) {
                        continue;
                    }

                    const bucket = nextCounts[topicId];
                    if (bucket) {
                        bucket.solvedCount += 1;
                    }
                }
            }

            setCountsByTopicId(nextCounts);
        };

        void loadTopicCounts();

        return () => {
            cancelled = true;
        };
    }, [topics]);

    // Mevcut bir konuya basinca dogrudan soru akisi acilir. Test uzunlugu
    // konudaki hazir soru sayisi kadar; banka bossa play ekrani kendi
    // varsayilaniyla yeni soru uretir.
    const handleStartTopic = (topicId: string) => {
        if (!sourceId) {
            return;
        }

        setSelectedTopicId(topicId);
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        router.push({
            pathname: '/quiz/[sourceId]/play',
            params: {
                sourceId,
                topicId,
                count: String(countsByTopicId[topicId]?.questionCount ?? 0),
            },
        });
    };

    // Bu ekran disinda test baslatmaz; tek istisna yeni konu, cunku konu
    // ancak akis sayfasi acilirken olusturulup ilk sorusu uretiliyor.
    const handleOpenFlowForNewTopic = () => {
        if (!sourceId) {
            return;
        }

        if (!trimmedNewTopicName) {
            setFlowNotice('Yeni konu oluşturmak için önce konu adını yaz.');
            return;
        }

        router.push({
            pathname: '/quiz/[sourceId]/play',
            params: { sourceId, topicName: trimmedNewTopicName },
        });
    };

    const deleteTopic = async (topicId: string) => {
        setDeletingTopicId(topicId);
        setDeleteError(null);

        try {
            // Sorular, loglar ve ilerleme kayitlari 0005 migrasyonundaki
            // ON DELETE CASCADE ile birlikte siliniyor.
            const { error: deleteTopicError } = await supabase
                .from('topics')
                .delete()
                .eq('id', topicId);

            if (deleteTopicError) {
                throw new Error(deleteTopicError.message);
            }

            if (selectedTopicId === topicId) {
                setSelectedTopicId(null);
            }

            await refresh();
        } catch (removeError) {
            setDeleteError(
                removeError instanceof Error ? removeError.message : 'Konu silinemedi.'
            );
        } finally {
            setDeletingTopicId(null);
        }
    };

    const handleDeleteTopic = (topicId: string, topicName: string) => {
        const questionCount = countsByTopicId[topicId]?.questionCount ?? 0;

        Alert.alert(
            'Konu silinsin mi?',
            questionCount > 0
                ? `"${topicName}" konusu ve içindeki ${questionCount} soru kalıcı olarak silinecek. Bu konudaki test geçmişin de gider.`
                : `"${topicName}" konusu kalıcı olarak silinecek.`,
            [
                { text: 'Vazgeç', style: 'cancel' },
                {
                    text: 'Sil',
                    style: 'destructive',
                    onPress: () => {
                        void deleteTopic(topicId);
                    },
                },
            ]
        );
    };

    if (isLoading) {
        return (
            <View style={styles.screen}>
                <StatusBar style="dark" />
                <View style={styles.stateWrap}>
                    <SkeletonCard height={92} />
                    <Text style={styles.stateText}>Konular yükleniyor...</Text>
                </View>
            </View>
        );
    }

    if (error) {
        return (
            <View style={styles.screen}>
                <StatusBar style="dark" />
                <View style={styles.stateWrap}>
                    <Text style={styles.errorTitle}>Konular açılamadı</Text>
                    <Text style={styles.errorText}>{error}</Text>
                    <Pressable
                        onPress={() => router.push('/(tabs)/sources')}
                        style={({ pressed }) => [
                            styles.primaryButton,
                            pressed ? styles.pressed : null,
                        ]}
                    >
                        <Text style={styles.primaryButtonText}>Kaynaklara Dön</Text>
                    </Pressable>
                </View>
            </View>
        );
    }

    return (
        // Klavye acilinca "Yeni Konu" kutusu ekranin altinda kaliyordu:
        // KeyboardAvoidingView icerigi yukari itiyor, ScrollView de odaklanan
        // alani gorunur tutuyor.
        <KeyboardAvoidingView
            style={styles.screen}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <StatusBar style="dark" />

            <ScrollView
                contentContainerStyle={styles.container}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                automaticallyAdjustKeyboardInsets
            >
                <View style={styles.summaryCard}>
                    <View style={styles.summaryText}>
                        <Text style={styles.summaryTitle} numberOfLines={2}>
                            {source?.title ?? 'Kaynak yükleniyor'}
                        </Text>
                        <Text style={styles.summaryMeta}>
                            {topics.length} konu • {totalQuestionCount} soru
                        </Text>
                    </View>

                    <ProgressRing
                        value={
                            totalQuestionCount === 0
                                ? 0
                                : Math.round((totalSolvedCount / totalQuestionCount) * 100)
                        }
                    />
                </View>

                <Text style={styles.sectionTitle}>Konular</Text>

                {topics.length === 0 ? (
                    <Text style={styles.emptyText}>
                        Bu kaynağa ait konu yok. Aşağıdan yeni konu adı girip soru
                        üretebilirsin.
                    </Text>
                ) : (
                    topics.map((topic, index) => {
                        const counts = countsByTopicId[topic.id];
                        const questionCount = counts?.questionCount ?? 0;
                        const solvedCount = counts?.solvedCount ?? 0;
                        const isDeleting = deletingTopicId === topic.id;
                        // Kaynaktan cikarilan konular silinmez; yalnizca "Yeni
                        // Konu" akisindan elle eklenenler kaldirilabilir.
                        const canDelete = topic.origin === 'manual';

                        return (
                            <AnimatedCard
                                key={topic.id}
                                delayMs={Math.min(200, index * 35)}
                                resetKey={topic.id}
                            >
                                <Pressable
                                    onPress={() => handleStartTopic(topic.id)}
                                    disabled={isDeleting}
                                    style={({ pressed }) => [
                                        styles.topicCard,
                                        pressed ? styles.topicCardPressed : null,
                                        isDeleting ? styles.disabled : null,
                                    ]}
                                >
                                    <View style={styles.topicText}>
                                        <Text style={styles.topicName} numberOfLines={2}>
                                            {topic.name}
                                        </Text>
                                        <Text style={styles.topicMeta}>
                                            {questionCount} soru • {solvedCount} çözüldü
                                            {canDelete ? ' • elle eklendi' : ''}
                                        </Text>
                                    </View>

                                    <ProgressRing
                                        value={
                                            questionCount === 0
                                                ? 0
                                                : Math.round(
                                                      (solvedCount / questionCount) * 100
                                                  )
                                        }
                                        size={40}
                                    />

                                    {canDelete ? (
                                        <Pressable
                                            onPress={() =>
                                                handleDeleteTopic(topic.id, topic.name)
                                            }
                                            disabled={isDeleting}
                                            style={({ pressed }) => [
                                                styles.deleteButton,
                                                pressed ? styles.deleteButtonPressed : null,
                                            ]}
                                            hitSlop={8}
                                        >
                                            {isDeleting ? (
                                                <ActivityIndicator
                                                    size="small"
                                                    color={palette.danger}
                                                />
                                            ) : (
                                                <Ionicons
                                                    name="trash-outline"
                                                    size={16}
                                                    color={palette.textMuted}
                                                />
                                            )}
                                        </Pressable>
                                    ) : null}
                                </Pressable>
                            </AnimatedCard>
                        );
                    })
                )}

                {deleteError ? <Text style={styles.errorText}>{deleteError}</Text> : null}

                <Text style={styles.sectionTitle}>Yeni Konu</Text>

                <View style={styles.newTopicCard}>
                    <TextInput
                        value={newTopicName}
                        onChangeText={setNewTopicName}
                        placeholder="Örn: Phrasal Verbs"
                        placeholderTextColor={palette.textMuted}
                        style={styles.input}
                    />

                    <Pressable
                        onPress={handleOpenFlowForNewTopic}
                        style={({ pressed }) => [
                            styles.primaryButton,
                            pressed ? styles.pressed : null,
                            !trimmedNewTopicName ? styles.disabled : null,
                        ]}
                    >
                        <Ionicons name="sparkles" size={15} color={palette.onDarkPrimary} />
                        <Text style={styles.primaryButtonText}>Bu Konuda Soru Üret</Text>
                    </Pressable>

                    {/* Konu adi bosken buton pasif gorunur; yine de basilabilir
                        ve ne yapmasi gerektigini soyleyen yumusak uyari cikar. */}
                    {!trimmedNewTopicName && !flowNotice ? (
                        <Text style={styles.hintText}>
                            Konu, akış sayfası açılırken oluşturulur.
                        </Text>
                    ) : null}

                    {flowNotice ? <Text style={styles.noticeText}>{flowNotice}</Text> : null}
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: palette.pageBg,
    },
    container: {
        padding: spacing.lg,
        gap: spacing.sm,
        // Klavye acikken son kart ve buton icin nefes payi.
        paddingBottom: spacing.xl * 2,
    },
    summaryCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: palette.primaryBorder,
        backgroundColor: palette.primarySurface,
    },
    summaryText: {
        flex: 1,
    },
    summaryTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: palette.textPrimary,
    },
    summaryMeta: {
        ...uiType.small,
        color: palette.textSecondary,
        marginTop: 3,
    },
    sectionTitle: {
        ...uiType.sectionTitle,
        color: palette.textPrimary,
        marginTop: spacing.md,
        marginBottom: spacing.xs,
    },
    topicCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: palette.cardBorder,
        backgroundColor: palette.cardBg,
    },
    topicCardPressed: {
        backgroundColor: palette.primarySurface,
    },
    topicText: {
        flex: 1,
    },
    topicName: {
        fontSize: 15,
        fontWeight: '700',
        color: palette.textPrimary,
    },
    topicMeta: {
        ...uiType.small,
        color: palette.textMuted,
        marginTop: 3,
    },
    deleteButton: {
        width: 34,
        height: 34,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    deleteButtonPressed: {
        backgroundColor: palette.dangerSurface,
    },
    newTopicCard: {
        gap: spacing.sm,
        padding: spacing.md,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: palette.cardBorder,
        backgroundColor: palette.cardBg,
    },
    input: {
        borderWidth: 1,
        borderColor: palette.cardBorder,
        borderRadius: radius.md,
        paddingHorizontal: spacing.md,
        paddingVertical: 12,
        fontSize: 14,
        color: palette.textPrimary,
        backgroundColor: palette.cardBg,
    },
    primaryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        paddingVertical: 14,
        borderRadius: radius.md,
        backgroundColor: palette.primary,
    },
    primaryButtonText: {
        color: palette.onDarkPrimary,
        fontSize: 15,
        fontWeight: '700',
    },
    hintText: {
        ...uiType.small,
        color: palette.textMuted,
        textAlign: 'center',
    },
    noticeText: {
        ...uiType.small,
        color: palette.textPrimary,
        backgroundColor: palette.primarySurface,
        borderRadius: radius.sm,
        paddingHorizontal: 10,
        paddingVertical: 8,
    },
    emptyText: {
        ...uiType.body,
        color: palette.textMuted,
    },
    stateWrap: {
        gap: spacing.sm,
        padding: spacing.lg,
    },
    stateText: {
        ...uiType.body,
        color: palette.textMuted,
        textAlign: 'center',
    },
    errorTitle: {
        color: palette.danger,
        fontSize: 16,
        fontWeight: '700',
    },
    errorText: {
        color: palette.danger,
        fontSize: 13,
        lineHeight: 19,
    },
    pressed: {
        opacity: 0.75,
    },
    disabled: {
        opacity: 0.55,
    },
});

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
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
import { SkeletonCard } from '../../src/components/SkeletonCard';
import { useQuiz } from '../../src/hooks/useQuiz';
import { supabase } from '../../src/services/supabase';
import { palette, radius, spacing, uiType } from '../../src/theme/tokens';

interface QuizUiSessionState {
    selectedTopicId: string | null;
    newTopicName: string;
}

const quizUiStateBySource = new Map<string, QuizUiSessionState>();

export default function QuizBySourceScreen() {
    const router = useRouter();
    const { sourceId } = useLocalSearchParams<{ sourceId: string }>();
    const {
        source,
        topics,
        recommendedTopicId,
        isLoading,
        error,
        refresh,
    } = useQuiz(sourceId);
    const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
    const [newTopicName, setNewTopicName] = useState('');
    const [questionCountByTopicId, setQuestionCountByTopicId] = useState<Record<string, number>>({});
    const [flowNotice, setFlowNotice] = useState<string | null>(null);
    const [deletingTopicId, setDeletingTopicId] = useState<string | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const trimmedNewTopicName = newTopicName.trim();

    const totalQuestionCount = useMemo(
        () => Object.values(questionCountByTopicId).reduce((sum, count) => sum + count, 0),
        [questionCountByTopicId]
    );

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

        quizUiStateBySource.set(sourceId, {
            selectedTopicId,
            newTopicName,
        });
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
            setQuestionCountByTopicId({});
            return;
        }

        let cancelled = false;
        const loadTopicQuestionCounts = async () => {
            const topicIds = topics.map((topic) => topic.id);
            const { data } = await supabase
                .from('questions')
                .select('topic_id')
                .in('topic_id', topicIds);

            if (cancelled) {
                return;
            }

            const nextCounts: Record<string, number> = {};
            for (const topic of topics) {
                nextCounts[topic.id] = 0;
            }

            for (const row of data ?? []) {
                nextCounts[row.topic_id] = (nextCounts[row.topic_id] ?? 0) + 1;
            }

            setQuestionCountByTopicId(nextCounts);
        };

        void loadTopicQuestionCounts();

        return () => {
            cancelled = true;
        };
    }, [topics]);

    // Bu ekran test baslatmaz; tek istisna yeni konu, cunku konu ancak akis
    // sayfasi acilirken olusturulup ilk sorusu uretiliyor.
    const handleOpenFlowForNewTopic = () => {
        if (!sourceId) {
            return;
        }

        if (!trimmedNewTopicName) {
            setFlowNotice('Yeni konu olusturmak icin once konu adini yaz.');
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
        const questionCount = questionCountByTopicId[topicId] ?? 0;

        Alert.alert(
            'Konu silinsin mi?',
            questionCount > 0
                ? `"${topicName}" konusu ve icindeki ${questionCount} soru kalici olarak silinecek. Bu konudaki test gecmisin de gider.`
                : `"${topicName}" konusu kalici olarak silinecek.`,
            [
                { text: 'Vazgec', style: 'cancel' },
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
            <ScrollView contentContainerStyle={styles.container}>
                <Text style={styles.title}>Konu Yonetimi</Text>
                <View style={[styles.card, styles.stateCard]}>
                    <SkeletonCard height={92} />
                    <Text style={styles.description}>Konular yukleniyor...</Text>
                </View>
            </ScrollView>
        );
    }

    if (error) {
        return (
            <ScrollView contentContainerStyle={styles.container}>
                <Text style={styles.title}>Konu Yonetimi</Text>
                <View style={[styles.card, styles.errorCard]}>
                    <Text style={styles.errorTitle}>Konular acilamadi</Text>
                    <Text style={styles.error}>{error}</Text>
                    <Link href="/(tabs)" style={styles.stateLinkButton}>
                        Kaynaklara Don
                    </Link>
                </View>
            </ScrollView>
        );
    }

    return (
        // Klavye acilinca "Yeni Konu" kutusu ekranin altinda kaliyordu:
        // KeyboardAvoidingView icerigi yukari itiyor, ScrollView de odaklanan
        // alani gorunur tutuyor.
        <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
        <ScrollView
            contentContainerStyle={styles.container}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            automaticallyAdjustKeyboardInsets
        >
            <Text style={styles.title}>Konu Yonetimi</Text>
            <View style={styles.stickyHeader}>
                <Text style={styles.stickyHeaderTitle}>{source?.title ?? 'Kaynak yukleniyor'}</Text>
                <Text style={styles.stickyHeaderMeta}>
                    {topics.length} konu · {totalQuestionCount} soru
                </Text>
            </View>

            <AnimatedCard style={styles.card} delayMs={30} resetKey={`topics-${sourceId}`}>
                <Text style={styles.sectionTitle}>Konular</Text>
                <Text style={styles.helperText}>
                    Yalnizca &quot;Yeni Konu&quot; akisindan elle ekledigin konular
                    silinebilir; kaynaktan cikarilanlar kaynagin kendisiyle birlikte
                    silinir. Test baslatmak icin asagidan bir konu sec.
                </Text>

                {topics.length === 0 ? (
                    <Text style={styles.description}>
                        Bu kaynaga ait konu yok. Asagidan yeni konu adi girip soru
                        uretebilirsin.
                    </Text>
                ) : (
                    topics.map((topic) => {
                        const questionCount = questionCountByTopicId[topic.id] ?? 0;
                        const isDeleting = deletingTopicId === topic.id;
                        // Kaynaktan cikarilan konular silinmez; yalnizca "Yeni
                        // Konu" akisindan elle eklenenler kaldirilabilir.
                        const canDelete = topic.origin === 'manual';

                        return (
                            <View key={topic.id} style={styles.topicRow}>
                                <View style={styles.topicRowText}>
                                    <Text style={styles.topicRowName} numberOfLines={2}>
                                        {topic.name}
                                    </Text>
                                    <Text style={styles.topicRowMeta}>
                                        {questionCount} soru
                                        {canDelete ? ' · elle eklendi' : ''}
                                    </Text>
                                </View>

                                {canDelete ? (
                                    <Pressable
                                        onPress={() => handleDeleteTopic(topic.id, topic.name)}
                                        disabled={isDeleting}
                                        style={({ pressed }) => [
                                            styles.iconButton,
                                            styles.iconButtonDanger,
                                            pressed ? styles.pressed : null,
                                        ]}
                                    >
                                        {isDeleting ? (
                                            <ActivityIndicator
                                                size="small"
                                                color={palette.error}
                                            />
                                        ) : (
                                            <Ionicons
                                                name="trash-outline"
                                                size={15}
                                                color={palette.error}
                                            />
                                        )}
                                    </Pressable>
                                ) : null}
                            </View>
                        );
                    })
                )}

                {deleteError ? <Text style={styles.error}>{deleteError}</Text> : null}
            </AnimatedCard>

            <AnimatedCard style={styles.card} delayMs={60} resetKey={`new-topic-${sourceId}`}>
                <Text style={styles.sectionTitle}>Yeni Konu</Text>

                <TextInput
                    value={newTopicName}
                    onChangeText={setNewTopicName}
                    placeholder="Yeni konu adi (ornek: Phrasal Verbs)"
                    placeholderTextColor={palette.textMuted}
                    style={styles.input}
                />

                <Pressable
                    onPress={() => {
                        handleOpenFlowForNewTopic();
                    }}
                    disabled={isLoading}
                    style={[
                        styles.button,
                        isLoading || !trimmedNewTopicName ? styles.buttonDisabled : null,
                    ]}
                >
                    <Text style={styles.buttonText}>Bu Konuda Soru Uret</Text>
                </Pressable>

                {/* Konu adi bosken buton pasif gorunur; yine de basilabilir ve
                    ne yapmasi gerektigini soyleyen yumusak uyari cikar. */}
                {!trimmedNewTopicName && !flowNotice ? (
                    <View style={styles.softHintRow}>
                        <Ionicons
                            name="information-circle-outline"
                            size={14}
                            color={palette.textMuted}
                        />
                        <Text style={styles.softHintText}>
                            Once yukaridaki kutuya konu adi yaz; konu, akis sayfasi acilirken
                            olusturulur.
                        </Text>
                    </View>
                ) : null}

                {flowNotice ? <Text style={styles.flowNoticeText}>{flowNotice}</Text> : null}
            </AnimatedCard>

            <Link href="/(tabs)/sources" style={styles.stateLinkButton}>
                Kaynak Listesine Don
            </Link>
        </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    flex: {
        flex: 1,
        backgroundColor: palette.cardBg,
    },
    container: {
        padding: spacing.lg,
        gap: 12,
        // Klavye acikken son kart ve buton icin nefes payi.
        paddingBottom: spacing.xl * 2,
        backgroundColor: palette.cardBg,
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: palette.textPrimary,
    },
    stickyHeader: {
        borderWidth: 1,
        borderColor: palette.cardBorder,
        borderRadius: radius.md,
        paddingHorizontal: 14,
        paddingVertical: 12,
        gap: 3,
        backgroundColor: palette.indigoSurface,
    },
    stickyHeaderTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: palette.textPrimary,
    },
    stickyHeaderMeta: {
        fontSize: 12,
        color: palette.indigo600,
    },
    description: {
        fontSize: 16,
        color: palette.textSecondary,
        lineHeight: 24,
    },
    card: {
        borderWidth: 1,
        borderColor: palette.cardBorder,
        borderRadius: radius.md,
        padding: spacing.md,
        gap: 10,
        backgroundColor: palette.cardBg,
    },
    sectionTitle: {
        ...uiType.heading,
        color: palette.textPrimary,
    },
    helperText: {
        fontSize: 12,
        lineHeight: 17,
        color: palette.textMuted,
    },
    topicRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderColor: palette.cardBorder,
        borderRadius: radius.md,
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: palette.cardBg,
    },
    topicRowText: {
        flex: 1,
    },
    topicRowName: {
        fontSize: 14,
        fontWeight: '700',
        color: palette.textPrimary,
    },
    topicRowMeta: {
        fontSize: 12,
        color: palette.textMuted,
        marginTop: 2,
    },
    iconButton: {
        width: 34,
        height: 34,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
    iconButtonDanger: {
        borderColor: palette.error,
        backgroundColor: palette.cardBg,
    },
    pressed: {
        opacity: 0.8,
    },
    input: {
        borderWidth: 1,
        borderColor: palette.cardBorder,
        borderRadius: radius.md,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 15,
        color: palette.textPrimary,
        backgroundColor: palette.cardBg,
    },
    button: {
        backgroundColor: palette.indigo600,
        borderRadius: radius.md,
        paddingVertical: 12,
        alignItems: 'center',
    },
    buttonDisabled: {
        opacity: 0.7,
    },
    buttonText: {
        color: palette.cardBg,
        fontSize: 15,
        fontWeight: '700',
    },
    error: {
        color: palette.error,
        fontSize: 14,
    },
    errorTitle: {
        color: palette.error,
        fontSize: 16,
        fontWeight: '700',
    },
    errorCard: {
        borderColor: palette.error,
        backgroundColor: '#fef2f2',
    },
    stateCard: {
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 120,
    },
    stateLinkButton: {
        marginTop: 4,
        alignSelf: 'flex-start',
        backgroundColor: palette.indigo600,
        color: palette.cardBg,
        borderRadius: radius.md,
        overflow: 'hidden',
        paddingVertical: 10,
        paddingHorizontal: 14,
        fontSize: 14,
        fontWeight: '700',
    },
    softHintRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 2,
    },
    softHintText: {
        flex: 1,
        fontSize: 12,
        lineHeight: 17,
        color: palette.textMuted,
    },
    flowNoticeText: {
        fontSize: 13,
        color: palette.textPrimary,
        backgroundColor: palette.indigoSurface,
        borderWidth: 1,
        borderColor: palette.cardBorder,
        borderRadius: radius.sm,
        paddingHorizontal: 10,
        paddingVertical: 8,
    },
});

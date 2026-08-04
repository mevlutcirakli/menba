import { useCallback, useEffect, useMemo, useState } from 'react';
import { calculateTopicWeights } from '../services/adaptiveEngine';
import { supabase } from '../services/supabase';
import type { Database } from '../types/database.types';

interface TopicProgressItem {
    topicId: string;
    topicName: string;
    totalAttempts: number;
    correctAttempts: number;
    accuracy: number;
    lastAttemptedAt: string | null;
}

export function useProgress() {
    const [progressByTopic, setProgressByTopic] = useState<TopicProgressItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async (background = false) => {
        if (background) {
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }
        setError(null);

        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
            setError(userError?.message ?? 'Kullanici oturumu bulunamadi.');
            setIsLoading(false);
            setIsRefreshing(false);
            return;
        }

        const { data: sourceRows, error: sourceError } = await supabase
            .from('sources')
            .select('id')
            .eq('user_id', user.id);

        if (sourceError) {
            setError(sourceError.message);
            setIsLoading(false);
            setIsRefreshing(false);
            return;
        }

        const sourceIds = (sourceRows ?? []).map((row) => row.id);
        if (sourceIds.length === 0) {
            setProgressByTopic([]);
            setIsLoading(false);
            setIsRefreshing(false);
            setLastUpdatedAt(new Date());
            return;
        }

        const [{ data: topicRows, error: topicError }, { data: progressRows, error: progressError }] =
            await Promise.all([
                supabase.from('topics').select('*').in('source_id', sourceIds),
                supabase.from('user_progress').select('*').eq('user_id', user.id),
            ]);

        if (topicError) {
            setError(topicError.message);
            setIsLoading(false);
            setIsRefreshing(false);
            return;
        }

        if (progressError) {
            setError(progressError.message);
            setIsLoading(false);
            setIsRefreshing(false);
            return;
        }

        const progressByTopicId = new Map(
            (progressRows ?? []).map((row) => [row.topic_id, row])
        );

        const items: TopicProgressItem[] = (topicRows ?? []).map((topic) => {
            const row = progressByTopicId.get(topic.id);
            const totalAttempts = row?.total_attempts ?? 0;
            const correctAttempts = row?.correct_attempts ?? 0;
            const accuracy =
                totalAttempts === 0 ? 0 : Number(((correctAttempts / totalAttempts) * 100).toFixed(1));

            return {
                topicId: topic.id,
                topicName: topic.name,
                totalAttempts,
                correctAttempts,
                accuracy,
                lastAttemptedAt: row?.last_attempted_at ?? null,
            };
        });

        setProgressByTopic(items.sort((a, b) => a.accuracy - b.accuracy));
        setIsLoading(false);
        setIsRefreshing(false);
        setLastUpdatedAt(new Date());
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    useEffect(() => {
        let isMounted = true;
        let channel: ReturnType<typeof supabase.channel> | null = null;

        const setupRealtime = async () => {
            const {
                data: { user },
            } = await supabase.auth.getUser();

            if (!isMounted || !user) {
                return;
            }

            // Kanal adi ornek basina benzersiz. Sabit ad kullanilinca
            // (Fast Refresh / cift mount) supabase ayni topic'i geri
            // donduruyor ve zaten subscribe edilmis kanala `.on()` denendigi
            // icin "cannot add postgres_changes callbacks after subscribe()"
            // hatasi atiliyordu.
            const channelTopic = `user-progress-${user.id}-${Math.random()
                .toString(36)
                .slice(2, 10)}`;

            const nextChannel = supabase
                .channel(channelTopic)
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'user_progress',
                        filter: `user_id=eq.${user.id}`,
                    },
                    () => {
                        void refresh(true);
                    }
                )
                .subscribe();

            // getUser() beklenirken unmount olduysa kanali hemen kapat;
            // yoksa cleanup zaten calismis olur ve kanal acik kalir.
            if (!isMounted) {
                void supabase.removeChannel(nextChannel);
                return;
            }

            channel = nextChannel;
        };

        void setupRealtime();

        return () => {
            isMounted = false;
            if (channel) {
                void supabase.removeChannel(channel);
            }
        };
    }, [refresh]);

    const belowTargetTopics = useMemo(
        () => progressByTopic.filter((item) => item.accuracy < 80),
        [progressByTopic]
    );

    const todayPriorityTopics = useMemo(() => {
        const weighted = calculateTopicWeights(
            progressByTopic.map((item) => ({
                topicId: item.topicId,
                totalAttempts: item.totalAttempts,
                correctAttempts: item.correctAttempts,
                lastAttemptedAt: item.lastAttemptedAt ? new Date(item.lastAttemptedAt) : null,
            }))
        );

        const weightedMap = new Map(weighted.map((item) => [item.topicId, item.weight]));

        return [...progressByTopic]
            .sort((a, b) => (weightedMap.get(b.topicId) ?? 0) - (weightedMap.get(a.topicId) ?? 0))
            .slice(0, 5);
    }, [progressByTopic]);

    return useMemo(
        () => ({
            progressByTopic,
            belowTargetTopics,
            todayPriorityTopics,
            isLoading,
            isRefreshing,
            lastUpdatedAt,
            error,
            refresh,
        }),
        [
            progressByTopic,
            belowTargetTopics,
            todayPriorityTopics,
            isLoading,
            isRefreshing,
            lastUpdatedAt,
            error,
            refresh,
        ]
    );
}

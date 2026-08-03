import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabase';

export interface RecentActivityItem {
    logId: string;
    topicName: string;
    isCorrect: boolean;
    answeredAt: string | null;
    timeSpentSeconds: number | null;
}

export interface DashboardStats {
    sourceCount: number;
    answeredCount: number;
    overallAccuracy: number;
    streakDays: number;
    recentActivity: RecentActivityItem[];
}

const EMPTY_STATS: DashboardStats = {
    sourceCount: 0,
    answeredCount: 0,
    overallAccuracy: 0,
    streakDays: 0,
    recentActivity: [],
};

const RECENT_ACTIVITY_LIMIT = 8;

/**
 * Ardisik calisma serisi: bugunden (ya da en son cevap gununden) geriye dogru
 * kesintisiz gun sayisi. Bugun hic cevap yoksa seri dunden baslar; boylece
 * gun icinde henuz soru cozmemis olmak seriyi sifirlamis gibi gorunmez.
 */
function calculateStreakDays(answeredAtValues: Array<string | null>): number {
    const dayKeys = new Set<string>();

    for (const value of answeredAtValues) {
        if (!value) {
            continue;
        }

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            continue;
        }

        dayKeys.add(
            `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
        );
    }

    if (dayKeys.size === 0) {
        return 0;
    }

    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);

    const keyOf = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

    // Bugun bos ise seriyi dunden baslatmayi dene.
    if (!dayKeys.has(keyOf(cursor))) {
        cursor.setDate(cursor.getDate() - 1);
        if (!dayKeys.has(keyOf(cursor))) {
            return 0;
        }
    }

    let streak = 0;
    while (dayKeys.has(keyOf(cursor))) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
    }

    return streak;
}

export function useDashboardStats() {
    const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setError(null);

        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
            setError(userError?.message ?? 'Kullanici oturumu bulunamadi.');
            setStats(EMPTY_STATS);
            setIsLoading(false);
            return;
        }

        const [
            { count: sourceCount, error: sourceError },
            { data: logRows, error: logError },
        ] = await Promise.all([
            supabase
                .from('sources')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', user.id),
            supabase
                .from('question_logs')
                .select('id, question_id, is_correct, answered_at, time_spent_seconds')
                .eq('user_id', user.id)
                .order('answered_at', { ascending: false }),
        ]);

        if (sourceError) {
            setError(sourceError.message);
            setIsLoading(false);
            return;
        }

        if (logError) {
            setError(logError.message);
            setIsLoading(false);
            return;
        }

        const logs = logRows ?? [];
        const answeredCount = logs.length;
        const correctCount = logs.filter((row) => row.is_correct).length;
        const overallAccuracy =
            answeredCount === 0
                ? 0
                : Number(((correctCount / answeredCount) * 100).toFixed(0));

        // Son etkinlikler icin konu adlarini cozumle. Sadece gosterilecek
        // kadar log'un sorusunu cekiyoruz; tum gecmisi join'lemeye gerek yok.
        const recentLogs = logs.slice(0, RECENT_ACTIVITY_LIMIT);
        const recentQuestionIds = Array.from(
            new Set(recentLogs.map((row) => row.question_id))
        );

        const topicNameByQuestionId = new Map<string, string>();

        if (recentQuestionIds.length > 0) {
            const { data: questionRows } = await supabase
                .from('questions')
                .select('id, topic_id')
                .in('id', recentQuestionIds);

            const topicIds = Array.from(
                new Set((questionRows ?? []).map((row) => row.topic_id))
            );

            if (topicIds.length > 0) {
                const { data: topicRows } = await supabase
                    .from('topics')
                    .select('id, name')
                    .in('id', topicIds);

                const nameByTopicId = new Map(
                    (topicRows ?? []).map((row) => [row.id, row.name])
                );

                for (const row of questionRows ?? []) {
                    const name = nameByTopicId.get(row.topic_id);
                    if (name) {
                        topicNameByQuestionId.set(row.id, name);
                    }
                }
            }
        }

        setStats({
            sourceCount: sourceCount ?? 0,
            answeredCount,
            overallAccuracy,
            streakDays: calculateStreakDays(logs.map((row) => row.answered_at)),
            recentActivity: recentLogs.map((row) => ({
                logId: row.id,
                topicName: topicNameByQuestionId.get(row.question_id) ?? 'Bilinmeyen konu',
                isCorrect: row.is_correct,
                answeredAt: row.answered_at,
                timeSpentSeconds: row.time_spent_seconds,
            })),
        });

        setIsLoading(false);
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    return useMemo(
        () => ({ ...stats, isLoading, error, refresh }),
        [stats, isLoading, error, refresh]
    );
}

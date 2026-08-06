import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabase';

/**
 * Tasarimdaki "Son Aktiviteler" karti tek tek cevaplari degil, bir oturumun
 * ozetini gosteriyor ("12/15 Dogru"). Ayni konuda ayni gun verilen cevaplar
 * tek satirda toplaniyor.
 */
export interface ActivitySessionItem {
    key: string;
    sourceTitle: string;
    topicName: string;
    totalCount: number;
    correctCount: number;
    lastAnsweredAt: string | null;
}

export interface DashboardStats {
    sourceCount: number;
    answeredCount: number;
    overallAccuracy: number;
    streakDays: number;
    recentSessions: ActivitySessionItem[];
}

const EMPTY_STATS: DashboardStats = {
    sourceCount: 0,
    answeredCount: 0,
    overallAccuracy: 0,
    streakDays: 0,
    recentSessions: [],
};

/** Gruplama icin taranacak en yeni log sayisi. */
const RECENT_LOG_SCAN_LIMIT = 200;
/** Karta basilacak oturum sayisi. */
const RECENT_SESSION_LIMIT = 6;

function dayKeyOf(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

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

        dayKeys.add(dayKeyOf(date));
    }

    if (dayKeys.size === 0) {
        return 0;
    }

    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);

    // Bugun bos ise seriyi dunden baslatmayi dene.
    if (!dayKeys.has(dayKeyOf(cursor))) {
        cursor.setDate(cursor.getDate() - 1);
        if (!dayKeys.has(dayKeyOf(cursor))) {
            return 0;
        }
    }

    let streak = 0;
    while (dayKeys.has(dayKeyOf(cursor))) {
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

        // Oturum ozetleri icin yalnizca en yeni loglarin konu/kaynak adlarini
        // cozumluyoruz; tum gecmisi join'lemeye gerek yok.
        const scannedLogs = logs.slice(0, RECENT_LOG_SCAN_LIMIT);
        const questionIds = Array.from(new Set(scannedLogs.map((row) => row.question_id)));

        const topicIdByQuestionId = new Map<string, string>();
        const topicNameById = new Map<string, string>();
        const sourceTitleByTopicId = new Map<string, string>();

        if (questionIds.length > 0) {
            const { data: questionRows } = await supabase
                .from('questions')
                .select('id, topic_id')
                .in('id', questionIds);

            for (const row of questionRows ?? []) {
                topicIdByQuestionId.set(row.id, row.topic_id);
            }

            const topicIds = Array.from(new Set(topicIdByQuestionId.values()));

            if (topicIds.length > 0) {
                const { data: topicRows } = await supabase
                    .from('topics')
                    .select('id, name, source_id')
                    .in('id', topicIds);

                const sourceIds = Array.from(
                    new Set((topicRows ?? []).map((row) => row.source_id))
                );

                const titleBySourceId = new Map<string, string>();
                if (sourceIds.length > 0) {
                    const { data: sourceRows } = await supabase
                        .from('sources')
                        .select('id, title')
                        .in('id', sourceIds);

                    for (const row of sourceRows ?? []) {
                        titleBySourceId.set(row.id, row.title);
                    }
                }

                for (const row of topicRows ?? []) {
                    topicNameById.set(row.id, row.name);
                    sourceTitleByTopicId.set(
                        row.id,
                        titleBySourceId.get(row.source_id) ?? 'Kaynak'
                    );
                }
            }
        }

        // Ayni konu + ayni gun = bir oturum.
        const sessionByKey = new Map<string, ActivitySessionItem>();

        for (const log of scannedLogs) {
            const topicId = topicIdByQuestionId.get(log.question_id);
            if (!topicId || !log.answered_at) {
                continue;
            }

            const answeredAt = new Date(log.answered_at);
            if (Number.isNaN(answeredAt.getTime())) {
                continue;
            }

            const key = `${topicId}|${dayKeyOf(answeredAt)}`;
            const existing = sessionByKey.get(key);

            if (existing) {
                existing.totalCount += 1;
                existing.correctCount += log.is_correct ? 1 : 0;
                // Loglar zaten yeniden eskiye sirali; ilk gorulen en yenisi.
                continue;
            }

            sessionByKey.set(key, {
                key,
                sourceTitle: sourceTitleByTopicId.get(topicId) ?? 'Kaynak',
                topicName: topicNameById.get(topicId) ?? 'Bilinmeyen konu',
                totalCount: 1,
                correctCount: log.is_correct ? 1 : 0,
                lastAnsweredAt: log.answered_at,
            });
        }

        const recentSessions = Array.from(sessionByKey.values())
            .sort((a, b) => {
                const left = a.lastAnsweredAt ? Date.parse(a.lastAnsweredAt) : 0;
                const right = b.lastAnsweredAt ? Date.parse(b.lastAnsweredAt) : 0;
                return right - left;
            })
            .slice(0, RECENT_SESSION_LIMIT);

        setStats({
            sourceCount: sourceCount ?? 0,
            answeredCount,
            overallAccuracy,
            streakDays: calculateStreakDays(logs.map((row) => row.answered_at)),
            recentSessions,
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

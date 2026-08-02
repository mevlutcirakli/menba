export interface TopicPerformance {
    topicId: string;
    totalAttempts: number;
    correctAttempts: number;
    lastAttemptedAt: Date | null;
}

export interface WeightedTopic {
    topicId: string;
    weight: number;
    accuracy: number;
}

const TARGET_ACCURACY = 0.8;
const DAYS_DECAY_FACTOR = 0.15;
const MIN_ATTEMPTS_FOR_TRUST = 5;

export function calculateTopicWeights(
    performances: TopicPerformance[]
): WeightedTopic[] {
    const now = new Date();

    return performances.map((perf) => {
        const accuracy =
            perf.totalAttempts === 0 ? 0.5 : perf.correctAttempts / perf.totalAttempts;
        const accuracyGap = Math.max(0, TARGET_ACCURACY - accuracy);
        const confidenceFactor = Math.min(1, perf.totalAttempts / MIN_ATTEMPTS_FOR_TRUST);
        const daysSinceLastAttempt = perf.lastAttemptedAt
            ? (now.getTime() - perf.lastAttemptedAt.getTime()) / (1000 * 60 * 60 * 24)
            : 999;
        const decayBonus = Math.min(1, daysSinceLastAttempt * DAYS_DECAY_FACTOR);

        const weight =
            0.1 + accuracyGap * (0.5 + 0.5 * confidenceFactor) + decayBonus * 0.3;

        return { topicId: perf.topicId, weight, accuracy };
    });
}

export function pickNextTopic(weightedTopics: WeightedTopic[]): string {
    if (weightedTopics.length === 0) {
        throw new Error('En az bir konu olmali.');
    }

    const totalWeight = weightedTopics.reduce((sum, topic) => sum + topic.weight, 0);
    let random = Math.random() * totalWeight;

    for (const topic of weightedTopics) {
        random -= topic.weight;
        if (random <= 0) {
            return topic.topicId;
        }
    }

    return weightedTopics[weightedTopics.length - 1].topicId;
}

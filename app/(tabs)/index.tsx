import { useState } from 'react';
import { Link } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { useSources, type IngestMode } from '../../src/hooks/useSources';
import { extractSourceTextFromFile, extractTopicsFromSource } from '../../src/services/geminiService';
import { AnimatedCard } from '../../src/components/AnimatedCard';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';

const MAX_IMPORT_FILE_SIZE_BYTES = 4 * 1024 * 1024;
const MAX_SUGGESTED_TOPICS = 8;
const MAX_AUTO_EXTRACT_QUESTIONS_TOTAL = 80;

type ImportStatus = 'idle' | 'processing' | 'success' | 'error';

const INGEST_MODE_OPTIONS: Array<{ mode: IngestMode; label: string; description: string }> = [
    {
        mode: 'hybrid',
        label: 'Hibrit (Topic + Soru)',
        description: 'PDF/metinden konu ve soru bankasi birlikte olusturulur.',
    },
    {
        mode: 'questions-only',
        label: 'Sadece Soru Bankasi',
        description: 'Metindeki sorular cikarilip bankaya eklenir.',
    },
    {
        mode: 'topics-only',
        label: 'Sadece Topic',
        description: 'Soru cikarmadan yalnizca topic yapisi olusturulur.',
    },
];

function getModeLabel(mode: IngestMode): string {
    const match = INGEST_MODE_OPTIONS.find((item) => item.mode === mode);
    return match?.label ?? mode;
}

function estimateQuestionLikeCount(text: string): number {
    const numberedStemCount = text.match(/(?:^|\n)\s*\d{1,3}[.)-]\s+.+/g)?.length ?? 0;
    const optionStemCount = text.match(/(?:^|\n)\s*[A-Ea-e][.)]\s+.+/g)?.length ?? 0;

    return Math.max(numberedStemCount, Math.floor(optionStemCount / 4));
}

function normalizeTopicCandidate(value: string): string {
    return value
        .replace(/^[-*]\s+/, '')
        .replace(/^\d+[.)\-:\s]+/, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractSuggestedTopics(content: string): string[] {
    const lines = content
        .split('\n')
        .map((line) => normalizeTopicCandidate(line))
        .filter((line) => line.length >= 4 && line.length <= 70);

    const headingCandidates = lines.filter((line) => {
        const wordCount = line.split(/\s+/).length;
        if (wordCount < 1 || wordCount > 7) {
            return false;
        }

        if (/[.?!]$/.test(line)) {
            return false;
        }

        return /^[A-Za-z0-9ÇĞİÖŞÜçğıöşü\s&/+()'-]+$/.test(line);
    });

    const unique = new Map<string, string>();
    for (const candidate of headingCandidates) {
        const key = candidate.toLocaleLowerCase('tr-TR');
        if (!unique.has(key)) {
            unique.set(key, candidate);
        }

        if (unique.size >= MAX_SUGGESTED_TOPICS) {
            break;
        }
    }

    return Array.from(unique.values());
}

export default function SourcesScreen() {
    const { createSource } = useSources();
    const [title, setTitle] = useState('');
    const [contentText, setContentText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isImportingFile, setIsImportingFile] = useState(false);
    const [isSuggestingTopics, setIsSuggestingTopics] = useState(false);
    const [suggestedTopics, setSuggestedTopics] = useState<string[]>([]);
    const [topicsInfo, setTopicsInfo] = useState<string | null>(null);
    const [importStatus, setImportStatus] = useState<ImportStatus>('idle');
    const [importStatusText, setImportStatusText] = useState<string | null>(null);
    const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
    const [importedCharCount, setImportedCharCount] = useState<number>(0);
    const [formError, setFormError] = useState<string | null>(null);
    const [formInfo, setFormInfo] = useState<string | null>(null);
    const [ingestMode, setIngestMode] = useState<IngestMode>('hybrid');
    const [lastInsertedQuestionBreakdown, setLastInsertedQuestionBreakdown] = useState<
        Array<{ topicName: string; questionCount: number }>
    >([]);
    const isQuestionsOnlyMode = ingestMode === 'questions-only';

    const expectedTopicCount =
        ingestMode === 'questions-only'
            ? Math.max(1, suggestedTopics.length)
            : suggestedTopics.length;
    const estimatedQuestionCount = estimateQuestionLikeCount(contentText);
    const expectedQuestionCount =
        ingestMode === 'topics-only'
            ? 0
            : Math.min(
                MAX_AUTO_EXTRACT_QUESTIONS_TOTAL,
                Math.max(expectedTopicCount * 6, estimatedQuestionCount)
            );

    const suggestTopics = async (text: string): Promise<number> => {
        const fallbackTopics = extractSuggestedTopics(text);
        const safeText = text.trim();

        if (!safeText) {
            setSuggestedTopics([]);
            setTopicsInfo(null);
            return 0;
        }

        setIsSuggestingTopics(true);
        try {
            const aiTopics = await extractTopicsFromSource({
                contentText: safeText,
                maxTopics: MAX_SUGGESTED_TOPICS,
            });

            if (aiTopics.length > 0) {
                setSuggestedTopics(aiTopics);
                setTopicsInfo('Konu onerileri AI ile olusturuldu.');
                return aiTopics.length;
            }

            setSuggestedTopics(fallbackTopics);
            setTopicsInfo('AI konu onerisi bos dondu. Yerel oneriler gosterildi.');
            return fallbackTopics.length;
        } catch {
            setSuggestedTopics(fallbackTopics);
            setTopicsInfo('AI konu onerisi alinamadi. Yerel oneriler gosterildi.');
            return fallbackTopics.length;
        } finally {
            setIsSuggestingTopics(false);
        }
    };

    const handlePickFile = async () => {
        setFormError(null);
        setFormInfo(null);
        setTopicsInfo(null);
        setImportStatus('idle');
        setImportStatusText(null);
        setImportedCharCount(0);
        setSelectedFileName(null);

        const result = await DocumentPicker.getDocumentAsync({
            type: ['text/plain', 'application/pdf'],
            multiple: false,
            copyToCacheDirectory: true,
        });

        if (result.canceled || result.assets.length === 0) {
            return;
        }

        const asset = result.assets[0];
        const filename = asset.name ?? 'Kaynak Dosyasi';
        setSelectedFileName(filename);
        const lowerName = filename.toLowerCase();
        const isPdf = asset.mimeType === 'application/pdf' || lowerName.endsWith('.pdf');
        const isText = asset.mimeType?.startsWith('text/') || lowerName.endsWith('.txt');

        if (asset.size && asset.size > MAX_IMPORT_FILE_SIZE_BYTES) {
            setImportStatus('error');
            setImportStatusText('Dosya boyutu limiti asildi.');
            setFormError('Dosya cok buyuk. Lutfen 4MB altinda bir dosya sec.');
            return;
        }

        if (!title.trim()) {
            setTitle(filename.replace(/\.[^/.]+$/, ''));
        }

        if (isText) {
            setImportStatus('processing');
            setImportStatusText('Metin dosyasi okunuyor...');
            try {
                const fileText = await FileSystemLegacy.readAsStringAsync(asset.uri);
                setContentText(fileText);
                setImportedCharCount(fileText.trim().length);
                setImportStatus('success');
                if (isQuestionsOnlyMode) {
                    setSuggestedTopics([]);
                    setTopicsInfo('Sadece soru bankasi modunda konu onerisi adimi atlandi.');
                    setImportStatusText(
                        `Metin basariyla alindi (${fileText.trim().length} karakter). Icerik gizli tutuldu, soru hazirligi arka planda yapilacak.`
                    );
                    setFormInfo('Dosya hazir. Kaydet dediginde soru bankasi arka planda olusturulacak.');
                } else {
                    setImportStatusText(
                        `Metin basariyla alindi (${fileText.trim().length} karakter). Konu onerileri arka planda hazirlaniyor...`
                    );
                    setFormInfo(
                        'Metin dosyasi okundu. Metin kutusu dolduysa islem tamam; inceleyip kaydedebilirsin.'
                    );
                    void suggestTopics(fileText).then((topicCount) => {
                        setImportStatusText(
                            `Metin basariyla alindi (${fileText.trim().length} karakter, ${topicCount} konu onerisi).`
                        );
                    });
                }
            } catch (readError) {
                setImportStatus('error');
                setImportStatusText('Metin dosyasi okunamadi.');
                setFormError(
                    readError instanceof Error
                        ? readError.message
                        : 'Dosya okunamadi. Lutfen tekrar dene.'
                );
            }
            return;
        }

        if (isPdf) {
            setIsImportingFile(true);
            setImportStatus('processing');
            setImportStatusText('PDF metni cikariliyor...');
            setFormInfo('PDF metni cikariliyor...');

            try {
                const base64Data = await FileSystemLegacy.readAsStringAsync(asset.uri, {
                    encoding: FileSystemLegacy.EncodingType.Base64,
                });

                const extractedText = await extractSourceTextFromFile({
                    base64Data,
                    mimeType: 'application/pdf',
                    fileName: filename,
                });

                if (!extractedText.trim()) {
                    setFormError(
                        'PDF dosyasindan metin cikarilamadi. Farkli bir PDF dene veya metni manuel ekle.'
                    );
                    return;
                }

                setContentText(extractedText);
                setImportedCharCount(extractedText.trim().length);
                setImportStatus('success');
                if (isQuestionsOnlyMode) {
                    setSuggestedTopics([]);
                    setTopicsInfo('Sadece soru bankasi modunda konu onerisi adimi atlandi.');
                    setImportStatusText(
                        `PDF metni basariyla cikarildi (${extractedText.trim().length} karakter). Icerik gizli tutuldu, soru hazirligi arka planda yapilacak.`
                    );
                    setFormInfo('Dosya hazir. Kaydet dediginde soru bankasi arka planda olusturulacak.');
                } else {
                    setImportStatusText(
                        `PDF metni basariyla cikarildi (${extractedText.trim().length} karakter). Konu onerileri arka planda hazirlaniyor...`
                    );
                    setFormInfo(
                        'Metin kutusu dolduysa PDF basariyla islenmistir; dilersen duzenleyip kaydedebilirsin.'
                    );
                    void suggestTopics(extractedText).then((topicCount) => {
                        setImportStatusText(
                            `PDF metni basariyla cikarildi (${extractedText.trim().length} karakter, ${topicCount} konu onerisi).`
                        );
                    });
                }
            } catch (extractError) {
                setImportStatus('error');
                setImportStatusText('PDF isleme basarisiz oldu.');
                setFormError(
                    extractError instanceof Error
                        ? extractError.message
                        : 'PDF islenirken hata olustu. Lutfen tekrar dene.'
                );
            } finally {
                setIsImportingFile(false);
            }

            return;
        }

        setImportStatus('error');
        setImportStatusText('Secilen dosya turu desteklenmiyor.');
        setFormError('Bu dosya turu desteklenmiyor. Lutfen .txt veya .pdf sec.');
    };

    const handleCreateSource = async () => {
        if (!title.trim()) {
            setFormError('Kaynak basligi zorunludur.');
            return;
        }

        if (!contentText.trim()) {
            setFormError(
                isQuestionsOnlyMode
                    ? 'Sadece soru bankasi modunda once bir dosya secmelisin.'
                    : 'Kaynak metni zorunludur.'
            );
            return;
        }

        setIsSubmitting(true);
        setFormError(null);
        setFormInfo(null);
        setTopicsInfo(null);
        setLastInsertedQuestionBreakdown([]);

        try {
            const result = await createSource({
                title: title.trim(),
                contentText: contentText.trim(),
                topicNames: suggestedTopics,
                ingestMode,
            });
            setTitle('');
            setContentText('');
            setSuggestedTopics([]);

            const duplicateInfo =
                result.skippedDuplicateQuestionCount > 0
                    ? ` ${result.skippedDuplicateQuestionCount} tekrar soru atlandi.`
                    : '';
            const similarInfo =
                result.skippedSimilarQuestionCount > 0
                    ? ` ${result.skippedSimilarQuestionCount} benzer soru atlandi.`
                    : '';

            if (result.appliedIngestMode === 'topics-only') {
                setFormInfo(
                    `Kaynak basariyla kaydedildi. Sadece topic modu tamamlandi: ${result.insertedTopicCount} topic eklendi.`
                );
                setLastInsertedQuestionBreakdown([]);
                return;
            }

            if (result.appliedIngestMode === 'questions-only') {
                setFormInfo(
                    `Kaynak basariyla kaydedildi. Sadece soru bankasi modu tamamlandi: ${result.insertedQuestionCount} soru eklendi.${duplicateInfo}${similarInfo}`
                );
                setLastInsertedQuestionBreakdown(result.insertedQuestionCountByTopic);
                return;
            }

            if (result.insertedTopicCount > 0 || result.insertedQuestionCount > 0) {
                setFormInfo(
                    `Kaynak basariyla kaydedildi. Hibrit mod tamamlandi: ${result.insertedTopicCount} topic, ${result.insertedQuestionCount} soru eklendi.${duplicateInfo}${similarInfo}`
                );
                setLastInsertedQuestionBreakdown(result.insertedQuestionCountByTopic);
                return;
            }

            setFormInfo('Kaynak basariyla kaydedildi.');
        } catch (createError) {
            setFormError(
                createError instanceof Error ? createError.message : 'Kaynak kaydedilemedi.'
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
            <View style={styles.heroCard}>
                <View style={styles.heroTopRow}>
                    <View style={styles.heroIconWrap}>
                        <Text style={styles.heroIconText}>K</Text>
                    </View>
                    <Text style={styles.heroBadge}>Kaynak Merkezi</Text>
                </View>
                <Text style={styles.title}>Kaynaklarini Akilli Sekilde Islet</Text>
                <Text style={styles.description}>
                    PDF veya metin yukle, modu sec ve topic/soru bankasini otomatik olustur.
                </Text>
            </View>

            <AnimatedCard style={styles.card} delayMs={20} resetKey="create-source-card">
                <Text style={styles.sectionTitle}>Yeni Kaynak Ekle</Text>
                <View style={styles.modeContainer}>
                    <Text style={styles.topicTitle}>Islem Modu</Text>
                    {INGEST_MODE_OPTIONS.map((item) => {
                        const isActive = ingestMode === item.mode;
                        return (
                            <Pressable
                                key={item.mode}
                                onPress={() => setIngestMode(item.mode)}
                                style={({ pressed }) => [
                                    styles.modeOption,
                                    isActive ? styles.modeOptionActive : null,
                                    pressed ? styles.pressablePressed : null,
                                ]}
                            >
                                <Text
                                    style={[
                                        styles.modeOptionTitle,
                                        isActive ? styles.modeOptionTitleActive : null,
                                    ]}
                                >
                                    {item.label}
                                </Text>
                                <Text
                                    style={[
                                        styles.modeOptionDescription,
                                        isActive ? styles.modeOptionDescriptionActive : null,
                                    ]}
                                >
                                    {item.description}
                                </Text>
                            </Pressable>
                        );
                    })}
                    <View style={styles.expectedCard}>
                        <Text style={styles.expectedTitle}>Beklenen Islem Ozeti</Text>
                        {ingestMode === 'topics-only' ? (
                            <Text style={styles.expectedText}>
                                Tahmini: {expectedTopicCount} topic eklenecek, soru bankasi uretilmeyecek.
                            </Text>
                        ) : ingestMode === 'questions-only' ? (
                            <Text style={styles.expectedText}>
                                Tahmini: ~{expectedQuestionCount} soru soru bankasina eklenecek.
                                {suggestedTopics.length > 0
                                    ? ` Dagitim ${suggestedTopics.length} topic uzerinden yapilacak.`
                                    : ' Topic girilmediyse Genel Soru Bankasi topici acilacak.'}
                            </Text>
                        ) : (
                            <Text style={styles.expectedText}>
                                Tahmini: {expectedTopicCount} topic ve ~{expectedQuestionCount} soru
                                olusturulacak.
                            </Text>
                        )}
                    </View>
                </View>
                <Pressable
                    style={({ pressed }) => [
                        styles.secondaryButton,
                        pressed ? styles.secondaryButtonPressed : null,
                        isImportingFile ? styles.buttonDisabled : null,
                    ]}
                    onPress={() => void handlePickFile()}
                    disabled={isImportingFile || isSubmitting}
                >
                    <Text style={styles.secondaryGlyph}>UP</Text>
                    <Text style={styles.secondaryButtonText}>
                        {isImportingFile ? 'Dosya isleniyor...' : 'Dosya Sec (.txt / .pdf)'}
                    </Text>
                </Pressable>
                <TextInput
                    value={title}
                    onChangeText={setTitle}
                    placeholder="Ornek: YDS Grammar Notlari"
                    style={styles.input}
                />
                {!isQuestionsOnlyMode ? (
                    <TextInput
                        value={contentText}
                        onChangeText={setContentText}
                        placeholder="Kaynak metnini buraya yapistir"
                        style={[styles.input, styles.textarea]}
                        multiline
                        textAlignVertical="top"
                    />
                ) : (
                    <View style={styles.compactInfoCard}>
                        <Text style={styles.compactInfoTitle}>Soru Icerigi Gizli Mod</Text>
                        <Text style={styles.compactInfoText}>
                            Dosya secildikten sonra soru metni ekranda gosterilmez.
                        </Text>
                        <Text style={styles.compactInfoText}>
                            Hazir veri: {importedCharCount > 0 ? `${importedCharCount} karakter` : '-'}
                        </Text>
                    </View>
                )}
                {!isQuestionsOnlyMode ? (
                    <Pressable
                        style={({ pressed }) => [
                            styles.secondaryButton,
                            pressed ? styles.secondaryButtonPressed : null,
                        ]}
                        onPress={() => {
                            void suggestTopics(contentText);
                        }}
                        disabled={
                            !contentText.trim() || isSubmitting || isImportingFile || isSuggestingTopics
                        }
                    >
                        <Text style={styles.secondaryGlyph}>AI</Text>
                        <Text style={styles.secondaryButtonText}>
                            {isSuggestingTopics ? 'Konu Onerileri Uretiliyor...' : 'Konu Onerilerini Yenile'}
                        </Text>
                    </Pressable>
                ) : null}
                {importStatus !== 'idle' ? (
                    <View
                        style={[
                            styles.importStatusCard,
                            importStatus === 'success'
                                ? styles.importStatusCardSuccess
                                : importStatus === 'error'
                                    ? styles.importStatusCardError
                                    : styles.importStatusCardProcessing,
                        ]}
                    >
                        <View style={styles.importStatusHeader}>
                            <Text style={styles.importStatusTitle}>
                                {importStatus === 'processing'
                                    ? 'Islem Suruyor'
                                    : importStatus === 'success'
                                        ? 'Islem Tamamlandi'
                                        : 'Islem Basarisiz'}
                            </Text>
                            {importStatus === 'processing' ? (
                                <ActivityIndicator size="small" color={colors.primary} />
                            ) : null}
                        </View>
                        {selectedFileName ? (
                            <Text style={styles.importStatusDetail}>Dosya: {selectedFileName}</Text>
                        ) : null}
                        {importStatusText ? (
                            <Text style={styles.importStatusDetail}>{importStatusText}</Text>
                        ) : null}
                        {isSuggestingTopics ? (
                            <View style={styles.inlineStatusRow}>
                                <ActivityIndicator size="small" color={colors.primary} />
                                <Text style={styles.importStatusDetail}>Konu onerileri hazirlaniyor...</Text>
                            </View>
                        ) : null}
                        {importStatus === 'success' && importedCharCount > 0 ? (
                            <Text style={styles.importStatusDetail}>
                                Kontrol: Metin kutusu dolu ve karakter sayisi {importedCharCount}.
                            </Text>
                        ) : null}
                    </View>
                ) : null}
                {suggestedTopics.length > 0 && !isQuestionsOnlyMode ? (
                    <View style={styles.topicContainer}>
                        <Text style={styles.topicTitle}>Onerilen Konular</Text>
                        <View style={styles.topicList}>
                            {suggestedTopics.map((topic) => (
                                <View key={topic} style={styles.topicPill}>
                                    <Text style={styles.topicPillText}>{topic}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                ) : null}
                {topicsInfo ? <Text style={styles.infoText}>{topicsInfo}</Text> : null}
                {formInfo ? <Text style={styles.infoText}>{formInfo}</Text> : null}
                {lastInsertedQuestionBreakdown.length > 0 ? (
                    <View style={styles.topicContainer}>
                        <Text style={styles.topicTitle}>Son Yukleme Soru Dagilimi</Text>
                        {lastInsertedQuestionBreakdown.map((item) => (
                            <Text key={item.topicName} style={styles.sourceMeta}>
                                {item.topicName}: {item.questionCount} soru
                            </Text>
                        ))}
                    </View>
                ) : null}
                {formError ? <Text style={styles.errorText}>{formError}</Text> : null}
                <Pressable
                    style={({ pressed }) => [
                        styles.button,
                        pressed ? styles.buttonPressed : null,
                        isSubmitting ? styles.buttonDisabled : null,
                    ]}
                    onPress={handleCreateSource}
                    disabled={isSubmitting}
                >
                    <Text style={styles.primaryGlyph}>OK</Text>
                    <Text style={styles.buttonText}>
                        {isSubmitting
                            ? 'Kaydediliyor...'
                            : ingestMode === 'topics-only'
                                ? 'Kaynak Kaydet (Sadece Topic)'
                                : ingestMode === 'questions-only'
                                    ? 'Kaynak Kaydet (Sadece Soru Bankasi)'
                                    : 'Kaynak Kaydet (Hibrit)'}
                    </Text>
                </Pressable>
                <Link href="/(tabs)/sources" style={styles.listLinkButton}>
                    Kaynak Listesine Git
                </Link>
            </AnimatedCard>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: spacing.lg,
        gap: spacing.md,
        backgroundColor: colors.background,
    },
    heroCard: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.xl,
        padding: 16,
        gap: spacing.sm,
        backgroundColor: colors.surface,
    },
    heroTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    heroIconWrap: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primarySurface,
    },
    heroIconText: {
        color: colors.primary,
        fontSize: 13,
        fontWeight: '700',
    },
    heroBadge: {
        color: colors.primary,
        fontSize: 12,
        fontWeight: '700',
    },
    title: {
        ...typography.title,
        color: colors.textPrimary,
    },
    description: {
        fontSize: 16,
        color: colors.textSecondary,
        lineHeight: 24,
    },
    card: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.lg,
        padding: spacing.md,
        gap: 10,
        backgroundColor: colors.surface,
    },
    sectionTitle: {
        ...typography.heading,
        color: colors.textPrimary,
    },
    input: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 15,
        color: colors.textPrimary,
        backgroundColor: colors.surface,
    },
    textarea: {
        minHeight: 120,
    },
    modeContainer: {
        gap: 8,
    },
    modeOption: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        paddingHorizontal: 10,
        paddingVertical: 9,
        gap: 2,
        backgroundColor: colors.surface,
    },
    modeOptionActive: {
        borderColor: colors.primary,
        backgroundColor: colors.primarySurface,
    },
    modeOptionTitle: {
        color: colors.textPrimary,
        fontSize: 13,
        fontWeight: '700',
    },
    modeOptionTitleActive: {
        color: colors.primary,
    },
    modeOptionDescription: {
        color: colors.textMuted,
        fontSize: 12,
    },
    modeOptionDescriptionActive: {
        color: colors.primary,
    },
    expectedCard: {
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.primaryLight,
        backgroundColor: colors.primarySurface,
        paddingHorizontal: 10,
        paddingVertical: 9,
        gap: 2,
    },
    expectedTitle: {
        color: colors.textPrimary,
        fontSize: 12,
        fontWeight: '700',
    },
    expectedText: {
        color: colors.primary,
        fontSize: 12,
        lineHeight: 18,
    },
    compactInfoCard: {
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.primaryLight,
        backgroundColor: colors.primarySurface,
        paddingHorizontal: 10,
        paddingVertical: 10,
        gap: 4,
    },
    compactInfoTitle: {
        color: colors.primary,
        fontSize: 13,
        fontWeight: '700',
    },
    compactInfoText: {
        color: colors.textSecondary,
        fontSize: 12,
        lineHeight: 18,
    },
    button: {
        backgroundColor: colors.primary,
        borderRadius: radius.md,
        paddingVertical: 12,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
    },
    secondaryButton: {
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        paddingVertical: 10,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: colors.surface,
    },
    secondaryButtonText: {
        color: colors.textPrimary,
        fontSize: 14,
        fontWeight: '700',
    },
    secondaryGlyph: {
        color: colors.textMuted,
        fontSize: 11,
        fontWeight: '700',
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    pressablePressed: {
        opacity: 0.8,
    },
    buttonPressed: {
        backgroundColor: colors.primaryLight,
    },
    secondaryButtonPressed: {
        backgroundColor: colors.primarySurface,
    },
    buttonText: {
        color: colors.surface,
        fontSize: 15,
        fontWeight: '700',
    },
    listLinkButton: {
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.primaryLight,
        backgroundColor: colors.primarySurface,
        color: colors.primary,
        fontSize: 14,
        fontWeight: '700',
        paddingVertical: 10,
        textAlign: 'center',
        overflow: 'hidden',
    },
    primaryGlyph: {
        color: colors.primarySurface,
        fontSize: 11,
        fontWeight: '700',
    },
    errorText: {
        color: colors.error,
        fontSize: 14,
    },
    infoText: {
        color: colors.primary,
        fontSize: 14,
    },
    importStatusCard: {
        borderRadius: 10,
        borderWidth: 1,
        padding: 10,
        gap: 6,
    },
    importStatusCardProcessing: {
        borderColor: colors.primaryLight,
        backgroundColor: colors.primarySurface,
    },
    importStatusCardSuccess: {
        borderColor: colors.success,
        backgroundColor: colors.successSurface,
    },
    importStatusCardError: {
        borderColor: colors.error,
        backgroundColor: colors.errorSurface,
    },
    importStatusHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    importStatusTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    importStatusDetail: {
        fontSize: 13,
        color: colors.textSecondary,
    },
    inlineStatusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    topicContainer: {
        gap: 8,
    },
    topicTitle: {
        color: colors.textPrimary,
        fontSize: 14,
        fontWeight: '700',
    },
    topicList: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    topicPill: {
        borderWidth: 1,
        borderColor: colors.primaryLight,
        backgroundColor: colors.primarySurface,
        borderRadius: radius.pill,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    topicPillText: {
        color: colors.primary,
        fontWeight: '600',
        fontSize: 12,
    },
    emptyText: {
        color: colors.textMuted,
        fontSize: 14,
    },
    sourceRow: {
        flexDirection: 'column',
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 14,
        padding: 10,
        gap: 10,
        backgroundColor: colors.surface,
    },
    sourceInfo: {
        flex: 1,
        gap: 4,
    },
    sourceTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    sourceMeta: {
        fontSize: 13,
        color: colors.textMuted,
    },
    sourceMetaRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    modeChip: {
        borderRadius: radius.pill,
        backgroundColor: colors.primarySurface,
        color: colors.primary,
        fontSize: 12,
        fontWeight: '700',
        paddingHorizontal: 10,
        paddingVertical: 5,
        overflow: 'hidden',
    },
    metricChip: {
        borderRadius: radius.pill,
        backgroundColor: colors.primarySurface,
        color: colors.primary,
        fontSize: 12,
        fontWeight: '700',
        paddingHorizontal: 10,
        paddingVertical: 5,
        overflow: 'hidden',
    },
    sourceActions: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 10,
    },
    actionPrimaryLink: {
        borderRadius: radius.sm,
        backgroundColor: colors.primary,
        color: colors.surface,
        fontSize: 14,
        fontWeight: '700',
        paddingHorizontal: 12,
        paddingVertical: 8,
        overflow: 'hidden',
    },
    actionSecondaryLink: {
        borderRadius: radius.sm,
        backgroundColor: colors.primarySurface,
        color: colors.primary,
        fontSize: 13,
        fontWeight: '700',
        paddingHorizontal: 12,
        paddingVertical: 8,
        overflow: 'hidden',
    },
    actionDangerButton: {
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: colors.error,
        backgroundColor: colors.errorSurface,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    actionDangerPressed: {
        backgroundColor: colors.errorSurface,
    },
    actionDangerText: {
        color: colors.error,
        fontSize: 13,
        fontWeight: '700',
    },
});

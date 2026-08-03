import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { LinearGradient } from 'expo-linear-gradient';
import { Link } from 'expo-router';
import { useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { AnimatedCard } from '../../src/components/AnimatedCard';
import { AppHeader } from '../../src/components/AppHeader';
import { useSources, type IngestMode } from '../../src/hooks/useSources';
import {
    extractSourceTextFromFile,
    extractTopicsFromSource,
} from '../../src/services/geminiService';
import { gradients, palette, radius, spacing, uiType } from '../../src/theme/tokens';

const MAX_IMPORT_FILE_SIZE_BYTES = 4 * 1024 * 1024;
const MAX_SUGGESTED_TOPICS = 8;
const MAX_AUTO_EXTRACT_QUESTIONS_TOTAL = 80;

type ImportStatus = 'idle' | 'processing' | 'success' | 'error';

const INGEST_MODE_OPTIONS: Array<{
    mode: IngestMode;
    label: string;
    description: string;
    icon: keyof typeof Ionicons.glyphMap;
}> = [
    {
        mode: 'hybrid',
        label: 'Hibrit (Topic + Soru)',
        description: 'PDF/metinden konu ve soru bankası birlikte otomatik üretilir.',
        icon: 'sparkles',
    },
    {
        mode: 'questions-only',
        label: 'Sadece Soru Bankası',
        description: 'İçerikten doğrudan sorular çıkarılıp test bankasına eklenir.',
        icon: 'help-circle-outline',
    },
    {
        mode: 'topics-only',
        label: 'Sadece Topic',
        description: 'Soru çıkarmadan yalnızca ana konu hiyerarşisi oluşturulur.',
        icon: 'filter-outline',
    },
];

// Su an kullaniciya yalnizca soru bankasi modu gosteriliyor. Diger modlarin
// kodu (IngestMode tipi, useSources'taki mod isleme, yukaridaki secenekler)
// bilerek duruyor; ileride geri acilacak. Geri acmak icin bu listeye ilgili
// mode degerini eklemek yeterli.
const VISIBLE_INGEST_MODES: IngestMode[] = ['questions-only'];

const VISIBLE_INGEST_MODE_OPTIONS = INGEST_MODE_OPTIONS.filter((item) =>
    VISIBLE_INGEST_MODES.includes(item.mode)
);

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
    const [ingestMode, setIngestMode] = useState<IngestMode>('questions-only');
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

    const charCount = contentText.trim().length;
    const wordCount = contentText.trim() ? contentText.trim().split(/\s+/).length : 0;

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
                setTopicsInfo('Konu önerileri AI ile oluşturuldu.');
                return aiTopics.length;
            }

            setSuggestedTopics(fallbackTopics);
            setTopicsInfo('AI konu önerisi boş döndü. Yerel öneriler gösterildi.');
            return fallbackTopics.length;
        } catch {
            setSuggestedTopics(fallbackTopics);
            setTopicsInfo('AI konu önerisi alınamadı. Yerel öneriler gösterildi.');
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
        const filename = asset.name ?? 'Kaynak Dosyası';
        setSelectedFileName(filename);
        const lowerName = filename.toLowerCase();
        const isPdf = asset.mimeType === 'application/pdf' || lowerName.endsWith('.pdf');
        const isText = asset.mimeType?.startsWith('text/') || lowerName.endsWith('.txt');

        if (asset.size && asset.size > MAX_IMPORT_FILE_SIZE_BYTES) {
            setImportStatus('error');
            setImportStatusText('Dosya boyutu limiti aşıldı.');
            setFormError('Dosya çok büyük. Lütfen 4MB altında bir dosya seç.');
            return;
        }

        if (!title.trim()) {
            setTitle(filename.replace(/\.[^/.]+$/, ''));
        }

        if (isText) {
            setImportStatus('processing');
            setImportStatusText('Metin dosyası okunuyor...');
            try {
                const fileText = await FileSystemLegacy.readAsStringAsync(asset.uri);
                setContentText(fileText);
                setImportedCharCount(fileText.trim().length);
                setImportStatus('success');
                if (isQuestionsOnlyMode) {
                    setSuggestedTopics([]);
                    setTopicsInfo('Sadece soru bankası modunda konu önerisi adımı atlandı.');
                    setImportStatusText(
                        'Metin alındı. İçerik gizli tutuldu, soru hazırlığı arka planda yapılacak.'
                    );
                    setFormInfo(
                        'Dosya hazır. "AI ile Analiz Et ve Üret" butonuna bastığında soru bankası oluşturulacak.'
                    );
                } else {
                    setImportStatusText(
                        'Metin alındı. Konu önerileri arka planda hazırlanıyor...'
                    );
                    setFormInfo(
                        'Metin dosyası okundu. Metin kutusu dolduysa işlem tamam; inceleyip kaydedebilirsin.'
                    );
                    void suggestTopics(fileText).then((topicCount) => {
                        setImportStatusText(
                            `Metin alındı, ${topicCount} konu önerisi hazırlandı.`
                        );
                    });
                }
            } catch (readError) {
                setImportStatus('error');
                setImportStatusText('Metin dosyası okunamadı.');
                setFormError(
                    readError instanceof Error
                        ? readError.message
                        : 'Dosya okunamadı. Lütfen tekrar dene.'
                );
            }
            return;
        }

        if (isPdf) {
            setIsImportingFile(true);
            setImportStatus('processing');
            setImportStatusText('PDF metni çıkarılıyor...');
            setFormInfo('PDF metni çıkarılıyor...');

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
                        'PDF dosyasından metin çıkarılamadı. Farklı bir PDF dene veya metni manuel ekle.'
                    );
                    return;
                }

                setContentText(extractedText);
                setImportedCharCount(extractedText.trim().length);
                setImportStatus('success');
                if (isQuestionsOnlyMode) {
                    setSuggestedTopics([]);
                    setTopicsInfo('Sadece soru bankası modunda konu önerisi adımı atlandı.');
                    setImportStatusText(
                        'PDF metni çıkarıldı. İçerik gizli tutuldu, soru hazırlığı arka planda yapılacak.'
                    );
                    setFormInfo(
                        'Dosya hazır. "AI ile Analiz Et ve Üret" butonuna bastığında soru bankası oluşturulacak.'
                    );
                } else {
                    setImportStatusText(
                        'PDF metni çıkarıldı. Konu önerileri arka planda hazırlanıyor...'
                    );
                    setFormInfo(
                        'Metin kutusu dolduysa PDF başarıyla işlenmiştir; dilersen düzenleyip kaydedebilirsin.'
                    );
                    void suggestTopics(extractedText).then((topicCount) => {
                        setImportStatusText(
                            `PDF metni çıkarıldı, ${topicCount} konu önerisi hazırlandı.`
                        );
                    });
                }
            } catch (extractError) {
                setImportStatus('error');
                setImportStatusText('PDF işleme başarısız oldu.');
                setFormError(
                    extractError instanceof Error
                        ? extractError.message
                        : 'PDF işlenirken hata oluştu. Lütfen tekrar dene.'
                );
            } finally {
                setIsImportingFile(false);
            }

            return;
        }

        setImportStatus('error');
        setImportStatusText('Seçilen dosya türü desteklenmiyor.');
        setFormError('Bu dosya türü desteklenmiyor. Lütfen .txt veya .pdf seç.');
    };

    const handleCreateSource = async () => {
        if (!title.trim()) {
            setFormError('Kaynak başlığı zorunludur.');
            return;
        }

        // Konu onerileri arka planda uretiliyorken kaydedilirse konu listesi bos
        // gider ve kaynak konusuz/sorusuz kaydedilirdi.
        if (isSuggestingTopics) {
            setFormError(
                'Konu önerileri hâlâ hazırlanıyor. Birkaç saniye bekleyip tekrar dene.'
            );
            return;
        }

        if (isImportingFile) {
            setFormError('Dosya hâlâ işleniyor. İşlem bitince kaydedebilirsin.');
            return;
        }

        if (!contentText.trim()) {
            setFormError(
                isQuestionsOnlyMode
                    ? 'Sadece soru bankası modunda önce bir dosya seçmelisin.'
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

            if (result.warning) {
                setFormError(result.warning);
            }

            const duplicateInfo =
                result.skippedDuplicateQuestionCount > 0
                    ? ` ${result.skippedDuplicateQuestionCount} tekrar soru atlandı.`
                    : '';
            const similarInfo =
                result.skippedSimilarQuestionCount > 0
                    ? ` ${result.skippedSimilarQuestionCount} benzer soru atlandı.`
                    : '';
            // Kaynakta karsiligi olmayan sorular sessizce elenmesin: kullanici
            // modelin uydurmaya calistigini gormeli.
            const ungroundedInfo =
                result.skippedUngroundedQuestionCount > 0
                    ? ` ${result.skippedUngroundedQuestionCount} soru kaynak metinde bulunamadığı için elendi.`
                    : '';

            if (result.appliedIngestMode === 'topics-only') {
                setFormInfo(
                    `Kaynak başarıyla kaydedildi. Sadece topic modu tamamlandı: ${result.insertedTopicCount} topic eklendi.`
                );
                setLastInsertedQuestionBreakdown([]);
                return;
            }

            if (result.appliedIngestMode === 'questions-only') {
                setFormInfo(
                    `Kaynak başarıyla kaydedildi. Sadece soru bankası modu tamamlandı: ${result.insertedQuestionCount} soru eklendi.${duplicateInfo}${similarInfo}${ungroundedInfo}`
                );
                setLastInsertedQuestionBreakdown(result.insertedQuestionCountByTopic);
                return;
            }

            if (result.insertedTopicCount > 0 || result.insertedQuestionCount > 0) {
                setFormInfo(
                    `Kaynak başarıyla kaydedildi. Hibrit mod tamamlandı: ${result.insertedTopicCount} topic, ${result.insertedQuestionCount} soru eklendi.${duplicateInfo}${similarInfo}${ungroundedInfo}`
                );
                setLastInsertedQuestionBreakdown(result.insertedQuestionCountByTopic);
                return;
            }

            setFormInfo('Kaynak başarıyla kaydedildi.');
        } catch (createError) {
            setFormError(
                createError instanceof Error ? createError.message : 'Kaynak kaydedilemedi.'
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <View style={styles.screen}>
            <AppHeader />

            <ScrollView
                contentContainerStyle={styles.container}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                <LinearGradient
                    colors={gradients.hero}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.hero}
                >
                    <Text style={styles.heroEyebrow}>AI DESTEKLİ KAYNAK İŞLEME</Text>
                    <Text style={styles.heroTitle}>Kaynağını Akıllı Şekilde İşle</Text>
                    <Text style={styles.heroDescription}>
                        PDF veya metin yükle, işleme modunu seç; konular ve soru bankası
                        otomatik üretilsin.
                    </Text>
                </LinearGradient>

                <AnimatedCard style={styles.panel} delayMs={20} resetKey="create-source-card">
                    <Text style={styles.sectionLabel}>
                        1. BELGE YÜKLE VEYA METİN YAPIŞTIR
                    </Text>

                    <Pressable
                        style={({ pressed }) => [
                            styles.dropzone,
                            pressed ? styles.pressed : null,
                            isImportingFile ? styles.disabled : null,
                        ]}
                        onPress={() => void handlePickFile()}
                        disabled={isImportingFile || isSubmitting}
                    >
                        <View style={styles.dropzoneIcon}>
                            {isImportingFile ? (
                                <ActivityIndicator size="small" color={palette.indigo600} />
                            ) : (
                                <Ionicons
                                    name="cloud-upload-outline"
                                    size={22}
                                    color={palette.indigo600}
                                />
                            )}
                        </View>
                        <Text style={styles.dropzoneTitle}>
                            {isImportingFile ? 'Dosya işleniyor...' : 'Dosya Seçin'}
                        </Text>
                        <Text style={styles.dropzoneHint}>
                            Desteklenen formatlar: TXT, PDF
                        </Text>
                        {selectedFileName ? (
                            <Text style={styles.dropzoneFile} numberOfLines={1}>
                                {selectedFileName}
                            </Text>
                        ) : null}
                    </Pressable>

                    <Text style={styles.fieldLabel}>KAYNAK BAŞLIĞI</Text>
                    <TextInput
                        value={title}
                        onChangeText={setTitle}
                        placeholder="Örn: YDS Grammar Notları"
                        placeholderTextColor={palette.textMuted}
                        style={styles.input}
                    />

                    {!isQuestionsOnlyMode ? (
                        <>
                            <View style={styles.fieldLabelRow}>
                                <Text style={styles.fieldLabel}>KAYNAK İÇERİĞİ</Text>
                                <Text style={styles.counterText}>
                                    {charCount} Karakter (~{wordCount} Kelime)
                                </Text>
                            </View>
                            <TextInput
                                value={contentText}
                                onChangeText={setContentText}
                                placeholder="Öğrenmek ve soru bankasına dönüştürmek istediğin ders notlarını buraya yapıştır..."
                                placeholderTextColor={palette.textMuted}
                                style={[styles.input, styles.textarea]}
                                multiline
                                textAlignVertical="top"
                            />

                            <Pressable
                                style={({ pressed }) => [
                                    styles.ghostButton,
                                    pressed ? styles.pressed : null,
                                ]}
                                onPress={() => {
                                    void suggestTopics(contentText);
                                }}
                                disabled={
                                    !contentText.trim() ||
                                    isSubmitting ||
                                    isImportingFile ||
                                    isSuggestingTopics
                                }
                            >
                                <Ionicons
                                    name="sparkles-outline"
                                    size={14}
                                    color={palette.indigo600}
                                />
                                <Text style={styles.ghostButtonText}>
                                    {isSuggestingTopics
                                        ? 'Konu Önerileri Üretiliyor...'
                                        : 'Konu Önerilerini Yenile'}
                                </Text>
                            </Pressable>
                        </>
                    ) : (
                        <View style={styles.noticeBox}>
                            <Text style={styles.noticeTitle}>Soru İçeriği Gizli Mod</Text>
                            <Text style={styles.noticeText}>
                                Dosya seçildikten sonra soru metni ekranda gösterilmez.
                            </Text>
                            <Text style={styles.noticeText}>
                                Hazır veri:{' '}
                                {importedCharCount > 0
                                    ? `${importedCharCount} karakter`
                                    : '—'}
                            </Text>
                        </View>
                    )}

                    {importStatus !== 'idle' ? (
                        <View
                            style={[
                                styles.statusCard,
                                importStatus === 'success'
                                    ? styles.statusCardSuccess
                                    : importStatus === 'error'
                                      ? styles.statusCardError
                                      : styles.statusCardProcessing,
                            ]}
                        >
                            <View style={styles.statusHeader}>
                                <Text style={styles.statusTitle}>
                                    {importStatus === 'processing'
                                        ? 'İşlem Sürüyor'
                                        : importStatus === 'success'
                                          ? 'İşlem Tamamlandı'
                                          : 'İşlem Başarısız'}
                                </Text>
                                {importStatus === 'processing' ? (
                                    <ActivityIndicator
                                        size="small"
                                        color={palette.indigo600}
                                    />
                                ) : null}
                            </View>
                            {importStatusText ? (
                                <Text style={styles.statusDetail}>{importStatusText}</Text>
                            ) : null}
                            {isSuggestingTopics ? (
                                <View style={styles.inlineStatusRow}>
                                    <ActivityIndicator
                                        size="small"
                                        color={palette.indigo600}
                                    />
                                    <Text style={styles.statusDetail}>
                                        Konu önerileri hazırlanıyor...
                                    </Text>
                                </View>
                            ) : null}
                        </View>
                    ) : null}

                    {suggestedTopics.length > 0 && !isQuestionsOnlyMode ? (
                        <View style={styles.topicBlock}>
                            <Text style={styles.fieldLabel}>TESPİT EDİLEN KONULAR</Text>
                            <View style={styles.topicList}>
                                {suggestedTopics.map((topic) => (
                                    <View key={topic} style={styles.topicPill}>
                                        <Text style={styles.topicPillText}>{topic}</Text>
                                    </View>
                                ))}
                            </View>
                        </View>
                    ) : null}

                    <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
                        2. AI İŞLEME MODU SEÇİMİ
                    </Text>

                    {VISIBLE_INGEST_MODE_OPTIONS.map((item) => {
                        const isActive = ingestMode === item.mode;

                        return (
                            <Pressable
                                key={item.mode}
                                onPress={() => setIngestMode(item.mode)}
                                style={({ pressed }) => [
                                    styles.modeCard,
                                    isActive ? styles.modeCardActive : null,
                                    pressed ? styles.pressed : null,
                                ]}
                            >
                                <View
                                    style={[
                                        styles.modeIcon,
                                        isActive ? styles.modeIconActive : null,
                                    ]}
                                >
                                    <Ionicons
                                        name={item.icon}
                                        size={18}
                                        color={
                                            isActive
                                                ? palette.onDarkPrimary
                                                : palette.textMuted
                                        }
                                    />
                                </View>

                                <View style={styles.modeTextBlock}>
                                    <Text style={styles.modeTitle}>{item.label}</Text>
                                    <Text style={styles.modeDescription}>
                                        {item.description}
                                    </Text>
                                </View>

                                {isActive ? (
                                    <Ionicons
                                        name="checkmark-circle"
                                        size={19}
                                        color={palette.indigo600}
                                    />
                                ) : null}
                            </Pressable>
                        );
                    })}

                    <View style={styles.expectedBox}>
                        <Text style={styles.expectedTitle}>Beklenen İşlem Özeti</Text>
                        {ingestMode === 'topics-only' ? (
                            <Text style={styles.expectedText}>
                                Tahmini: {expectedTopicCount} topic eklenecek, soru bankası
                                üretilmeyecek.
                            </Text>
                        ) : ingestMode === 'questions-only' ? (
                            <Text style={styles.expectedText}>
                                Tahmini: ~{expectedQuestionCount} soru bankaya eklenecek.
                                {suggestedTopics.length > 0
                                    ? ` Dağıtım ${suggestedTopics.length} topic üzerinden yapılacak.`
                                    : ' Topic girilmediyse Genel Soru Bankası topiği açılacak.'}
                            </Text>
                        ) : (
                            <Text style={styles.expectedText}>
                                Tahmini: {expectedTopicCount} topic ve ~
                                {expectedQuestionCount} soru oluşturulacak.
                            </Text>
                        )}
                    </View>

                    {topicsInfo ? <Text style={styles.infoText}>{topicsInfo}</Text> : null}
                    {formInfo ? <Text style={styles.infoText}>{formInfo}</Text> : null}

                    {lastInsertedQuestionBreakdown.length > 0 ? (
                        <View style={styles.breakdownBox}>
                            <Text style={styles.fieldLabel}>SON YÜKLEME SORU DAĞILIMI</Text>
                            {lastInsertedQuestionBreakdown.map((item) => (
                                <View key={item.topicName} style={styles.breakdownRow}>
                                    <Text style={styles.breakdownName} numberOfLines={1}>
                                        {item.topicName}
                                    </Text>
                                    <Text style={styles.breakdownCount}>
                                        {item.questionCount} soru
                                    </Text>
                                </View>
                            ))}
                        </View>
                    ) : null}

                    {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

                    <Pressable
                        style={({ pressed }) => [
                            styles.submitButton,
                            pressed ? styles.pressed : null,
                            isSubmitting ? styles.disabled : null,
                        ]}
                        onPress={handleCreateSource}
                        disabled={isSubmitting || isSuggestingTopics || isImportingFile}
                    >
                        {isSubmitting ? (
                            <ActivityIndicator size="small" color={palette.onDarkPrimary} />
                        ) : (
                            <Ionicons
                                name="sparkles"
                                size={16}
                                color={palette.onDarkPrimary}
                            />
                        )}
                        <Text style={styles.submitButtonText}>
                            {isSubmitting ? 'İşleniyor...' : 'AI ile Analiz Et ve Üret'}
                        </Text>
                    </Pressable>

                    <Link href="/(tabs)/sources" asChild>
                        <Pressable
                            style={({ pressed }) => [
                                styles.ghostButton,
                                pressed ? styles.pressed : null,
                            ]}
                        >
                            <Ionicons
                                name="albums-outline"
                                size={14}
                                color={palette.indigo600}
                            />
                            <Text style={styles.ghostButtonText}>Kaynak Listesine Git</Text>
                        </Pressable>
                    </Link>
                </AnimatedCard>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: palette.pageBg,
    },
    container: {
        padding: spacing.lg,
        gap: spacing.md,
        paddingBottom: spacing.xl,
    },
    hero: {
        borderRadius: radius.lg,
        padding: spacing.lg,
        gap: spacing.sm,
    },
    heroEyebrow: {
        color: palette.indigo300,
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.9,
    },
    heroTitle: {
        color: palette.onDarkPrimary,
        fontSize: 24,
        fontWeight: '800',
    },
    heroDescription: {
        color: palette.onDarkMuted,
        fontSize: 14,
        lineHeight: 21,
    },
    panel: {
        backgroundColor: palette.cardBg,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: palette.cardBorder,
        padding: spacing.md,
        gap: spacing.sm,
    },
    sectionLabel: {
        ...uiType.statLabel,
        color: palette.textSecondary,
    },
    sectionLabelSpaced: {
        marginTop: spacing.md,
    },
    dropzone: {
        alignItems: 'center',
        gap: spacing.xs,
        paddingVertical: spacing.xl,
        paddingHorizontal: spacing.md,
        borderRadius: radius.md,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: palette.indigoBorder,
        backgroundColor: palette.pageBg,
    },
    dropzoneIcon: {
        width: 40,
        height: 40,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: palette.indigoSurface,
        marginBottom: spacing.xs,
    },
    dropzoneTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: palette.textPrimary,
    },
    dropzoneHint: {
        ...uiType.small,
        color: palette.textMuted,
    },
    dropzoneFile: {
        ...uiType.small,
        color: palette.indigo600,
        fontWeight: '700',
        marginTop: spacing.xs,
        maxWidth: '100%',
    },
    fieldLabel: {
        ...uiType.statLabel,
        color: palette.textSecondary,
        marginTop: spacing.sm,
    },
    fieldLabelRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: spacing.sm,
    },
    counterText: {
        ...uiType.small,
        color: palette.textMuted,
    },
    input: {
        borderWidth: 1,
        borderColor: palette.cardBorder,
        borderRadius: radius.md,
        paddingHorizontal: spacing.md,
        paddingVertical: 11,
        fontSize: 14,
        color: palette.textPrimary,
        backgroundColor: palette.cardBg,
    },
    textarea: {
        minHeight: 150,
        paddingTop: spacing.md,
    },
    ghostButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        paddingVertical: 10,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.indigoBorder,
        backgroundColor: palette.indigoSurface,
    },
    ghostButtonText: {
        color: palette.indigo600,
        fontSize: 13,
        fontWeight: '700',
    },
    noticeBox: {
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.cardBorder,
        backgroundColor: palette.pageBg,
        padding: spacing.md,
        gap: spacing.xs,
    },
    noticeTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: palette.textPrimary,
    },
    noticeText: {
        ...uiType.small,
        color: palette.textSecondary,
    },
    statusCard: {
        borderRadius: radius.md,
        borderWidth: 1,
        padding: spacing.md,
        gap: spacing.xs,
    },
    statusCardProcessing: {
        borderColor: palette.indigoBorder,
        backgroundColor: palette.indigoSurface,
    },
    statusCardSuccess: {
        borderColor: palette.emerald500,
        backgroundColor: palette.emeraldSurface,
    },
    statusCardError: {
        borderColor: palette.error,
        backgroundColor: '#fef2f2',
    },
    statusHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.sm,
    },
    statusTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: palette.textPrimary,
    },
    statusDetail: {
        ...uiType.small,
        color: palette.textSecondary,
        lineHeight: 17,
    },
    inlineStatusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    topicBlock: {
        gap: spacing.sm,
    },
    topicList: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
    },
    topicPill: {
        paddingHorizontal: 11,
        paddingVertical: 6,
        borderRadius: radius.pill,
        backgroundColor: palette.indigoSurface,
        borderWidth: 1,
        borderColor: palette.indigoBorder,
    },
    topicPillText: {
        color: palette.indigo600,
        fontSize: 12,
        fontWeight: '700',
    },
    modeCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.cardBorder,
        backgroundColor: palette.cardBg,
    },
    modeCardActive: {
        borderColor: palette.indigo500,
        backgroundColor: palette.indigoSurface,
    },
    modeIcon: {
        width: 36,
        height: 36,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: palette.pageBg,
    },
    modeIconActive: {
        backgroundColor: palette.indigo600,
    },
    modeTextBlock: {
        flex: 1,
    },
    modeTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: palette.textPrimary,
    },
    modeDescription: {
        ...uiType.small,
        color: palette.textSecondary,
        marginTop: 2,
        lineHeight: 16,
    },
    expectedBox: {
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.cardBorder,
        backgroundColor: palette.pageBg,
        padding: spacing.md,
        gap: spacing.xs,
    },
    expectedTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: palette.textPrimary,
    },
    expectedText: {
        ...uiType.small,
        color: palette.textSecondary,
        lineHeight: 17,
    },
    breakdownBox: {
        gap: spacing.xs,
    },
    breakdownRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: spacing.sm,
    },
    breakdownName: {
        ...uiType.small,
        color: palette.textSecondary,
        flex: 1,
    },
    breakdownCount: {
        ...uiType.small,
        color: palette.textMuted,
        fontWeight: '600',
    },
    submitButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        marginTop: spacing.sm,
        paddingVertical: 13,
        borderRadius: radius.pill,
        backgroundColor: palette.indigo600,
    },
    submitButtonText: {
        color: palette.onDarkPrimary,
        fontSize: 15,
        fontWeight: '700',
    },
    pressed: {
        opacity: 0.75,
    },
    disabled: {
        opacity: 0.55,
    },
    infoText: {
        color: palette.emerald500,
        fontSize: 13,
        lineHeight: 19,
    },
    errorText: {
        color: palette.error,
        fontSize: 13,
        lineHeight: 19,
    },
});

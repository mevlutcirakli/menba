import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { AnimatedCard } from '../src/components/AnimatedCard';
import { AppHeader } from '../src/components/AppHeader';
import { useSources, type IngestMode } from '../src/hooks/useSources';
import { extractSourceTextFromFile } from '../src/services/geminiService';
import { gradients, palette, radius, shadow, spacing, uiType } from '../src/theme/tokens';

// Sinir bilincli olarak dusuk: soru cikarma hattinda zaten en fazla
// 8 x 10.000 karakter isleniyor (bkz. useSources CONTENT_CHUNK_SIZE /
// MAX_CONTENT_CHUNKS). Daha buyuk dosya, islenmeyen icerik icin dakikalarca
// bekletiyor.
const MAX_IMPORT_FILE_SIZE_MB = 2;
const MAX_IMPORT_FILE_SIZE_BYTES = MAX_IMPORT_FILE_SIZE_MB * 1024 * 1024;
// Beklenen soru sayisi tahmininde taban deger; icerikten hic soru kalibi
// cikarilamazsa en az bu kadar soru hedefleniyor.
const MIN_EXPECTED_QUESTIONS = 8;
const MAX_AUTO_EXTRACT_QUESTIONS_TOTAL = 80;

type ImportStatus = 'idle' | 'processing' | 'success' | 'error';

// Ekran tek modda calisiyor: dosyadan dogrudan soru bankasi uretiliyor.
// `IngestMode` tipi ve useSources'taki hybrid/topics-only isleme kodu
// duruyor; baska bir mod gerekirse createSource'a bu sabiti degistirmek
// yeterli.
const INGEST_MODE: IngestMode = 'questions-only';

function estimateQuestionLikeCount(text: string): number {
    const numberedStemCount = text.match(/(?:^|\n)\s*\d{1,3}[.)-]\s+.+/g)?.length ?? 0;
    const optionStemCount = text.match(/(?:^|\n)\s*[A-Ea-e][.)]\s+.+/g)?.length ?? 0;

    return Math.max(numberedStemCount, Math.floor(optionStemCount / 4));
}

export default function AddSourceScreen() {
    const router = useRouter();
    const { createSource } = useSources();
    const [title, setTitle] = useState('');
    const [contentText, setContentText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isImportingFile, setIsImportingFile] = useState(false);
    const [importStatus, setImportStatus] = useState<ImportStatus>('idle');
    const [importStatusText, setImportStatusText] = useState<string | null>(null);
    const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
    const [importedCharCount, setImportedCharCount] = useState<number>(0);
    const [formError, setFormError] = useState<string | null>(null);
    const [formInfo, setFormInfo] = useState<string | null>(null);
    const [lastInsertedQuestionBreakdown, setLastInsertedQuestionBreakdown] = useState<
        Array<{ topicName: string; questionCount: number }>
    >([]);

    // Konu adlari kaynak islenirken sunucu tarafinda cikariliyor; bu ekranda
    // onceden gosterilen konu onerisi adimi kalkti.
    const estimatedQuestionCount = estimateQuestionLikeCount(contentText);
    const expectedQuestionCount = Math.min(
        MAX_AUTO_EXTRACT_QUESTIONS_TOTAL,
        Math.max(MIN_EXPECTED_QUESTIONS, estimatedQuestionCount)
    );

    const handlePickFile = async () => {
        setFormError(null);
        setFormInfo(null);
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
            const sizeMb = (asset.size / (1024 * 1024)).toFixed(1);
            setImportStatus('error');
            setImportStatusText('Dosya boyutu limiti aşıldı.');
            setFormError(
                `Dosya çok büyük (${sizeMb}MB). En fazla ${MAX_IMPORT_FILE_SIZE_MB}MB yükleyebilirsin; ` +
                    'daha büyük dosyalarda işlem dakikalarca sürüyor ve fazlası zaten okunmuyor.'
            );
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
                setImportStatusText('Metin alındı. Soru hazırlığı üretim adımında yapılacak.');
                setFormInfo(
                    'Dosya hazır. "AI ile Analiz Et ve Üret" butonuna bastığında soru bankası oluşturulacak.'
                );
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
                setImportStatusText(
                    'PDF metni çıkarıldı. Soru hazırlığı üretim adımında yapılacak.'
                );
                setFormInfo(
                    'Dosya hazır. "AI ile Analiz Et ve Üret" butonuna bastığında soru bankası oluşturulacak.'
                );
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

        if (isImportingFile) {
            setFormError('Dosya hâlâ işleniyor. İşlem bitince kaydedebilirsin.');
            return;
        }

        if (!contentText.trim()) {
            setFormError('Soru bankası üretmek için önce bir dosya seçmelisin.');
            return;
        }

        setIsSubmitting(true);
        setFormError(null);
        setFormInfo(null);
        setLastInsertedQuestionBreakdown([]);

        try {
            const result = await createSource({
                title: title.trim(),
                contentText: contentText.trim(),
                topicNames: [],
                ingestMode: INGEST_MODE,
            });
            setTitle('');
            setContentText('');

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

            setFormInfo(
                `Kaynak kaydedildi: ${result.insertedQuestionCount} soru, ${result.insertedTopicCount} konu eklendi.${duplicateInfo}${similarInfo}${ungroundedInfo}`
            );
            setLastInsertedQuestionBreakdown(result.insertedQuestionCountByTopic);
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (createError) {
            setFormError(
                createError instanceof Error ? createError.message : 'Kaynak kaydedilemedi.'
            );
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        // Baslik kutusuna yazarken klavye alani kapatmasin diye icerik
        // klavye yuksekligi kadar yukari itiliyor.
        <KeyboardAvoidingView
            style={styles.screen}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <AppHeader />

            <ScrollView
                contentContainerStyle={styles.container}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                automaticallyAdjustKeyboardInsets
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
                        PDF veya metin dosyanı yükle; konular ve soru bankası otomatik
                        üretilsin.
                    </Text>
                </LinearGradient>

                <AnimatedCard style={styles.panel} delayMs={20} resetKey="create-source-card">
                    <Text style={styles.sectionLabel}>1. BELGE YÜKLE</Text>

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

                    <View style={styles.readyDataRow}>
                        <Ionicons
                            name="document-text-outline"
                            size={14}
                            color={palette.textMuted}
                        />
                        <Text style={styles.readyDataText}>
                            Hazır veri:{' '}
                            {importedCharCount > 0
                                ? `${importedCharCount} karakter`
                                : 'henüz dosya seçilmedi'}
                        </Text>
                    </View>

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
                        </View>
                    ) : null}

                    <View style={styles.expectedBox}>
                        <Text style={styles.expectedTitle}>Beklenen İşlem Özeti</Text>
                        <Text style={styles.expectedText}>
                            Tahmini: ~{expectedQuestionCount} soru bankaya eklenecek. Konu
                            başlıkları içerikten otomatik çıkarılacak.
                        </Text>
                    </View>

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
                        onPress={() => {
                            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            void handleCreateSource();
                        }}
                        disabled={isSubmitting || isImportingFile}
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

                    {/* Modal olarak acildigi icin listeye "gitmek" yerine
                        sadece kapatiyoruz; sources ekrani zaten arkada duruyor. */}
                    <Pressable
                        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/sources'))}
                        style={({ pressed }) => [
                            styles.ghostButton,
                            pressed ? styles.pressed : null,
                        ]}
                    >
                        <Ionicons name="close-outline" size={14} color={palette.indigo600} />
                        <Text style={styles.ghostButtonText}>Kapat</Text>
                    </Pressable>
                </AnimatedCard>
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
        ...shadow.card,
    },
    sectionLabel: {
        ...uiType.statLabel,
        color: palette.textSecondary,
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
    readyDataRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingVertical: spacing.xs,
    },
    readyDataText: {
        flex: 1,
        ...uiType.small,
        color: palette.textMuted,
    },
    fieldLabel: {
        ...uiType.statLabel,
        color: palette.textSecondary,
        marginTop: spacing.sm,
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

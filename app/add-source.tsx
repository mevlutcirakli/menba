import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import {
    MAX_PROCESSED_CONTENT_CHARS,
    useSources,
    type IngestMode,
} from '../src/hooks/useSources';
import { extractSourceTextFromFile } from '../src/services/geminiService';
import { palette, radius, spacing, uiType } from '../src/theme/tokens';

// Ekranda yazan sinir bu sabitten turetiliyor ki etiket ile gercek davranis
// birbirinden ayrilmasin. Dosya sinirinin ustunde bir de icerik siniri var
// (MAX_PROCESSED_CONTENT_CHARS): bu dosya boyutuna sigan ama hattin
// isleyeceginden uzun metinler icin asagida ayrica uyari cikiyor.
const MAX_IMPORT_FILE_SIZE_MB = 4;
const MAX_IMPORT_FILE_SIZE_BYTES = MAX_IMPORT_FILE_SIZE_MB * 1024 * 1024;

type ImportStatus = 'idle' | 'processing' | 'success' | 'error';

// Ekran tek modda calisiyor: dosyadan dogrudan soru bankasi uretiliyor.
const INGEST_MODE: IngestMode = 'questions-only';

/**
 * source_type sutunu kategori icin de kullaniliyor ama eskiden ingest modu
 * yaziliyordu. Bu degerler kullanicinin yazdigi bir kategori degil; oneri
 * listesinde gosterilmemeliler.
 */
const NON_CATEGORY_SOURCE_TYPES = new Set([
    'hybrid',
    'questions-only',
    'topics-only',
    'custom',
]);

/** Oneri olarak gosterilecek en fazla kategori sayisi. */
const CATEGORY_SUGGESTION_LIMIT = 6;

export default function AddSourceScreen() {
    const router = useRouter();
    const { createSource, sources } = useSources();
    const [title, setTitle] = useState('');
    const [category, setCategory] = useState('');
    const [contentText, setContentText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isImportingFile, setIsImportingFile] = useState(false);
    const [importStatus, setImportStatus] = useState<ImportStatus>('idle');
    const [importStatusText, setImportStatusText] = useState<string | null>(null);
    const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [formInfo, setFormInfo] = useState<string | null>(null);

    // Oneriler kullanicinin kendi kaynaklarindan geliyor: uygulama alandan
    // bagimsiz, "YDS" gibi sabit bir liste herkese uymuyor.
    const categorySuggestions = useMemo(() => {
        const seen = new Set<string>();
        for (const source of sources) {
            const value = source.source_type?.trim();
            if (!value || NON_CATEGORY_SOURCE_TYPES.has(value)) {
                continue;
            }
            seen.add(value);
        }

        return Array.from(seen).slice(0, CATEGORY_SUGGESTION_LIMIT);
    }, [sources]);

    const closeSheet = () => {
        if (router.canGoBack()) {
            router.back();
            return;
        }

        router.replace('/(tabs)/sources');
    };

    const handlePickFile = async () => {
        setFormError(null);
        setFormInfo(null);
        setImportStatus('idle');
        setImportStatusText(null);
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
                setImportStatus('success');
                setImportStatusText(`${fileText.trim().length} karakter alındı.`);
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
                    setImportStatus('error');
                    setImportStatusText('PDF metni boş geldi.');
                    setFormError(
                        'PDF dosyasından metin çıkarılamadı. Farklı bir PDF dene veya metni manuel ekle.'
                    );
                    return;
                }

                setContentText(extractedText);
                setImportStatus('success');
                setImportStatusText(`${extractedText.trim().length} karakter alındı.`);
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

        try {
            const result = await createSource({
                title: title.trim(),
                contentText: contentText.trim(),
                // Bos birakildiysa createSource kendi varsayilanini yaziyor.
                sourceType: category.trim() || undefined,
                topicNames: [],
                ingestMode: INGEST_MODE,
            });

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
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

            setTitle('');
            setContentText('');
            setSelectedFileName(null);
            setImportStatus('idle');
        } catch (createError) {
            setFormError(
                createError instanceof Error ? createError.message : 'Kaynak kaydedilemedi.'
            );
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const isBusy = isSubmitting || isImportingFile;

    return (
        <View style={styles.sheet}>
            {/* Kendi tutamagimiz: sheetGrabberVisible yalnizca iOS'ta calisiyor,
                bu yuzden iki platformda da ayni gorunsun diye elle ciziliyor. */}
            <View style={styles.grabber} />

            <ScrollView
                contentContainerStyle={styles.container}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                automaticallyAdjustKeyboardInsets
            >
                <Text style={styles.sheetTitle}>Yeni Kaynak Ekle</Text>

                <Pressable
                    style={({ pressed }) => [
                        styles.dropzone,
                        pressed ? styles.pressed : null,
                        isBusy ? styles.disabled : null,
                    ]}
                    onPress={() => void handlePickFile()}
                    disabled={isBusy}
                >
                    <View style={styles.dropzoneIcon}>
                        {isImportingFile ? (
                            <ActivityIndicator size="small" color={palette.accent} />
                        ) : (
                            <Ionicons
                                name="cloud-upload-outline"
                                size={24}
                                color={palette.accent}
                            />
                        )}
                    </View>
                    <Text style={styles.dropzoneTitle}>
                        {isImportingFile ? 'Dosya işleniyor...' : 'PDF veya metin dosyası seçin'}
                    </Text>
                    <Text style={styles.dropzoneHint}>
                        Maksimum dosya boyutu: {MAX_IMPORT_FILE_SIZE_MB}MB
                    </Text>
                    {selectedFileName ? (
                        <Text style={styles.dropzoneFile} numberOfLines={1}>
                            {selectedFileName}
                        </Text>
                    ) : null}
                </Pressable>

                {/* Dosya 4MB'a sigsa bile metin hattin isleyeceginden uzun
                    olabiliyor; fazlasi sessizce dusmesin. */}
                {contentText.trim().length > MAX_PROCESSED_CONTENT_CHARS ? (
                    <View style={[styles.statusRow, styles.statusRowWarning]}>
                        <Ionicons
                            name="information-circle"
                            size={16}
                            color={palette.amber600}
                        />
                        <Text style={styles.statusText}>
                            Metin {contentText.trim().length.toLocaleString('tr-TR')} karakter.
                            Soru üretimi ilk{' '}
                            {MAX_PROCESSED_CONTENT_CHARS.toLocaleString('tr-TR')} karakteri
                            işliyor; gerisi bu yüklemede kullanılmayacak.
                        </Text>
                    </View>
                ) : null}

                {importStatus !== 'idle' && importStatusText ? (
                    <View
                        style={[
                            styles.statusRow,
                            importStatus === 'success'
                                ? styles.statusRowSuccess
                                : importStatus === 'error'
                                  ? styles.statusRowError
                                  : styles.statusRowProcessing,
                        ]}
                    >
                        {importStatus === 'processing' ? (
                            <ActivityIndicator size="small" color={palette.accent} />
                        ) : (
                            <Ionicons
                                name={
                                    importStatus === 'success'
                                        ? 'checkmark-circle'
                                        : 'alert-circle'
                                }
                                size={16}
                                color={
                                    importStatus === 'success'
                                        ? palette.success
                                        : palette.danger
                                }
                            />
                        )}
                        <Text style={styles.statusText}>{importStatusText}</Text>
                    </View>
                ) : null}

                <Text style={styles.fieldLabel}>Kaynak Adı</Text>
                <TextInput
                    value={title}
                    onChangeText={setTitle}
                    placeholder="Örn: 3. Ünite Ders Notları"
                    placeholderTextColor={palette.textMuted}
                    style={styles.input}
                />

                <Text style={styles.fieldLabel}>Kategori</Text>
                <TextInput
                    value={category}
                    onChangeText={setCategory}
                    placeholder="Örn: Ticaret Hukuku (isteğe bağlı)"
                    placeholderTextColor={palette.textMuted}
                    style={styles.input}
                />

                {categorySuggestions.length > 0 ? (
                    <View style={styles.suggestionRow}>
                        {categorySuggestions.map((suggestion) => {
                            const isActive = suggestion === category.trim();

                            return (
                                <Pressable
                                    key={suggestion}
                                    onPress={() => setCategory(isActive ? '' : suggestion)}
                                    style={({ pressed }) => [
                                        styles.suggestionChip,
                                        isActive ? styles.suggestionChipActive : null,
                                        pressed ? styles.pressed : null,
                                    ]}
                                >
                                    <Text
                                        style={[
                                            styles.suggestionChipText,
                                            isActive
                                                ? styles.suggestionChipTextActive
                                                : null,
                                        ]}
                                        numberOfLines={1}
                                    >
                                        {suggestion}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>
                ) : null}

                {formInfo ? <Text style={styles.infoText}>{formInfo}</Text> : null}
                {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

                <Pressable
                    style={({ pressed }) => [
                        styles.submitButton,
                        pressed ? styles.pressed : null,
                        isBusy ? styles.disabled : null,
                    ]}
                    onPress={() => {
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        void handleCreateSource();
                    }}
                    disabled={isBusy}
                >
                    {isSubmitting ? (
                        <ActivityIndicator size="small" color={palette.onDarkPrimary} />
                    ) : null}
                    <Text style={styles.submitButtonText}>
                        {isSubmitting ? 'İşleniyor...' : 'Analiz Et ve Soru Üret'}
                    </Text>
                </Pressable>

                <Pressable
                    onPress={closeSheet}
                    style={({ pressed }) => [
                        styles.cancelButton,
                        pressed ? styles.pressed : null,
                    ]}
                >
                    <Text style={styles.cancelButtonText}>İptal</Text>
                </Pressable>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    sheet: {
        flex: 1,
        backgroundColor: palette.cardBg,
    },
    grabber: {
        alignSelf: 'center',
        width: 38,
        height: 4,
        borderRadius: radius.pill,
        backgroundColor: palette.cardBorder,
        marginTop: spacing.sm,
        marginBottom: spacing.xs,
    },
    container: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        paddingBottom: spacing.xl,
        gap: spacing.sm,
    },
    sheetTitle: {
        fontSize: 21,
        fontWeight: '800',
        color: palette.textPrimary,
        marginBottom: spacing.sm,
    },
    dropzone: {
        alignItems: 'center',
        gap: spacing.xs,
        paddingVertical: spacing.xl,
        paddingHorizontal: spacing.md,
        borderRadius: radius.lg,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: palette.teal200,
        backgroundColor: palette.primarySurface,
    },
    dropzoneIcon: {
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
        color: palette.accent,
        fontWeight: '700',
        marginTop: spacing.xs,
        maxWidth: '100%',
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.md,
        borderWidth: 1,
    },
    statusRowProcessing: {
        borderColor: palette.primaryBorder,
        backgroundColor: palette.primarySurface,
    },
    statusRowSuccess: {
        borderColor: palette.successBorder,
        backgroundColor: palette.successSurface,
    },
    statusRowError: {
        borderColor: palette.dangerBorder,
        backgroundColor: palette.dangerSurface,
    },
    statusRowWarning: {
        borderColor: palette.amber500,
        backgroundColor: palette.amberSurface,
    },
    statusText: {
        flex: 1,
        ...uiType.small,
        color: palette.textSecondary,
    },
    fieldLabel: {
        fontSize: 13,
        fontWeight: '700',
        color: palette.textPrimary,
        marginTop: spacing.sm,
    },
    input: {
        borderWidth: 1,
        borderColor: palette.cardBorder,
        borderRadius: radius.md,
        paddingHorizontal: spacing.md,
        paddingVertical: 13,
        fontSize: 14,
        color: palette.textPrimary,
        backgroundColor: palette.cardBg,
    },
    suggestionRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
        marginTop: spacing.xs,
    },
    suggestionChip: {
        paddingVertical: 6,
        paddingHorizontal: 11,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: palette.cardBorder,
        backgroundColor: palette.cardBg,
        maxWidth: '100%',
    },
    suggestionChipActive: {
        borderColor: palette.primaryBorder,
        backgroundColor: palette.primarySurface,
    },
    suggestionChipText: {
        ...uiType.small,
        color: palette.textSecondary,
    },
    suggestionChipTextActive: {
        color: palette.accent,
        fontWeight: '700',
    },
    submitButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        marginTop: spacing.lg,
        paddingVertical: 15,
        borderRadius: radius.md,
        backgroundColor: palette.primary,
    },
    submitButtonText: {
        color: palette.onDarkPrimary,
        fontSize: 15,
        fontWeight: '700',
    },
    cancelButton: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 13,
    },
    cancelButtonText: {
        color: palette.textMuted,
        fontSize: 15,
        fontWeight: '600',
    },
    pressed: {
        opacity: 0.75,
    },
    disabled: {
        opacity: 0.55,
    },
    infoText: {
        color: palette.success,
        fontSize: 13,
        lineHeight: 19,
        marginTop: spacing.sm,
    },
    errorText: {
        color: palette.danger,
        fontSize: 13,
        lineHeight: 19,
        marginTop: spacing.sm,
    },
});

import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
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
    type IngestProgress,
} from '../src/hooks/useSources';
import { extractSourceTextFromFile } from '../src/services/geminiService';
import { palette, radius, spacing, uiType } from '../src/theme/tokens';
import { localizeError } from '../src/utils/errors';

// Ekranda yazan sinir bu sabitten turetiliyor ki etiket ile gercek davranis
// birbirinden ayrilmasin. Dosya sinirinin ustunde bir de icerik siniri var
// (MAX_PROCESSED_CONTENT_CHARS): bu dosya boyutuna sigan ama hattin
// isleyeceginden uzun metinler icin asagida ayrica uyari cikiyor.
const MAX_IMPORT_FILE_SIZE_MB = 4;
const MAX_IMPORT_FILE_SIZE_BYTES = MAX_IMPORT_FILE_SIZE_MB * 1024 * 1024;
// base64 kodlama ham boyutu ~4/3 buyutur; boyutu onceden bildirilmeyen
// dosyalarda sinir okuduktan sonra bunun uzerinden kontrol ediliyor.
const MAX_IMPORT_BASE64_LENGTH = Math.ceil((MAX_IMPORT_FILE_SIZE_BYTES * 4) / 3);

type ImportStatus = 'idle' | 'processing' | 'success' | 'error';

interface CreatedSourceSummary {
    sourceId: string;
    message: string;
}

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
    const navigation = useNavigation();
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
    const [createdSource, setCreatedSource] = useState<CreatedSourceSummary | null>(null);
    const [ingestProgress, setIngestProgress] = useState<IngestProgress | null>(null);

    const isBusy = isSubmitting || isImportingFile;

    // Uzun suren yukleme sirasinda sheet'in asagi surukleyerek kapatilmasi
    // engelleniyor: is arka planda devam ediyor ama kullanici sonucu bir daha
    // hic goremiyordu.
    useEffect(() => {
        navigation.setOptions({ gestureEnabled: !isSubmitting });
    }, [isSubmitting, navigation]);

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

    const openCreatedSource = (sourceId: string) => {
        closeSheet();
        // Sheet kapanma animasyonu bitmeden yapilan push yutuluyor; kisa
        // gecikme yonlendirmenin guvenilir calismasini sagliyor.
        setTimeout(() => {
            router.push({ pathname: '/quiz/[sourceId]', params: { sourceId } });
        }, 350);
    };

    const resetForNextSource = () => {
        setCreatedSource(null);
        setTitle('');
        setCategory('');
        setContentText('');
        setSelectedFileName(null);
        setImportStatus('idle');
        setImportStatusText(null);
        setFormError(null);
        setIngestProgress(null);
    };

    const handlePickFile = async () => {
        setFormError(null);
        setCreatedSource(null);
        setImportStatus('idle');
        setImportStatusText(null);
        setSelectedFileName(null);

        let result: DocumentPicker.DocumentPickerResult;
        try {
            result = await DocumentPicker.getDocumentAsync({
                type: ['text/plain', 'application/pdf'],
                multiple: false,
                copyToCacheDirectory: true,
            });
        } catch (pickError) {
            // Secici izin/saglayici hatasi verirse butona basmak eskiden
            // hicbir sey yapmiyor gibi gorunuyordu.
            setImportStatus('error');
            setImportStatusText('Dosya seçici açılamadı.');
            setFormError(localizeError(pickError, 'Dosya seçici açılamadı.'));
            return;
        }

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
                setFormError(localizeError(readError, 'Dosya okunamadı.'));
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

                // Bazi Android saglayicilari asset.size vermiyor; sinir o
                // durumda sessizce atlaniyordu.
                if (base64Data.length > MAX_IMPORT_BASE64_LENGTH) {
                    setImportStatus('error');
                    setImportStatusText('Dosya boyutu limiti aşıldı.');
                    setFormError(
                        `Bu dosya ${MAX_IMPORT_FILE_SIZE_MB}MB sınırını aşıyor. Daha küçük bir dosya dene.`
                    );
                    return;
                }

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
                setFormError(localizeError(extractError, 'PDF işlenirken hata oluştu.'));
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
        setCreatedSource(null);
        setIngestProgress({ label: 'Başlatılıyor...', completed: 0, total: 0 });

        try {
            const result = await createSource({
                title: title.trim(),
                contentText: contentText.trim(),
                // Bos birakildiysa createSource kendi varsayilanini yaziyor.
                sourceType: category.trim() || undefined,
                topicNames: [],
                ingestMode: INGEST_MODE,
                onProgress: setIngestProgress,
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

            setCreatedSource({
                sourceId: result.sourceId,
                message: `${result.insertedQuestionCount} soru, ${result.insertedTopicCount} konu eklendi.${duplicateInfo}${similarInfo}${ungroundedInfo}`,
            });
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (createError) {
            setFormError(localizeError(createError, 'Kaynak kaydedilemedi.'));
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } finally {
            setIsSubmitting(false);
            setIngestProgress(null);
        }
    };

    // Kayit bittikten sonra form yerine ne yapabilecegini soyleyen bir ozet
    // gosteriliyor. Onceden sheet acik kaliyor, tek cikis "Iptal" oluyordu.
    if (createdSource) {
        return (
            <View style={styles.sheet}>
                <View style={styles.grabber} />

                <ScrollView
                    contentContainerStyle={styles.container}
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.doneIcon}>
                        <Ionicons
                            name="checkmark-circle"
                            size={34}
                            color={palette.success}
                        />
                    </View>

                    <Text style={styles.sheetTitle}>Kaynak hazır</Text>
                    <Text style={styles.doneBody}>{createdSource.message}</Text>

                    {formError ? (
                        <View style={[styles.statusRow, styles.statusRowWarning]}>
                            <Ionicons
                                name="information-circle"
                                size={16}
                                color={palette.amber600}
                            />
                            <Text style={styles.statusText}>{formError}</Text>
                        </View>
                    ) : null}

                    <Pressable
                        onPress={() => openCreatedSource(createdSource.sourceId)}
                        accessibilityRole="button"
                        accessibilityLabel="Kaynağı aç ve teste başla"
                        style={({ pressed }) => [
                            styles.submitButton,
                            pressed ? styles.pressed : null,
                        ]}
                    >
                        <Ionicons
                            name="play"
                            size={15}
                            color={palette.onDarkPrimary}
                        />
                        <Text style={styles.submitButtonText}>Kaynağı Aç</Text>
                    </Pressable>

                    <Pressable
                        onPress={resetForNextSource}
                        accessibilityRole="button"
                        accessibilityLabel="Yeni bir kaynak daha ekle"
                        style={({ pressed }) => [
                            styles.secondaryButton,
                            pressed ? styles.pressed : null,
                        ]}
                    >
                        <Text style={styles.secondaryButtonText}>Bir Kaynak Daha Ekle</Text>
                    </Pressable>

                    <Pressable
                        onPress={closeSheet}
                        accessibilityRole="button"
                        accessibilityLabel="Kapat"
                        style={({ pressed }) => [
                            styles.cancelButton,
                            pressed ? styles.pressed : null,
                        ]}
                    >
                        <Text style={styles.cancelButtonText}>Kapat</Text>
                    </Pressable>
                </ScrollView>
            </View>
        );
    }

    const progressRatio =
        ingestProgress && ingestProgress.total > 0
            ? Math.min(1, ingestProgress.completed / ingestProgress.total)
            : null;

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
                    accessibilityRole="button"
                    accessibilityLabel="PDF veya metin dosyası seç"
                    accessibilityHint={`En fazla ${MAX_IMPORT_FILE_SIZE_MB} megabayt`}
                    accessibilityState={{ disabled: isBusy, busy: isImportingFile }}
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
                    editable={!isSubmitting}
                    accessibilityLabel="Kaynak adı"
                    style={styles.input}
                />

                <Text style={styles.fieldLabel}>Kategori</Text>
                <TextInput
                    value={category}
                    onChangeText={setCategory}
                    placeholder="Örn: Ticaret Hukuku (isteğe bağlı)"
                    placeholderTextColor={palette.textMuted}
                    editable={!isSubmitting}
                    accessibilityLabel="Kategori, isteğe bağlı"
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
                                    disabled={isSubmitting}
                                    hitSlop={8}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Kategori: ${suggestion}`}
                                    accessibilityState={{ selected: isActive }}
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

                {/* Uzun suren adim: kullanici hangi asamada olundugunu ve
                    isin ilerledigini gorebilmeli. */}
                {isSubmitting && ingestProgress ? (
                    <View style={styles.progressCard}>
                        <View style={styles.progressHead}>
                            <ActivityIndicator size="small" color={palette.accent} />
                            <Text style={styles.progressLabel} numberOfLines={2}>
                                {ingestProgress.label}
                            </Text>
                        </View>

                        <View
                            style={styles.progressTrack}
                            accessibilityRole="progressbar"
                            accessibilityValue={
                                progressRatio === null
                                    ? undefined
                                    : {
                                          min: 0,
                                          max: ingestProgress.total,
                                          now: ingestProgress.completed,
                                      }
                            }
                        >
                            <View
                                style={[
                                    styles.progressFill,
                                    // Toplam bilinmiyorken belirsizlik yerine ince
                                    // bir baslangic dolgusu gosteriliyor.
                                    { width: `${(progressRatio ?? 0.08) * 100}%` },
                                ]}
                            />
                        </View>

                        <Text style={styles.progressHint}>
                            Bu adım dosyanın boyutuna göre birkaç dakika sürebilir.
                            Uygulamayı açık tut.
                        </Text>
                    </View>
                ) : null}

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
                    accessibilityRole="button"
                    accessibilityLabel="Analiz et ve soru üret"
                    accessibilityState={{ disabled: isBusy, busy: isSubmitting }}
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
                    disabled={isSubmitting}
                    accessibilityRole="button"
                    accessibilityLabel="Vazgeç ve kapat"
                    accessibilityState={{ disabled: isSubmitting }}
                    style={({ pressed }) => [
                        styles.cancelButton,
                        pressed ? styles.pressed : null,
                        isSubmitting ? styles.disabled : null,
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
        justifyContent: 'center',
        minHeight: 36,
        paddingVertical: 8,
        paddingHorizontal: 13,
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
    progressCard: {
        gap: spacing.sm,
        marginTop: spacing.sm,
        padding: spacing.md,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: palette.primaryBorder,
        backgroundColor: palette.primarySurface,
    },
    progressHead: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    progressLabel: {
        flex: 1,
        fontSize: 13,
        fontWeight: '700',
        color: palette.textPrimary,
    },
    progressTrack: {
        height: 6,
        borderRadius: radius.pill,
        backgroundColor: palette.teal100,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: radius.pill,
        backgroundColor: palette.accent,
    },
    progressHint: {
        ...uiType.small,
        color: palette.textSecondary,
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
    secondaryButton: {
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: spacing.sm,
        paddingVertical: 14,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: palette.primaryBorder,
        backgroundColor: palette.primarySurface,
    },
    secondaryButtonText: {
        color: palette.primary,
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
    doneIcon: {
        alignSelf: 'center',
        width: 64,
        height: 64,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: palette.successSurface,
        marginBottom: spacing.sm,
    },
    doneBody: {
        ...uiType.body,
        color: palette.textSecondary,
    },
    pressed: {
        opacity: 0.75,
    },
    disabled: {
        opacity: 0.55,
    },
    errorText: {
        color: palette.danger,
        fontSize: 13,
        lineHeight: 19,
        marginTop: spacing.sm,
    },
});

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { gradients, palette, radius, spacing } from '../theme/tokens';

interface AppHeaderProps {
    /** Sag tarafta gosterilecek opsiyonel aksiyon (ornegin "Kaynak Ekle"). */
    rightAction?: {
        icon: keyof typeof Ionicons.glyphMap;
        label?: string;
        onPress: () => void;
    };
}

/**
 * AI Studio surumundeki koyu ust bar. Web'deki yatay sekme grubu buraya
 * tasinmadi: mobilde o gorevi alttaki tab bar goruyor, ikisi birden olursa
 * ayni navigasyon iki kez cizilmis olurdu.
 */
export function AppHeader({ rightAction }: AppHeaderProps = {}) {
    const insets = useSafeAreaInsets();

    return (
        <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
            {/* Koyu bar durum cubugunun altina da uzaniyor. app.json'da
                userInterfaceStyle "light" oldugu icin varsayilan "auto" koyu
                ikon ciziyordu ve saat/sinyal koyu zeminde kayboluyordu. */}
            <StatusBar style="light" />
            <LinearGradient
                colors={gradients.brand}
                start={{ x: 0, y: 1 }}
                end={{ x: 1, y: 0 }}
                style={styles.logoBadge}
            >
                <Ionicons name="sparkles" size={20} color={palette.onDarkPrimary} />
            </LinearGradient>

            <View style={styles.textBlock}>
                <Text style={styles.brand}>MENBA</Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                    Akıllı Kaynak & Soru Bankası Platformu
                </Text>
            </View>

            {rightAction ? (
                <Pressable
                    onPress={() => {
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        rightAction.onPress();
                    }}
                    style={({ pressed }) => [
                        styles.rightActionButton,
                        pressed ? styles.rightActionButtonPressed : null,
                    ]}
                >
                    <Ionicons name={rightAction.icon} size={18} color={palette.onDarkPrimary} />
                </Pressable>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.md,
        backgroundColor: palette.navy900,
        borderBottomWidth: 1,
        borderBottomColor: palette.navy800,
    },
    logoBadge: {
        width: 40,
        height: 40,
        borderRadius: radius.lg,
        alignItems: 'center',
        justifyContent: 'center',
    },
    textBlock: {
        flex: 1,
    },
    brand: {
        color: palette.onDarkPrimary,
        fontSize: 20,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    subtitle: {
        marginTop: 2,
        color: palette.onDarkMuted,
        fontSize: 11,
    },
    rightActionButton: {
        width: 36,
        height: 36,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.12)',
    },
    rightActionButtonPressed: {
        opacity: 0.7,
    },
});

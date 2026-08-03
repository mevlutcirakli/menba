import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { gradients, palette, radius, spacing } from '../theme/tokens';

/**
 * AI Studio surumundeki koyu ust bar. Web'deki yatay sekme grubu buraya
 * tasinmadi: mobilde o gorevi alttaki tab bar goruyor, ikisi birden olursa
 * ayni navigasyon iki kez cizilmis olurdu.
 */
export function AppHeader() {
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
});

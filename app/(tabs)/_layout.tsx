import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette } from '../../src/theme/tokens';

/** Ikon + etiketin kapladigi alan; bunun altina sistem cubugu payi ekleniyor. */
const BAR_CONTENT_HEIGHT = 50;
const BAR_PADDING_TOP = 8;

/**
 * Tasarimdaki alt bar: beyaz zemin, ince ust cizgi, ikon + etiket.
 * Aktif sekme koyu teal, pasifler notr gri; arka plan vurgusu yok.
 */
export default function TabsLayout() {
    // Uygulama edge-to-edge ciziliyor: Android'de sistem gezinme cubugu
    // (ozellikle 3 tuslu mod) barin uzerine biner, iOS'ta ise home indicator
    // ayni isi yapar. Yuksekligi sabit vermek yerine alt inset kadar buyutup
    // ic bosluk birakiyoruz, boylece sekmeler her cihazda gorunur/tiklanabilir
    // kaliyor. Cubugun hic olmadigi cihazlarda da nefes payi kalsin diye taban
    // deger 8.
    const insets = useSafeAreaInsets();
    const bottomInset = Math.max(insets.bottom, 8);

    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarActiveTintColor: palette.primary,
                tabBarInactiveTintColor: palette.textMuted,
                tabBarHideOnKeyboard: true,
                tabBarLabelStyle: styles.label,
                tabBarItemStyle: styles.item,
                tabBarStyle: [
                    styles.bar,
                    {
                        height: BAR_CONTENT_HEIGHT + BAR_PADDING_TOP + bottomInset,
                        paddingBottom: bottomInset,
                    },
                ],
            }}
        >
            <Tabs.Screen
                name="index"
                options={{
                    title: 'Ana Sayfa',
                    tabBarIcon: ({ color, focused }) => (
                        <Ionicons
                            name={focused ? 'home' : 'home-outline'}
                            size={22}
                            color={color}
                        />
                    ),
                }}
            />
            <Tabs.Screen
                name="sources"
                options={{
                    title: 'Kaynaklarım',
                    tabBarIcon: ({ color, focused }) => (
                        <Ionicons
                            name={focused ? 'book' : 'book-outline'}
                            size={22}
                            color={color}
                        />
                    ),
                }}
            />
            <Tabs.Screen
                name="profile"
                options={{
                    title: 'Profil',
                    tabBarIcon: ({ color, focused }) => (
                        <Ionicons
                            name={focused ? 'person' : 'person-outline'}
                            size={22}
                            color={color}
                        />
                    ),
                }}
            />
        </Tabs>
    );
}

const styles = StyleSheet.create({
    bar: {
        backgroundColor: palette.cardBg,
        borderTopColor: palette.cardBorder,
        borderTopWidth: 1,
        // height ve paddingBottom calisma aninda inset'e gore veriliyor.
        paddingTop: BAR_PADDING_TOP,
        // Tasarimda bar duz; golge yok.
        elevation: 0,
        shadowOpacity: 0,
    },
    item: {
        paddingVertical: 0,
    },
    label: {
        fontSize: 11,
        fontWeight: '600',
        marginTop: 2,
    },
});

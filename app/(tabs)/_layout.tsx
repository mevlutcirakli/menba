import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';
import { palette } from '../../src/theme/tokens';

/**
 * Tasarimdaki alt bar: beyaz zemin, ince ust cizgi, ikon + etiket.
 * Aktif sekme koyu teal, pasifler notr gri; arka plan vurgusu yok.
 */
export default function TabsLayout() {
    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarActiveTintColor: palette.primary,
                tabBarInactiveTintColor: palette.textMuted,
                tabBarHideOnKeyboard: true,
                tabBarLabelStyle: styles.label,
                tabBarItemStyle: styles.item,
                tabBarStyle: styles.bar,
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
        height: Platform.OS === 'ios' ? 84 : 66,
        paddingBottom: Platform.OS === 'ios' ? 26 : 8,
        paddingTop: 8,
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

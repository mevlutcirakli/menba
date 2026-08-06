import { Tabs } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Platform, StyleSheet, View } from 'react-native';
import { palette, radius } from '../../src/theme/tokens';

export default function TabsLayout() {
    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarActiveTintColor: palette.indigo600,
                tabBarInactiveTintColor: palette.textMuted,
                tabBarActiveBackgroundColor: palette.indigoSurface,
                tabBarInactiveBackgroundColor: palette.cardBg,
                tabBarHideOnKeyboard: true,
                tabBarItemStyle: {
                    borderRadius: radius.md,
                    marginHorizontal: 2,
                },
                tabBarLabelStyle: {
                    fontSize: 11,
                    fontWeight: '700',
                },
                tabBarStyle: {
                    backgroundColor: palette.cardBg,
                    borderTopColor: palette.cardBorder,
                    borderTopWidth: 1,
                    height: Platform.OS === 'ios' ? 78 : 68,
                    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
                    paddingTop: 8,
                    ...Platform.select({
                        ios: {
                            shadowColor: palette.textPrimary,
                            shadowOpacity: 0.08,
                            shadowRadius: 10,
                            shadowOffset: { width: 0, height: -3 },
                        },
                        android: {
                            elevation: 10,
                        },
                        default: {},
                    }),
                },
            }}
        >
            {/* Ana sayfa artik panel/istatistikler: kullanici uygulamayi
                actiginda bos bir form yerine "durumun bu" gorsun diye eski
                dashboard.tsx buraya tasindi. Kaynak ekleme akisi artik tab
                degil, sources ekranindaki "+" ile acilan bir modal
                (/add-source). */}
            <Tabs.Screen
                name="index"
                options={{
                    title: 'Ana Sayfa',
                    tabBarIcon: ({ color, size, focused }) => (
                        <View style={[styles.iconWrap, focused ? styles.iconWrapFocused : null]}>
                            <FontAwesome
                                name={focused ? 'home' : 'home'}
                                size={focused ? size + 2 : size + 1}
                                color={color}
                            />
                        </View>
                    ),
                }}
            />
            <Tabs.Screen
                name="sources"
                options={{
                    title: 'Kaynaklarım',
                    tabBarIcon: ({ color, size, focused }) => (
                        <View style={[styles.iconWrap, focused ? styles.iconWrapFocused : null]}>
                            <FontAwesome
                                name={focused ? 'book' : 'book'}
                                size={focused ? size + 1 : size}
                                color={color}
                            />
                        </View>
                    ),
                }}
            />
        </Tabs>
    );
}

const styles = StyleSheet.create({
    iconWrap: {
        transform: [{ translateY: 0 }, { scale: 1 }],
    },
    iconWrapFocused: {
        transform: [{ translateY: -1 }, { scale: 1.06 }],
    },
});

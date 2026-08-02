import { Tabs } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Platform, StyleSheet, View } from 'react-native';
import { colors, radius } from '../../src/theme/tokens';

export default function TabsLayout() {
    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarActiveTintColor: colors.primaryLight,
                tabBarInactiveTintColor: colors.textMuted,
                tabBarActiveBackgroundColor: colors.primarySurface,
                tabBarInactiveBackgroundColor: colors.surface,
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
                    backgroundColor: colors.surface,
                    borderTopColor: colors.border,
                    borderTopWidth: 1,
                    height: Platform.OS === 'ios' ? 78 : 68,
                    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
                    paddingTop: 8,
                    ...Platform.select({
                        ios: {
                            shadowColor: colors.textPrimary,
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
            <Tabs.Screen
                name="index"
                options={{
                    title: 'Ekle',
                    tabBarIcon: ({ color, size, focused }) => (
                        <View style={[styles.iconWrap, focused ? styles.iconWrapFocused : null]}>
                            <FontAwesome
                                name="plus-circle"
                                size={focused ? size + 1 : size}
                                color={color}
                            />
                        </View>
                    ),
                }}
            />
            <Tabs.Screen
                name="sources"
                options={{
                    title: 'Kaynak',
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
            <Tabs.Screen
                name="quiz"
                options={{
                    title: 'Test',
                    tabBarIcon: ({ color, size, focused }) => (
                        <View style={[styles.iconWrap, focused ? styles.iconWrapFocused : null]}>
                            <FontAwesome
                                name={focused ? 'check-square' : 'check-square-o'}
                                size={focused ? size + 1 : size}
                                color={color}
                            />
                        </View>
                    ),
                }}
            />
            <Tabs.Screen
                name="dashboard"
                options={{
                    title: 'Panel',
                    tabBarIcon: ({ color, size, focused }) => (
                        <View style={[styles.iconWrap, focused ? styles.iconWrapFocused : null]}>
                            <FontAwesome
                                name={focused ? 'line-chart' : 'bar-chart'}
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

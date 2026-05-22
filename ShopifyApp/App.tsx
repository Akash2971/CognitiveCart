import React, { useEffect } from 'react';
import { Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import ShoppingListScreen from './src/screens/ShoppingListScreen';
import LiveCaptureScreen from './src/screens/LiveCaptureScreen';
import ChatScreen from './src/screens/ChatScreen';
import { BACKEND_URL } from './src/config';

export type RootTabParamList = {
  List: undefined;
  Capture: undefined;
  Chat: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

export default function App() {
  useEffect(() => {
    fetch(`${BACKEND_URL}/scanned_products`, { method: 'DELETE' }).catch(() => {});
    fetch(`${BACKEND_URL}/agent_state`, { method: 'DELETE' }).catch(() => {});
  }, []);

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#0f0f0f',
            borderTopColor: '#222',
            height: 60,
            paddingBottom: 8,
          },
          tabBarActiveTintColor: '#fff',
          tabBarInactiveTintColor: '#555',
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        }}
      >
        <Tab.Screen
          name="Chat"
          component={ChatScreen}
          options={{ tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>💬</Text> }}
        />
        <Tab.Screen
          name="List"
          component={ShoppingListScreen}
          options={{ tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>☰</Text> }}
        />
        <Tab.Screen
          name="Capture"
          component={LiveCaptureScreen}
          options={{ tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>◉</Text> }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

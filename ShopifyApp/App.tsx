import React, { useEffect } from 'react';
import { Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import ShoppingListScreen from './src/screens/ShoppingListScreen';
import ChatScreen from './src/screens/ChatScreen';
import TripScreen from './src/screens/TripScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import { useShoppingStore } from './src/store/shoppingStore';
import Wearables from './WearablesModule';
import { BACKEND_URL } from './src/config';

export type RootTabParamList = {
  Chat: undefined;
  List: undefined;
  Trip: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

export default function App() {
  const { setUserProfile } = useShoppingStore();

  useEffect(() => {
    fetch(`${BACKEND_URL}/scanned_products`, { method: 'DELETE' }).catch(() => {});
    Wearables.checkCameraPermission()
      .then(status => { if (status !== 'granted') return Wearables.requestCameraPermission(); })
      .catch(() => {});
    fetch(`${BACKEND_URL}/user_profile`)
      .then(r => r.json())
      .then(data => setUserProfile({
        goals: data.goals ?? [],
        restrictions: data.restrictions ?? [],
        priorities: data.priorities ?? [],
      }))
      .catch(() => {});
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
          name="Trip"
          component={TripScreen}
          options={{ tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>🛒</Text> }}
        />
        <Tab.Screen
          name="Profile"
          component={ProfileScreen}
          options={{ tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>👤</Text> }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

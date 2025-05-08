import React from 'react';
import './global.css';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Import your screens
import Login from './screens/Login.jsx';
import Onboarding from './screens/Onboarding.jsx';
import Register from './screens/Register.jsx';
import Home from './screens/Home.jsx';
import AddMedicine from './screens/AddMedicine.jsx';
import Schedule from './screens/Schedule.jsx';
import Emergency from './screens/Emergency.jsx';
import Chat from './screens/Chat.jsx';
import Profile from './screens/Profile.jsx';

// Create the navigators
const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Bottom Tab Navigator
function TabNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="HomeTab"
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'HomeTab') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Chat') {
            iconName = focused ? 'chatbubble' : 'chatbubble-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          } else if (route.name === 'Emergency') {
            iconName = focused ? 'alert-circle' : 'alert-circle-outline';
          }

          return <Ionicons name={iconName} size={size + 2} color={color} />;
        },
        tabBarActiveTintColor: '#FF6B00', // Orange color
        tabBarInactiveTintColor: '#666666',
        tabBarStyle: {
          backgroundColor: '#FFFFFF', // White background
          height: 60, // Make tabs taller
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
        },
      })}
    >
      <Tab.Screen 
        name="Profile" 
        component={Profile}
        options={{ headerShown: false }}
      />
      <Tab.Screen 
        name="HomeTab" 
        component={Home} 
        options={{ headerShown: false, title: 'Home' }}
      />
      <Tab.Screen 
        name="Chat" 
        component={Chat} 
        options={{ headerShown: false }}
      />
      <Tab.Screen 
        name="Emergency" 
        component={Emergency}
        options={{ headerShown: false }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator initialRouteName="Login">
          <Stack.Screen 
            name="Login" 
            component={Login} 
            options={{ headerShown: false }}
          />
          <Stack.Screen 
            name="Register" 
            component={Register} 
            options={{ headerShown: false }}
          />
          <Stack.Screen 
            name="Onboarding" 
            component={Onboarding} 
            options={{ headerShown: false }}
          />
          <Stack.Screen 
            name="Home" 
            component={TabNavigator} 
            options={{ headerShown: false }}
          />
          <Stack.Screen 
            name="AddMedicine" 
            component={AddMedicine} 
            options={{ headerShown: false }}
          />
          <Stack.Screen 
            name="Schedule" 
            component={Schedule} 
            options={{ headerShown: false }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
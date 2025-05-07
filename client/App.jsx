import React from 'react';
import './global.css';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View } from 'react-native';

// Import your screens
import Login from './screens/Login.jsx';
import Onboarding from './screens/Onboarding.jsx';
import Register from './screens/Register.jsx';
import Home from './screens/Home.jsx';
import AddMedicine from './screens/AddMedicine.jsx';
import Schedule from './screens/Schedule.jsx';

// Create the navigator
const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator initialRouteName="Register">
          <Stack.Screen 
            name="Register" 
            component={Register} 
            options={{ headerShown: false }}
          />
          <Stack.Screen 
            name="Login" 
            component={Login} 
            options={{ headerShown: false }}
          />
          <Stack.Screen 
            name="Onboarding" 
            component={Onboarding} 
            options={{ headerShown: false }}
          />
          <Stack.Screen 
            name="Home" 
            component={Home} 
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
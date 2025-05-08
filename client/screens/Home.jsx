import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  SafeAreaView,
  ActivityIndicator,
  Modal,
  Animated,
  Dimensions,
  Vibration,
  Image,
  StatusBar,
  Platform,
  TouchableWithoutFeedback,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons, FontAwesome, Ionicons, MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import axios from 'axios';
import { SERVER_URL } from '@env';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import MedicationsModal from '../components/MedicationsModal';

// Import these conditionally in case they're not installed
let LinearGradient;
let BlurView;
let Svg;
let Circle;

try {
  LinearGradient = require('expo-linear-gradient').LinearGradient;
} catch (error) {
  // Create a fallback component if LinearGradient is not available
  LinearGradient = ({ children, style }) => (
    <View style={[style, { backgroundColor: '#5e72e4' }]}>{children}</View>
  );
}

try {
  BlurView = require('expo-blur').BlurView;
} catch (error) {
  // Create a fallback component if BlurView is not available
  BlurView = ({ children, style, intensity }) => (
    <View style={[style, { backgroundColor: 'rgba(0, 0, 0, 0.6)' }]}>{children}</View>
  );
}

try {
  const SvgComponents = require('react-native-svg');
  Svg = SvgComponents.Svg;
  Circle = SvgComponents.Circle;
} catch (error) {
  // Create fallback components if SVG is not available
  Svg = ({ children, width, height }) => (
    <View style={{ width, height, position: 'relative' }}>{children}</View>
  );
  Circle = (props) => {
    // For the progress circle, create a simple view with different styling
    const isProgressCircle = props.strokeDasharray !== undefined;
    
    if (isProgressCircle) {
      return (
        <View style={{ 
          position: 'absolute',
          width: props.r * 2, 
          height: props.r * 2,
          borderRadius: props.r,
          borderWidth: props.strokeWidth,
          borderColor: props.stroke,
          opacity: 0.8,
          top: 50 - props.r,
          left: 50 - props.r
        }} />
      );
    }
    
    return (
      <View style={{ 
        position: 'absolute',
        width: props.r * 2, 
        height: props.r * 2, 
        borderRadius: props.r,
        borderWidth: props.strokeWidth,
        borderColor: props.stroke,
        top: 50 - props.r,
        left: 50 - props.r
      }} />
    );
  };
}

const { width, height } = Dimensions.get('window');

const Home = () => {
  const navigation = useNavigation();
  const [todayMedicines, setTodayMedicines] = useState([]);
  const [progress, setProgress] = useState({ total: 0, completed: 0, progress: 0 });
  const [schedule, setSchedule] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // New states for analytics data
  const [analyticsData, setAnalyticsData] = useState({
    weeklyAvg: 0,
    bestDay: '0%',
    perfectDays: '0/7',
    dailyProgress: [0, 0, 0, 0, 0, 0, 0] // Sunday to Saturday
  });
  
  // Reminder state management
  const [reminderVisible, setReminderVisible] = useState(false);
  const [upcomingReminderVisible, setUpcomingReminderVisible] = useState(false);
  const [currentReminder, setCurrentReminder] = useState(null);
  const [upcomingReminder, setUpcomingReminder] = useState(null);
  const [activeReminders, setActiveReminders] = useState([]);
  const [dismissedReminders, setDismissedReminders] = useState([]); // Track dismissed reminders
  const reminderOpacity = useRef(new Animated.Value(0)).current;
  const upcomingReminderOpacity = useRef(new Animated.Value(0)).current;
  const sound = useRef(null);

  // Animation values
  const headerHeight = useRef(new Animated.Value(0)).current;
  const progressOpacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.95)).current;
  
  // All medications modal
  const [allMedicinesVisible, setAllMedicinesVisible] = useState(false);
  
  // Fetch data from the server
  const fetchData = async () => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      
      if (!token) {
        navigation.navigate('Login');
        return { medicines: [] };
      }

      // Use Promise.allSettled to handle partial failures
      const responses = await Promise.allSettled([
        axios.get(`${SERVER_URL}/api/user/medicines/today`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${SERVER_URL}/api/user/medicines/progress`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${SERVER_URL}/api/user/medicines/schedule`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${SERVER_URL}/api/user/medicines`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      // Process today's medicines
      let todayMeds = [];
      if (responses[0].status === 'fulfilled') {
        todayMeds = responses[0].value.data.medicines || [];
      }

      // Sort medications by time
      todayMeds.sort((a, b) => {
        const timeA = a.time.split(':').map(Number);
        const timeB = b.time.split(':').map(Number);
        
        if (timeA[0] !== timeB[0]) {
          return timeA[0] - timeB[0]; // Sort by hour
        }
        return timeA[1] - timeB[1]; // Sort by minute
      });

      // Process progress data
      let progressData = { total: 0, completed: 0, progress: 0 };
      if (responses[1].status === 'fulfilled') {
        progressData = responses[1].value.data;
      } else {
        // Calculate progress from medications if API failed
        const total = todayMeds.length;
        const completed = todayMeds.filter(med => med.last_status).length;
        progressData = {
          total,
          completed,
          progress: total > 0 ? (completed / total) * 100 : 0
        };
      }

      // Process schedule data
      let scheduleData = {};
      if (responses[2].status === 'fulfilled') {
        scheduleData = responses[2].value.data.schedule || {};
      }
      
      // Process all medicines data and calculate analytics
      let medicinesWithHistory = [];
      if (responses[3].status === 'fulfilled') {
        medicinesWithHistory = responses[3].value.data.medicines || [];
      }
      
      // Calculate analytics from the medicine history
      const analyticsResults = calculateAnalytics(medicinesWithHistory);
      setAnalyticsData(analyticsResults);

      const firstMedicationTime = todayMeds.length > 0 ? todayMeds[0].time : null;

      setTodayMedicines(todayMeds);
      setProgress(progressData);
      setSchedule(scheduleData);
      setLoading(false);
      setRefreshing(false);
      
      return { 
        medicines: todayMeds,
        firstMedicationTime 
      };
    } catch (error) {
      console.error('Error fetching data:', error);
      setLoading(false);
      setRefreshing(false);
      
      // Check for authentication errors
      if (error.response && error.response.status === 401) {
        Alert.alert('Session Expired', 'Please login again');
        navigation.navigate('Login');
      }
      
      return { medicines: [] };
    }
  };

  // Refresh data on pull down
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, []);

  // Update medicine status (taken or not taken)
  const updateMedicineStatus = async (medicineId, completed) => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      
      // Store original medicines state for rollback if needed
      const originalMedicines = [...todayMedicines];
      
      // Update local state optimistically
      if (completed) {
        setTodayMedicines(prev => prev.filter(med => med._id !== medicineId));
        
        // Update progress optimistically
        const newCompleted = progress.completed + 1;
        setProgress(prev => ({
          ...prev,
          completed: newCompleted,
          progress: prev.total > 0 ? (newCompleted / prev.total) * 100 : 0
        }));
      }

      // Send the update to the server
      const response = await axios.post(
        `${SERVER_URL}/api/user/medicines/${medicineId}/status`,
        { completed },
        { 
          headers: { Authorization: `Bearer ${token}` },
          timeout: 15000 // 15-second timeout
        }
      );
      
      console.log('Medicine status updated successfully:', response.data);
      
      // Refresh data after a short delay
      setTimeout(() => {
        fetchData();
      }, 1000);
      
    } catch (error) {
      console.error('Error updating medicine status:', error);
      
      // Show detailed error information in console for debugging
      if (error.response) {
        console.error('Server response error:', error.response.status, error.response.data);
      } else if (error.request) {
        console.error('No response received:', error.request);
      } else {
        console.error('Request setup error:', error.message);
      }
      
      // Refresh data to ensure UI consistency regardless of error
      fetchData();
      
      // Show user-friendly error message
      Alert.alert(
        'Update Failed', 
        'Could not update medication status. Please check your connection and try again.'
      );
    }
  };

  // Format time to AM/PM format
  const formatTime = (timeString) => {
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const formattedHour = hour % 12 || 12;
    return `${formattedHour}:${minutes} ${ampm}`;
  };

  // Sound related functions
  const playAlertSound = async () => {
    try {
      if (sound.current) {
        await sound.current.unloadAsync();
        sound.current = null;
      }

      // Start vibration immediately as a backup
      Vibration.vibrate([500, 1000, 500, 1000], true);
      
      // Create a local Audio Sound object
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: 'https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg' },
        { shouldPlay: true, isLooping: true }
      );
      
      sound.current = newSound;
    } catch (error) {
      console.error('Error playing alert sound:', error);
      // Fallback to vibration already started
    }
  };

  const playUpcomingSound = async () => {
    try {
      if (sound.current) {
        await sound.current.unloadAsync();
        sound.current = null;
      }
      
      // Create a local Audio Sound object
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg' },
        { shouldPlay: true }
      );
      
      sound.current = newSound;
    } catch (error) {
      console.error('Error playing upcoming sound:', error);
      // Fallback to vibration
      Vibration.vibrate(500);
    }
  };

  const stopAlertSound = async () => {
    try {
      // Stop vibration first (important for the haptic feedback issue)
      Vibration.cancel();
      
      if (sound.current) {
        await sound.current.stopAsync();
        await sound.current.unloadAsync();
        sound.current = null;
      }
    } catch (error) {
      console.error('Error stopping alert sound:', error);
      // Make sure vibration is stopped even if there's an error
      Vibration.cancel();
    }
  };

  // Cleanup sound when component unmounts
  useEffect(() => {
    return () => {
      if (sound.current) {
        sound.current.unloadAsync();
      }
      // Make sure vibration is stopped on unmount
      Vibration.cancel();
    };
  }, []);

  // Check if medicine is due now (within 1 minute)
  const isDueNow = (timeString) => {
    const [hours, minutes] = timeString.split(':');
    const now = new Date();
    const medicineTime = new Date();
    medicineTime.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
    
    // Get current time in minutes since midnight
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    // Get medicine time in minutes since midnight
    const medicineMinutes = parseInt(hours) * 60 + parseInt(minutes);
    
    // Check if within 1 minute
    const diffInMinutes = Math.abs(medicineMinutes - currentMinutes);
    return diffInMinutes <= 1;
  };

  // Check if medicine is upcoming
  const isUpcoming = (timeString) => {
    const [hours, minutes] = timeString.split(':');
    const now = new Date();
    const medicineTime = new Date();
    medicineTime.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
    
    // Get current time in minutes since midnight
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    // Get medicine time in minutes since midnight
    const medicineMinutes = parseInt(hours) * 60 + parseInt(minutes);
    
    // Calculate difference in minutes
    const diffInMinutes = medicineMinutes - currentMinutes;
    
    // Return true if medicine is between 1 and 15 minutes away and in the future
    return diffInMinutes > 1 && diffInMinutes <= 15;
  };

  // Navigate to add medicine screen
  const goToAddMedicine = () => {
    navigation.navigate('AddMedicine');
  };

  // Navigate to full schedule/calendar view
  const goToSchedule = () => {
    // Pass the first medicine time to schedule for proper week start
    const firstMedicineTime = todayMedicines.length > 0 ? todayMedicines[0].time : null;
    navigation.navigate('Schedule', { schedule, firstMedicineTime });
  };
  
  // Navigate to all medications screen instead of showing a modal
  const goToAllMedications = () => {
    console.log("Navigating to All Medications screen");
    // Use getRootState().navigate to access screens outside the tab navigator
    navigation.getParent().navigate('AllMedications', { 
      medications: sortMedicationsByTime(todayMedicines)
    });
  };

  // Show reminder for specific medicine
  const showReminderForMedicine = (medicine) => {
    // Check if this medicine is already dismissed
    if (dismissedReminders.includes(medicine._id)) {
      return;
    }
    
    // Set current reminder
    setCurrentReminder(medicine);
    
    // Add to active reminders
    setActiveReminders(prev => [...prev, medicine._id]);
    
    // Provide haptic feedback
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } catch (error) {
      console.error('Error with haptic feedback:', error);
    }
    
    // Show modal
    setReminderVisible(true);
    
    // Animate in
    Animated.timing(reminderOpacity, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
    
    // Play alert sound
    playAlertSound();
  };

  // Handle upcoming reminder dismissal
  const dismissUpcomingReminder = () => {
    if (!upcomingReminder) return;

    // Store reminder for later use
    const reminderToDismiss = {...upcomingReminder};

    // Add to dismissed reminders with type
    setDismissedReminders(prev => [...prev, `${reminderToDismiss._id}_upcoming`]);
    
    // Cancel vibration first - do this before any async operations
    Vibration.cancel();
    
    // Hide modal immediately to improve responsiveness
    setUpcomingReminderVisible(false);
    
    // Provide haptic feedback
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      console.error('Error with haptic feedback:', error);
    }
    
    // Stop sound
    stopAlertSound();
    
    // Animate out
    Animated.timing(upcomingReminderOpacity, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setActiveReminders(prev => prev.filter(id => id !== reminderToDismiss._id));
      setUpcomingReminder(null);
    });
  };

  // Show upcoming reminder for medicine
  const showUpcomingReminderForMedicine = (medicine) => {
    console.log('Showing upcoming reminder for:', medicine.name);
    
    // Double check if we should show this reminder
    if (dismissedReminders.includes(medicine._id) || 
        activeReminders.includes(medicine._id) || 
        medicine.last_status) {
      return;
    }

    // Set upcoming reminder
    setUpcomingReminder(medicine);
    setUpcomingReminderVisible(true);
    setActiveReminders(prev => [...prev, medicine._id]);

    // Provide haptic feedback
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch (error) {
      console.error('Error with haptic feedback:', error);
    }

    // Play sound and animate
    playUpcomingSound();
    
    Animated.timing(upcomingReminderOpacity, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  };

  // Handle medicine reminder response
  const handleReminderResponse = async (taken) => {
    if (currentReminder) {
      // Add to dismissed reminders list with type to prevent it from showing again
      setDismissedReminders(prev => [...prev, `${currentReminder._id}_due`]);
      
      // First stop vibration immediately - do this before any async operations
      Vibration.cancel();
      
      // Store reminder info for later use
      const reminderToUpdate = {...currentReminder};
      
      // Hide modal and stop sounds immediately to improve responsiveness
      setReminderVisible(false);
      
      // Use haptic feedback as confirmation
      try {
        if (taken) {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      } catch (error) {
        console.error('Error with haptic feedback:', error);
      }
      
      // Stop sound
      await stopAlertSound();
      
      // Animate out
      Animated.timing(reminderOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(async () => {
        // Update medicine status if taken
        if (taken) {
          await updateMedicineStatus(reminderToUpdate._id, true);
        }
        
        // Remove from active reminders
        setActiveReminders(prev => prev.filter(id => id !== reminderToUpdate._id));
        
        // Clear current reminder
        setCurrentReminder(null);
      });
    }
  };

  // Check medicines and show reminders
  const checkMedicines = useCallback(() => {
    if (reminderVisible || upcomingReminderVisible) {
      console.log('Reminder already visible, skipping check');
      return;
    }

    const now = new Date();
    console.log('Checking medicines...');
    console.log('Current time:', now.toLocaleTimeString());

    // Get today's date in YYYY-MM-DD format
    const today = now.toISOString().split('T')[0];

    todayMedicines.forEach((medicine) => {
      // Skip if medicine was already taken today or reminder was dismissed
      const takenToday = medicine.history?.some(
        (record) => record.date === today && record.completed
      );

      if (takenToday || 
          medicine.last_status || 
          dismissedReminders.includes(medicine._id)) {
        return;
      }

      console.log(`Checking medicine: ${medicine.name} scheduled for: ${medicine.time}`);

      // Check if it's time to show a reminder
      if (isDueNow(medicine.time) && !dismissedReminders.includes(`${medicine._id}_due`)) {
        console.log(`Medicine is due now: ${medicine.name}`);
        showReminderForMedicine(medicine);
      } else if (isUpcoming(medicine.time) && !dismissedReminders.includes(`${medicine._id}_upcoming`)) {
        console.log(`Medicine is upcoming: ${medicine.name}`);
        showUpcomingReminderForMedicine(medicine);
      }
    });
  }, [todayMedicines, reminderVisible, upcomingReminderVisible, dismissedReminders]);

  // Setup polling intervals
  useEffect(() => {
    // Check every 5 seconds instead of 30
    const checkInterval = setInterval(() => {
      checkMedicines();
    }, 5000);

    // Initial check
    checkMedicines();

    return () => {
      clearInterval(checkInterval);
      stopAlertSound();
    };
  }, [checkMedicines]);

  // Check whenever medicines list changes
  useEffect(() => {
    if (todayMedicines.length > 0) {
      console.log('Medicines list changed, checking medicines...'); // Debug log
      checkMedicines();
    }
  }, [todayMedicines]);

  // Reset at midnight
  useEffect(() => {
    const midnightReset = setInterval(() => {
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() === 0) {
        setDismissedReminders([]); // Clear all dismissed reminders at midnight
        setActiveReminders([]);
        fetchData();
      }
    }, 60000); // Check every minute

    return () => clearInterval(midnightReset);
  }, []);

  // Refresh data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchData();
      
      // Check for incoming navigation params
      if (navigation.isFocused()) {
        const params = navigation.getState().routes.find(r => r.name === 'Home')?.params;
        if (params) {
          // Handle medicine to take
          if (params.medicineToTake) {
            const medicineId = params.medicineToTake;
            const medicineToTake = todayMedicines.find(med => med._id === medicineId);
            if (medicineToTake && !medicineToTake.last_status) {
              // Small delay to ensure everything is rendered
              setTimeout(() => {
                updateMedicineStatus(medicineId, true);
              }, 300);
            }
            // Clear the parameter
            navigation.setParams({ medicineToTake: undefined });
          }
          
          // Handle medicine to show reminder for
          if (params.medicineToRemind) {
            const medicineId = params.medicineToRemind;
            const medicineToRemind = todayMedicines.find(med => med._id === medicineId);
            if (medicineToRemind && !medicineToRemind.last_status) {
              // Small delay to ensure everything is rendered
              setTimeout(() => {
                showReminderForMedicine(medicineToRemind);
              }, 300);
            }
            // Clear the parameter
            navigation.setParams({ medicineToRemind: undefined });
          }
        }
      }
      
      return () => {};
    }, [navigation, todayMedicines])
  );

  // Configure audio session
  useEffect(() => {
    const setupAudio = async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
          allowsRecordingIOS: false,
        });
        
        // Preload sounds for better response time
        console.log('Preloading sounds...');
        try {
          await Audio.Sound.createAsync(
            { uri: 'https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg' },
            { shouldPlay: false }
          );
          await Audio.Sound.createAsync(
            { uri: 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg' },
            { shouldPlay: false }
          );
        } catch (preloadError) {
          console.log('Error preloading sounds:', preloadError);
        }
      } catch (error) {
        console.log('Error setting audio mode:', error);
      }
    };
    
    setupAudio();
  }, []);

  // Let's add some entrance animations
  useEffect(() => {
    if (!loading) {
      // Animate header
      Animated.timing(headerHeight, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }).start();

      // Animate progress section
      Animated.timing(progressOpacity, {
        toValue: 1,
        duration: 1000,
        delay: 300,
        useNativeDriver: true,
      }).start();

      // Animate cards
      Animated.spring(cardScale, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }).start();
    }
  }, [loading]);

  // Calculate analytics based on medication history
  const calculateAnalytics = useCallback((medicines) => {
    try {
      if (!medicines || medicines.length === 0) {
        return {
          weeklyAvg: 0,
          bestDay: '0%',
          perfectDays: '0/7', 
          dailyProgress: [0, 0, 0, 0, 0, 0, 0]
        };
      }
      
      // Get dates for the past week
      const today = new Date();
      const dates = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        dates.push(date.toISOString().split('T')[0]); // Format as YYYY-MM-DD
      }
      
      // Initialize counts for each day
      const dailyCounts = dates.map(date => {
        return {
          date,
          total: 0,
          completed: 0,
        };
      });
      
      // Count medications for each day in the past week
      medicines.forEach(medicine => {
        if (!medicine.history) return;
        
        medicine.history.forEach(record => {
          const recordIndex = dailyCounts.findIndex(day => day.date === record.date);
          if (recordIndex !== -1) {
            dailyCounts[recordIndex].total++;
            if (record.completed) {
              dailyCounts[recordIndex].completed++;
            }
          }
        });
      });
      
      // Calculate progress percentages
      const dailyProgress = dailyCounts.map(day => {
        if (day.total === 0) return 0;
        return Math.round((day.completed / day.total) * 100);
      });
      
      // Calculate weekly average
      const completedSum = dailyCounts.reduce((sum, day) => sum + day.completed, 0);
      const totalSum = dailyCounts.reduce((sum, day) => sum + day.total, 0);
      const weeklyAvg = totalSum > 0 ? Math.round((completedSum / totalSum) * 100) : 0;
      
      // Find best day
      const bestDayPercentage = Math.max(...dailyProgress);
      const bestDay = bestDayPercentage > 0 ? `${bestDayPercentage}%` : 'N/A';
      
      // Count perfect days (100% completion)
      const perfectDaysCount = dailyProgress.filter(percentage => percentage === 100).length;
      const perfectDays = `${perfectDaysCount}/7`;
      
      return {
        weeklyAvg,
        bestDay,
        perfectDays,
        dailyProgress
      };
    } catch (error) {
      console.error("Error calculating analytics:", error);
      return {
        weeklyAvg: 0,
        bestDay: 'N/A',
        perfectDays: '0/7',
        dailyProgress: [0, 0, 0, 0, 0, 0, 0]
      };
    }
  }, []);

  // Sort medications helper function - sorts by time in descending order (later times first)
  const sortMedicationsByTime = (medications) => {
    return [...medications].sort((a, b) => {
      const timeA = a.time.split(':').map(Number);
      const timeB = b.time.split(':').map(Number);
      
      // Convert to minutes for easier comparison (24-hour format)
      const minutesA = timeA[0] * 60 + timeA[1];
      const minutesB = timeB[0] * 60 + timeB[1];
      
      // Sort in descending order (later times first)
      return minutesB - minutesA;
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />
        <Image 
          source={require('../assets/icon.png')} 
          style={styles.loadingImage}
          resizeMode="contain"
        />
        <ActivityIndicator size="large" color="#5e72e4" />
        <Text style={styles.loadingText}>Preparing your health dashboard...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />
      
      {/* Animated Header Section */}
      <Animated.View 
        style={[
          styles.headerContainer,
          {
            transform: [{
              translateY: headerHeight.interpolate({
                inputRange: [0, 1],
                outputRange: [-50, 0],
              })
            }],
            opacity: headerHeight
          }
        ]}
      >
        <LinearGradient
          colors={['#ff7e5f', '#feb47b']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.headerGradient}
        >
          <View style={styles.headerContent}>
            <View style={styles.headerLeft}>
              <MaterialCommunityIcons name="pill" size={30} color="#fff" />
              <Text style={styles.headerTitle}>MediTracker</Text>
            </View>
            
            <View style={styles.headerRight}>
              <TouchableOpacity 
                style={styles.iconButton}
                onPress={goToSchedule}
              >
                <Feather name="calendar" size={22} color="#fff" />
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.iconButton, styles.addIconButton]}
                onPress={goToAddMedicine}
              >
                <Ionicons name="add" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </LinearGradient>
      </Animated.View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh} 
            colors={['#ff7e5f']} 
            tintColor="#ff7e5f"
            progressBackgroundColor="#ffffff"
          />
        }
      >
        {/* Today's Progress Card */}
        <Animated.View 
          style={[
            styles.progressCard,
            {
              opacity: progressOpacity,
              transform: [{ scale: cardScale }]
            }
          ]}
        >
          <LinearGradient
            colors={['#ff7e5f', '#feb47b']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.progressCardInner}
          >
            <View style={styles.progressTitleRow}>
              <Text style={styles.progressTitle}>Today's Progress</Text>
              <View style={styles.dateBadge}>
                <Text style={styles.dateText}>{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>
              </View>
            </View>
            
            <View style={styles.progressVisualContainer}>
              <View style={styles.progressCircleContainer}>
                <Svg width={100} height={100} viewBox="0 0 100 100">
                  {/* Background Circle */}
                  <Circle
                    cx="50"
                    cy="50"
                    r="45"
                    stroke="rgba(255, 255, 255, 0.3)"
                    strokeWidth="10"
                    fill="transparent"
                  />
                  
                  {/* Progress Circle */}
                  <Circle
                    cx="50"
                    cy="50"
                    r="45"
                    stroke="white"
                    strokeWidth="10"
                    fill="transparent"
                    strokeDasharray={2 * Math.PI * 45}
                    strokeDashoffset={2 * Math.PI * 45 * (1 - (progress.progress || 0) / 100)}
                    strokeLinecap="round"
                    transform="rotate(-90, 50, 50)"
                  />
                </Svg>
                <View style={styles.progressTextContainer}>
                  <Text style={styles.progressPercentage}>{Math.round(progress.progress || 0)}%</Text>
                </View>
              </View>
              
              <View style={styles.progressDetails}>
                <View style={styles.progressItem}>
                  <MaterialCommunityIcons name="pill" size={20} color="#ffffff" />
                  <Text style={styles.progressItemText}>Total: {progress.total}</Text>
                </View>
                <View style={styles.progressItem}>
                  <MaterialCommunityIcons name="check-circle" size={20} color="#ffffff" />
                  <Text style={styles.progressItemText}>Taken: {progress.completed}</Text>
                </View>
                <View style={styles.progressItem}>
                  <MaterialCommunityIcons name="clock-outline" size={20} color="#ffffff" />
                  <Text style={styles.progressItemText}>Pending: {progress.total - progress.completed}</Text>
                </View>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Analytics Section */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Analytics</Text>
          <View style={styles.analyticsCard}>
            <View style={styles.analyticsHeader}>
              <Text style={styles.analyticsTitle}>Medication Trends</Text>
              <View style={styles.tabsContainer}>
                <TouchableOpacity style={[styles.tab, styles.activeTab]}>
                  <Text style={[styles.tabText, styles.activeTabText]}>Week</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.tab}>
                  <Text style={styles.tabText}>Month</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.graphContainer}>
              <View style={styles.barGraph}>
                {/* Sunday */}
                <View style={styles.barContainer}>
                  <View style={styles.barLabels}>
                    <Text style={styles.barValue}>{analyticsData.dailyProgress[0]}%</Text>
                    <View style={[
                      styles.barColumn, 
                      { height: Math.min(Math.max(analyticsData.dailyProgress[0], 5), 100) }
                    ]}>
                      <LinearGradient
                        colors={['#ff7e5f', '#feb47b']}
                        style={styles.bar}
                      />
                    </View>
                    <Text style={styles.barDay}>S</Text>
                  </View>
                </View>

                {/* Monday */}
                <View style={styles.barContainer}>
                  <View style={styles.barLabels}>
                    <Text style={styles.barValue}>{analyticsData.dailyProgress[1]}%</Text>
                    <View style={[
                      styles.barColumn, 
                      { height: Math.min(Math.max(analyticsData.dailyProgress[1], 5), 100) }
                    ]}>
                      <LinearGradient
                        colors={['#ff7e5f', '#feb47b']}
                        style={styles.bar}
                      />
                    </View>
                    <Text style={styles.barDay}>M</Text>
                  </View>
                </View>

                {/* Tuesday */}
                <View style={styles.barContainer}>
                  <View style={styles.barLabels}>
                    <Text style={styles.barValue}>{analyticsData.dailyProgress[2]}%</Text>
                    <View style={[
                      styles.barColumn, 
                      { height: Math.min(Math.max(analyticsData.dailyProgress[2], 5), 100) }
                    ]}>
                      <LinearGradient
                        colors={['#ff7e5f', '#feb47b']}
                        style={styles.bar}
                      />
                    </View>
                    <Text style={styles.barDay}>T</Text>
                  </View>
                </View>

                {/* Wednesday */}
                <View style={styles.barContainer}>
                  <View style={styles.barLabels}>
                    <Text style={styles.barValue}>{analyticsData.dailyProgress[3]}%</Text>
                    <View style={[
                      styles.barColumn, 
                      { height: Math.min(Math.max(analyticsData.dailyProgress[3], 5), 100) }
                    ]}>
                      <LinearGradient
                        colors={['#ff7e5f', '#feb47b']}
                        style={styles.bar}
                      />
                    </View>
                    <Text style={styles.barDay}>W</Text>
                  </View>
                </View>

                {/* Thursday */}
                <View style={styles.barContainer}>
                  <View style={styles.barLabels}>
                    <Text style={styles.barValue}>{analyticsData.dailyProgress[4]}%</Text>
                    <View style={[
                      styles.barColumn, 
                      { height: Math.min(Math.max(analyticsData.dailyProgress[4], 5), 100) }
                    ]}>
                      <LinearGradient
                        colors={['#ff7e5f', '#feb47b']}
                        style={styles.bar}
                      />
                    </View>
                    <Text style={styles.barDay}>T</Text>
                  </View>
                </View>

                {/* Friday */}
                <View style={styles.barContainer}>
                  <View style={styles.barLabels}>
                    <Text style={styles.barValue}>{analyticsData.dailyProgress[5]}%</Text>
                    <View style={[
                      styles.barColumn, 
                      { height: Math.min(Math.max(analyticsData.dailyProgress[5], 5), 100) }
                    ]}>
                      <LinearGradient
                        colors={['#ff7e5f', '#feb47b']}
                        style={styles.bar}
                      />
                    </View>
                    <Text style={styles.barDay}>F</Text>
                  </View>
                </View>

                {/* Saturday */}
                <View style={styles.barContainer}>
                  <View style={styles.barLabels}>
                    <Text style={styles.barValue}>{analyticsData.dailyProgress[6]}%</Text>
                    <View style={[
                      styles.barColumn, 
                      { height: Math.min(Math.max(analyticsData.dailyProgress[6], 5), 100) }
                    ]}>
                      <LinearGradient
                        colors={['#ff7e5f', '#feb47b']}
                        style={styles.bar}
                      />
                    </View>
                    <Text style={styles.barDay}>S</Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.statsContainer}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{analyticsData.weeklyAvg}%</Text>
                <Text style={styles.statLabel}>Weekly Avg</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{analyticsData.bestDay}</Text>
                <Text style={styles.statLabel}>Best Day</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{analyticsData.perfectDays}</Text>
                <Text style={styles.statLabel}>Perfect Days</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Today's Schedule Section */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Today's Schedule</Text>
          <Text style={styles.sectionSubtitle}>Showing latest 3 medications</Text>
        
          {todayMedicines.length > 0 ? (
            <>
              {/* Sort medicines by time in descending order */}
              {sortMedicationsByTime(todayMedicines)
                .slice(0, 3)
                .map((medicine, index) => (
                  <Animated.View 
                    key={medicine._id} 
                    style={[
                      { 
                        transform: [
                          { scale: cardScale },
                          { 
                            translateY: cardScale.interpolate({
                              inputRange: [0.95, 1],
                              outputRange: [20 * (index + 1), 0]
                            })
                          }
                        ]
                      }
                    ]}
                  >
                    <TouchableOpacity
                      onPress={() => {
                        if (!medicine.last_status) {
                          showReminderForMedicine(medicine);
                        }
                      }}
                      activeOpacity={0.7}
                      style={[
                        styles.medicineCard,
                        isDueNow(medicine.time) && !medicine.last_status && styles.dueMedicineCard,
                        isUpcoming(medicine.time) && !medicine.last_status && styles.upcomingMedicineCard,
                        medicine.last_status && styles.takenMedicineCard,
                      ]}
                    >
                      <View style={styles.medicineCardContent}>
                        <View style={styles.medicineDetails}>
                          <View style={styles.medicineNameContainer}>
                            <Text style={styles.medicineName}>{medicine.name}</Text>
                            {isDueNow(medicine.time) && !medicine.last_status && (
                              <View style={styles.dueNowBadge}>
                                <Text style={styles.dueNowText}>DUE NOW</Text>
                              </View>
                            )}
                            {isUpcoming(medicine.time) && !medicine.last_status && (
                              <View style={styles.upcomingBadge}>
                                <Text style={styles.upcomingText}>UPCOMING</Text>
                              </View>
                            )}
                            {medicine.last_status && (
                              <View style={styles.takenBadge}>
                                <Text style={styles.takenBadgeText}>TAKEN</Text>
                              </View>
                            )}
                          </View>
                          
                          <Text style={styles.medicineDosage}>{medicine.dosage}</Text>
                          
                          <View style={styles.medicineTimeContainer}>
                            <Feather name="clock" size={16} color={medicine.last_status ? "#4cd964" : isDueNow(medicine.time) ? "#ff3b30" : "#4682b4"} />
                            <Text style={[
                              styles.medicineTime,
                              isDueNow(medicine.time) && !medicine.last_status && styles.dueNowTimeText,
                              isUpcoming(medicine.time) && !medicine.last_status && styles.upcomingTimeText,
                              medicine.last_status && styles.takenTimeText,
                            ]}>
                              {formatTime(medicine.time)}
                            </Text>
                          </View>
                        </View>
                        
                        <View style={styles.actionContainer}>
                          {!medicine.last_status ? (
                            <TouchableOpacity 
                              style={styles.takeButton}
                              onPress={() => updateMedicineStatus(medicine._id, true)}
                            >
                              <Text style={styles.takeButtonText}>Take</Text>
                            </TouchableOpacity>
                          ) : (
                            <View style={styles.takenIndicator}>
                              <FontAwesome name="check" size={16} color="#fff" />
                            </View>
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
                ))}
                
                {todayMedicines.length > 3 && (
                  <TouchableOpacity 
                    style={styles.viewMoreButton}
                    onPress={goToAllMedications}
                  >
                    <Text style={styles.viewMoreText}>View All Medications</Text>
                    <Feather name="grid" size={18} color="#ff7e5f" />
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <Animated.View style={{ opacity: progressOpacity }}>
                <View style={styles.noMedicineContainer}>
                  <MaterialCommunityIcons name="pill-off" size={50} color="#ddd" />
                  <Text style={styles.noMedicineText}>No medications scheduled for today</Text>
                  <TouchableOpacity 
                    style={styles.addMedicineButton}
                    onPress={goToAddMedicine}
                  >
                    <Text style={styles.addMedicineButtonText}>Add Medication</Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            )}
        </View>
      </ScrollView>

      {/* Medicine Due Now Reminder Modal */}
      <Modal
        transparent={true}
        visible={reminderVisible}
        animationType="fade"
        onRequestClose={() => handleReminderResponse(false)}
      >
        <BlurView intensity={80} style={styles.blurBackground}>
          <Animated.View 
            style={[
              styles.reminderContainer,
              { opacity: reminderOpacity }
            ]}
          >
            <LinearGradient
              colors={['#ff7e5f', '#feb47b']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.reminderGradient}
            >
              <View style={styles.reminderIconContainer}>
                <MaterialCommunityIcons name="pill" size={60} color="#fff" />
              </View>
              
              <Text style={styles.reminderTitle}>Medication Time</Text>
              
              {currentReminder && (
                <View style={styles.reminderContent}>
                  <View style={styles.reminderInfoCard}>
                    <View style={styles.pillIconRow}>
                      <View style={styles.pillIconContainer}>
                        <MaterialCommunityIcons name="pill" size={24} color="#ff7e5f" />
                      </View>
                      <Text style={styles.reminderMedicineName}>{currentReminder.name}</Text>
                    </View>
                    
                    <View style={styles.reminderInfoRow}>
                      <MaterialCommunityIcons name="medical-bag" size={20} color="#8898aa" />
                      <Text style={styles.reminderInfoText}>{currentReminder.dosage}</Text>
                    </View>
                    
                    <View style={styles.reminderInfoRow}>
                      <Feather name="clock" size={20} color="#8898aa" />
                      <Text style={styles.reminderInfoText}>{formatTime(currentReminder.time)}</Text>
                    </View>
                  </View>
                  
                  <View style={styles.reminderActions}>
                    <TouchableOpacity 
                      style={[styles.reminderButton, styles.reminderButtonSkip]}
                      onPress={() => handleReminderResponse(false)}
                    >
                      <Feather name="x" size={24} color="#fff" />
                      <Text style={styles.reminderButtonText}>Skip</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      style={[styles.reminderButton, styles.reminderButtonTaken]}
                      onPress={() => handleReminderResponse(true)}
                    >
                      <Feather name="check" size={24} color="#fff" />
                      <Text style={styles.reminderButtonText}>Taken</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </LinearGradient>
          </Animated.View>
        </BlurView>
      </Modal>

      {/* Upcoming Medicine Reminder Modal */}
      <Modal
        transparent={true}
        visible={upcomingReminderVisible}
        animationType="fade"
        onRequestClose={dismissUpcomingReminder}
      >
        <BlurView intensity={80} style={styles.blurBackground}>
          <Animated.View 
            style={[
              styles.upcomingReminderContainer,
              { opacity: upcomingReminderOpacity }
            ]}
          >
            <View style={styles.upcomingReminderContent}>
              <View style={styles.upcomingIconContainer}>
                <MaterialCommunityIcons name="clock-time-four-outline" size={40} color="#ff7e5f" />
              </View>
              
              <Text style={styles.upcomingReminderTitle}>Upcoming Medication</Text>
              
              {upcomingReminder && (
                <View style={styles.upcomingReminderInfo}>
                  <Text style={styles.upcomingMedicineName}>{upcomingReminder.name}</Text>
                  <Text style={styles.upcomingDosage}>{upcomingReminder.dosage}</Text>
                  
                  <View style={styles.upcomingTimeContainer}>
                    <Feather name="clock" size={18} color="#ff7e5f" />
                    <Text style={styles.upcomingTime}>
                      Scheduled for {formatTime(upcomingReminder.time)}
                    </Text>
                  </View>
                  
                  <View style={styles.upcomingCountdown}>
                    <Text style={styles.upcomingCountdownText}>
                      Coming up in ~{
                        Math.max(1, Math.round(
                          (new Date(new Date().setHours(
                            parseInt(upcomingReminder.time.split(':')[0]),
                            parseInt(upcomingReminder.time.split(':')[1])
                          )) - new Date()) / (1000 * 60)
                        ))
                      } minutes
                    </Text>
                  </View>
                </View>
              )}
              
              <TouchableOpacity 
                style={styles.dismissButton}
                onPress={dismissUpcomingReminder}
              >
                <Text style={styles.dismissButtonText}>Got it</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </BlurView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7fafc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingImage: {
    width: 100,
    height: 100,
    marginBottom: 20,
  },
  loadingText: {
    marginTop: 20,
    color: '#8898aa',
    fontSize: 16,
    fontWeight: '500',
  },
  headerContainer: {
    width: '100%',
    zIndex: 10,
    elevation: 10,
  },
  headerGradient: {
    borderBottomLeftRadius: 15,
    borderBottomRightRadius: 15,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 10 : 10,
    paddingBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginLeft: 10,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginLeft: 10,
  },
  addIconButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 30,
  },
  progressCard: {
    marginBottom: 24,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  progressCardInner: {
    padding: 20,
  },
  progressTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  progressTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  dateBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  dateText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  progressVisualContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressCircleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  progressTextContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    width: 100,
    height: 100,
  },
  progressPercentage: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  progressDetails: {
    flex: 2,
    marginLeft: 20,
    justifyContent: 'center',
  },
  progressItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressItemText: {
    fontSize: 14,
    color: '#fff',
    marginLeft: 8,
    fontWeight: '500',
  },
  sectionContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#525f7f',
    marginBottom: 16,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#8898aa',
    marginBottom: 12,
  },
  medicineCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  dueMedicineCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#ff3b30',
  },
  upcomingMedicineCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#4682b4',
  },
  takenMedicineCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#4cd964',
  },
  medicineCardContent: {
    flexDirection: 'row',
    padding: 16,
  },
  medicineDetails: {
    flex: 1,
  },
  medicineNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  medicineName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#32325d',
    marginRight: 8,
  },
  dueNowBadge: {
    backgroundColor: 'rgba(255, 59, 48, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  dueNowText: {
    color: '#ff3b30',
    fontSize: 10,
    fontWeight: 'bold',
  },
  upcomingBadge: {
    backgroundColor: 'rgba(70, 130, 180, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  upcomingText: {
    color: '#4682b4',
    fontSize: 10,
    fontWeight: 'bold',
  },
  takenBadge: {
    backgroundColor: 'rgba(76, 217, 100, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  takenBadgeText: {
    color: '#4cd964',
    fontSize: 10,
    fontWeight: 'bold',
  },
  medicineDosage: {
    fontSize: 14,
    color: '#8898aa',
    marginBottom: 8,
  },
  medicineTimeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  medicineTime: {
    fontSize: 14,
    color: '#8898aa',
    marginLeft: 6,
    fontWeight: '500',
  },
  dueNowTimeText: {
    color: '#ff3b30',
  },
  upcomingTimeText: {
    color: '#4682b4',
  },
  takenTimeText: {
    color: '#4cd964',
  },
  actionContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  takeButton: {
    backgroundColor: '#ff7e5f',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 30,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  takeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  takenIndicator: {
    backgroundColor: '#4cd964',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noMedicineContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  noMedicineText: {
    fontSize: 16,
    color: '#8898aa',
    marginVertical: 16,
    textAlign: 'center',
  },
  addMedicineButton: {
    backgroundColor: '#ff7e5f',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 30,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  addMedicineButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  blurBackground: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)', // Fallback for devices without blur support
  },
  reminderContainer: {
    width: width * 0.85,
    borderRadius: 24,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  reminderGradient: {
    padding: 0,
    alignItems: 'center',
  },
  reminderIconContainer: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 30,
    marginBottom: 20,
  },
  reminderTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 30,
  },
  reminderContent: {
    width: '100%',
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  reminderInfoCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 25,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  pillIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  pillIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 126, 95, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  reminderMedicineName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#32325d',
  },
  reminderInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  reminderInfoText: {
    fontSize: 16,
    color: '#525f7f',
    marginLeft: 12,
  },
  reminderActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  reminderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 30,
    elevation: 2,
    width: '47%',
  },
  reminderButtonTaken: {
    backgroundColor: '#ff7e5f',
  },
  reminderButtonSkip: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  reminderButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
    marginLeft: 8,
  },
  upcomingReminderContainer: {
    width: width * 0.85,
    borderRadius: 24,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  upcomingReminderContent: {
    backgroundColor: '#fff',
    padding: 25,
    alignItems: 'center',
  },
  upcomingIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 126, 95, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  upcomingReminderTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#32325d',
    marginBottom: 20,
  },
  upcomingReminderInfo: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 25,
  },
  upcomingMedicineName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ff7e5f',
    marginBottom: 8,
    textAlign: 'center',
  },
  upcomingDosage: {
    fontSize: 16,
    color: '#525f7f',
    marginBottom: 12,
    textAlign: 'center',
  },
  upcomingTimeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  upcomingTime: {
    fontSize: 16,
    color: '#525f7f',
    marginLeft: 8,
  },
  upcomingCountdown: {
    backgroundColor: 'rgba(255, 126, 95, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  upcomingCountdownText: {
    color: '#ff7e5f',
    fontSize: 14,
    fontWeight: '600',
  },
  dismissButton: {
    backgroundColor: '#ff7e5f',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 30,
    elevation: 2,
  },
  dismissButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  viewMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ff7e5f',
    marginTop: 8,
  },
  viewMoreText: {
    color: '#ff7e5f',
    fontWeight: '600',
    marginRight: 8,
  },
  analyticsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  analyticsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  analyticsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#525f7f',
  },
  tabsContainer: {
    flexDirection: 'row',
    borderRadius: 25,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    overflow: 'hidden',
  },
  tab: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#f7f7f7',
  },
  activeTab: {
    backgroundColor: '#ff7e5f',
  },
  tabText: {
    fontSize: 12,
    color: '#8898aa',
    fontWeight: '500',
  },
  activeTabText: {
    color: '#fff',
  },
  graphContainer: {
    marginVertical: 10,
  },
  barGraph: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 150,
    paddingVertical: 20,
  },
  barContainer: {
    flex: 1,
    alignItems: 'center',
  },
  barLabels: {
    alignItems: 'center',
    width: '100%',
  },
  barValue: {
    fontSize: 10,
    color: '#8898aa',
    marginBottom: 5,
  },
  barColumn: {
    width: 10,
    borderRadius: 5,
    overflow: 'hidden',
    minHeight: 5, // Add a minimum height for zero values
    maxHeight: 100, // Cap the maximum height
  },
  bar: {
    width: '100%',
    height: '100%',
  },
  barDay: {
    fontSize: 12,
    color: '#525f7f',
    marginTop: 5,
    fontWeight: '500',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    marginTop: 10,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ff7e5f',
  },
  statLabel: {
    fontSize: 12,
    color: '#8898aa',
    marginTop: 5,
  },
  statDivider: {
    width: 1,
    height: '80%',
    backgroundColor: '#f0f0f0',
    alignSelf: 'center',
  },
  modalBackground: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  allMedicinesContainer: {
    width: width * 0.9,
    maxHeight: height * 0.8,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#fff',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  allMedicinesContent: {
    flex: 1,
    padding: 20,
  },
  allMedicinesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingBottom: 15,
  },
  allMedicinesTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#32325d',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  medicineGridScroll: {
    flex: 1,
  },
  medicineGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginHorizontal: -5,
  },
  medicineGridItem: {
    width: '48%',
    marginBottom: 15,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  medicineGridItemTaken: {
    opacity: 0.7,
    borderColor: '#4cd964',
    borderWidth: 1,
  },
  medicineGridIconContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    height: 60,
    marginBottom: 10,
  },
  gridItemBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#4cd964',
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridItemDueBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#ff3b30',
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  medicineGridItemName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#32325d',
    textAlign: 'center',
    marginBottom: 5,
  },
  medicineGridItemNameTaken: {
    color: '#8898aa',
  },
  medicineGridItemTime: {
    fontSize: 12,
    color: '#8898aa',
    textAlign: 'center',
  },
  addMedicineButtonModal: {
    backgroundColor: '#ff7e5f',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 30,
    marginTop: 15,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  noMedicineGridContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  noMedicineGridText: {
    fontSize: 16,
    color: '#8898aa',
    marginVertical: 16,
    textAlign: 'center',
  },
});

export default Home;
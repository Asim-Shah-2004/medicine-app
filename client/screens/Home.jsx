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
  Vibration
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons, FontAwesome, Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { SERVER_URL } from '@env';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';

const Home = () => {
  const navigation = useNavigation();
  const [todayMedicines, setTodayMedicines] = useState([]);
  const [progress, setProgress] = useState({ total: 0, completed: 0, progress: 0 });
  const [schedule, setSchedule] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  
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
      return () => {};
    }, [])
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

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF7F50" />
        <Text style={styles.loadingText}>Loading your medication schedule...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#FF7F50']} />
        }
      >
        {/* Header Section */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Medicine Tracker</Text>
          <TouchableOpacity 
            style={styles.addButton}
            onPress={goToAddMedicine}
          >
            <Ionicons name="add" size={28} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Today's Progress */}
        <View style={styles.progressContainer}>
          <Text style={styles.sectionTitle}>Today's Progress</Text>
          <View style={styles.progressBarContainer}>
            <View 
              style={[
                styles.progressBar, 
                { width: `${progress.progress || 0}%` }
              ]} 
            />
          </View>
          <Text style={styles.progressText}>
            {progress.completed} of {progress.total} medications taken
          </Text>
        </View>

        {/* Today's Schedule */}
        <View style={styles.todayContainer}>
          <Text style={styles.sectionTitle}>Today's Schedule</Text>
          {todayMedicines.length > 0 ? (
            todayMedicines.map((medicine) => (
              <View key={medicine._id} style={[
                styles.medicineCard,
                isDueNow(medicine.time) && !medicine.last_status && styles.dueMedicineCard,
                isUpcoming(medicine.time) && !medicine.last_status && styles.upcomingMedicineCard,
                medicine.last_status && styles.takenMedicineCard,
              ]}>
                <View style={styles.medicineInfo}>
                  <Text style={styles.medicineName}>{medicine.name}</Text>
                  <Text style={styles.medicineDosage}>{medicine.dosage}</Text>
                  <Text style={styles.medicineTime}>{formatTime(medicine.time)}</Text>
                  {isUpcoming(medicine.time) && !medicine.last_status && (
                    <Text style={styles.upcomingText}>Coming up in {
                      Math.round(
                        (new Date(new Date().setHours(...medicine.time.split(':'), 0, 0)) - new Date()) / 
                        (1000 * 60)
                      )} minutes
                    </Text>
                  )}
                  {isDueNow(medicine.time) && !medicine.last_status && (
                    <Text style={styles.dueNowText}>Due now!</Text>
                  )}
                  {medicine.last_status && (
                    <Text style={styles.takenText}>Already taken</Text>
                  )}
                </View>
                <View style={styles.actionButtons}>
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
            ))
          ) : (
            <Text style={styles.noMedicineText}>No medications scheduled for today</Text>
          )}
        </View>

        {/* Calendar Link */}
        <TouchableOpacity 
          style={styles.calendarLinkContainer}
          onPress={goToSchedule}
        >
          <Text style={styles.calendarLinkText}>Click here to view medicine calendar</Text>
          <Ionicons name="calendar" size={24} color="#FF7F50" style={styles.calendarIcon} />
        </TouchableOpacity>
      </ScrollView>

      {/* Medicine Due Now Reminder Modal */}
      <Modal
        transparent={true}
        visible={reminderVisible}
        animationType="none"
        onRequestClose={() => handleReminderResponse(false)}
      >
        <Animated.View 
          style={[
            styles.reminderContainer,
            { opacity: reminderOpacity }
          ]}
        >
          <View style={styles.reminderContent}>
            <View style={styles.reminderIconContainer}>
              <Ionicons name="medkit" size={60} color="#FF7F50" />
            </View>
            <Text style={styles.reminderTitle}>It's time for your medicine!</Text>
            {currentReminder && (
              <>
                <Text style={styles.reminderMedicineName}>{currentReminder.name}</Text>
                <Text style={styles.reminderDosage}>{currentReminder.dosage}</Text>
                <Text style={styles.reminderTime}>{formatTime(currentReminder.time)}</Text>
              </>
            )}
            <View style={styles.reminderActions}>
              <TouchableOpacity 
                style={[styles.reminderButton, styles.reminderButtonTaken]}
                onPress={() => handleReminderResponse(true)}
              >
                <FontAwesome name="check" size={24} color="#fff" />
                <Text style={styles.reminderButtonText}>Taken</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.reminderButton, styles.reminderButtonSkip]}
                onPress={() => handleReminderResponse(false)}
              >
                <MaterialIcons name="close" size={24} color="#fff" />
                <Text style={styles.reminderButtonText}>Skip</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </Modal>

      {/* Upcoming Medicine Reminder Modal */}
      <Modal
        transparent={true}
        visible={upcomingReminderVisible}
        animationType="none"
        onRequestClose={dismissUpcomingReminder}
      >
        <Animated.View 
          style={[
            styles.upcomingReminderContainer,
            { opacity: upcomingReminderOpacity }
          ]}
        >
          <View style={styles.upcomingReminderContent}>
            <View style={styles.upcomingIconContainer}>
              <Ionicons name="time-outline" size={40} color="#4682B4" />
            </View>
            <Text style={styles.upcomingReminderTitle}>Medicine Coming Up</Text>
            {upcomingReminder && (
              <>
                <Text style={styles.upcomingMedicineName}>{upcomingReminder.name}</Text>
                <Text style={styles.upcomingDosage}>{upcomingReminder.dosage}</Text>
                <Text style={styles.upcomingTime}>
                  Scheduled for {formatTime(upcomingReminder.time)}
                </Text>
              </>
            )}
            <TouchableOpacity 
              style={styles.dismissButton}
              onPress={dismissUpcomingReminder}
            >
              <Text style={styles.dismissButtonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Modal>
    </SafeAreaView>
  );
};

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
  },
  loadingText: {
    marginTop: 10,
    color: '#666',
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  addButton: {
    backgroundColor: '#FF7F50',
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  progressContainer: {
    backgroundColor: '#fff',
    padding: 20,
    marginHorizontal: 15,
    marginTop: 20,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  progressBarContainer: {
    height: 16,
    backgroundColor: '#eee',
    borderRadius: 8,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#FF7F50',
    borderRadius: 8,
  },
  progressText: {
    marginTop: 10,
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  todayContainer: {
    backgroundColor: '#fff',
    padding: 20,
    marginHorizontal: 15,
    marginTop: 20,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  medicineCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 15,
    marginBottom: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#ccc',
  },
  dueMedicineCard: {
    borderLeftColor: '#FF7F50',
    backgroundColor: '#FFF5F0',
  },
  upcomingMedicineCard: {
    borderLeftColor: '#4682B4',
    backgroundColor: '#F0F8FF',
  },
  takenMedicineCard: {
    borderLeftColor: '#4CD964',
    backgroundColor: '#F0FFF0',
  },
  medicineInfo: {
    flex: 1,
  },
  medicineName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  medicineDosage: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  medicineTime: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  upcomingText: {
    color: '#4682B4',
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  takenText: {
    color: '#4CD964',
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  actionButtons: {
    flexDirection: 'row',
  },
  takeButton: {
    backgroundColor: '#FF7F50',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  takeButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  takenIndicator: {
    backgroundColor: '#4CD964',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  noMedicineText: {
    textAlign: 'center',
    color: '#888',
    padding: 20,
    fontStyle: 'italic',
  },
  calendarLinkContainer: {
    backgroundColor: '#fff',
    padding: 20,
    marginHorizontal: 15,
    marginTop: 20,
    marginBottom: 30,
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  calendarLinkText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '500',
  },
  calendarIcon: {
    marginLeft: 10,
  },
  reminderContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    backdropFilter: 'blur(5px)',
  },
  reminderContent: {
    backgroundColor: 'white',
    borderRadius: 25,
    padding: 30,
    width: width * 0.9,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  reminderIconContainer: {
    backgroundColor: '#FFF5F0',
    width: 130,
    height: 130,
    borderRadius: 65,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 25,
    shadowColor: '#FF7F50',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  reminderTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 15,
  },
  reminderMedicineName: {
    fontSize: 24,
    color: '#FF7F50',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  reminderDosage: {
    fontSize: 20,
    color: '#666',
    marginBottom: 8,
    textAlign: 'center',
  },
  reminderTime: {
    fontSize: 18,
    color: '#888',
    marginBottom: 25,
    textAlign: 'center',
  },
  reminderActions: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-around',
    marginTop: 15,
  },
  reminderButton: {
    flexDirection: 'row',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 4,
    minWidth: width * 0.35,
  },
  reminderButtonTaken: {
    backgroundColor: '#4CD964',
  },
  reminderButtonSkip: {
    backgroundColor: '#FF3B30',
  },
  reminderButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
    marginLeft: 10,
  },
  upcomingReminderContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    backdropFilter: 'blur(5px)',
  },
  upcomingReminderContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 25,
    width: width * 0.85,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 7,
  },
  upcomingIconContainer: {
    backgroundColor: '#F0F8FF',
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#4682B4',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  upcomingReminderTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
    textAlign: 'center',
  },
  upcomingMedicineName: {
    fontSize: 20,
    color: '#4682B4',
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  upcomingDosage: {
    fontSize: 18,
    color: '#666',
    marginBottom: 8,
    textAlign: 'center',
  },
  upcomingTime: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  dismissButton: {
    backgroundColor: '#4682B4',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  dismissButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  dueNowText: {
    color: '#FF3B30',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 4,
  },
});

export default Home;
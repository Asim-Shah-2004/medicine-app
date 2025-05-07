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
  Dimensions
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

  // Fetch initial user medications from onboarding
  const fetchUserMedications = async () => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      
      if (!token) {
        navigation.navigate('Login');
        return [];
      }

      try {
        const userResponse = await axios.get(`${SERVER_URL}/api/user/profile`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        // Extract medications from user profile
        const userMedications = userResponse.data.medications || [];
        
        // Transform user medications to the format expected by the app
        const transformedMedications = userMedications.map((med, index) => {
          // Parse the time_of_day to extract time
          const medDate = new Date(med.time_of_day);
          const hours = medDate.getHours().toString().padStart(2, '0');
          const minutes = medDate.getMinutes().toString().padStart(2, '0');
          const timeString = `${hours}:${minutes}`;

          return {
            _id: `onboarding-med-${index}`, // Create a temporary ID
            name: med.name,
            dosage: med.dosage,
            time: timeString,
            frequency: med.frequency,
            notes: med.notes,
            last_status: false // Default to not taken
          };
        });

        return transformedMedications;
      } catch (error) {
        console.log('Error fetching user profile, continuing without profile data:', error);
        return []; // Continue without profile data
      }
    } catch (error) {
      console.error('Error in fetchUserMedications:', error);
      return [];
    }
  };

  // Fetch data from the server
  const fetchData = async () => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      
      if (!token) {
        navigation.navigate('Login');
        return { medicines: [] };
      }

      // First check if we have medications from onboarding
      const onboardingMedications = await fetchUserMedications();

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

      // Combine onboarding medications with today's medicines
      const combinedMedications = [...todayMeds];
      
      if (onboardingMedications.length > 0) {
        // Add onboarding medications that aren't already in today's medicines
        onboardingMedications.forEach(onboardingMed => {
          const alreadyExists = combinedMedications.some(
            todayMed => todayMed.name === onboardingMed.name && todayMed.time === onboardingMed.time
          );
          
          if (!alreadyExists) {
            combinedMedications.push(onboardingMed);
          }
        });
      }

      // Sort medications by time
      combinedMedications.sort((a, b) => {
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
        // Calculate progress from combined medications if API failed
        const total = combinedMedications.length;
        const completed = combinedMedications.filter(med => med.last_status).length;
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

      const firstMedicationTime = combinedMedications.length > 0 ? combinedMedications[0].time : null;

      setTodayMedicines(combinedMedications);
      setProgress(progressData);
      setSchedule(scheduleData);
      setLoading(false);
      setRefreshing(false);
      
      return { 
        medicines: combinedMedications,
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
      
      // Update local state optimistically
      setTodayMedicines(prev => 
        prev.map(med => 
          med._id === medicineId ? { ...med, last_status: completed } : med
        )
      );

      // Calculate progress optimistically
      const total = todayMedicines.length;
      const updatedCompleted = todayMedicines.reduce((count, med) => {
        if (med._id === medicineId) {
          return completed ? count + 1 : count;
        }
        return med.last_status ? count + 1 : count;
      }, 0);
      
      setProgress(prev => ({
        ...prev,
        completed: updatedCompleted,
        progress: total > 0 ? (updatedCompleted / total) * 100 : 0
      }));

      // Send the update to the server
      if (!medicineId.startsWith('onboarding-med-')) {
        await axios.post(
          `${SERVER_URL}/api/user/medicines/${medicineId}/status`,
          { completed },
          { headers: { Authorization: `Bearer ${token}` }}
        );
      }

      // Refresh data after updating to ensure consistency
      fetchData();
    } catch (error) {
      console.error('Error updating medicine status:', error);
      // Rollback changes if the server request failed
      fetchData();
      Alert.alert('Error', 'Failed to update medicine status. Please try again.');
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

  // Check if medicine is due now (within 30 seconds)
  const isDueNow = (timeString) => {
    const [hours, minutes] = timeString.split(':');
    const medicineTime = new Date();
    medicineTime.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
    
    const now = new Date();
    const timeDiff = Math.abs(medicineTime - now) / (1000); // difference in seconds
    
    return timeDiff <= 30;
  };

  // Check if medicine is upcoming (within 15 minutes)
  const isUpcoming = (timeString) => {
    const [hours, minutes] = timeString.split(':');
    const medicineTime = new Date();
    medicineTime.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
    
    const now = new Date();
    
    // Medicine time should be in the future
    if (medicineTime <= now) return false;
    
    const timeDiff = Math.abs(medicineTime - now) / (1000 * 60); // difference in minutes
    
    return timeDiff <= 15; // Within 15 minutes
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

  // Play alert sound
  const playAlertSound = async () => {
    try {
      // First try Haptics
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      
      // Stop previous sound if exists
      if (sound.current) {
        await sound.current.unloadAsync().catch(() => {});
      }
      
      // Create a simple sound using system preset
      const { sound: newSound } = await Audio.Sound.createAsync(
        require('expo-asset/play_button.ios.m4a'), // Use expo asset's built-in sound
        { shouldPlay: true, isLooping: true, volume: 1.0 }
      );
      
      sound.current = newSound;
      
      // Set a timeout to stop the sound after 30 seconds in case user doesn't respond
      setTimeout(async () => {
        if (sound.current) {
          await sound.current.stopAsync().catch(() => {});
        }
      }, 30000);
    } catch (error) {
      console.log('Sound playback failed, falling back to haptic only');
      // Fallback to repeated haptics if sound fails
      const hapticInterval = setInterval(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }, 2000);
      
      // Store the interval ID in a ref so we can clear it later
      sound.current = { 
        hapticInterval,
        stopAsync: async () => clearInterval(hapticInterval),
        unloadAsync: async () => clearInterval(hapticInterval)
      };
    }
  };

  // Play upcoming reminder sound (less intrusive)
  const playUpcomingSound = async () => {
    try {
      // Use haptic feedback first (gentle)
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      
      // Stop previous sound if exists
      if (sound.current) {
        await sound.current.unloadAsync().catch(() => {});
      }
      
      // Use a simple sound notification
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3' },
        { shouldPlay: true, isLooping: false, volume: 0.7 }
      );
      
      sound.current = newSound;
      
      // Automatically release audio after playing once
      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          newSound.unloadAsync().catch(() => {});
        }
      });
    } catch (error) {
      console.log('Upcoming sound playback failed, falling back to haptic only');
      // Just use haptics if sound fails
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  // Stop alert sound
  const stopAlertSound = async () => {
    if (sound.current) {
      try {
        if (sound.current.hapticInterval) {
          clearInterval(sound.current.hapticInterval);
        } else {
          await sound.current.stopAsync();
        }
        await sound.current.unloadAsync();
      } catch (error) {
        console.log('Error stopping sound:', error);
      }
    }
  };

  // Handle medicine reminder response
  const handleReminderResponse = async (taken) => {
    if (currentReminder) {
      // Add to dismissed reminders list to prevent it from showing again
      setDismissedReminders(prev => [...prev, currentReminder._id]);
      
      // Animate out
      Animated.timing(reminderOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(async () => {
        // Stop sound
        await stopAlertSound();
        
        // Hide modal
        setReminderVisible(false);
        
        // Update medicine status if taken
        if (taken) {
          await updateMedicineStatus(currentReminder._id, true);
        }
        
        // Remove from active reminders
        setActiveReminders(prev => prev.filter(id => id !== currentReminder._id));
        
        // Check if there are more reminders waiting
        const nextReminders = todayMedicines.filter(med => 
          isDueNow(med.time) && 
          !med.last_status && 
          !activeReminders.includes(med._id) &&
          !dismissedReminders.includes(med._id) &&
          med._id !== currentReminder._id
        );
        
        if (nextReminders.length > 0) {
          // Show next reminder after a short delay
          setTimeout(() => {
            showReminderForMedicine(nextReminders[0]);
          }, 500);
        }
        
        // Clear current reminder
        setCurrentReminder(null);
      });
    }
  };

  // Handle upcoming reminder dismissal
  const dismissUpcomingReminder = () => {
    if (upcomingReminder) {
      // Add to dismissed reminders list to prevent it from showing again
      setDismissedReminders(prev => [...prev, upcomingReminder._id]);
    }
    
    // Animate out
    Animated.timing(upcomingReminderOpacity, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(async () => {
      // Stop sound
      await stopAlertSound();
      
      // Hide modal
      setUpcomingReminderVisible(false);
      
      // Remove from active reminders if there is an upcomingReminder
      if (upcomingReminder) {
        setActiveReminders(prev => prev.filter(id => id !== upcomingReminder._id));
      }
      
      // Clear upcoming reminder
      setUpcomingReminder(null);
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

  // Show upcoming reminder for medicine
  const showUpcomingReminderForMedicine = (medicine) => {
    // Check if this medicine is already dismissed
    if (dismissedReminders.includes(medicine._id)) {
      return;
    }
    
    // Set upcoming reminder
    setUpcomingReminder(medicine);
    
    // Add to active reminders
    setActiveReminders(prev => [...prev, medicine._id]);
    
    // Show modal
    setUpcomingReminderVisible(true);
    
    // Animate in
    Animated.timing(upcomingReminderOpacity, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
    
    // Play upcoming alert sound
    playUpcomingSound();
  };

  // Check for medicines that are due now or upcoming
  const checkMedicines = useCallback(() => {
    // Skip if a reminder is already showing
    if (reminderVisible) return;
    
    // First, check for medicines that are due RIGHT NOW (within 30 seconds)
    const dueMedicines = todayMedicines.filter(medicine => 
      isDueNow(medicine.time) && 
      !medicine.last_status && 
      !activeReminders.includes(medicine._id) &&
      !dismissedReminders.includes(medicine._id)
    );
    
    if (dueMedicines.length > 0) {
      showReminderForMedicine(dueMedicines[0]);
      return;
    }
    
    // If no medicines are due right now, check for upcoming medicines (within 15 mins)
    // Only show upcoming reminder if there's no active upcoming reminder
    if (!upcomingReminderVisible) {
      const upcomingMedicines = todayMedicines.filter(medicine => 
        isUpcoming(medicine.time) && 
        !medicine.last_status && 
        !activeReminders.includes(medicine._id) &&
        !dismissedReminders.includes(medicine._id)
      );
      
      if (upcomingMedicines.length > 0) {
        showUpcomingReminderForMedicine(upcomingMedicines[0]);
      }
    }
  }, [todayMedicines, reminderVisible, upcomingReminderVisible, activeReminders, dismissedReminders]);

  // Reset dismissed reminders at midnight
  const resetDismissedRemindersAtMidnight = useCallback(() => {
    const now = new Date();
    if (now.getHours() === 0 && now.getMinutes() === 0) {
      setDismissedReminders([]);
    }
  }, []);

  // Setup polling and check for medicine alerts
  useEffect(() => {
    // Configure audio session for playback
    const setupAudio = async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: true,
        });
      } catch (error) {
        console.log('Error setting audio mode:', error);
      }
    };
    
    const initialize = async () => {
      await setupAudio();
      const data = await fetchData();
      
      // Set up polling interval (every 5 seconds for more accurate time checks)
      const intervalId = setInterval(() => {
        setCurrentTime(new Date());
        checkMedicines();
        resetDismissedRemindersAtMidnight();
      }, 5000);
      
      return () => {
        clearInterval(intervalId);
        // Ensure sound is stopped when component unmounts
        if (sound.current) {
          if (sound.current.hapticInterval) {
            clearInterval(sound.current.hapticInterval);
          } else {
            sound.current.unloadAsync().catch(() => {});
          }
        }
      };
    };
    
    initialize();
  }, []);

  // Check for due medicines whenever todayMedicines changes
  useEffect(() => {
    checkMedicines();
  }, [todayMedicines, checkMedicines]);

  // Refresh data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchData();
      return () => {};
    }, [])
  );

  // Generate weekday labels for the schedule preview
  const getWeekDays = () => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    // If there are medications, start the week from the first medication's day
    let weekStart;
    
    if (todayMedicines.length > 0) {
      // Get the first medicine's time and use that to determine the start date
      const firstMedicine = todayMedicines[0];
      const [hours, minutes] = firstMedicine.time.split(':').map(Number);
      
      const today = new Date();
      weekStart = new Date(today);
      weekStart.setHours(hours, minutes, 0, 0);
      
      // If the first medicine time has already passed today, use tomorrow as the start
      if (weekStart < today) {
        weekStart.setDate(weekStart.getDate() + 1);
      }
    } else {
      // Default to today if no medicines
      const today = new Date();
      weekStart = new Date(today);
    }
    
    return days.map((day, index) => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + index);
      const dateString = date.toISOString().split('T')[0];
      const isToday = date.getDate() === new Date().getDate() && 
                      date.getMonth() === new Date().getMonth() && 
                      date.getFullYear() === new Date().getFullYear();
      
      return {
        day,
        date: date.getDate(),
        dateString,
        isToday
      };
    });
  };

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
                isUpcoming(medicine.time) && !medicine.last_status && styles.upcomingMedicineCard
              ]}>
                <View style={styles.medicineInfo}>
                  <Text style={styles.medicineName}>{medicine.name}</Text>
                  <Text style={styles.medicineDosage}>{medicine.dosage}</Text>
                  <Text style={styles.medicineTime}>{formatTime(medicine.time)}</Text>
                  {isUpcoming(medicine.time) && !medicine.last_status && (
                    <Text style={styles.upcomingText}>Coming up soon</Text>
                  )}
                </View>
                <View style={styles.actionButtons}>
                  <TouchableOpacity 
                    style={[
                      styles.statusButton,
                      medicine.last_status ? styles.takenButton : styles.notTakenButton
                    ]}
                    onPress={() => updateMedicineStatus(medicine._id, !medicine.last_status)}
                  >
                    {medicine.last_status ? (
                      <FontAwesome name="check" size={20} color="#fff" />
                    ) : (
                      <MaterialIcons name="close" size={20} color="#fff" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.noMedicineText}>No medications scheduled for today</Text>
          )}
        </View>

        {/* Weekly Preview */}
        <View style={styles.weeklyPreviewContainer}>
          <View style={styles.weeklyHeader}>
            <Text style={styles.sectionTitle}>Schedule Preview</Text>
            <TouchableOpacity onPress={goToSchedule}>
              <Text style={styles.viewAllText}>View All</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.daysContainer}>
            {getWeekDays().map((dayInfo) => {
              const daySchedule = schedule[dayInfo.dateString] || [];
              const hasMeds = daySchedule.length > 0;
              
              return (
                <TouchableOpacity 
                  key={dayInfo.dateString}
                  style={[
                    styles.dayItem,
                    dayInfo.isToday && styles.todayItem,
                    hasMeds && styles.hasMedsItem
                  ]}
                  onPress={goToSchedule}
                >
                  <Text style={[
                    styles.dayText,
                    dayInfo.isToday && styles.todayText
                  ]}>
                    {dayInfo.day}
                  </Text>
                  <Text style={[
                    styles.dateText,
                    dayInfo.isToday && styles.todayText
                  ]}>
                    {dayInfo.date}
                  </Text>
                  {hasMeds && (
                    <View style={styles.medIndicator}>
                      <Text style={styles.medCount}>{daySchedule.length}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
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
        onRequestClose={() => dismissUpcomingReminder()}
      >
        <Animated.View 
          style={[
            styles.upcomingReminder,
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
                <Text style={styles.upcomingTime}>{formatTime(upcomingReminder.time)}</Text>
              </>
            )}
            <TouchableOpacity 
              style={styles.dismissButton}
              onPress={dismissUpcomingReminder}
            >
              <Text style={styles.dismissButtonText}>Dismiss</Text>
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
  actionButtons: {
    flexDirection: 'row',
  },
  statusButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  takenButton: {
    backgroundColor: '#4CAF50',
  },
  notTakenButton: {
    backgroundColor: '#F44336',
  },
  noMedicineText: {
    textAlign: 'center',
    color: '#888',
    padding: 20,
    fontStyle: 'italic',
  },
  weeklyPreviewContainer: {
    backgroundColor: '#fff',
    padding: 20,
    marginHorizontal: 15,
    marginTop: 20,
    marginBottom: 30,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  weeklyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  viewAllText: {
    color: '#FF7F50',
    fontSize: 14,
    fontWeight: '500',
  },
  daysContainer: {
    flexDirection: 'row',
  },
  dayItem: {
    width: 60,
    height: 80,
    marginRight: 10,
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10,
  },
  todayItem: {
    backgroundColor: '#FF7F50',
  },
  hasMedsItem: {
    borderWidth: 1,
    borderColor: '#ddd',
  },
  dayText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  dateText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 4,
  },
  todayText: {
    color: '#fff',
  },
  medIndicator: {
    position: 'absolute',
    bottom: -5,
    right: -5,
    backgroundColor: '#4682B4',
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  medCount: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  reminderContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reminderContent: {
    backgroundColor: '#fff',
    width: width * 0.85,
    padding: 25,
    borderRadius: 15,
    alignItems: 'center',
  },
  reminderIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FFF5F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  reminderTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 15,
  },
  reminderMedicineName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FF7F50',
    marginBottom: 5,
  },
  reminderDosage: {
    fontSize: 16,
    color: '#666',
    marginBottom: 5,
  },
  reminderTime: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 25,
  },
  reminderActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  reminderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    width: '48%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
    elevation: 2,
  },
  reminderButtonTaken: {
    backgroundColor: '#4CAF50',
  },
  reminderButtonSkip: {
    backgroundColor: '#F44336',
  },
  reminderButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  upcomingReminder: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  upcomingReminderContent: {
    backgroundColor: '#fff',
    width: width * 0.8,
    padding: 20,
    borderRadius: 15,
    alignItems: 'center',
  },
  upcomingIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F0F8FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  upcomingReminderTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  upcomingMedicineName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4682B4',
    marginBottom: 5,
  },
  upcomingTime: {
    fontSize: 15,
    color: '#666',
    marginBottom: 20,
  },
  dismissButton: {
    backgroundColor: '#eee',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  dismissButtonText: {
    color: '#333',
    fontSize: 14,
    fontWeight: '500',
  }
});

export default Home;
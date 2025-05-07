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
  const reminderOpacity = useRef(new Animated.Value(0)).current;
  const upcomingReminderOpacity = useRef(new Animated.Value(0)).current;
  const sound = useRef(null);

  // Fetch initial user medications from onboarding
  const fetchUserMedications = async () => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      
      if (!token) {
        navigation.navigate('Login');
        return;
      }

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
      console.error('Error fetching user medications:', error);
      return [];
    }
  };

  // Fetch data from the server
  const fetchData = async () => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      
      if (!token) {
        navigation.navigate('Login');
        return;
      }

      // First check if we have medications from onboarding
      const onboardingMedications = await fetchUserMedications();

      // Get today's medicines
      const todayResponse = await axios.get(`${SERVER_URL}/api/user/medicines/today`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Combine onboarding medications with today's medicines
      // Only include onboarding medications if they're not already in today's medicines
      const combinedMedications = [...todayResponse.data.medicines];
      
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

      // Get progress data
      const progressResponse = await axios.get(`${SERVER_URL}/api/user/medicines/progress`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Get schedule data for the week
      const scheduleResponse = await axios.get(`${SERVER_URL}/api/user/medicines/schedule`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const firstMedicationTime = combinedMedications.length > 0 ? combinedMedications[0].time : null;

      setTodayMedicines(combinedMedications);
      setProgress(progressResponse.data);
      setSchedule(scheduleResponse.data.schedule);
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
      
      await axios.post(
        `${SERVER_URL}/api/user/medicines/${medicineId}/status`,
        { completed },
        { headers: { Authorization: `Bearer ${token}` }}
      );

      // Refresh data after updating
      fetchData();
    } catch (error) {
      console.error('Error updating medicine status:', error);
      Alert.alert('Error', 'Failed to update medicine status');
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
      !activeReminders.includes(medicine._id)
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
        !activeReminders.includes(medicine._id)
      );
      
      if (upcomingMedicines.length > 0) {
        showUpcomingReminderForMedicine(upcomingMedicines[0]);
      }
    }
  }, [todayMedicines, reminderVisible, upcomingReminderVisible, activeReminders]);

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
            styles.upcomingReminderContainer,
            { opacity: upcomingReminderOpacity }
          ]}
        >
          <View style={styles.upcomingReminderContent}>
            <View style={styles.upcomingReminderIconContainer}>
              <Ionicons name="time-outline" size={40} color="#FF7F50" />
            </View>
            <View style={styles.upcomingReminderTextContainer}>
              <Text style={styles.upcomingReminderTitle}>Medication Reminder</Text>
              {upcomingReminder && (
                <>
                  <Text style={styles.upcomingReminderMedicineName}>
                    {upcomingReminder.name} in {
                      (() => {
                        const [hours, minutes] = upcomingReminder.time.split(':');
                        const medicineTime = new Date();
                        medicineTime.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
                        
                        const now = new Date();
                        const timeDiff = Math.floor((medicineTime - now) / (1000 * 60));
                        
                        return `${timeDiff} mins`;
                      })()
                    }
                  </Text>
                </>
              )}
            </View>
            <TouchableOpacity 
              style={styles.dismissButton}
              onPress={dismissUpcomingReminder}
            >
              <Ionicons name="close" size={20} color="#666" />
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#333',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  addButton: {
    backgroundColor: '#FF7F50',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  progressContainer: {
    padding: 20,
    backgroundColor: '#fff',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  progressBarContainer: {
    height: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
    overflow: 'hidden',
    marginVertical: 10,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#FF7F50',
    borderRadius: 6,
  },
  progressText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 5,
  },
  todayContainer: {
    padding: 20,
    backgroundColor: '#fff',
    borderTopWidth: 8,
    borderTopColor: '#f8f8f8',
  },
  medicineCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  dueMedicineCard: {
    backgroundColor: '#FFF5EE',
    borderLeftWidth: 5,
    borderLeftColor: '#FF7F50',
  },
  upcomingMedicineCard: {
    backgroundColor: '#FFF8F5',
    borderLeftWidth: 3,
    borderLeftColor: '#FFA07A',
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
    color: '#FF7F50',
    fontWeight: 'bold',
    marginTop: 4,
  },
  upcomingText: {
    fontSize: 12,
    color: '#FFA07A',
    fontWeight: '600',
    marginTop: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  takenButton: {
    backgroundColor: '#4CAF50',
  },
  notTakenButton: {
    backgroundColor: '#FF5252',
  },
  noMedicineText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 16,
    padding: 20,
  },
  weeklyPreviewContainer: {
    padding: 20,
    backgroundColor: '#fff',
    borderTopWidth: 8,
    borderTopColor: '#f8f8f8',
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
    fontWeight: '600',
  },
  daysContainer: {
    flexDirection: 'row',
    paddingVertical: 5,
  },
  dayItem: {
    width: 70,
    height: 90,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
    marginRight: 10,
    padding: 10,
  },
  todayItem: {
    backgroundColor: '#FF7F50',
  },
  hasMedsItem: {
    borderBottomWidth: 3,
    borderBottomColor: '#FF7F50',
  },
  dayText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  dateText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 5,
  },
  todayText: {
    color: '#fff',
  },
  medIndicator: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#FF7F50',
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  medCount: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  reminderContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reminderContent: {
    width: '85%',
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 25,
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  reminderIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FFF5EE',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  reminderTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  reminderMedicineName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FF7F50',
    marginBottom: 5,
    textAlign: 'center',
  },
  reminderDosage: {
    fontSize: 18,
    color: '#666',
    marginBottom: 5,
    textAlign: 'center',
  },
  reminderTime: {
    fontSize: 16,
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  reminderActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 10,
  },
  reminderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 10,
    width: '45%',
  },
  reminderButtonTaken: {
    backgroundColor: '#4CAF50',
  },
  reminderButtonSkip: {
    backgroundColor: '#FF5252',
  },
  reminderButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  upcomingReminderContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
    padding: 15,
  },
  upcomingReminderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  upcomingReminderIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFF5EE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  upcomingReminderTextContainer: {
    flex: 1,
  },
  upcomingReminderTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  upcomingReminderMedicineName: {
    fontSize: 14,
    color: '#FF7F50',
    fontWeight: '600',
  },
  dismissButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default Home;
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
  const [currentReminder, setCurrentReminder] = useState(null);
  const [activeReminders, setActiveReminders] = useState([]);
  const reminderOpacity = useRef(new Animated.Value(0)).current;
  const sound = useRef(null);

  // Fetch data from the server
  const fetchData = async () => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      
      if (!token) {
        navigation.navigate('Login');
        return;
      }

      // Get today's medicines
      const todayResponse = await axios.get(`${SERVER_URL}/api/user/medicines/today`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Get progress data
      const progressResponse = await axios.get(`${SERVER_URL}/api/user/medicines/progress`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Get schedule data for the week
      const scheduleResponse = await axios.get(`${SERVER_URL}/api/user/medicines/schedule`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setTodayMedicines(todayResponse.data.medicines);
      setProgress(progressResponse.data);
      setSchedule(scheduleResponse.data.schedule);
      setLoading(false);
      setRefreshing(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      setLoading(false);
      setRefreshing(false);
      
      if (error.response && error.response.status === 401) {
        Alert.alert('Session Expired', 'Please login again');
        navigation.navigate('Login');
      }
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

  // Check if medicine is due now (within 30 minutes)
  const isDue = (timeString) => {
    const [hours, minutes] = timeString.split(':');
    const medicineTime = new Date();
    medicineTime.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
    
    const now = new Date();
    const timeDiff = Math.abs(medicineTime - now) / (1000 * 60); // difference in minutes
    
    return timeDiff <= 30;
  };

  // Navigate to add medicine screen
  const goToAddMedicine = () => {
    navigation.navigate('AddMedicine');
  };

  // Navigate to full schedule/calendar view
  const goToSchedule = () => {
    navigation.navigate('Schedule', { schedule });
  };

  // Play alert sound
  const playAlertSound = async () => {
    try {
      if (sound.current) {
        await sound.current.unloadAsync();
      }
      const { sound: newSound } = await Audio.Sound.createAsync(
        require('../assets/sounds/medicine-alert.mp3'),
        { shouldPlay: true, isLooping: true }
      );
      sound.current = newSound;
    } catch (error) {
      console.error('Error playing sound', error);
    }
  };

  // Stop alert sound
  const stopAlertSound = async () => {
    if (sound.current) {
      await sound.current.stopAsync();
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
          isDue(med.time) && 
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

  // Check for medicines that are due
  const checkDueMedicines = useCallback(() => {
    // Skip if a reminder is already showing
    if (reminderVisible) return;
    
    // Find medicines that are due and not taken
    const dueMedicines = todayMedicines.filter(medicine => 
      isDue(medicine.time) && 
      !medicine.last_status && 
      !activeReminders.includes(medicine._id)
    );
    
    if (dueMedicines.length > 0) {
      showReminderForMedicine(dueMedicines[0]);
    }
  }, [todayMedicines, reminderVisible, activeReminders]);

  // Setup polling and check for medicine alerts
  useEffect(() => {
    fetchData();
    
    // Set up polling interval (every 10 seconds)
    const intervalId = setInterval(() => {
      fetchData();
      setCurrentTime(new Date());
    }, 10000);
    
    return () => {
      clearInterval(intervalId);
      // Ensure sound is stopped when component unmounts
      if (sound.current) {
        sound.current.unloadAsync();
      }
    };
  }, []);

  // Check for due medicines whenever todayMedicines changes
  useEffect(() => {
    checkDueMedicines();
  }, [todayMedicines, checkDueMedicines]);

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
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay()); // Start from Sunday
    
    return days.map((day, index) => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + index);
      const dateString = date.toISOString().split('T')[0];
      const isToday = date.getDate() === today.getDate() && 
                      date.getMonth() === today.getMonth() && 
                      date.getFullYear() === today.getFullYear();
      
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
                isDue(medicine.time) && !medicine.last_status && styles.dueMedicineCard
              ]}>
                <View style={styles.medicineInfo}>
                  <Text style={styles.medicineName}>{medicine.name}</Text>
                  <Text style={styles.medicineDosage}>{medicine.dosage}</Text>
                  <Text style={styles.medicineTime}>{formatTime(medicine.time)}</Text>
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

      {/* Medicine Reminder Modal */}
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
    paddingVertical: 10,
  },
  dayItem: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
    height: 80,
    borderRadius: 10,
    marginRight: 10,
    backgroundColor: '#f9f9f9',
    padding: 10,
  },
  todayItem: {
    backgroundColor: '#FFF5EE',
    borderWidth: 2,
    borderColor: '#FF7F50',
  },
  hasMedsItem: {
    backgroundColor: '#f9f9f9',
  },
  dayText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  dateText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 5,
  },
  todayText: {
    color: '#FF7F50',
  },
  medIndicator: {
    backgroundColor: '#FF7F50',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    position: 'absolute',
    top: 5,
    right: 5,
  },
  medCount: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  
  // Reminder Modal Styles
  reminderContainer: {
    flex: 1,
    backgroundColor: 'rgba(255, 127, 80, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  reminderContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
    width: '90%',
    maxWidth: 400,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  reminderIconContainer: {
    backgroundColor: '#fff5ee',
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#FF7F50',
  },
  reminderTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  reminderMedicineName: {
    fontSize: 22,
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
    fontWeight: '500',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  reminderActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 20,
  },
  reminderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    borderRadius: 12,
    minWidth: 120,
    marginHorizontal: 10,
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
});

export default Home;
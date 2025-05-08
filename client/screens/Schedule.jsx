import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  Alert,
  Platform,
  StatusBar,
  Dimensions
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons, FontAwesome, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { SERVER_URL } from '@env';

const { width } = Dimensions.get('window');
const CALENDAR_WIDTH = width - 32; // Full width minus padding
const DAY_WIDTH = CALENDAR_WIDTH / 7; // Width of each day column

const Schedule = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const initialSchedule = route.params?.schedule || {};
  
  const [schedule, setSchedule] = useState(initialSchedule);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [currentWeekStart, setCurrentWeekStart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);
  const [dayMedicines, setDayMedicines] = useState([]);

  // Initialize data on component mount - now starting from today
  useEffect(() => {
    const today = new Date();
    
    // Start from today instead of the beginning of the week
    const startDate = today;
    
    // Format dates for API
    const formattedStart = formatDateForAPI(startDate);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6); // 7 days from today
    const formattedEnd = formatDateForAPI(endDate);
    
    setStartDate(formattedStart);
    setEndDate(formattedEnd);
    setCurrentWeekStart(startDate);
    
    // Set selected day to today
    const formattedToday = formatDateForAPI(today);
    setSelectedDay(formattedToday);
    
    // Check if schedule is already passed from Home screen
    if (Object.keys(initialSchedule).length === 0) {
      fetchSchedule(formattedStart, formattedEnd);
    } else {
      setLoading(false);
      // Extract the medicines for today
      if (initialSchedule[formattedToday]) {
        setDayMedicines(initialSchedule[formattedToday]);
      }
    }
  }, []);

  // Format date for API (YYYY-MM-DD)
  const formatDateForAPI = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Format date for display
  const formatDateForDisplay = (dateString) => {
    const date = new Date(dateString);
    const options = { weekday: 'short', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
  };

  // Format month for display
  const formatMonthForDisplay = (date) => {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  // Fetch schedule from API
  const fetchSchedule = async (start, end) => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('accessToken');
      
      if (!token) {
        navigation.navigate('Login');
        return;
      }
      
      const response = await axios.get(
        `${SERVER_URL}/api/user/medicines/schedule?start_date=${start}&end_date=${end}`,
        { headers: { Authorization: `Bearer ${token}` }}
      );
      
      // Filter out onboarding medicines
      const filteredSchedule = {};
      Object.keys(response.data.schedule).forEach(date => {
        filteredSchedule[date] = response.data.schedule[date].filter(
          med => !med.id.startsWith('onboarding')
        );
      });
      
      setSchedule(filteredSchedule);
      setLoading(false);
      
      // Update the selected day's medicines
      if (selectedDay && filteredSchedule[selectedDay]) {
        setDayMedicines(filteredSchedule[selectedDay]);
      } else {
        setDayMedicines([]);
      }
    } catch (error) {
      console.error('Error fetching schedule:', error);
      setLoading(false);
      Alert.alert('Error', 'Failed to load schedule');
    }
  };

  // Navigate to previous week
  const goToPreviousWeek = () => {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(currentWeekStart.getDate() - 7);
    setCurrentWeekStart(newStart);
    
    const newStartFormatted = formatDateForAPI(newStart);
    const newEnd = new Date(newStart);
    newEnd.setDate(newStart.getDate() + 6);
    const newEndFormatted = formatDateForAPI(newEnd);
    
    setStartDate(newStartFormatted);
    setEndDate(newEndFormatted);
    
    fetchSchedule(newStartFormatted, newEndFormatted);
  };

  // Navigate to next week
  const goToNextWeek = () => {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(currentWeekStart.getDate() + 7);
    setCurrentWeekStart(newStart);
    
    const newStartFormatted = formatDateForAPI(newStart);
    const newEnd = new Date(newStart);
    newEnd.setDate(newStart.getDate() + 6);
    const newEndFormatted = formatDateForAPI(newEnd);
    
    setStartDate(newStartFormatted);
    setEndDate(newEndFormatted);
    
    fetchSchedule(newStartFormatted, newEndFormatted);
  };

  // Return to today
  const goToToday = () => {
    const today = new Date();
    const startDate = today;
    const formattedStart = formatDateForAPI(startDate);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    const formattedEnd = formatDateForAPI(endDate);
    
    setStartDate(formattedStart);
    setEndDate(formattedEnd);
    setCurrentWeekStart(startDate);
    setSelectedDay(formattedStart);
    
    fetchSchedule(formattedStart, formattedEnd);
  };

  // Select a day to view its medicines
  const selectDay = (dateString) => {
    setSelectedDay(dateString);
    if (schedule[dateString]) {
      setDayMedicines(schedule[dateString]);
    } else {
      setDayMedicines([]);
    }
  };

  // Generate array of days for the current week view
  const getWeekDays = () => {
    if (!currentWeekStart) return [];
    
    const days = [];
    const startDate = new Date(currentWeekStart);
    
    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);
      const dateString = formatDateForAPI(currentDate);
      
      days.push({
        date: currentDate,
        dateString,
        dayName: currentDate.toLocaleDateString('en-US', { weekday: 'short' }),
        dayNumber: currentDate.getDate(),
        hasMeds: schedule[dateString] && schedule[dateString].length > 0,
        medCount: schedule[dateString] ? schedule[dateString].length : 0,
        isToday: dateString === formatDateForAPI(new Date()),
      });
    }
    
    return days;
  };

  // Format time (8:00 to 8:00 AM)
  const formatTime = (timeString) => {
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const formattedHour = hour % 12 || 12;
    return `${formattedHour}:${minutes} ${ampm}`;
  };

  // Navigate to add medication screen
  const goToAddMedicine = () => {
    navigation.navigate('AddMedicine');
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF7F50" />
        <Text style={styles.loadingText}>Loading your calendar...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Medicine Calendar</Text>
        <TouchableOpacity onPress={goToAddMedicine} style={styles.addButton}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
      
      {/* Month Display and Navigation */}
      <View style={styles.monthContainer}>
        <Text style={styles.monthText}>
          {currentWeekStart ? formatMonthForDisplay(currentWeekStart) : ''}
        </Text>
        <View style={styles.navigationContainer}>
          <TouchableOpacity onPress={goToPreviousWeek} style={styles.navButton}>
            <Ionicons name="chevron-back" size={24} color="#666" />
          </TouchableOpacity>
          
          <TouchableOpacity onPress={goToToday} style={styles.todayButton}>
            <Text style={styles.todayText}>Today</Text>
          </TouchableOpacity>
          
          <TouchableOpacity onPress={goToNextWeek} style={styles.navButton}>
            <Ionicons name="chevron-forward" size={24} color="#666" />
          </TouchableOpacity>
        </View>
      </View>
      
      {/* Calendar Week View */}
      <View style={styles.calendarContainer}>
        {/* Weekday Headers */}
        <View style={styles.weekdayHeader}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
            <View key={day} style={styles.weekdayHeaderItem}>
              <Text style={styles.weekdayHeaderText}>{day}</Text>
            </View>
          ))}
        </View>
        
        {/* Calendar Days */}
        <View style={styles.daysContainer}>
          {getWeekDays().map((item) => (
            <TouchableOpacity
              key={item.dateString}
              style={[
                styles.dayItem,
                selectedDay === item.dateString && styles.selectedDayItem,
                item.isToday && styles.todayItem
              ]}
              onPress={() => selectDay(item.dateString)}
            >
              <View style={styles.dayNumberContainer}>
                <Text
                  style={[
                    styles.dayNumber,
                    selectedDay === item.dateString && styles.selectedDayText,
                    item.isToday && styles.todayText
                  ]}
                >
                  {item.dayNumber}
                </Text>
                {item.hasMeds && (
                  <Text
                    style={[
                      styles.superscriptCount,
                      selectedDay === item.dateString && styles.selectedSuperscriptCount
                    ]}
                  >
                    {item.medCount}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      
      {/* Medicines List */}
      <View style={styles.medicinesContainer}>
        <Text style={styles.medicinesHeader}>
          {selectedDay ? formatDateForDisplay(selectedDay) : 'No day selected'}
          <Text style={styles.medicineCount}> • {dayMedicines.length} {dayMedicines.length === 1 ? 'Medicine' : 'Medicines'}</Text>
        </Text>
        
        <FlatList
          data={dayMedicines}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.medicinesList}
          ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
              <Ionicons name="calendar-outline" size={60} color="#ddd" />
              <Text style={styles.emptyText}>No medications scheduled for this day</Text>
            </View>
          )}
          renderItem={({ item }) => {
            const isToday = selectedDay === formatDateForAPI(new Date());
            
            return (
              <View style={[
                styles.medicineCard,
                item.completed && styles.completedMedicineCard
              ]}>
                <View style={styles.medicineContent}>
                  <View style={styles.medicineInfo}>
                    <Text style={styles.medicineName}>{item.name}</Text>
                    <Text style={styles.medicineDosage}>{item.dosage}</Text>
                    <View style={styles.timeContainer}>
                      <Ionicons name="time-outline" size={16} color="#FF7F50" />
                      <Text style={styles.medicineTime}>{formatTime(item.time)}</Text>
                    </View>
                  </View>
                  
                  <View style={styles.statusContainer}>
                    {item.completed ? (
                      <View style={styles.statusBadge}>
                        <FontAwesome name="check-circle" size={16} color="#4CAF50" />
                        <Text style={styles.statusText}>Taken</Text>
                      </View>
                    ) : isToday ? (
                      <View style={[styles.statusBadge, styles.pendingBadge]}>
                        <MaterialIcons name="pending" size={16} color="#FF7F50" />
                        <Text style={styles.pendingText}>Scheduled</Text>
                      </View>
                    ) : (
                      <View style={[styles.statusBadge, styles.missedBadge]}>
                        <MaterialIcons name="cancel" size={16} color="#F44336" />
                        <Text style={styles.missedText}>Not Taken</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            );
          }}
        />
      </View>
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
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 10 : 10,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  addButton: {
    backgroundColor: '#FF7F50',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  monthText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  navigationContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  navButton: {
    padding: 8,
  },
  todayButton: {
    backgroundColor: '#FF7F50',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  todayText: {
    color: '#FF7F50',
  },
  calendarContainer: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  weekdayHeader: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekdayHeaderItem: {
    flex: 1,
    alignItems: 'center',
  },
  weekdayHeaderText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  daysContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  dayItem: {
    width: DAY_WIDTH,
    height: DAY_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: DAY_WIDTH / 2,
    marginVertical: 4,
  },
  selectedDayItem: {
    backgroundColor: '#FF7F50',
  },
  todayItem: {
    backgroundColor: '#FFF5EE',
    borderWidth: 2,
    borderColor: '#FF7F50',
  },
  dayNumberContainer: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  dayNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  selectedDayText: {
    color: '#fff',
  },
  superscriptCount: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FF7F50',
    marginLeft: 1,
    marginTop: -4,
  },
  selectedSuperscriptCount: {
    color: '#fff',
  },
  medicinesContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  medicinesHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  medicineCount: {
    color: '#666',
    fontWeight: 'normal',
  },
  medicinesList: {
    padding: 16,
  },
  medicineCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    overflow: 'hidden',
  },
  completedMedicineCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  medicineContent: {
    padding: 16,
  },
  medicineInfo: {
    flex: 1,
  },
  medicineName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  medicineDosage: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  medicineTime: {
    fontSize: 14,
    color: '#FF7F50',
    marginLeft: 6,
    fontWeight: '500',
  },
  statusContainer: {
    marginTop: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  pendingBadge: {
    backgroundColor: '#FFF3E0',
  },
  missedBadge: {
    backgroundColor: '#FFEBEE',
  },
  statusText: {
    marginLeft: 6,
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '600',
  },
  pendingText: {
    marginLeft: 6,
    fontSize: 12,
    color: '#FF7F50',
    fontWeight: '600',
  },
  missedText: {
    marginLeft: 6,
    fontSize: 12,
    color: '#F44336',
    fontWeight: '600',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});

export default Schedule;
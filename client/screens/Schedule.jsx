import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  Alert
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons, FontAwesome, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { SERVER_URL } from '@env';

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
      
      // Filter out onboarding medicines (those with IDs starting with 'onboarding-med-')
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
    
    // Start from today
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
  
  // Navigate to edit medication screen
  const editMedicine = (medicineId) => {
    navigation.navigate('EditMedicine', { medicineId });
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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Medicine Calendar</Text>
        <TouchableOpacity onPress={goToAddMedicine} style={styles.addButton}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
      
      {/* Week Navigation */}
      <View style={styles.weekNavigation}>
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
      
      {/* Calendar Week View */}
      <View style={styles.calendarContainer}>
        <FlatList
          horizontal
          data={getWeekDays()}
          keyExtractor={(item) => item.dateString}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.calendarList}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.dayItem,
                selectedDay === item.dateString && styles.selectedDayItem,
                item.isToday && styles.todayItem
              ]}
              onPress={() => selectDay(item.dateString)}
            >
              <Text
                style={[
                  styles.dayName,
                  selectedDay === item.dateString && styles.selectedDayText,
                  item.isToday && styles.todayItemText
                ]}
              >
                {item.dayName}
              </Text>
              <Text
                style={[
                  styles.dayNumber,
                  selectedDay === item.dateString && styles.selectedDayText,
                  item.isToday && styles.todayItemText
                ]}
              >
                {item.dayNumber}
              </Text>
              {item.hasMeds && (
                <View
                  style={[
                    styles.medIndicator,
                    selectedDay === item.dateString && styles.selectedMedIndicator
                  ]}
                >
                  <Text
                    style={[
                      styles.medCount,
                      selectedDay === item.dateString && styles.selectedMedCount
                    ]}
                  >
                    {item.medCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        />
      </View>
      
      {/* Selected Day Header */}
      <View style={styles.selectedDayHeader}>
        <Text style={styles.selectedDayTitle}>
          {selectedDay ? formatDateForDisplay(selectedDay) : 'No day selected'}
        </Text>
        <Text style={styles.medicineCount}>
          {dayMedicines.length} {dayMedicines.length === 1 ? 'Medicine' : 'Medicines'}
        </Text>
      </View>
      
      {/* Medicines List - Now just shows status instead of actions */}
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
          // Check if selected day is today
          const isToday = selectedDay === formatDateForAPI(new Date());
          
          return (
            <View style={[
              styles.medicineCard, 
              item.completed && styles.completedMedicineCard
            ]}>
              <View style={styles.medicineDetails}>
                <Text style={styles.medicineName}>{item.name}</Text>
                <Text style={styles.medicineDosage}>{item.dosage}</Text>
                <Text style={styles.medicineTime}>{formatTime(item.time)}</Text>
                
                {/* Status Display - Show status instead of actions */}
                {item.completed ? (
                  <View style={styles.statusContainer}>
                    <FontAwesome name="check-circle" size={16} color="#4CAF50" />
                    <Text style={styles.statusText}>Taken</Text>
                  </View>
                ) : isToday ? (
                  <View style={styles.statusContainer}>
                    <MaterialIcons name="pending" size={16} color="#FF7F50" />
                    <Text style={styles.pendingText}>Scheduled</Text>
                  </View>
                ) : (
                  <View style={styles.statusContainer}>
                    <MaterialIcons name="cancel" size={16} color="#F44336" />
                    <Text style={styles.missedText}>Not Taken</Text>
                  </View>
                )}
              </View>
              
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => editMedicine(item.id)}
              >
                <MaterialIcons name="edit" size={16} color="#666" />
              </TouchableOpacity>
            </View>
          );
        }}
      />
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
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
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
  weekNavigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  navButton: {
    padding: 5,
  },
  todayButton: {
    backgroundColor: '#FF7F50',
    paddingVertical: 6,
    paddingHorizontal: 15,
    borderRadius: 15,
  },
  todayText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  calendarContainer: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  calendarList: {
    paddingHorizontal: 10,
  },
  dayItem: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
    height: 80,
    marginHorizontal: 6,
    borderRadius: 10,
    backgroundColor: '#f9f9f9',
    padding: 8,
  },
  selectedDayItem: {
    backgroundColor: '#FF7F50',
  },
  todayItem: {
    backgroundColor: '#FFF5EE',
    borderWidth: 2,
    borderColor: '#FF7F50',
  },
  dayName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    marginBottom: 5,
  },
  dayNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  selectedDayText: {
    color: '#fff',
  },
  todayItemText: {
    color: '#FF7F50',
  },
  medIndicator: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: '#FF7F50',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  selectedMedIndicator: {
    backgroundColor: '#fff',
  },
  medCount: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  selectedMedCount: {
    color: '#FF7F50',
  },
  selectedDayHeader: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  selectedDayTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  medicineCount: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  medicinesList: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    flexGrow: 1,
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
    borderLeftWidth: 4,
    borderLeftColor: '#FF7F50',
  },
  completedMedicineCard: {
    borderLeftColor: '#4CAF50',
    backgroundColor: '#F1F8E9',
  },
  medicineDetails: {
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
    fontWeight: '600',
    marginTop: 4,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  statusText: {
    marginLeft: 6,
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: 'bold',
  },
  pendingText: {
    marginLeft: 6,
    fontSize: 14,
    color: '#FF7F50',
    fontWeight: 'bold',
  },
  missedText: {
    marginLeft: 6,
    fontSize: 14,
    color: '#F44336',
    fontWeight: 'bold',
  },
  editButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    marginTop: 10,
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
});

export default Schedule;
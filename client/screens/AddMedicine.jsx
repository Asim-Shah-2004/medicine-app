import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { SERVER_URL } from '@env';
import DateTimePicker from '@react-native-community/datetimepicker';

const AddMedicine = () => {
  const navigation = useNavigation();
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState('daily');
  const [time, setTime] = useState(new Date());
  const [notes, setNotes] = useState('');
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState([]);
  const [daysOfMonth, setDaysOfMonth] = useState([]);

  // Format time for display
  const formatTimeForDisplay = (date) => {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 || 12;
    const formattedMinutes = minutes.toString().padStart(2, '0');
    return `${formattedHours}:${formattedMinutes} ${ampm}`;
  };

  // Format time for API (HH:MM)
  const formatTimeForAPI = (date) => {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  // Handle time change
  const onTimeChange = (event, selectedTime) => {
    setShowTimePicker(false);
    if (selectedTime) {
      setTime(selectedTime);
    }
  };

  // Toggle day selection for weekly frequency
  const toggleDay = (day) => {
    if (days.includes(day)) {
      setDays(days.filter(d => d !== day));
    } else {
      setDays([...days, day]);
    }
  };

  // Toggle day of month for monthly frequency
  const toggleDayOfMonth = (day) => {
    if (daysOfMonth.includes(day)) {
      setDaysOfMonth(daysOfMonth.filter(d => d !== day));
    } else {
      setDaysOfMonth([...daysOfMonth, day]);
    }
  };

  // Submit medicine data to API
  const handleSubmit = async () => {
    // Validate input
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a medicine name');
      return;
    }
    
    if (!dosage.trim()) {
      Alert.alert('Error', 'Please enter the dosage');
      return;
    }
    
    // Validate frequency-specific fields
    if (frequency === 'weekly' && days.length === 0) {
      Alert.alert('Error', 'Please select at least one day of the week');
      return;
    }
    
    if (frequency === 'monthly' && daysOfMonth.length === 0) {
      Alert.alert('Error', 'Please select at least one day of the month');
      return;
    }

    setLoading(true);
    
    try {
      const token = await AsyncStorage.getItem('accessToken');
      
      if (!token) {
        setLoading(false);
        Alert.alert('Authentication Error', 'You need to login first', [
          { text: 'OK', onPress: () => navigation.navigate('Login') }
        ]);
        return;
      }
      
      const medicineData = {
        name,
        dosage,
        time: formatTimeForAPI(time),
        frequency,
        notes
      };
      
      // Add frequency-specific data
      if (frequency === 'weekly') {
        medicineData.days = days;
      } else if (frequency === 'monthly') {
        medicineData.days_of_month = daysOfMonth;
      }
      
      const response = await axios.post(
        `${SERVER_URL}/api/user/medicines`,
        medicineData,
        { headers: { Authorization: `Bearer ${token}` }}
      ).catch(error => {
        console.error('API Error Details:', error.response?.data || error.message);
        if (error.response?.status === 401) {
          throw new Error('Authentication failed');
        }
        throw error;
      });
      
      setLoading(false);
      
      if (response.status === 201) {
        Alert.alert('Success', 'Medicine added successfully', [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
      }
    } catch (error) {
      setLoading(false);
      console.error('Error adding medicine:', error);
      
      if (error.message === 'Authentication failed') {
        Alert.alert('Session Expired', 'Your session has expired. Please log in again.', [
          { text: 'OK', onPress: () => navigation.navigate('Login') }
        ]);
      } else {
        Alert.alert('Error', 'Failed to add medicine. Please try again.');
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Add Medicine</Text>
            <View style={{ width: 24 }} />
          </View>

          {/* Form */}
          <View style={styles.formContainer}>
            {/* Medicine Name */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Medicine Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Enter medicine name"
                placeholderTextColor="#999"
              />
            </View>

            {/* Dosage */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Dosage</Text>
              <TextInput
                style={styles.input}
                value={dosage}
                onChangeText={setDosage}
                placeholder="e.g., 1 tablet, 5ml, etc."
                placeholderTextColor="#999"
              />
            </View>

            {/* Time */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Time</Text>
              <TouchableOpacity
                style={styles.timeInput}
                onPress={() => setShowTimePicker(true)}
              >
                <Text style={styles.timeText}>{formatTimeForDisplay(time)}</Text>
                <Ionicons name="time-outline" size={24} color="#FF7F50" />
              </TouchableOpacity>
              
              {showTimePicker && (
                <DateTimePicker
                  value={time}
                  mode="time"
                  is24Hour={false}
                  display="default"
                  onChange={onTimeChange}
                />
              )}
            </View>

            {/* Frequency */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Frequency</Text>
              <View style={styles.frequencyOptions}>
                {['daily', 'weekly', 'monthly'].map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.frequencyOption,
                      frequency === option && styles.selectedFrequency
                    ]}
                    onPress={() => setFrequency(option)}
                  >
                    <Text
                      style={[
                        styles.frequencyText,
                        frequency === option && styles.selectedFrequencyText
                      ]}
                    >
                      {option.charAt(0).toUpperCase() + option.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Weekly days selection */}
            {frequency === 'weekly' && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Select Days</Text>
                <View style={styles.daysContainer}>
                  {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day) => (
                    <TouchableOpacity
                      key={day}
                      style={[
                        styles.dayOption,
                        days.includes(day) && styles.selectedDay
                      ]}
                      onPress={() => toggleDay(day)}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          days.includes(day) && styles.selectedDayText
                        ]}
                      >
                        {day.substr(0, 3)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Monthly days selection */}
            {frequency === 'monthly' && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Select Days of Month</Text>
                <View style={styles.monthDaysContainer}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                    <TouchableOpacity
                      key={day}
                      style={[
                        styles.monthDayOption,
                        daysOfMonth.includes(day) && styles.selectedDay
                      ]}
                      onPress={() => toggleDayOfMonth(day)}
                    >
                      <Text
                        style={[
                          styles.monthDayText,
                          daysOfMonth.includes(day) && styles.selectedDayText
                        ]}
                      >
                        {day}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Notes */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Notes (Optional)</Text>
              <TextInput
                style={[styles.input, styles.notesInput]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Enter any additional instructions or notes"
                placeholderTextColor="#999"
                multiline
                numberOfLines={3}
              />
            </View>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitButton, loading && styles.disabledButton]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <Text style={styles.submitButtonText}>Adding...</Text>
            ) : (
              <Text style={styles.submitButtonText}>Add Medicine</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingVertical: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  formContainer: {
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#f9f9f9',
  },
  notesInput: {
    height: 100,
    textAlignVertical: 'top',
  },
  timeInput: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#f9f9f9',
  },
  timeText: {
    fontSize: 16,
    color: '#333',
  },
  frequencyOptions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  frequencyOption: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  selectedFrequency: {
    backgroundColor: '#FF7F50',
    borderColor: '#FF7F50',
  },
  frequencyText: {
    color: '#333',
    fontWeight: '500',
  },
  selectedFrequencyText: {
    color: '#fff',
  },
  daysContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
  },
  dayOption: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    margin: 4,
    backgroundColor: '#f9f9f9',
  },
  selectedDay: {
    backgroundColor: '#FF7F50',
    borderColor: '#FF7F50',
  },
  dayText: {
    color: '#333',
  },
  selectedDayText: {
    color: '#fff',
  },
  monthDaysContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
  },
  monthDayOption: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    margin: 4,
    backgroundColor: '#f9f9f9',
  },
  monthDayText: {
    color: '#333',
  },
  submitButton: {
    backgroundColor: '#FF7F50',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 30,
  },
  disabledButton: {
    backgroundColor: '#FFB6A3',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  }
});

export default AddMedicine;
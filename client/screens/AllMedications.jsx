import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Dimensions,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons, FontAwesome, Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';

const { width, height } = Dimensions.get('window');

const AllMedications = () => {
  const navigation = useNavigation();
  const route = useRoute();
  
  // Get medications data passed from Home screen
  const { medications = [] } = route.params || {};

  console.log("Received medications:", medications.length); // Debug
  
  // Format time to AM/PM format
  const formatTime = (timeString) => {
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const formattedHour = hour % 12 || 12;
    return `${formattedHour}:${minutes} ${ampm}`;
  };
  
  // Check if medicine is due now (within 1 minute)
  const isDueNow = (timeString) => {
    const [hours, minutes] = timeString.split(':');
    const now = new Date();
    
    // Get current time in minutes since midnight
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    // Get medicine time in minutes since midnight
    const medicineMinutes = parseInt(hours) * 60 + parseInt(minutes);
    
    // Check if within 1 minute
    const diffInMinutes = Math.abs(medicineMinutes - currentMinutes);
    return diffInMinutes <= 1;
  };
  
  // Navigate back to home screen
  const goBack = () => {
    navigation.goBack();
  };
  
  // Handle medicine taken action
  const handleMedicineTaken = (medicine) => {
    // Navigate back to home screen and pass medicine ID to be marked as taken
    navigation.navigate('Home', {
      medicineToTake: medicine._id
    });
  };
  
  // Handle press on a medicine card
  const handleMedicinePress = (medicine) => {
    if (medicine.last_status) return; // Don't do anything if already taken
    
    // Navigate back to Home screen and tell it to show reminder for this medicine
    navigation.navigate('Home', {
      medicineToRemind: medicine._id
    });
  };
  
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={goBack}
        >
          <Feather name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>All Medications</Text>
        <View style={styles.placeholderButton} />
      </View>
      
      {/* Content */}
      <View style={styles.content}>
        {medications && medications.length > 0 ? (
          <ScrollView style={styles.scrollView}>
            <View style={styles.medicationsList}>
              {medications.map((medicine) => (
                <TouchableOpacity 
                  key={medicine._id}
                  style={[
                    styles.medicationCard,
                    medicine.last_status && styles.medicationCardTaken
                  ]}
                  onPress={() => handleMedicinePress(medicine)}
                >
                  <View style={styles.medicationContent}>
                    <View style={styles.medicationIcon}>
                      <MaterialCommunityIcons 
                        name="pill" 
                        size={26} 
                        color={medicine.last_status ? "#4cd964" : "#ff7e5f"} 
                      />
                      {medicine.last_status && (
                        <View style={styles.statusBadge}>
                          <FontAwesome name="check" size={10} color="#fff" />
                        </View>
                      )}
                      {isDueNow(medicine.time) && !medicine.last_status && (
                        <View style={styles.dueBadge}>
                          <MaterialCommunityIcons name="bell-ring" size={10} color="#fff" />
                        </View>
                      )}
                    </View>
                    
                    <View style={styles.medicationDetails}>
                      <Text style={styles.medicationName}>{medicine.name}</Text>
                      <Text style={styles.medicationDosage}>{medicine.dosage}</Text>
                      
                      <View style={styles.timeContainer}>
                        <Feather 
                          name="clock" 
                          size={14} 
                          color={medicine.last_status ? "#4cd964" : isDueNow(medicine.time) ? "#ff3b30" : "#8898aa"} 
                        />
                        <Text style={[
                          styles.medicationTime,
                          medicine.last_status && styles.takenTime,
                          isDueNow(medicine.time) && !medicine.last_status && styles.dueTime
                        ]}>
                          {formatTime(medicine.time)}
                        </Text>
                      </View>
                    </View>
                    
                    <View style={styles.statusContainer}>
                      {medicine.last_status ? (
                        <View style={styles.takenIndicator}>
                          <Text style={styles.takenText}>TAKEN</Text>
                        </View>
                      ) : (
                        <TouchableOpacity 
                          style={styles.takeButton}
                          onPress={() => handleMedicineTaken(medicine)}
                        >
                          <Text style={styles.takeButtonText}>Take</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        ) : (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="pill-off" size={60} color="#ddd" />
            <Text style={styles.emptyText}>No medications scheduled for today</Text>
            <TouchableOpacity 
              style={styles.addButton}
              onPress={goBack}
            >
              <Text style={styles.addButtonText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7fafc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 10 : StatusBar.currentHeight + 10,
    paddingBottom: 16,
    backgroundColor: '#ff7e5f',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderButton: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  scrollView: {
    flex: 1,
  },
  medicationsList: {
    marginBottom: 20,
  },
  medicationCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderLeftWidth: 4,
    borderLeftColor: '#ff7e5f',
  },
  medicationCardTaken: {
    borderLeftColor: '#4cd964',
    opacity: 0.8,
  },
  medicationContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  medicationIcon: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    backgroundColor: 'rgba(255, 126, 95, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    position: 'relative',
  },
  statusBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#4cd964',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dueBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#ff3b30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  medicationDetails: {
    flex: 1,
  },
  medicationName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#32325d',
    marginBottom: 4,
  },
  medicationDosage: {
    fontSize: 14,
    color: '#8898aa',
    marginBottom: 6,
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  medicationTime: {
    fontSize: 14,
    color: '#8898aa',
    marginLeft: 6,
  },
  takenTime: {
    color: '#4cd964',
  },
  dueTime: {
    color: '#ff3b30',
  },
  statusContainer: {
    marginLeft: 12,
  },
  takenIndicator: {
    backgroundColor: 'rgba(76, 217, 100, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 30,
  },
  takenText: {
    color: '#4cd964',
    fontSize: 12,
    fontWeight: 'bold',
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 16,
    color: '#8898aa',
    textAlign: 'center',
    marginVertical: 20,
  },
  addButton: {
    backgroundColor: '#ff7e5f',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 30,
    elevation: 2,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default AllMedications; 
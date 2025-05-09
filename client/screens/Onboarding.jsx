import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  StatusBar
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons, FontAwesome5, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { SERVER_URL } from '@env';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import DropDownPicker from 'react-native-dropdown-picker';
import { Chip } from 'react-native-paper';

const { width, height } = Dimensions.get('window');

const Onboarding = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [userData, setUserData] = useState(null);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Form data
  const [basicProfile, setBasicProfile] = useState({
    date_of_birth: new Date(),
    gender: '',
    phone_number: '',
  });

  const [healthProfile, setHealthProfile] = useState({
    health_conditions: [],
    allergies: [],
    height: '',
    weight: '',
    blood_type: '',
  });

  // Default medications data - will be submitted automatically
  const defaultMedications = [
    {
      name: "Vitamin D3",
      dosage: "1000 IU",
      frequency: "daily",
      time_of_day: "08:00",
      notes: "Take with breakfast"
    }
  ];

  // Dropdown states
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [genderOpen, setGenderOpen] = useState(false);
  const [genderItems, setGenderItems] = useState([
    { label: 'Male', value: 'male' },
    { label: 'Female', value: 'female' },
    { label: 'Other', value: 'other' },
    { label: 'Prefer not to say', value: 'not_specified' },
  ]);

  const [bloodTypeOpen, setBloodTypeOpen] = useState(false);
  const [bloodTypeItems, setBloodTypeItems] = useState([
    { label: 'A+', value: 'A+' },
    { label: 'A-', value: 'A-' },
    { label: 'B+', value: 'B+' },
    { label: 'B-', value: 'B-' },
    { label: 'AB+', value: 'AB+' },
    { label: 'AB-', value: 'AB-' },
    { label: 'O+', value: 'O+' },
    { label: 'O-', value: 'O-' },
    { label: 'Unknown', value: 'unknown' },
  ]);

  // New condition/allergy input fields
  const [newCondition, setNewCondition] = useState('');
  const [newAllergy, setNewAllergy] = useState('');

  // Add state to control zIndex dynamically
  const [zIndexes, setZIndexes] = useState({
    gender: 3000,
    bloodType: 2000
  });

  // Handle dropdown opening
  const handleOpenGender = (open) => {
    setGenderOpen(open);
    setZIndexes({
      gender: open ? 3000 : 1000,
      bloodType: open ? 1000 : 2000
    });
  };

  const handleOpenBloodType = (open) => {
    setBloodTypeOpen(open);
    setZIndexes({
      gender: open ? 1000 : 3000,
      bloodType: open ? 3000 : 1000
    });
  };

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const userDataString = await AsyncStorage.getItem('userData');
        if (userDataString) {
          const parsedUserData = JSON.parse(userDataString);
          setUserData(parsedUserData);
          
          // Set current onboarding step from stored data
          if (parsedUserData.onboardingStep) {
            setCurrentStep(parsedUserData.onboardingStep);
          }
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
      }
    };

    fetchUserData();

    // Check onboarding status from API
    checkOnboardingStatus();

    // Start animations
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();

    updateProgressAnimation(currentStep);
  }, []);

  useEffect(() => {
    updateProgressAnimation(currentStep);
  }, [currentStep]);

  // Update the progress animation to show only 2 steps total
  const updateProgressAnimation = (step) => {
    // Adjust to show only 2 steps (0 to 1)
    const progressValue = (step - 1);
    Animated.timing(progressAnim, {
      toValue: progressValue,
      duration: 300,
      useNativeDriver: false,
    }).start();
  };

  const checkOnboardingStatus = async () => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      
      if (!token) {
        navigation.replace('Login');
        return;
      }

      const response = await fetch(`${SERVER_URL}/api/onboarding/status`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
      });

      const data = await response.json();

      if (response.ok) {
        // If onboarding is already complete, go to home screen
        if (data.onboarding_complete) {
          navigation.replace('Home');
          return;
        }

        // Set current step from API response
        if (data.onboarding_step) {
          setCurrentStep(data.onboarding_step);
        }
      }
    } catch (error) {
      console.error("Error checking onboarding status:", error);
    }
  };

  const handleDateChange = (event, selectedDate) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setBasicProfile({...basicProfile, date_of_birth: selectedDate});
    }
  };

  const addHealthCondition = () => {
    if (newCondition.trim() !== '') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setHealthProfile({
        ...healthProfile,
        health_conditions: [...healthProfile.health_conditions, newCondition.trim()]
      });
      setNewCondition('');
    }
  };

  const removeHealthCondition = (index) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updatedConditions = [...healthProfile.health_conditions];
    updatedConditions.splice(index, 1);
    setHealthProfile({...healthProfile, health_conditions: updatedConditions});
  };

  const addAllergy = () => {
    if (newAllergy.trim() !== '') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setHealthProfile({
        ...healthProfile,
        allergies: [...healthProfile.allergies, newAllergy.trim()]
      });
      setNewAllergy('');
    }
  };

  const removeAllergy = (index) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updatedAllergies = [...healthProfile.allergies];
    updatedAllergies.splice(index, 1);
    setHealthProfile({...healthProfile, allergies: updatedAllergies});
  };

  const validateBasicProfile = () => {
    if (!basicProfile.gender) {
      Alert.alert('Required Field', 'Please select your gender');
      return false;
    }
    return true;
  };

  const validateHealthProfile = () => {
    if (healthProfile.health_conditions.length === 0) {
      Alert.alert('Health Information', 'Please add at least one health condition or "None" if not applicable');
      return false;
    }
    if (healthProfile.allergies.length === 0) {
      Alert.alert('Health Information', 'Please add at least one allergy or "None" if not applicable');
      return false;
    }
    return true;
  };

  const submitBasicProfile = async () => {
    if (!validateBasicProfile()) return;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setIsLoading(true);

      const token = await AsyncStorage.getItem('accessToken');
      
      // Format the date in ISO format (YYYY-MM-DD)
      const formattedDate = basicProfile.date_of_birth.toISOString().split('T')[0];
      
      const response = await fetch(`${SERVER_URL}/api/onboarding/profile/basic`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...basicProfile,
          date_of_birth: formattedDate
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to update basic profile');
      }

      // Update local user data
      const userDataString = await AsyncStorage.getItem('userData');
      if (userDataString) {
        const parsedUserData = JSON.parse(userDataString);
        await AsyncStorage.setItem('userData', JSON.stringify({
          ...parsedUserData,
          onboardingStep: 2
        }));
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCurrentStep(2);
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const submitHealthProfile = async () => {
    if (!validateHealthProfile()) return;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setIsLoading(true);

      const token = await AsyncStorage.getItem('accessToken');
      
      const response = await fetch(`${SERVER_URL}/api/onboarding/profile/health`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(healthProfile),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to update health profile');
      }

      // Since we're skipping step 3, automatically submit the default medications
      await submitDefaultMedications();

      // Update local user data
      const userDataString = await AsyncStorage.getItem('userData');
      if (userDataString) {
        const parsedUserData = JSON.parse(userDataString);
        await AsyncStorage.setItem('userData', JSON.stringify({
          ...parsedUserData,
          onboardingStep: 3,  // Mark as completed all steps
          onboardingComplete: true
        }));
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.replace('Home');
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const submitDefaultMedications = async () => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      
      const response = await fetch(`${SERVER_URL}/api/onboarding/medications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ medications: defaultMedications }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to add default medications');
      }

      // Complete onboarding
      await completeOnboarding();
      
      return true;
    } catch (error) {
      console.error("Error submitting default medications:", error);
      throw error;
    }
  };

  const completeOnboarding = async () => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      
      await fetch(`${SERVER_URL}/api/onboarding/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
      });
    } catch (error) {
      console.error("Error completing onboarding:", error);
    }
  };

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const renderStepIndicator = () => {
    return (
      <View style={styles.stepIndicator}>
        <View style={styles.progressBarContainer}>
          <Animated.View
            style={[
              styles.progressBar,
              { width: progressWidth }
            ]}
          />
        </View>
        <View style={styles.steps}>
          {[1, 2].map((step) => (
            <View key={step} style={styles.stepCircleContainer}>
              <View 
                style={[
                  styles.stepCircle, 
                  currentStep >= step ? styles.activeStep : {}
                ]}
              >
                {currentStep > step ? (
                  <MaterialCommunityIcons name="check" size={16} color="white" />
                ) : (
                  <Text style={currentStep === step ? styles.activeStepText : styles.stepText}>
                    {step}
                  </Text>
                )}
              </View>
              <Text style={styles.stepLabel}>
                {step === 1 ? 'Basics' : 'Health'}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderBasicProfileStep = () => {
    return (
      <View style={styles.scrollContent}>
        <View style={styles.stepHeader}>
          <MaterialCommunityIcons name="account-details" size={28} color="#ff7e5f" />
          <Text style={styles.stepTitle}>Basic Information</Text>
        </View>
        <Text style={styles.stepDescription}>
          Let's start with some basic information about you
        </Text>

        <ScrollView 
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled={true}
          contentContainerStyle={styles.formContainer}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.formGroup}>
            <Text style={styles.label}>Date of Birth</Text>
            <TouchableOpacity 
              style={styles.datePickerButton}
              onPress={() => {
                Haptics.selectionAsync();
                setShowDatePicker(true);
              }}
            >
              <Text style={styles.dateText}>
                {basicProfile.date_of_birth.toLocaleDateString()}
              </Text>
              <MaterialCommunityIcons name="calendar" size={20} color="#ff7e5f" />
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={basicProfile.date_of_birth}
                mode="date"
                display="default"
                onChange={handleDateChange}
                maximumDate={new Date()}
              />
            )}
          </View>

          <View style={[styles.formGroup, { zIndex: zIndexes.gender }]}>
            <Text style={styles.label}>Gender</Text>
            <DropDownPicker
              open={genderOpen}
              value={basicProfile.gender}
              items={genderItems}
              setOpen={handleOpenGender}
              setValue={(callback) => {
                if (typeof callback === 'function') {
                  setBasicProfile((prev) => ({ ...prev, gender: callback(prev.gender) }));
                } else {
                  setBasicProfile({ ...basicProfile, gender: callback });
                }
                Haptics.selectionAsync();
              }}
              setItems={setGenderItems}
              style={styles.dropdown}
              dropDownContainerStyle={styles.dropdownContainer}
              placeholderStyle={styles.placeholderStyle}
              placeholder="Select gender"
              listMode="SCROLLVIEW"
              scrollViewProps={{ nestedScrollEnabled: true }}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Phone Number (Optional)</Text>
            <View style={styles.inputContainer}>
              <MaterialCommunityIcons name="phone" size={20} color="#ff7e5f" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Enter your phone number"
                value={basicProfile.phone_number}
                onChangeText={(text) => setBasicProfile({...basicProfile, phone_number: text})}
                keyboardType="phone-pad"
              />
            </View>
          </View>

          <TouchableOpacity
            style={styles.nextButton}
            onPress={submitBasicProfile}
            activeOpacity={0.8}
            disabled={isLoading}
          >
            <LinearGradient
              colors={['#ff9966', '#ff5e62']}
              style={styles.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {isLoading ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <Text style={styles.nextButtonText}>Continue</Text>
                  <MaterialCommunityIcons name="arrow-right" size={20} color="white" />
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  };

  const renderHealthProfileStep = () => {
    return (
      <View style={styles.scrollContent}>
        <View style={styles.stepHeader}>
          <MaterialCommunityIcons name="heart-pulse" size={28} color="#ff7e5f" />
          <Text style={styles.stepTitle}>Health Information</Text>
        </View>
        <Text style={styles.stepDescription}>
          Tell us about your health conditions and allergies
        </Text>

        <ScrollView 
          showsVerticalScrollIndicator={false} 
          nestedScrollEnabled={true}
          contentContainerStyle={styles.formContainer}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.formGroup}>
            <Text style={styles.label}>Health Conditions</Text>
            <Text style={styles.helpText}>Add any chronic conditions or important health info</Text>
            <View style={styles.inputContainer}>
              <MaterialCommunityIcons name="hospital-box" size={20} color="#ff7e5f" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Enter a health condition"
                value={newCondition}
                onChangeText={setNewCondition}
                onSubmitEditing={addHealthCondition}
                returnKeyType="done"
              />
              <TouchableOpacity 
                style={styles.addButton}
                onPress={addHealthCondition}
              >
                <MaterialCommunityIcons name="plus" size={20} color="white" />
              </TouchableOpacity>
            </View>

            <View style={styles.chipContainer}>
              {healthProfile.health_conditions.map((condition, index) => (
                <Chip
                  key={index}
                  style={styles.chip}
                  textStyle={styles.chipText}
                  onClose={() => removeHealthCondition(index)}
                  onPress={() => {}}
                >
                  {condition}
                </Chip>
              ))}
              {healthProfile.health_conditions.length === 0 && (
                <Text style={styles.noItemsText}>No conditions added yet</Text>
              )}
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Allergies</Text>
            <Text style={styles.helpText}>Add any allergies to medications, foods, etc.</Text>
            <View style={styles.inputContainer}>
              <MaterialCommunityIcons name="alert-circle" size={20} color="#ff7e5f" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Enter an allergy"
                value={newAllergy}
                onChangeText={setNewAllergy}
                onSubmitEditing={addAllergy}
                returnKeyType="done"
              />
              <TouchableOpacity 
                style={styles.addButton}
                onPress={addAllergy}
              >
                <MaterialCommunityIcons name="plus" size={20} color="white" />
              </TouchableOpacity>
            </View>

            <View style={styles.chipContainer}>
              {healthProfile.allergies.map((allergy, index) => (
                <Chip
                  key={index}
                  style={styles.chip}
                  textStyle={styles.chipText}
                  onClose={() => removeAllergy(index)}
                  onPress={() => {}}
                >
                  {allergy}
                </Chip>
              ))}
              {healthProfile.allergies.length === 0 && (
                <Text style={styles.noItemsText}>No allergies added yet</Text>
              )}
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Height (Optional)</Text>
            <View style={styles.inputContainer}>
              <MaterialCommunityIcons name="human-male-height" size={20} color="#ff7e5f" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Enter your height (cm)"
                value={healthProfile.height}
                onChangeText={(text) => setHealthProfile({...healthProfile, height: text})}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Weight (Optional)</Text>
            <View style={styles.inputContainer}>
              <MaterialCommunityIcons name="weight" size={20} color="#ff7e5f" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Enter your weight (kg)"
                value={healthProfile.weight}
                onChangeText={(text) => setHealthProfile({...healthProfile, weight: text})}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={[styles.formGroup, { zIndex: zIndexes.bloodType }]}>
            <Text style={styles.label}>Blood Type (Optional)</Text>
            <DropDownPicker
              open={bloodTypeOpen}
              value={healthProfile.blood_type}
              items={bloodTypeItems}
              setOpen={handleOpenBloodType}
              setValue={(callback) => {
                if (typeof callback === 'function') {
                  setHealthProfile((prev) => ({ ...prev, blood_type: callback(prev.blood_type) }));
                } else {
                  setHealthProfile({ ...healthProfile, blood_type: callback });
                }
                Haptics.selectionAsync();
              }}
              setItems={setBloodTypeItems}
              style={styles.dropdown}
              dropDownContainerStyle={styles.dropdownContainer}
              placeholderStyle={styles.placeholderStyle}
              placeholder="Select blood type (if known)"
              listMode="SCROLLVIEW"
              scrollViewProps={{ nestedScrollEnabled: true }}
            />
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setCurrentStep(1);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.backButtonText}>Back</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.nextButton}
              onPress={submitHealthProfile}
              activeOpacity={0.8}
              disabled={isLoading}
            >
              <LinearGradient
                colors={['#ff9966', '#ff5e62']}
                style={styles.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {isLoading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <Text style={styles.nextButtonText}>Finish</Text>
                    <MaterialCommunityIcons name="check" size={20} color="white" />
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <StatusBar barStyle="dark-content" />
      
      <Animated.View style={{ opacity: fadeAnim, flex: 1 }}>
        {renderStepIndicator()}

        <View style={styles.contentContainer}>
          {currentStep === 1 && renderBasicProfileStep()}
          {currentStep === 2 && renderHealthProfileStep()}
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  stepIndicator: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  progressBarContainer: {
    height: 4,
    backgroundColor: '#f0f0f0',
    borderRadius: 2,
    marginBottom: 10,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#ff7e5f',
    borderRadius: 2,
  },
  steps: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  stepCircleContainer: {
    alignItems: 'center',
  },
  stepCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ddd',
  },
  activeStep: {
    backgroundColor: '#ff7e5f',
    borderColor: '#ff7e5f',
  },
  stepText: {
    color: '#888',
    fontWeight: 'bold',
  },
  activeStepText: {
    color: 'white',
    fontWeight: 'bold',
  },
  stepLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  contentContainer: {
    flex: 1,
    padding: 20,
  },
  scrollContent: {
    paddingBottom: 30,
  },
  formContainer: {
    paddingBottom: 40,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 10,
  },
  stepDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 6,
  },
  helpText: {
    fontSize: 12,
    color: '#888',
    marginBottom: 6,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f7f7f7',
    borderRadius: 10,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: '#eee',
  },
  input: {
    flex: 1,
    height: 55,
    fontSize: 16,
    color: '#333',
    paddingLeft: 5,
  },
  inputIcon: {
    marginRight: 10,
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f7f7f7',
    borderRadius: 10,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: '#eee',
    height: 55,
  },
  dateText: {
    fontSize: 16,
    color: '#333',
  },
  dropdown: {
    backgroundColor: '#f7f7f7',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
    height: 55,
    paddingHorizontal: 15,
  },
  dropdownContainer: {
    borderColor: '#eee',
    borderRadius: 10,
    borderWidth: 1,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  placeholderStyle: {
    color: '#aaa',
  },
  addButton: {
    backgroundColor: '#ff7e5f',
    borderRadius: 8,
    padding: 8,
    marginLeft: 10,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
    paddingHorizontal: 5,
  },
  chip: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ff7e5f',
    marginRight: 8,
    marginBottom: 8,
  },
  chipText: {
    color: '#ff7e5f',
  },
  noItemsText: {
    color: '#aaa',
    fontStyle: 'italic',
    padding: 8,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  nextButton: {
    flex: 1,
    height: 55,
    borderRadius: 10,
    overflow: 'hidden',
    shadowColor: '#ff7e5f',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  backButton: {
    width: 100,
    height: 55,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  backButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  gradient: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  nextButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: 8,
  },
  disabledButton: {
    opacity: 0.7,
  }
});

export default Onboarding;
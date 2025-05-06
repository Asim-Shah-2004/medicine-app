import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  StatusBar,
  ScrollView
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { SERVER_URL } from '@env';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

const Register = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    first_name: '',
    last_name: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [secureTextEntry, setSecureTextEntry] = useState(true);
  const [confirmSecureTextEntry, setConfirmSecureTextEntry] = useState(true);
  const [errors, setErrors] = useState({});
  const [currentStep, setCurrentStep] = useState(1);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const formSlideAnim = useRef(new Animated.Value(0)).current;

  // Refs for TextInputs
  const emailInputRef = useRef(null);
  const passwordInputRef = useRef(null);
  const confirmPasswordInputRef = useRef(null);
  const firstNameInputRef = useRef(null);
  const lastNameInputRef = useRef(null);

  React.useEffect(() => {
    // Start animations when component mounts
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  React.useEffect(() => {
    // Animate form slide when changing steps
    Animated.timing(formSlideAnim, {
      toValue: currentStep === 1 ? 0 : -width,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [currentStep]);

  const validateStep1 = () => {
    let newErrors = {};
    let isValid = true;

    if (!formData.username) {
      newErrors.username = 'Username is required';
      isValid = false;
    } else if (formData.username.length < 3) {
      newErrors.username = 'Username must be at least 3 characters';
      isValid = false;
    }

    if (!formData.email) {
      newErrors.email = 'Email is required';
      isValid = false;
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const validateStep2 = () => {
    let newErrors = {};
    let isValid = true;

    if (!formData.password) {
      newErrors.password = 'Password is required';
      isValid = false;
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
      isValid = false;
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
      isValid = false;
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
      isValid = false;
    }

    if (!formData.first_name) {
      newErrors.first_name = 'First name is required';
      isValid = false;
    }

    if (!formData.last_name) {
      newErrors.last_name = 'Last name is required';
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleNextStep = () => {
    if (validateStep1()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setCurrentStep(2);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleChange = (field, value) => {
    setFormData({
      ...formData,
      [field]: value,
    });
    // Clear error when user types
    if (errors[field]) {
      setErrors({
        ...errors,
        [field]: null,
      });
    }
  };

  const handleRegister = async () => {
    if (!validateStep2()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsLoading(true);

    try {
      // Register the user
      console.log(SERVER_URL);
      
      const response = await fetch(`${SERVER_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: formData.username,
          email: formData.email,
          password: formData.password,
          first_name: formData.first_name,
          last_name: formData.last_name,
        }),
      });
      console.log(response);
      
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Registration failed');
      }

      // Login automatically after successful registration
      const loginResponse = await fetch(`${SERVER_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
        }),
      });

      const loginData = await loginResponse.json();

      if (!loginResponse.ok) {
        // Registration was successful but login failed
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          'Registration Successful',
          'You can now log in with your new account.',
          [
            {
              text: 'OK',
              onPress: () => navigation.navigate('Login'),
            },
          ]
        );
        return;
      }

      // Store tokens and user data in AsyncStorage
      await AsyncStorage.setItem('accessToken', loginData.access_token);
      await AsyncStorage.setItem('refreshToken', loginData.refresh_token);
      await AsyncStorage.setItem('userData', JSON.stringify({
        userId: loginData.user_id,
        email: loginData.email,
        firstName: loginData.first_name,
        lastName: loginData.last_name,
        onboardingComplete: false, // Ensure we go to onboarding
        onboardingStep: 1
      }));

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      // Navigate to Onboarding screen immediately after registration
      navigation.replace('Onboarding');
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Registration Failed', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentStep(1);
  };

  const animatedPillStyle = {
    transform: [
      { translateY: slideAnim },
      { scale: scaleAnim }
    ],
    opacity: fadeAnim,
  };

  const renderStep1 = () => (
    <Animated.View 
      style={[
        styles.formContainer, 
        { transform: [{ translateX: formSlideAnim }] }
      ]}
    >
      <Text style={styles.headerText}>Create Account</Text>
      <Text style={styles.subHeaderText}>Step 1 of 2</Text>

      <View style={styles.inputContainer}>
        <MaterialCommunityIcons name="account-outline" size={20} color="#ff7e5f" style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder="Username"
          value={formData.username}
          onChangeText={(text) => handleChange('username', text)}
          autoCapitalize="none"
          returnKeyType="next"
          onSubmitEditing={() => emailInputRef.current.focus()}
          blurOnSubmit={false}
        />
      </View>
      {errors.username && <Text style={styles.errorText}>{errors.username}</Text>}

      <View style={styles.inputContainer}>
        <MaterialCommunityIcons name="email-outline" size={20} color="#ff7e5f" style={styles.inputIcon} />
        <TextInput
          ref={emailInputRef}
          style={styles.input}
          placeholder="Email"
          value={formData.email}
          onChangeText={(text) => handleChange('email', text)}
          keyboardType="email-address"
          autoCapitalize="none"
          returnKeyType="done"
        />
      </View>
      {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}

      <TouchableOpacity
        style={styles.nextButton}
        onPress={handleNextStep}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={['#ff9966', '#ff5e62']}
          style={styles.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <Text style={styles.buttonText}>Next</Text>
        </LinearGradient>
      </TouchableOpacity>

      <View style={styles.registerContainer}>
        <Text style={styles.registerText}>Already have an account? </Text>
        <TouchableOpacity 
          onPress={() => {
            Haptics.selectionAsync();
            navigation.navigate('Login');
          }}
        >
          <Text style={styles.registerLink}>Sign In</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );

  const renderStep2 = () => (
    <Animated.View 
      style={[
        styles.formContainer, 
        { transform: [{ translateX: formSlideAnim.interpolate({
          inputRange: [-width, 0],
          outputRange: [0, width]
        }) }] }
      ]}
    >
      <Text style={styles.headerText}>Complete Profile</Text>
      <Text style={styles.subHeaderText}>Step 2 of 2</Text>

      <View style={styles.inputContainer}>
        <MaterialCommunityIcons name="lock-outline" size={20} color="#ff7e5f" style={styles.inputIcon} />
        <TextInput
          ref={passwordInputRef}
          style={styles.input}
          placeholder="Password"
          value={formData.password}
          onChangeText={(text) => handleChange('password', text)}
          secureTextEntry={secureTextEntry}
          returnKeyType="next"
          onSubmitEditing={() => confirmPasswordInputRef.current.focus()}
          blurOnSubmit={false}
        />
        <TouchableOpacity 
          style={styles.eyeIcon}
          onPress={() => {
            Haptics.selectionAsync();
            setSecureTextEntry(!secureTextEntry);
          }}
        >
          <MaterialCommunityIcons 
            name={secureTextEntry ? "eye-outline" : "eye-off-outline"} 
            size={20} 
            color="#888" 
          />
        </TouchableOpacity>
      </View>
      {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}

      <View style={styles.inputContainer}>
        <MaterialCommunityIcons name="lock-check-outline" size={20} color="#ff7e5f" style={styles.inputIcon} />
        <TextInput
          ref={confirmPasswordInputRef}
          style={styles.input}
          placeholder="Confirm Password"
          value={formData.confirmPassword}
          onChangeText={(text) => handleChange('confirmPassword', text)}
          secureTextEntry={confirmSecureTextEntry}
          returnKeyType="next"
          onSubmitEditing={() => firstNameInputRef.current.focus()}
          blurOnSubmit={false}
        />
        <TouchableOpacity 
          style={styles.eyeIcon}
          onPress={() => {
            Haptics.selectionAsync();
            setConfirmSecureTextEntry(!confirmSecureTextEntry);
          }}
        >
          <MaterialCommunityIcons 
            name={confirmSecureTextEntry ? "eye-outline" : "eye-off-outline"} 
            size={20} 
            color="#888" 
          />
        </TouchableOpacity>
      </View>
      {errors.confirmPassword && <Text style={styles.errorText}>{errors.confirmPassword}</Text>}

      <View style={styles.inputContainer}>
        <MaterialCommunityIcons name="account-outline" size={20} color="#ff7e5f" style={styles.inputIcon} />
        <TextInput
          ref={firstNameInputRef}
          style={styles.input}
          placeholder="First Name"
          value={formData.first_name}
          onChangeText={(text) => handleChange('first_name', text)}
          returnKeyType="next"
          onSubmitEditing={() => lastNameInputRef.current.focus()}
          blurOnSubmit={false}
        />
      </View>
      {errors.first_name && <Text style={styles.errorText}>{errors.first_name}</Text>}

      <View style={styles.inputContainer}>
        <MaterialCommunityIcons name="account-outline" size={20} color="#ff7e5f" style={styles.inputIcon} />
        <TextInput
          ref={lastNameInputRef}
          style={styles.input}
          placeholder="Last Name"
          value={formData.last_name}
          onChangeText={(text) => handleChange('last_name', text)}
          returnKeyType="done"
          onSubmitEditing={handleRegister}
        />
      </View>
      {errors.last_name && <Text style={styles.errorText}>{errors.last_name}</Text>}

      <View style={styles.buttonRow}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={handleBack}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#ff9966', '#ff8e62']}
            style={styles.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <MaterialCommunityIcons name="arrow-left" size={20} color="#ffffff" />
            <Text style={styles.backButtonText}>Back</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.registerButton}
          onPress={handleRegister}
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
              <Text style={styles.buttonText}>Sign Up</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="dark-content" />
  
      <Animated.View style={[styles.logoContainer, animatedPillStyle]}>
        <LinearGradient
          colors={['#ff9966', '#ff5e62']}
          style={styles.logoBackground}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <MaterialCommunityIcons name="pill" size={40} color="white" />
        </LinearGradient>
        <Text style={styles.logoText}>MedRemind</Text>
      </Animated.View>
  
      <View style={styles.formSliderContainer}>
        {renderStep1()}
        {renderStep2()}
      </View>
    </KeyboardAvoidingView>
  );
  
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 20,
  },
  logoBackground: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ff7e5f',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  logoText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#ff7e5f',
    marginTop: 10,
  },
  formSliderContainer: {
    position: 'relative',
    overflow: 'hidden',
    width: '100%',
    height: 500, // Increased height to accommodate all form fields
  },
  formContainer: {
    position: 'absolute',
    width: width - 40,
  },
  headerText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  subHeaderText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 30,
    textAlign: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
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
  eyeIcon: {
    padding: 10,
  },
  errorText: {
    color: '#ff5e62',
    fontSize: 12,
    marginBottom: 10,
    marginLeft: 5,
  },
  nextButton: {
    width: '100%',
    height: 55,
    borderRadius: 10,
    marginBottom: 20,
    overflow: 'hidden',
    shadowColor: '#ff7e5f',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  registerButton: {
    flex: 1,
    height: 55,
    borderRadius: 10,
    marginBottom: 20,
    overflow: 'hidden',
    shadowColor: '#ff7e5f',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  gradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  registerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 10,
  },
  registerText: {
    color: '#666',
    fontSize: 16,
  },
  registerLink: {
    color: '#ff7e5f',
    fontSize: 16,
    fontWeight: 'bold',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  backButton: {
    width: 100,
    height: 55,
    borderRadius: 10,
    overflow: 'hidden',
    shadowColor: '#ff9966',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 5,
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 5,
  }
});

export default Register;
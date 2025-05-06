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
  }, [currentStep, width]);
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
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsLoading(true);

    try {
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

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Registration failed');
      }

      // Registration successful
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
    } catch (error) {
      Alert.alert('Registration Failed', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentStep(1);
  };

  const toggleSecureEntry = () => {
    setSecureTextEntry(!secureTextEntry);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const toggleConfirmSecureEntry = () => {
    setConfirmSecureTextEntry(!confirmSecureTextEntry);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const renderStep1 = () => (
    <Animated.View 
      style={[
        styles.formContainer, 
        { transform: [{ translateX: formSlideAnim }] }
      ]}
    >
      <Text style={styles.stepIndicator}>Step 1 of 2</Text>
      <View style={styles.inputContainer}>
        <MaterialCommunityIcons name="account" size={24} color="#ff7e5f" style={styles.inputIcon} />
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
        <MaterialCommunityIcons name="email" size={24} color="#ff7e5f" style={styles.inputIcon} />
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

      <TouchableOpacity style={styles.button} onPress={handleNextStep} activeOpacity={0.8}>
        <Text style={styles.buttonText}>Next</Text>
      </TouchableOpacity>

      <View style={styles.footerContainer}>
        <Text style={styles.footerText}>Already have an account? </Text>
        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
          <Text style={styles.footerLink}>Login</Text>
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
      <Text style={styles.stepIndicator}>Step 2 of 2</Text>

      <View style={styles.inputContainer}>
        <MaterialCommunityIcons name="lock" size={24} color="#ff7e5f" style={styles.inputIcon} />
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
        <TouchableOpacity style={styles.eyeIcon} onPress={toggleSecureEntry}>
          <MaterialCommunityIcons
            name={secureTextEntry ? 'eye-off' : 'eye'}
            size={24}
            color="#6b7280"
          />
        </TouchableOpacity>
      </View>
      {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}

      <View style={styles.inputContainer}>
        <MaterialCommunityIcons name="lock-check" size={24} color="#ff7e5f" style={styles.inputIcon} />
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
        <TouchableOpacity style={styles.eyeIcon} onPress={toggleConfirmSecureEntry}>
          <MaterialCommunityIcons
            name={confirmSecureTextEntry ? 'eye-off' : 'eye'}
            size={24}
            color="#6b7280"
          />
        </TouchableOpacity>
      </View>
      {errors.confirmPassword && <Text style={styles.errorText}>{errors.confirmPassword}</Text>}

      <View style={styles.inputContainer}>
        <MaterialCommunityIcons name="badge-account" size={24} color="#ff7e5f" style={styles.inputIcon} />
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
        <MaterialCommunityIcons name="account-box" size={24} color="#ff7e5f" style={styles.inputIcon} />
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
        <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.8}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#ffffff" />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.button, { flex: 1 }]} 
          onPress={handleRegister} 
          activeOpacity={0.8}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Register</Text>
          )}
        </TouchableOpacity>
      </View>
    </Animated.View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="dark-content" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ScrollView 
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={[
              styles.headerContainer,
              {
                opacity: fadeAnim,
                transform: [
                  { translateY: slideAnim },
                  { scale: scaleAnim },
                ],
              },
            ]}
          >
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
        </ScrollView>
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
  scrollContainer: {
    flexGrow: 1,
    paddingBottom: 30,
  },
  headerContainer: {
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
    height: 460, // Adjust based on your form size
  },
  formContainer: {
    position: 'absolute',
    width: width - 40, // Account for padding
  },
  stepIndicator: {
    textAlign: 'center',
    marginBottom: 15,
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f7f7f7',
    borderRadius: 10,
    marginBottom: 12,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: '#eee',
  },
  inputIcon: {
    marginRight: 10,
    color: '#ff7e5f',
  },
  input: {
    flex: 1,
    height: 55,
    fontSize: 16,
    color: '#333',
    paddingLeft: 5,
  },
  eyeIcon: {
    padding: 5,
  },
  errorText: {
    color: '#ff5e62',
    fontSize: 12,
    marginTop: -8,
    marginBottom: 8,
    marginLeft: 5,
  },
  button: {
    backgroundColor: '#ff7e5f',
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#ff7e5f',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
    height: 55,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 10,
  },
  backButton: {
    backgroundColor: '#ff9966',
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
    width: 100,
  },
  backButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 5,
  },
  footerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  footerText: {
    color: '#666',
    fontSize: 14,
  },
  footerLink: {
    color: '#ff7e5f',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default Register;
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Dimensions,
  Animated,
} from 'react-native';
import { Ionicons, MaterialIcons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SERVER_URL } from '@env';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

const { width, height } = Dimensions.get('window');

const EmergencyScreen = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [hasContacts, setHasContacts] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRecordingLoaded, setIsRecordingLoaded] = useState(false);
  const pulseAnim = React.useRef(new Animated.Value(1)).current;
  const recording = React.useRef(null);

  // Check contacts when screen comes into focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchUserProfile();
    });

    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    fetchUserProfile();
    
    // Pulse animation for the microphone
    const startPulseAnimation = () => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    };

    if (isListening) {
      startPulseAnimation();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }

    // Cleanup recording when component unmounts
    return () => {
      if (recording.current && isRecordingLoaded) {
        recording.current.stopAndUnloadAsync();
      }
    };
  }, [isRecordingLoaded]);

  const fetchUserProfile = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('accessToken');

      if (!token) {
        navigation.replace('Login');
        return;
      }

      const response = await fetch(`${SERVER_URL}/api/user/profile`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        setProfile(data);
        const contacts = data.emergency_contacts || [];
        setHasContacts(contacts.length > 0);
      } else {
        showToast('Error', data.message || 'Failed to load profile');
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      showToast('Error', 'Failed to load profile. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const startRecording = async () => {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recording.current = newRecording;
      setIsRecordingLoaded(true);
      setIsListening(true);
    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert('Error', 'Failed to start recording. Please try again.');
    }
  };

  const stopRecording = async () => {
    try {
      if (!recording.current || !isRecordingLoaded) return;

      setIsListening(false);
      setIsProcessing(true);

      await recording.current.stopAndUnloadAsync();
      const uri = recording.current.getURI();
      setIsRecordingLoaded(false);
      recording.current = null;

      // Send the recording to backend
      await sendEmergencyMessage(uri);
    } catch (err) {
      console.error('Failed to stop recording', err);
      setIsListening(false);
      setIsProcessing(false);
      setIsRecordingLoaded(false);
      Alert.alert('Error', 'Failed to process recording. Please try again.');
    }
  };

  const sendEmergencyMessage = async (audioUri) => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      
      // Create form data with both audio file and text transcription request
      const formData = new FormData();
      formData.append('audio', {
        uri: audioUri,
        type: 'audio/m4a',
        name: 'emergency_message.m4a'
      });
      formData.append('transcribe', 'true');  // Request transcription from server

      const response = await fetch(`${SERVER_URL}/api/help`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
        body: formData
      });

      const data = await response.json();

      if (response.ok) {
        Alert.alert(
          "Emergency Alert Sent",
          data.message || "Your emergency message has been sent to your contacts",
          [{ text: "OK" }]
        );
      } else {
        throw new Error(data.message || 'Failed to send emergency message');
      }
    } catch (error) {
      console.error('Error sending emergency message:', error);
      Alert.alert(
        "Error",
        "Failed to send emergency message. Please try again."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const showToast = (title, message) => {
    Alert.alert(title, message);
  };

  const handleMicPress = async () => {
    if (!hasContacts) {
      navigation.navigate('Profile');
      return;
    }
    
    if (!isListening) {
      await startRecording();
    } else {
      await stopRecording();
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ff5e62" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#ff9966', '#ff5e62']}
        style={styles.header}
      >
        <Text style={styles.headerTitle}>Emergency Assistance</Text>
      </LinearGradient>

      <View style={styles.content}>
        {hasContacts ? (
          <View style={styles.emergencyAvailable}>
            <View style={styles.micContainer}>
              <TouchableOpacity
                onPress={handleMicPress}
                activeOpacity={0.7}
                disabled={isProcessing}
              >
                <Animated.View
                  style={[
                    styles.micCircle,
                    {
                      transform: [{ scale: isListening ? pulseAnim : 1 }],
                      backgroundColor: isListening ? '#ff5e62' : '#fff',
                    },
                  ]}
                >
                  {isProcessing ? (
                    <ActivityIndicator size="large" color="#ff5e62" />
                  ) : (
                    <Ionicons
                      name="mic"
                      size={50}
                      color={isListening ? '#fff' : '#ff5e62'}
                    />
                  )}
                </Animated.View>
              </TouchableOpacity>
            </View>
            
            <Text style={styles.instructionText}>
              {isListening
                ? "I'm listening... Describe your emergency"
                : isProcessing
                ? "Processing your request..."
                : "Tap the microphone and describe your emergency"}
            </Text>
            
            <View style={styles.infoBox}>
              <MaterialIcons name="info-outline" size={24} color="#ff5e62" style={styles.infoIcon} />
              <Text style={styles.infoText}>
                Your voice message will be sent to your emergency contacts along with your current location
              </Text>
            </View>
            
            <View style={styles.contactsCount}>
              <Feather name="users" size={20} color="#666" />
              <Text style={styles.contactsCountText}>
                {profile?.emergency_contacts?.length || 0} Emergency Contacts Added
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.emergencyUnavailable}>
            <View style={styles.noContactsIcon}>
              <Feather name="users" size={60} color="#ff5e62" />
            </View>
            <Text style={styles.noContactsTitle}>No Emergency Contacts</Text>
            <Text style={styles.noContactsDescription}>
              Please add emergency contacts from your profile to activate the emergency assistance feature
            </Text>
            
            <TouchableOpacity
              style={styles.addContactsButton}
              onPress={() => navigation.navigate('Profile')}
            >
              <LinearGradient
                colors={['#ff9966', '#ff5e62']}
                start={{x: 0, y: 0}}
                end={{x: 1, y: 0}}
                style={styles.addContactsGradient}
              >
                <Feather name="plus" size={20} color="#fff" style={styles.addIcon} />
                <Text style={styles.addContactsText}>Add Emergency Contacts</Text>
              </LinearGradient>
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
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  header: {
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emergencyAvailable: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micContainer: {
    marginBottom: 30,
  },
  micCircle: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 10,
  },
  instructionText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginBottom: 30,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 20,
    alignItems: 'center',
    width: '90%',
  },
  infoIcon: {
    marginRight: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  contactsCount: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
  },
  contactsCountText: {
    marginLeft: 8,
    fontSize: 15,
    color: '#666',
  },
  emergencyUnavailable: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noContactsIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  noContactsTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  noContactsDescription: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
    paddingHorizontal: 20,
    lineHeight: 24,
  },
  addContactsButton: {
    width: '80%',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  addContactsGradient: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
  },
  addIcon: {
    marginRight: 8,
  },
  addContactsText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default EmergencyScreen;
import React, { useState, useEffect, useRef } from 'react';
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
  ToastAndroid,
  Platform,
} from 'react-native';
import { Ionicons, MaterialIcons, Feather, FontAwesome } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SERVER_URL } from '@env';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as Location from 'expo-location';
import MapView, { Marker, Polyline } from 'react-native-maps';
import Toast from 'react-native-toast-message';

const { width, height } = Dimensions.get('window');

const EmergencyScreen = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [hasContacts, setHasContacts] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRecordingLoaded, setIsRecordingLoaded] = useState(false);
  const [location, setLocation] = useState(null);
  const [locationPermission, setLocationPermission] = useState(false);
  const [nearbyHospitals, setNearbyHospitals] = useState([]);
  const [showMap, setShowMap] = useState(false);
  const [selectedHospital, setSelectedHospital] = useState(null);
  const [route, setRoute] = useState(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const recording = useRef(null);
  const mapRef = useRef(null);

  // Check contacts when screen comes into focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchUserProfile();
      getLocationPermission();
    });

    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    fetchUserProfile();
    getLocationPermission();
    
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

  // Get location permission and current location
  const getLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        setLocationPermission(true);
        const currentLocation = await Location.getCurrentPositionAsync({});
        setLocation(currentLocation);
        console.log('Current location:', currentLocation.coords);
        
        // Find nearby hospitals when location is available
        if (currentLocation) {
          findRealNearbyHospitals(currentLocation.coords);
        }
      }
    } catch (error) {
      console.error('Error getting location permission:', error);
    }
  };

  // Find real nearest hospital using OpenStreetMap API
  const findRealNearbyHospitals = async (coords) => {
    try {
      setLoading(true);
      const { latitude, longitude } = coords;
      
      // Call OpenStreetMap's Nominatim API to find hospitals
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=hospital,clinic,medical&limit=5&lat=${latitude}&lon=${longitude}&radius=5000`,
        {
          headers: {
            'Accept-Language': 'en-US,en',
            'User-Agent': 'MedicineApp/1.0' // Required by OSM policy
          }
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch hospitals');
      }
      
      const data = await response.json();
      console.log('Found hospitals:', data);
      
      // Transform the data into a format we can use
      const hospitals = data.map((item, index) => {
        // Calculate rough distance using Haversine formula
        const distance = calculateDistance(
          coords.latitude,
          coords.longitude,
          parseFloat(item.lat),
          parseFloat(item.lon)
        );
        
        return {
          id: index + 1,
          name: item.display_name.split(',')[0], // Get the first part of the name
          fullName: item.display_name,
          distance: `${distance.toFixed(1)} km`,
          distanceValue: distance,
          coordinate: {
            latitude: parseFloat(item.lat),
            longitude: parseFloat(item.lon),
          },
          type: item.type,
          osm_id: item.osm_id
        };
      });
      
      // Sort by distance
      hospitals.sort((a, b) => a.distanceValue - b.distanceValue);
      
      setNearbyHospitals(hospitals);
      
      // Automatically select the nearest hospital
      if (hospitals.length > 0) {
        const nearestHospital = hospitals[0];
        setSelectedHospital(nearestHospital);
        getRouteToHospital(nearestHospital);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error finding nearest hospital:', error);
      Alert.alert('Error', 'Failed to find nearest hospital. Using simulated data instead.');
      
      // Fallback to simulated data if API fails
      const simulatedHospitals = [
        {
          id: 1,
          name: 'City General Hospital',
          distance: '1.2 km',
          distanceValue: 1.2,
          coordinate: {
            latitude: coords.latitude + 0.01,
            longitude: coords.longitude + 0.01,
          },
        },
        {
          id: 2,
          name: 'Community Medical Center',
          distance: '2.5 km',
          distanceValue: 2.5,
          coordinate: {
            latitude: coords.latitude - 0.01,
            longitude: coords.longitude + 0.005,
          },
        },
        {
          id: 3,
          name: 'University Hospital',
          distance: '3.8 km',
          distanceValue: 3.8,
          coordinate: {
            latitude: coords.latitude + 0.005,
            longitude: coords.longitude - 0.01,
          },
        },
      ];
      
      setNearbyHospitals(simulatedHospitals);
      
      // Select the nearest hospital from simulated data
      const nearestHospital = simulatedHospitals[0];
      setSelectedHospital(nearestHospital);
      getRouteToHospital(nearestHospital);
      
      setLoading(false);
    }
  };
  
  // Calculate distance using Haversine formula (for rough distance estimation)
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
    const distance = R * c; // Distance in km
    return distance;
  };
  
  const deg2rad = (deg) => {
    return deg * (Math.PI / 180);
  };

  // Get real route using OSRM (OpenStreetMap Routing Machine) API
  const getRouteToHospital = async (hospital) => {
    try {
      if (!location || !hospital) return null;
      
      setLoading(true);
      
      const startCoords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
      
      // Call OSRM API for route planning
      const response = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${startCoords.longitude},${startCoords.latitude};${hospital.coordinate.longitude},${hospital.coordinate.latitude}?overview=full&geometries=geojson`
      );
      
      if (!response.ok) {
        throw new Error('Failed to calculate route');
      }
      
      const data = await response.json();
      console.log('Route data:', data);
      
      if (data.routes && data.routes.length > 0) {
        // OSRM returns coordinates as [longitude, latitude], but we need [latitude, longitude]
        const routeCoordinates = data.routes[0].geometry.coordinates.map(coord => ({
          latitude: coord[1],
          longitude: coord[0]
        }));
        
        setRoute(routeCoordinates);
        setSelectedHospital(hospital);
        
        // Center the map to show the route
        if (mapRef.current) {
          mapRef.current.fitToCoordinates(routeCoordinates, {
            edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
            animated: true,
          });
        }
        
        setLoading(false);
      } else {
        throw new Error('No route found');
      }
    } catch (error) {
      console.error('Error getting route:', error);
      Alert.alert('Error', 'Failed to calculate route. Using direct line instead.');
      
      // Fallback to direct line if API fails
      const startCoords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
      
      // Create a simple straight line route as fallback
      const waypoints = [
        startCoords,
        {
          latitude: (startCoords.latitude + hospital.coordinate.latitude) / 2,
          longitude: (startCoords.longitude + hospital.coordinate.longitude) / 2,
        },
        hospital.coordinate,
      ];
      
      setRoute(waypoints);
      setSelectedHospital(hospital);
      
      // Center the map to show the route
      if (mapRef.current) {
        mapRef.current.fitToCoordinates(waypoints, {
          edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
          animated: true,
        });
      }
      
      setLoading(false);
    }
  };

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
      
      // Get current location if not already available
      let currentLocation = location;
      if (!currentLocation && locationPermission) {
        currentLocation = await Location.getCurrentPositionAsync({});
        setLocation(currentLocation);
      }
      
      // Create form data with audio file, transcription request, and user data
      const formData = new FormData();
      formData.append('audio', {
        uri: audioUri,
        type: 'audio/m4a',
        name: 'emergency_message.m4a'
      });
      formData.append('transcribe', 'true');
      
      // Add coordinates if available - only once
      if (currentLocation) {
        const coordinates = {
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude,
          accuracy: currentLocation.coords.accuracy,
        };
        formData.append('coordinates', JSON.stringify(coordinates));
        
        // Print coordinates for debugging
        console.log('Coordinates:', JSON.stringify(coordinates, null, 2));
      }
      
      // Add complete user profile - only once
      formData.append('current_user', JSON.stringify(profile));
      
      // Print user profile for debugging
      console.log('User Profile:', JSON.stringify(profile, null, 2));

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
        // Print transcribed audio if available
        if (data.transcription) {
          console.log('Transcribed Audio:', data.transcription);
        }
        
        // Show toast with contacts notified
        const contactsNames = profile.emergency_contacts.map(c => c.name).join(', ');
        displayToast('Emergency Alert Sent', `Notified: ${contactsNames}`);
        
        // Show map with routes to nearby hospitals
        setShowMap(true);
        
        // If we have nearby hospitals, show route to the closest one
        if (nearbyHospitals.length > 0) {
          getRouteToHospital(nearbyHospitals[0]);
        }
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

  const displayToast = (title, message) => {
    // Show toast message based on platform
    if (Platform.OS === 'android') {
      ToastAndroid.showWithGravity(
        `${title}: ${message}`,
        ToastAndroid.LONG,
        ToastAndroid.TOP
      );
    } else {
      // For iOS, use Alert as a fallback or a proper Toast library
      Toast.show({
        type: 'success',
        text1: title,
        text2: message,
      });
    }
    
    // Also log to console
    console.log(`${title}: ${message}`);
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

  // Handle selecting a hospital from the list
  const selectHospital = (hospital) => {
    getRouteToHospital(hospital);
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
        {showMap ? (
          <View style={styles.mapContainer}>
            <Text style={styles.mapTitle}>Nearest Medical Facility</Text>
            
            <MapView
              ref={mapRef}
              style={styles.map}
              initialRegion={location ? {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              } : null}
              showsUserLocation={true}
              showsMyLocationButton={true}
              showsCompass={true}
              showsTraffic={true}
              loadingEnabled={true}
            >
              {/* User's current location */}
              {location && (
                <Marker
                  coordinate={{
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude,
                  }}
                  title="Your Location"
                  pinColor="blue"
                >
                  <View style={styles.userMarker}>
                    <FontAwesome name="user" size={16} color="#fff" />
                  </View>
                </Marker>
              )}
              
              {/* Nearby hospitals */}
              {nearbyHospitals.map(hospital => (
                <Marker
                  key={hospital.id}
                  coordinate={hospital.coordinate}
                  title={hospital.name}
                  description={hospital.fullName || `Distance: ${hospital.distance}`}
                  pinColor={selectedHospital?.id === hospital.id ? 'green' : 'red'}
                  onPress={() => selectHospital(hospital)}
                >
                  <View style={[
                    styles.hospitalMarker,
                    selectedHospital?.id === hospital.id && styles.selectedHospitalMarker
                  ]}>
                    <FontAwesome name="hospital-o" size={16} color="#fff" />
                  </View>
                </Marker>
              ))}
              
              {/* Route to selected hospital */}
              {route && (
                <Polyline
                  coordinates={route}
                  strokeWidth={4}
                  strokeColor="#ff5e62"
                  strokeColors={[
                    '#ff9966',
                    '#ff5e62',
                  ]}
                  lineDashPattern={[0]}
                />
              )}
            </MapView>
            
            {/* Hospital details card */}
            {selectedHospital && (
              <View style={styles.hospitalDetailCard}>
                <View style={styles.hospitalHeaderRow}>
                  <FontAwesome name="hospital-o" size={24} color="#ff5e62" />
                  <Text style={styles.hospitalDetailName}>{selectedHospital.name}</Text>
                  <Text style={styles.hospitalDetailDistance}>{selectedHospital.distance}</Text>
                </View>
                
                {selectedHospital.fullName && (
                  <Text style={styles.hospitalAddress} numberOfLines={2}>
                    {selectedHospital.fullName}
                  </Text>
                )}
                
                <View style={styles.actionButtonsRow}>
                  <TouchableOpacity style={styles.actionButton}>
                    <FontAwesome name="phone" size={18} color="#fff" />
                    <Text style={styles.actionButtonText}>Call</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity style={styles.actionButton}>
                    <FontAwesome name="share-alt" size={18} color="#fff" />
                    <Text style={styles.actionButtonText}>Share</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={styles.actionButton}
                    onPress={() => {
                      if (selectedHospital) {
                        getRouteToHospital(selectedHospital);
                      }
                    }}
                  >
                    <FontAwesome name="refresh" size={18} color="#fff" />
                    <Text style={styles.actionButtonText}>Reroute</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            
            <View style={styles.hospitalsList}>
              <Text style={styles.hospitalsListTitle}>Nearest Medical Facility:</Text>
              
              {loading ? (
                <View style={styles.loadingHospitals}>
                  <ActivityIndicator size="small" color="#ff5e62" />
                  <Text style={styles.loadingHospitalsText}>Finding nearest hospital...</Text>
                </View>
              ) : nearbyHospitals.length === 0 ? (
                <Text style={styles.noHospitalsText}>No nearby hospital found</Text>
              ) : (
                nearbyHospitals.map(hospital => (
                  <TouchableOpacity
                    key={hospital.id}
                    style={[
                      styles.hospitalItem,
                      selectedHospital?.id === hospital.id && styles.selectedHospitalItem
                    ]}
                    onPress={() => selectHospital(hospital)}
                  >
                    <FontAwesome
                      name="hospital-o"
                      size={16}
                      color={selectedHospital?.id === hospital.id ? '#fff' : '#ff5e62'}
                      style={styles.hospitalIcon}
                    />
                    <View style={styles.hospitalDetails}>
                      <Text style={[
                        styles.hospitalName,
                        selectedHospital?.id === hospital.id && styles.selectedHospitalText
                      ]}>
                        {hospital.name}
                      </Text>
                      <Text style={[
                        styles.hospitalDistance,
                        selectedHospital?.id === hospital.id && styles.selectedHospitalText
                      ]}>
                        {hospital.distance}
                      </Text>
                    </View>
                    <FontAwesome
                      name="chevron-right"
                      size={14}
                      color={selectedHospital?.id === hospital.id ? '#fff' : '#999'}
                    />
                  </TouchableOpacity>
                ))
              )}
              
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => setShowMap(false)}
              >
                <Text style={styles.backButtonText}>Back to Emergency</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : hasContacts ? (
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
            
            {!locationPermission && (
              <TouchableOpacity
                style={styles.locationButton}
                onPress={getLocationPermission}
              >
                <LinearGradient
                  colors={['#ff9966', '#ff5e62']}
                  start={{x: 0, y: 0}}
                  end={{x: 1, y: 0}}
                  style={styles.locationGradient}
                >
                  <MaterialIcons name="location-on" size={20} color="#fff" style={styles.locationIcon} />
                  <Text style={styles.locationText}>Enable Location Services</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
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
  locationButton: {
    width: '80%',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginTop: 20,
  },
  locationGradient: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
  },
  locationIcon: {
    marginRight: 8,
  },
  locationText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  // Map styles
  mapContainer: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
  },
  mapTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  map: {
    width: '100%',
    height: height * 0.45,
    borderRadius: 12,
    marginBottom: 10,
    overflow: 'hidden',
  },
  userMarker: {
    backgroundColor: '#1a73e8',
    padding: 8,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'white',
  },
  hospitalMarker: {
    backgroundColor: '#ff5e62',
    padding: 8,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'white',
  },
  selectedHospitalMarker: {
    backgroundColor: '#4CAF50',
  },
  hospitalsList: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    maxHeight: height * 0.3,
  },
  hospitalsListTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  hospitalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#f8f9fa',
  },
  selectedHospitalItem: {
    backgroundColor: '#ff5e62',
  },
  hospitalIcon: {
    marginRight: 12,
  },
  hospitalDetails: {
    flex: 1,
  },
  hospitalName: {
    fontWeight: 'bold',
    fontSize: 15,
    color: '#333',
  },
  hospitalDistance: {
    fontSize: 13,
    color: '#666',
    marginTop: 3,
  },
  selectedHospitalText: {
    color: '#fff',
  },
  backButton: {
    backgroundColor: '#333',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  backButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  hospitalDetailCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    width: '100%',
    marginVertical: 10,
  },
  hospitalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  hospitalDetailName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 10,
    flex: 1,
  },
  hospitalDetailDistance: {
    fontSize: 14,
    color: '#666',
    marginLeft: 10,
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  hospitalAddress: {
    fontSize: 14,
    color: '#666',
    marginBottom: 15,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#ff5e62',
    flex: 1,
    marginHorizontal: 5,
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
    marginLeft: 8,
  },
  loadingHospitals: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingHospitalsText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#666',
  },
  noHospitalsText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    padding: 20,
  },
});

export default EmergencyScreen;
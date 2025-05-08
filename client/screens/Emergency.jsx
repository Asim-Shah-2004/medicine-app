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
  ScrollView,
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

  // Find real nearest hospital using OpenStreetMap APIs with multiple fallbacks
  const findRealNearbyHospitals = async (coords) => {
    try {
      setLoading(true);
      const { latitude, longitude } = coords;
      
      console.log('Starting hospital search at coordinates:', latitude, longitude);
      
      // Try multiple search methods in sequence until one works
      let hospitals = [];
      
      // Method 1: Try Nominatim API first (general search)
      hospitals = await searchWithNominatim(coords);
      
      // Method 2: If no results, try Overpass API (more specific for amenities)
      if (hospitals.length === 0) {
        console.log('Nominatim search failed, trying Overpass API...');
        hospitals = await searchWithOverpass(coords);
      }
      
      // Method 3: If still no results, use a hardcoded list of major hospitals for the region
      if (hospitals.length === 0) {
        console.log('Overpass search failed, checking hardcoded hospitals...');
        hospitals = checkHardcodedHospitals(coords);
      }
      
      // Final fallback: Create a simulated hospital
      if (hospitals.length === 0) {
        console.log('All search methods failed, creating simulated hospital');
        hospitals = [createSimulatedHospital(coords)];
      }
      
      // Ensure we only show the three nearest hospitals
      hospitals = hospitals.slice(0, 3);
      
      console.log(`Final result: Found ${hospitals.length} medical facilities (showing max 3)`);
      setNearbyHospitals(hospitals);
      
      // Automatically select the nearest hospital
      if (hospitals.length > 0) {
        const nearestHospital = hospitals[0];
        console.log('Selected nearest facility:', nearestHospital.name, 'at', nearestHospital.distance);
        setSelectedHospital(nearestHospital);
        getRouteToHospital(nearestHospital);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error finding nearest hospital:', error);
      Alert.alert('Error', 'Failed to find nearest hospital. Using simulated data instead.');
      
      // Ultimate fallback - always provide at least a simulated hospital
      const simulatedHospital = createSimulatedHospital(coords);
      setNearbyHospitals([simulatedHospital]);
      setSelectedHospital(simulatedHospital);
      getRouteToHospital(simulatedHospital);
      setLoading(false);
    }
  };
  
  // Search using Nominatim API (address-based search)
  const searchWithNominatim = async (coords) => {
    try {
      const { latitude, longitude } = coords;
      
      // Calculate a bounding box for a 10km radius search
      const latDelta = 0.09;  // ~10km
      const lonDelta = 0.09 / Math.cos(latitude * (Math.PI / 180));
      
      const boundingBox = [
        longitude - lonDelta,
        latitude - latDelta,
        longitude + lonDelta,
        latitude + latDelta
      ].join(',');
      
      console.log('Searching with Nominatim API using bounding box:', boundingBox);
      
      // Primary search with hospital-specific terms
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=hospital+OR+clinic+OR+emergency&limit=10&bounded=1&viewbox=${boundingBox}`,
        {
          headers: {
            'Accept-Language': 'en-US,en',
            'User-Agent': 'MedicineApp/1.0' // Required by OSM policy
          }
        }
      );
      
      if (!response.ok) {
        throw new Error('Primary Nominatim search failed');
      }
      
      const data = await response.json();
      console.log('Nominatim primary search results:', data.length);
      
      // If no results, try secondary search
      let allResults = [...data];
      if (data.length < 2) {
        try {
          console.log('Trying secondary Nominatim search');
          const secondaryResponse = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=medical+OR+health+OR+doctor&limit=10&bounded=1&viewbox=${boundingBox}`,
            {
              headers: {
                'Accept-Language': 'en-US,en',
                'User-Agent': 'MedicineApp/1.0'
              }
            }
          );
          
          if (secondaryResponse.ok) {
            const secondaryData = await secondaryResponse.json();
            console.log('Nominatim secondary search results:', secondaryData.length);
            allResults = [...allResults, ...secondaryData];
          }
        } catch (error) {
          console.log('Secondary search failed:', error.message);
        }
      }
      
      // Third attempt - direct lat/lon search for nearby amenities
      if (allResults.length < 2) {
        try {
          console.log('Trying direct Nominatim reverse search');
          const reverseResponse = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=16&addressdetails=1`,
            {
              headers: {
                'Accept-Language': 'en-US,en',
                'User-Agent': 'MedicineApp/1.0'
              }
            }
          );
          
          if (reverseResponse.ok) {
            const reverseData = await reverseResponse.json();
            console.log('Nominatim reverse search result:', reverseData);
            if (reverseData && !Array.isArray(reverseData)) {
              allResults.push(reverseData);
            }
          }
        } catch (error) {
          console.log('Reverse search failed:', error.message);
        }
      }
      
      return processAndFilterResults(allResults, coords);
    } catch (error) {
      console.error('Nominatim search error:', error.message);
      return [];
    }
  };
  
  // Search using Overpass API (amenity-based search, more detailed but complex)
  const searchWithOverpass = async (coords) => {
    try {
      const { latitude, longitude } = coords;
      
      // Overpass query to find hospitals and healthcare facilities within 10km
      const overpassQuery = `
        [out:json];
        (
          node["amenity"="hospital"](around:10000,${latitude},${longitude});
          way["amenity"="hospital"](around:10000,${latitude},${longitude});
          relation["amenity"="hospital"](around:10000,${latitude},${longitude});
          node["amenity"="clinic"](around:10000,${latitude},${longitude});
          way["amenity"="clinic"](around:10000,${latitude},${longitude});
          node["amenity"="doctors"](around:10000,${latitude},${longitude});
          node["healthcare"](around:10000,${latitude},${longitude});
        );
        out body center;
      `;
      
      console.log('Searching with Overpass API');
      
      const response = await fetch(
        "https://overpass-api.de/api/interpreter",
        {
          method: "POST",
          body: overpassQuery,
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          }
        }
      );
      
      if (!response.ok) {
        throw new Error('Overpass API request failed');
      }
      
      const data = await response.json();
      console.log('Overpass API results:', data.elements?.length || 0);
      
      // Process Overpass results into our hospital format
      if (data.elements && data.elements.length > 0) {
        const hospitals = data.elements.map((element, index) => {
          // Extract coordinates based on element type
          let elementLat, elementLon;
          
          if (element.type === 'node') {
            elementLat = element.lat;
            elementLon = element.lon;
          } else if (element.center) {
            // Ways and relations have a center property
            elementLat = element.center.lat;
            elementLon = element.center.lon;
          } else {
            return null; // Skip if we can't determine coordinates
          }
          
          // Calculate distance
          const distance = calculateDistance(
            coords.latitude,
            coords.longitude,
            elementLat,
            elementLon
          );
          
          // Only include facilities within 10km
          if (distance <= 10) {
            // Get the name or a default name
            const name = element.tags?.name || 
                         element.tags?.["name:en"] || 
                         `${element.tags?.amenity || element.tags?.healthcare || "Medical Facility"} ${index + 1}`;
            
            return {
              id: `overpass-${index + 1}`,
              name: name,
              fullName: `${name} (${element.tags?.amenity || element.tags?.healthcare || "Medical facility"})`,
              distance: `${distance.toFixed(1)} km`,
              distanceValue: distance,
              coordinate: {
                latitude: elementLat,
                longitude: elementLon,
              },
              type: element.tags?.amenity || element.tags?.healthcare,
              source: 'overpass'
            };
          }
          return null;
        }).filter(item => item !== null);
        
        // Sort by distance
        hospitals.sort((a, b) => a.distanceValue - b.distanceValue);
        
        // Return only the three nearest hospitals
        return hospitals.slice(0, 3);
      }
      
      return [];
    } catch (error) {
      console.error('Overpass API search error:', error.message);
      return [];
    }
  };
  
  // Process and filter API results
  const processAndFilterResults = (results, coords) => {
    try {
      // Filter results to keep only medical-related places
      const medicalKeywords = ['hospital', 'clinic', 'medical', 'health', 'doctor', 'emergency', 'healthcare', 'pharmacy'];
      
      const filteredResults = results.filter(item => {
        if (!item || !item.display_name) return false;
        
        // Check if any medical keyword is in the name or type
        return medicalKeywords.some(keyword => 
          item.display_name.toLowerCase().includes(keyword)
        );
      });
      
      // Transform to our format
      const hospitals = filteredResults.map((item, index) => {
        // Calculate distance
        const distance = calculateDistance(
          coords.latitude,
          coords.longitude,
          parseFloat(item.lat),
          parseFloat(item.lon)
        );
        
        // Only include facilities within 10km
        if (distance <= 10) {
          return {
            id: `nominatim-${index + 1}`,
            name: item.display_name.split(',')[0], // Get the first part of the name
            fullName: item.display_name,
            distance: `${distance.toFixed(1)} km`,
            distanceValue: distance,
            coordinate: {
              latitude: parseFloat(item.lat),
              longitude: parseFloat(item.lon),
            },
            type: item.type,
            source: 'nominatim'
          };
        }
        return null;
      }).filter(item => item !== null);
      
      // Sort by distance
      hospitals.sort((a, b) => a.distanceValue - b.distanceValue);
      
      // Return only the three nearest hospitals
      return hospitals.slice(0, 3);
    } catch (error) {
      console.error('Error processing results:', error);
      return [];
    }
  };
  
  // Check against hardcoded list of major hospitals
  const checkHardcodedHospitals = (coords) => {
    // List of major hospitals with their coordinates
    // This list should be customized based on your app's primary service region
    const majorHospitals = [
      // Example format - replace with actual major hospitals in your region
      { name: "City General Hospital", lat: 40.7128, lon: -74.0060 }, // New York
      { name: "Memorial Hospital", lat: 34.0522, lon: -118.2437 },    // Los Angeles
      { name: "County Medical Center", lat: 41.8781, lon: -87.6298 }, // Chicago
      // Add more major hospitals here
    ];
    
    // Find distances to all hardcoded hospitals
    const hospitals = majorHospitals.map((hospital, index) => {
      const distance = calculateDistance(
        coords.latitude,
        coords.longitude,
        hospital.lat,
        hospital.lon
      );
      
      return {
        id: `hardcoded-${index + 1}`,
        name: hospital.name,
        fullName: `${hospital.name} (Major Hospital)`,
        distance: `${distance.toFixed(1)} km`,
        distanceValue: distance,
        coordinate: {
          latitude: hospital.lat,
          longitude: hospital.lon,
        },
        source: 'hardcoded'
      };
    });
    
    // Sort by distance
    hospitals.sort((a, b) => a.distanceValue - b.distanceValue);
    
    // Only return if there's a hospital within reasonable distance (50km)
    // and limit to 3
    const nearbyHospitals = hospitals.filter(hospital => hospital.distanceValue <= 50).slice(0, 3);
    return nearbyHospitals;
  };
  
  // Create a simulated hospital when no real ones can be found
  const createSimulatedHospital = (coords) => {
    // Create a simulated hospital about 2-5km away
    const distance = 2 + Math.random() * 3; // 2-5km
    const angle = Math.random() * 2 * Math.PI; // random direction
    
    // Convert distance to approximate lat/lon changes
    // 0.009 degrees is roughly 1km
    const latChange = Math.sin(angle) * (distance * 0.009);
    const lonChange = Math.cos(angle) * (distance * 0.009);
    
    return {
      id: 'simulated-1',
      name: 'Emergency Medical Center',
      fullName: 'Emergency Medical Center (Simulated)',
      distance: `${distance.toFixed(1)} km`,
      distanceValue: distance,
      coordinate: {
        latitude: coords.latitude + latChange,
        longitude: coords.longitude + lonChange,
      },
      source: 'simulated'
    };
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
          <ScrollView 
            style={styles.mapScrollView}
            contentContainerStyle={styles.mapScrollContent}
            showsVerticalScrollIndicator={true}
          >
            <View style={styles.mapContainer}>
              <Text style={styles.mapTitle}>Nearest Medical Facilities</Text>
              <Text style={styles.mapSubtitle}>Showing the 3 closest hospitals to your location</Text>
              
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
                <Text style={styles.hospitalsListTitle}>Nearest 3 Medical Facilities:</Text>
                
                {loading ? (
                  <View style={styles.loadingHospitals}>
                    <ActivityIndicator size="small" color="#ff5e62" />
                    <Text style={styles.loadingHospitalsText}>Finding nearest hospitals...</Text>
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
          </ScrollView>
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
          <ScrollView style={styles.noContactScrollView} contentContainerStyle={styles.noContactContent}>
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
          </ScrollView>
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
    width: '100%',
    paddingHorizontal: 15,
  },
  emergencyAvailable: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 20,
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
    paddingHorizontal: 20,
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
  mapScrollView: {
    flex: 1,
    width: '100%',
  },
  mapScrollContent: {
    paddingBottom: 30,
  },
  mapContainer: {
    width: '100%',
    alignItems: 'center',
    paddingBottom: 10,
  },
  mapTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  mapSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 10,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  map: {
    width: '100%',
    height: height * 0.35,
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
    marginBottom: 20,
  },
  hospitalsListTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 8,
  },
  hospitalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#f8f9fa',
    borderLeftWidth: 3,
    borderLeftColor: '#ff5e62',
  },
  selectedHospitalItem: {
    backgroundColor: '#ff5e62',
  },
  hospitalIcon: {
    marginRight: 12,
  },
  hospitalDetails: {
    flex: 1,
    paddingRight: 5,
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
    marginBottom: 10,
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
  noContactScrollView: {
    flex: 1,
    width: '100%',
  },
  noContactContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 30,
  },
});

export default EmergencyScreen;
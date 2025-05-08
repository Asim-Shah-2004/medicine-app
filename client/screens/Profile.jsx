import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Animated,
  Dimensions,
  StatusBar
} from 'react-native';
import { Ionicons, MaterialCommunityIcons, AntDesign, Feather, FontAwesome5 } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { SERVER_URL } from '@env';
import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');

const ProfileScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;
  const headerHeight = 280;
  
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editedProfile, setEditedProfile] = useState({});
  const [emergencyContacts, setEmergencyContacts] = useState([]);
  const [newContact, setNewContact] = useState({ name: '', email: '', phone: '' });
  const [addingContact, setAddingContact] = useState(false);
  const [activeSection, setActiveSection] = useState('personal');

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    fetchProfile();
    
    // Entrance animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      })
    ]).start();
    
    StatusBar.setBarStyle('light-content');
    return () => {
      StatusBar.setBarStyle('default');
    };
  }, []);

  const fetchProfile = async () => {
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
        setEditedProfile(data);
        setEmergencyContacts(data.emergency_contacts || []);
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

  const showToast = (title, message) => {
    // Simplified for demo - would be replaced with a custom toast component
    Alert.alert(title, message);
  };

  const handleLogout = async () => {
    Alert.alert(
      'Confirm Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.removeItem('accessToken');
              await AsyncStorage.removeItem('userData');
              
              navigation.reset({
                index: 0,
                routes: [{ name: 'Login' }],
              });
            } catch (error) {
              console.error('Error during logout:', error);
            }
          },
        },
      ]
    );
  };

  const toggleEditMode = () => {
    if (editMode) {
      setEditedProfile(profile);
    }
    setEditMode(!editMode);
  };

  const handleSaveProfile = async () => {
    try {
      setSaving(true);
      const token = await AsyncStorage.getItem('accessToken');
      
      if (!token) {
        navigation.replace('Login');
        return;
      }

      const updatedProfile = {
        ...editedProfile,
        emergency_contacts: emergencyContacts
      };

      if (updatedProfile._id) {
        delete updatedProfile._id;
      }

      const response = await fetch(`${SERVER_URL}/api/user/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updatedProfile)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Server response error:', errorText);
        throw new Error(response.statusText);
      }

      const data = await response.json();

      setProfile(data);
      setEditedProfile(data);
      setEditMode(false);
      showToast('Success', 'Profile updated successfully');
    } catch (error) {
      console.error('Error updating profile:', error);
      showToast('Error', 'Failed to update profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (field, value) => {
    setEditedProfile(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photo library to change profile picture.');
      return;
    }
    
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setEditedProfile(prev => ({
          ...prev,
          profile_picture: result.assets[0].uri
        }));
      }
    } catch (error) {
      console.error('Error picking image:', error);
      showToast('Error', 'Failed to select image.');
    }
  };

  const addEmergencyContact = () => {
    if (!newContact.name || (!newContact.email && !newContact.phone)) {
      showToast('Error', 'Please provide a name and either email or phone number');
      return;
    }
    
    setEmergencyContacts([...emergencyContacts, { ...newContact, id: Date.now().toString() }]);
    setNewContact({ name: '', email: '', phone: '' });
    setAddingContact(false);
  };

  const removeEmergencyContact = (contactId) => {
    Alert.alert(
      'Remove Contact',
      'Are you sure you want to remove this emergency contact?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setEmergencyContacts(emergencyContacts.filter(contact => contact.id !== contactId));
          },
        },
      ]
    );
  };

  const headerOpacity = scrollY.interpolate({
    inputRange: [0, headerHeight - 100],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const profileScale = scrollY.interpolate({
    inputRange: [-100, 0],
    outputRange: [1.2, 1],
    extrapolate: 'clamp',
  });

  const profileTranslateY = scrollY.interpolate({
    inputRange: [-100, 0, 100],
    outputRange: [10, 0, -50],
    extrapolate: 'clamp',
  });

  const renderSectionButton = (id, label, icon) => {
    const isActive = activeSection === id;
    return (
      <TouchableOpacity
        style={[styles.sectionTab, isActive && styles.activeTab]}
        onPress={() => setActiveSection(id)}
      >
        <MaterialCommunityIcons 
          name={icon} 
          size={22} 
          color={isActive ? '#FF7F50' : '#888'} 
        />
        <Text style={[styles.sectionTabText, isActive && styles.activeTabText]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF7F50" />
        <LinearGradient
          colors={['#FF9800', '#FF7F50']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.loadingGradient}
        >
          <Text style={styles.appTitle}>MedicineApp</Text>
        </LinearGradient>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Animated Header */}
      <Animated.View style={[styles.animatedHeader, { opacity: headerOpacity }]}>
        <BlurView intensity={90} tint="dark" style={styles.blurHeader}>
          <View style={[styles.headerContent, { paddingTop: insets.top }]}>
            <Text style={styles.headerTitle}>{profile.name || profile.username}</Text>
          </View>
        </BlurView>
      </Animated.View>

      {/* Header Actions */}
      <View style={[styles.headerActions, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={26} color="#fff" />
        </TouchableOpacity>
      </View>

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      >
        {/* Profile Header */}
        <View style={styles.profileHeaderContainer}>
          <LinearGradient
            colors={['#FF9800', '#FF7F50']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerGradient}
          >
            <View style={styles.headerPattern} />
          </LinearGradient>

          <Animated.View 
            style={[
              styles.profileInfoContainer,
              { 
                transform: [
                  { scale: profileScale },
                  { translateY: profileTranslateY }
                ]
              }
            ]}
          >
            <TouchableOpacity 
              style={styles.profileImageContainer} 
              onPress={editMode ? handlePickImage : undefined}
              activeOpacity={editMode ? 0.7 : 1}
            >
              <LinearGradient
                colors={['#FFCC80', '#FF8A65']}
                style={styles.profileImageBorder}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                {profile.profile_picture ? (
                  <Image 
                    source={{ uri: profile.profile_picture }} 
                    style={styles.profileImage} 
                  />
                ) : (
                  <View style={styles.profileImageFallback}>
                    <Text style={styles.profileInitial}>
                      {profile.name ? profile.name.charAt(0).toUpperCase() : 'U'}
                    </Text>
                  </View>
                )}
                {editMode && (
                  <View style={styles.editProfileImageOverlay}>
                    <Ionicons name="camera" size={24} color="#fff" />
                  </View>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.nameContainer}>
              <Text style={styles.profileName}>{profile.name || profile.username}</Text>
              <Text style={styles.profileEmail}>{profile.email}</Text>
            </View>
          </Animated.View>
        </View>

        {/* Edit Toggle Button - Now clearly after the profileHeaderContainer */}
        <View style={styles.editButtonContainer}>
          <TouchableOpacity 
            style={[styles.editButton, editMode && styles.saveButton]} 
            onPress={editMode ? handleSaveProfile : toggleEditMode}
            disabled={saving}
          >
            <LinearGradient
              colors={editMode ? ['#4CAF50', '#2E7D32'] : ['#FF9800', '#FF7F50']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.editButtonGradient}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Feather 
                    name={editMode ? "check" : "edit-2"} 
                    size={18} 
                    color="#fff" 
                    style={styles.editIcon} 
                  />
                  <Text style={styles.editButtonText}>
                    {editMode ? "Save Changes" : "Edit Profile"}
                  </Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
          
          {editMode && (
            <TouchableOpacity 
              style={styles.cancelButton} 
              onPress={toggleEditMode}
              disabled={saving}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Section Tabs */}
        <View style={styles.sectionTabs}>
          {renderSectionButton('personal', 'Personal', 'account-outline')}
          {renderSectionButton('health', 'Health', 'heart-pulse')}
          {renderSectionButton('contacts', 'Contacts', 'contacts')}
        </View>

        {/* Content Sections */}
        <Animated.View 
          style={[
            styles.contentContainer, 
            {  
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }]
            }
          ]}
        >
          {/* Personal Information Section */}
          {activeSection === 'personal' && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Feather name="user" size={22} color="#FF7F50" />
                <Text style={styles.sectionTitle}>Personal Information</Text>
              </View>

              <View style={styles.card}>
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>
                    <Feather name="user" size={16} color="#888" /> Name
                  </Text>
                  {editMode ? (
                    <TextInput
                      style={styles.input}
                      value={editedProfile.name || ''}
                      onChangeText={(text) => handleInputChange('name', text)}
                      placeholder="Enter your name"
                      placeholderTextColor="#aaa"
                    />
                  ) : (
                    <Text style={styles.fieldValue}>{profile.name || 'Not provided'}</Text>
                  )}
                </View>

                <View style={styles.divider} />

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>
                    <Feather name="at-sign" size={16} color="#888" /> Username
                  </Text>
                  <Text style={styles.fieldValue}>{profile.username}</Text>
                </View>

                <View style={styles.divider} />

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>
                    <Feather name="mail" size={16} color="#888" /> Email
                  </Text>
                  <Text style={styles.fieldValue}>{profile.email}</Text>
                </View>

                <View style={styles.divider} />

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>
                    <Feather name="phone" size={16} color="#888" /> Phone
                  </Text>
                  {editMode ? (
                    <TextInput
                      style={styles.input}
                      value={editedProfile.phone_number || ''}
                      onChangeText={(text) => handleInputChange('phone_number', text)}
                      placeholder="Enter your phone number"
                      placeholderTextColor="#aaa"
                      keyboardType="phone-pad"
                    />
                  ) : (
                    <Text style={styles.fieldValue}>{profile.phone_number || 'Not provided'}</Text>
                  )}
                </View>

                {(profile.date_of_birth || profile.gender) && <View style={styles.divider} />}

                <View style={styles.fieldRow}>
                  {profile.date_of_birth && (
                    <View style={styles.fieldColumn}>
                      <Text style={styles.fieldLabel}>
                        <Feather name="calendar" size={16} color="#888" /> Date of Birth
                      </Text>
                      <Text style={styles.fieldValue}>
                        {new Date(profile.date_of_birth).toLocaleDateString()}
                      </Text>
                    </View>
                  )}

                  {profile.gender && (
                    <View style={styles.fieldColumn}>
                      <Text style={styles.fieldLabel}>
                        <MaterialCommunityIcons name="gender-male-female" size={16} color="#888" /> Gender
                      </Text>
                      <Text style={styles.fieldValue}>
                        {profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1)}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          )}

          {/* Health Information Section */}
          {activeSection === 'health' && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Feather name="heart" size={22} color="#FF7F50" />
                <Text style={styles.sectionTitle}>Health Information</Text>
              </View>

              <View style={styles.card}>
                {profile.blood_type && (
                  <View style={styles.bloodTypeSection}>
                    <LinearGradient
                      colors={['#FFECB3', '#FFE0B2']}
                      style={styles.bloodTypeBadge}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      <Text style={styles.bloodTypeText}>{profile.blood_type}</Text>
                    </LinearGradient>
                    <Text style={styles.bloodTypeLabel}>Blood Type</Text>
                  </View>
                )}

                {(profile.height || profile.weight) && (
                  <View style={styles.bodyMetricsContainer}>
                    {profile.height && (
                      <View style={styles.metricCard}>
                        <Feather name="arrow-up" size={18} color="#FF7F50" />
                        <Text style={styles.metricValue}>{profile.height}</Text>
                        <Text style={styles.metricUnit}>cm</Text>
                        <Text style={styles.metricLabel}>Height</Text>
                      </View>
                    )}
                    
                    {profile.weight && (
                      <View style={styles.metricCard}>
                        <Feather name="bar-chart-2" size={18} color="#FF7F50" />
                        <Text style={styles.metricValue}>{profile.weight}</Text>
                        <Text style={styles.metricUnit}>kg</Text>
                        <Text style={styles.metricLabel}>Weight</Text>
                      </View>
                    )}
                  </View>
                )}

                {profile.health_conditions && profile.health_conditions.length > 0 && (
                  <View style={styles.healthSection}>
                    <Text style={styles.healthSectionTitle}>
                      <Feather name="activity" size={16} color="#FF7F50" /> Health Conditions
                    </Text>
                    <View style={styles.tagContainer}>
                      {profile.health_conditions.map((condition, index) => (
                        <View key={index} style={styles.tag}>
                          <Text style={styles.tagText}>{condition}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {profile.allergies && profile.allergies.length > 0 && (
                  <View style={styles.healthSection}>
                    <Text style={styles.healthSectionTitle}>
                      <MaterialCommunityIcons name="allergy" size={16} color="#FF7F50" /> Allergies
                    </Text>
                    <View style={styles.tagContainer}>
                      {profile.allergies.map((allergy, index) => (
                        <View key={index} style={[styles.tag, styles.allergyTag]}>
                          <Text style={styles.allergyTagText}>{allergy}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {(!profile.health_conditions || profile.health_conditions.length === 0) && 
                 (!profile.allergies || profile.allergies.length === 0) && 
                 (!profile.blood_type) && 
                 (!profile.height) && 
                 (!profile.weight) && (
                  <View style={styles.emptyStateContainer}>
                    <MaterialCommunityIcons name="clipboard-text-outline" size={50} color="#ddd" />
                    <Text style={styles.emptyStateText}>No health information available</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Emergency Contacts Section */}
          {activeSection === 'contacts' && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Feather name="users" size={22} color="#FF7F50" />
                <Text style={styles.sectionTitle}>Emergency Contacts</Text>
              </View>

              {emergencyContacts.length === 0 && !addingContact ? (
                <View style={[styles.card, styles.emptyContactsCard]}>
                  <Feather name="users" size={50} color="#ddd" />
                  <Text style={styles.emptyStateText}>
                    No emergency contacts added yet
                  </Text>
                  <Text style={styles.emptyStateSubtext}>
                    Add contacts who should be notified in case of emergency
                  </Text>
                  
                  {editMode && (
                    <TouchableOpacity 
                      style={styles.emptyAddButton}
                      onPress={() => setAddingContact(true)}
                    >
                      <LinearGradient
                        colors={['#FF9800', '#FF7F50']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.emptyAddButtonGradient}
                      >
                        <Feather name="plus" size={18} color="#fff" />
                        <Text style={styles.emptyAddButtonText}>Add Contact</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <>
                  {emergencyContacts.map((contact, index) => (
                    <View key={contact.id || index} style={styles.contactCard}>
                      <View style={styles.contactCardHeader}>
                        <View style={styles.contactAvatarContainer}>
                          <LinearGradient
                            colors={['#E0F2F1', '#B2DFDB']}
                            style={styles.contactAvatar}
                          >
                            <Text style={styles.contactInitial}>
                              {contact.name.charAt(0).toUpperCase()}
                            </Text>
                          </LinearGradient>
                        </View>
                        <View style={styles.contactInfo}>
                          <Text style={styles.contactName}>{contact.name}</Text>
                          <Text style={styles.contactRelation}>Emergency Contact</Text>
                        </View>
                        {editMode && (
                          <TouchableOpacity 
                            style={styles.removeContactButton}
                            onPress={() => removeEmergencyContact(contact.id)}
                          >
                            <Feather name="trash-2" size={18} color="#FF3B30" />
                          </TouchableOpacity>
                        )}
                      </View>
                      
                      <View style={styles.contactMethods}>
                        {contact.phone && (
                          <View style={styles.contactMethod}>
                            <View style={styles.contactMethodIcon}>
                              <Feather name="phone" size={16} color="#4CAF50" />
                            </View>
                            <Text style={styles.contactMethodText}>{contact.phone}</Text>
                          </View>
                        )}
                        
                        {contact.email && (
                          <View style={styles.contactMethod}>
                            <View style={styles.contactMethodIcon}>
                              <Feather name="mail" size={16} color="#2196F3" />
                            </View>
                            <Text style={styles.contactMethodText}>{contact.email}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  ))}
                  
                  {editMode && !addingContact && (
                    <TouchableOpacity 
                      style={styles.addContactButton}
                      onPress={() => setAddingContact(true)}
                    >
                      <Feather name="plus" size={18} color="#FF7F50" />
                      <Text style={styles.addContactText}>Add Emergency Contact</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}

              {editMode && addingContact && (
                <View style={styles.addContactForm}>
                  <View style={styles.formHeader}>
                    <Text style={styles.formTitle}>Add Emergency Contact</Text>
                    <TouchableOpacity 
                      onPress={() => {
                        setAddingContact(false);
                        setNewContact({ name: '', email: '', phone: '' });
                      }}
                    >
                      <Feather name="x" size={20} color="#888" />
                    </TouchableOpacity>
                  </View>
                  
                  <View style={styles.formField}>
                    <Text style={styles.formLabel}>Name <Text style={styles.requiredStar}>*</Text></Text>
                    <TextInput
                      style={styles.formInput}
                      value={newContact.name}
                      onChangeText={(text) => setNewContact({...newContact, name: text})}
                      placeholder="Contact name"
                      placeholderTextColor="#aaa"
                    />
                  </View>
                  
                  <View style={styles.formField}>
                    <Text style={styles.formLabel}>Phone Number</Text>
                    <TextInput
                      style={styles.formInput}
                      value={newContact.phone}
                      onChangeText={(text) => setNewContact({...newContact, phone: text})}
                      placeholder="Phone number"
                      placeholderTextColor="#aaa"
                      keyboardType="phone-pad"
                    />
                  </View>
                  
                  <View style={styles.formField}>
                    <Text style={styles.formLabel}>Email Address</Text>
                    <TextInput
                      style={styles.formInput}
                      value={newContact.email}
                      onChangeText={(text) => setNewContact({...newContact, email: text})}
                      placeholder="Email address"
                      placeholderTextColor="#aaa"
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                  
                  <TouchableOpacity 
                    style={styles.formSubmitButton}
                    onPress={addEmergencyContact}
                  >
                    <LinearGradient
                      colors={['#FF9800', '#FF7F50']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.formSubmitGradient}
                    >
                      <Text style={styles.formSubmitText}>Add Contact</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </Animated.View>
      </Animated.ScrollView>
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
    backgroundColor: '#fff',
  },
  loadingGradient: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    marginTop: 20,
  },
  appTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  animatedHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  blurHeader: {
    width: '100%',
    height: 60,
  },
  headerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  headerActions: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileHeaderContainer: {
    position: 'relative',
    height: 280,
  },
  headerGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  headerPattern: {
    flex: 1,
    opacity: 0.1,
  },
  profileInfoContainer: {
    position: 'absolute',
    top: 80,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  profileImageContainer: {
    alignItems: 'center',
    marginBottom: 15,
  },
  profileImageBorder: {
    width: 110,
    height: 110,
    borderRadius: 55,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileImage: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: '#f0f0f0',
  },
  profileImageFallback: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitial: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#FF7F50',
  },
  editProfileImageOverlay: {
    position: 'absolute',
    bottom: 0,
    right: -5,
    backgroundColor: '#FF7F50',
    borderRadius: 18,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  nameContainer: {
    alignItems: 'center',
  },
  profileName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
    color: '#333',
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 10,
  },
  editButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 20,
    position: 'relative',
    zIndex: 30,
  },
  editButton: {
    borderRadius: 25,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  editButtonGradient: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButton: {
    backgroundColor: '#4CAF50',
  },
  editIcon: {
    marginRight: 8,
  },
  editButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  cancelButton: {
    backgroundColor: '#f2f2f2',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    marginLeft: 10,
  },
  cancelButtonText: {
    color: '#666',
    fontWeight: '600',
    fontSize: 15,
  },
  sectionTabs: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 12,
    marginHorizontal: 20,
    marginTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  sectionTab: {
    flex: 1,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#FF7F50',
  },
  sectionTabText: {
    color: '#888',
    marginLeft: 5,
    fontSize: 14,
    fontWeight: '500',
  },
  activeTabText: {
    color: '#FF7F50',
    fontWeight: '600',
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  section: {
    marginBottom: 25,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 8,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 14,
    color: '#888',
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  fieldValue: {
    fontSize: 16,
    color: '#333',
  },
  divider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginVertical: 16,
  },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  fieldColumn: {
    flex: 1,
  },
  input: {
    fontSize: 16,
    color: '#333',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    paddingVertical: 6,
    paddingHorizontal: 0,
  },
  bloodTypeSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  bloodTypeBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  bloodTypeText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FF7F50',
  },
  bloodTypeLabel: {
    fontSize: 14,
    color: '#888',
  },
  bodyMetricsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  metricCard: {
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 12,
    width: '45%',
  },
  metricValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 5,
  },
  metricUnit: {
    fontSize: 14,
    color: '#888',
  },
  metricLabel: {
    fontSize: 14,
    color: '#888',
    marginTop: 5,
  },
  healthSection: {
    marginTop: 15,
  },
  healthSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#444',
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tagContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tag: {
    backgroundColor: '#f0f0f0',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    marginRight: 10,
    marginBottom: 10,
  },
  tagText: {
    color: '#555',
    fontSize: 14,
  },
  allergyTag: {
    backgroundColor: '#FFECB3',
  },
  allergyTagText: {
    color: '#FF7F50',
  },
  emptyStateContainer: {
    alignItems: 'center',
    padding: 20,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    marginTop: 15,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#aaa',
    textAlign: 'center',
    marginTop: 5,
    marginBottom: 20,
  },
  emptyContactsCard: {
    alignItems: 'center',
    padding: 30,
  },
  emptyAddButton: {
    marginTop: 15,
    overflow: 'hidden',
    borderRadius: 25,
  },
  emptyAddButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  emptyAddButtonText: {
    color: '#fff',
    fontWeight: '600',
    marginLeft: 8,
  },
  contactCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  contactCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  contactAvatarContainer: {
    marginRight: 15,
  },
  contactAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactInitial: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FF7F50',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  contactRelation: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  removeContactButton: {
    padding: 8,
  },
  contactMethods: {
    paddingTop: 5,
  },
  contactMethod: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  contactMethodIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  contactMethodText: {
    fontSize: 14,
    color: '#555',
  },
  addContactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    borderWidth: 1,
    borderColor: '#FF7F50',
    borderRadius: 12,
    borderStyle: 'dashed',
    marginTop: 10,
  },
  addContactText: {
    color: '#FF7F50',
    marginLeft: 8,
    fontWeight: '500',
  },
  addContactForm: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginTop: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  formField: {
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  requiredStar: {
    color: '#FF7F50',
  },
  formInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 16,
    color: '#333',
  },
  formSubmitButton: {
    borderRadius: 10,
    overflow: 'hidden',
    marginTop: 10,
  },
  formSubmitGradient: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  formSubmitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ProfileScreen;
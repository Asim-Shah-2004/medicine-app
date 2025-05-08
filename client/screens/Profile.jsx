import React, { useState, useEffect } from 'react';
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
  SafeAreaView
} from 'react-native';
import { Ionicons, MaterialCommunityIcons, AntDesign } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { SERVER_URL } from '@env';

const Profile = ({ navigation }) => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editedProfile, setEditedProfile] = useState({});
  const [emergencyContacts, setEmergencyContacts] = useState([]);
  const [newContact, setNewContact] = useState({ name: '', email: '', phone: '' });
  const [addingContact, setAddingContact] = useState(false);

  useEffect(() => {
    fetchProfile();
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
        Alert.alert('Error', data.message || 'Failed to load profile');
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      Alert.alert('Error', 'Failed to load profile. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      'Confirm Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
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

      const response = await fetch(`${SERVER_URL}/api/user/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updatedProfile)
      });

      const data = await response.json();

      if (response.ok) {
        setProfile(data);
        setEditMode(false);
        Alert.alert('Success', 'Profile updated successfully');
      } else {
        Alert.alert('Error', data.message || 'Failed to update profile');
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      Alert.alert('Error', 'Failed to update profile. Please try again.');
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
        quality: 0.5,
      });
      
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setEditedProfile(prev => ({
          ...prev,
          profile_picture: result.assets[0].uri
        }));
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to select image.');
    }
  };

  const addEmergencyContact = () => {
    if (!newContact.name || (!newContact.email && !newContact.phone)) {
      Alert.alert('Error', 'Please provide a name and either email or phone number');
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

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF7F50" />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView>
          <LinearGradient
            colors={['#FF7F50', '#FF6347']}
            style={styles.header}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <View style={styles.profileHeader}>
              <TouchableOpacity 
                style={styles.profileImageContainer} 
                onPress={editMode ? handlePickImage : undefined}
                activeOpacity={editMode ? 0.7 : 1}
              >
                {profile.profile_picture ? (
                  <Image 
                    source={{ uri: profile.profile_picture }} 
                    style={styles.profileImage} 
                  />
                ) : (
                  <View style={styles.profileImage}>
                    <Text style={styles.profileInitial}>{profile.name ? profile.name.charAt(0).toUpperCase() : 'U'}</Text>
                  </View>
                )}
                {editMode && (
                  <View style={styles.editProfileImageOverlay}>
                    <Ionicons name="camera" size={24} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
              <Text style={styles.profileName}>{profile.name || profile.username}</Text>
              <Text style={styles.profileEmail}>{profile.email}</Text>
            </View>
          </LinearGradient>

          <View style={styles.editButtonContainer}>
            <TouchableOpacity 
              style={[styles.editButton, editMode && styles.saveButton]} 
              onPress={editMode ? handleSaveProfile : toggleEditMode}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons 
                    name={editMode ? "checkmark" : "pencil"} 
                    size={18} 
                    color="#fff" 
                    style={styles.editIcon} 
                  />
                  <Text style={styles.editButtonText}>
                    {editMode ? "Save Profile" : "Edit Profile"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            {editMode && (
              <TouchableOpacity 
                style={styles.cancelButton} 
                onPress={toggleEditMode}
                disabled={saving}
              >
                <Ionicons name="close" size={18} color="#666" style={styles.editIcon} />
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Personal Information</Text>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Name</Text>
              {editMode ? (
                <TextInput
                  style={styles.input}
                  value={editedProfile.name || ''}
                  onChangeText={(text) => handleInputChange('name', text)}
                  placeholder="Enter your name"
                />
              ) : (
                <Text style={styles.fieldValue}>{profile.name || 'Not provided'}</Text>
              )}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Username</Text>
              <Text style={styles.fieldValue}>{profile.username}</Text>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Email</Text>
              <Text style={styles.fieldValue}>{profile.email}</Text>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Phone</Text>
              {editMode ? (
                <TextInput
                  style={styles.input}
                  value={editedProfile.phone_number || ''}
                  onChangeText={(text) => handleInputChange('phone_number', text)}
                  placeholder="Enter your phone number"
                  keyboardType="phone-pad"
                />
              ) : (
                <Text style={styles.fieldValue}>{profile.phone_number || 'Not provided'}</Text>
              )}
            </View>

            {profile.date_of_birth && (
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Date of Birth</Text>
                <Text style={styles.fieldValue}>
                  {new Date(profile.date_of_birth).toLocaleDateString()}
                </Text>
              </View>
            )}

            {profile.gender && (
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Gender</Text>
                <Text style={styles.fieldValue}>
                  {profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1)}
                </Text>
              </View>
            )}
          </View>

          {(profile.health_conditions || profile.allergies || profile.blood_type) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Health Information</Text>
              
              {profile.health_conditions && profile.health_conditions.length > 0 && (
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Health Conditions</Text>
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
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Allergies</Text>
                  <View style={styles.tagContainer}>
                    {profile.allergies.map((allergy, index) => (
                      <View key={index} style={[styles.tag, styles.allergyTag]}>
                        <Text style={styles.tagText}>{allergy}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {profile.blood_type && (
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Blood Type</Text>
                  <View style={[styles.tag, styles.bloodTypeTag]}>
                    <Text style={styles.bloodTypeText}>{profile.blood_type}</Text>
                  </View>
                </View>
              )}

              {profile.height && (
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Height</Text>
                  <Text style={styles.fieldValue}>{profile.height} cm</Text>
                </View>
              )}

              {profile.weight && (
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Weight</Text>
                  <Text style={styles.fieldValue}>{profile.weight} kg</Text>
                </View>
              )}
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Emergency Contacts</Text>
            
            {emergencyContacts.length === 0 && !addingContact ? (
              <Text style={styles.emptyStateText}>
                No emergency contacts added yet. Add contacts who should be notified in case of emergency.
              </Text>
            ) : (
              emergencyContacts.map((contact, index) => (
                <View key={contact.id || index} style={styles.contactCard}>
                  <View style={styles.contactInfo}>
                    <Text style={styles.contactName}>{contact.name}</Text>
                    {contact.phone && (
                      <View style={styles.contactDetail}>
                        <Ionicons name="call-outline" size={16} color="#666" />
                        <Text style={styles.contactText}>{contact.phone}</Text>
                      </View>
                    )}
                    {contact.email && (
                      <View style={styles.contactDetail}>
                        <Ionicons name="mail-outline" size={16} color="#666" />
                        <Text style={styles.contactText}>{contact.email}</Text>
                      </View>
                    )}
                  </View>
                  {editMode && (
                    <TouchableOpacity 
                      style={styles.removeContactButton}
                      onPress={() => removeEmergencyContact(contact.id)}
                    >
                      <AntDesign name="close" size={18} color="#FF3B30" />
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}

            {editMode && addingContact && (
              <View style={styles.addContactForm}>
                <Text style={styles.addContactTitle}>Add Emergency Contact</Text>
                
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>Name *</Text>
                  <TextInput
                    style={styles.formInput}
                    value={newContact.name}
                    onChangeText={(text) => setNewContact({...newContact, name: text})}
                    placeholder="Contact name"
                  />
                </View>
                
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>Phone</Text>
                  <TextInput
                    style={styles.formInput}
                    value={newContact.phone}
                    onChangeText={(text) => setNewContact({...newContact, phone: text})}
                    placeholder="Phone number"
                    keyboardType="phone-pad"
                  />
                </View>
                
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>Email</Text>
                  <TextInput
                    style={styles.formInput}
                    value={newContact.email}
                    onChangeText={(text) => setNewContact({...newContact, email: text})}
                    placeholder="Email address"
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
                
                <View style={styles.formButtons}>
                  <TouchableOpacity 
                    style={styles.cancelFormButton}
                    onPress={() => {
                      setAddingContact(false);
                      setNewContact({ name: '', email: '', phone: '' });
                    }}
                  >
                    <Text style={styles.cancelFormText}>Cancel</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={styles.saveFormButton}
                    onPress={addEmergencyContact}
                  >
                    <Text style={styles.saveFormText}>Add Contact</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            
            {editMode && !addingContact && (
              <TouchableOpacity 
                style={styles.addContactButton}
                onPress={() => setAddingContact(true)}
              >
                <Ionicons name="add" size={18} color="#FF7F50" />
                <Text style={styles.addContactText}>Add Emergency Contact</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Medicine App v1.0</Text>
          </View>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 10,
    color: '#888',
  },
  header: {
    paddingTop: 30,
    paddingBottom: 40,
  },
  profileHeader: {
    alignItems: 'center',
  },
  profileImageContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 10,
    borderWidth: 3,
    borderColor: '#fff',
    position: 'relative',
  },
  profileImage: {
    width: '100%',
    height: '100%',
    borderRadius: 50,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInitial: {
    fontSize: 40,
    color: '#FF7F50',
  },
  editProfileImageOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 15,
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
  },
  editButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 20,
    transform: [{ translateY: -20 }],
  },
  editButton: {
    flexDirection: 'row',
    backgroundColor: '#FF7F50',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  saveButton: {
    backgroundColor: '#4CD964',
  },
  cancelButton: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  editIcon: {
    marginRight: 5,
  },
  editButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  cancelButtonText: {
    color: '#666',
    fontWeight: '600',
    fontSize: 14,
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  fieldGroup: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 14,
    color: '#888',
    marginBottom: 6,
  },
  fieldValue: {
    fontSize: 16,
    color: '#333',
  },
  input: {
    fontSize: 16,
    color: '#333',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    paddingVertical: 6,
    paddingHorizontal: 0,
  },
  tagContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 5,
  },
  tag: {
    backgroundColor: '#f0f0f0',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
  },
  allergyTag: {
    backgroundColor: '#FFE5E5',
  },
  bloodTypeTag: {
    backgroundColor: '#E5F1FF',
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  tagText: {
    color: '#666',
    fontSize: 14,
  },
  bloodTypeText: {
    color: '#4682B4',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyStateText: {
    color: '#888',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 15,
  },
  contactCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 15,
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
    marginBottom: 15,
    borderLeftWidth: 3,
    borderLeftColor: '#FF7F50',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5,
  },
  contactDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
  },
  contactText: {
    color: '#666',
    marginLeft: 5,
    fontSize: 14,
  },
  removeContactButton: {
    padding: 5,
  },
  addContactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: '#FF7F50',
    borderRadius: 10,
    borderStyle: 'dashed',
  },
  addContactText: {
    color: '#FF7F50',
    marginLeft: 5,
    fontWeight: '500',
  },
  addContactForm: {
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
  },
  addContactTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 15,
  },
  formField: {
    marginBottom: 15,
  },
  formLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  formInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  formButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  cancelFormButton: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    marginRight: 10,
  },
  saveFormButton: {
    backgroundColor: '#FF7F50',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  cancelFormText: {
    color: '#666',
    fontWeight: '500',
  },
  saveFormText: {
    color: '#fff',
    fontWeight: '500',
  },
  logoutButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 15,
    marginTop: 20,
  },
  logoutText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 6,
  },
  footer: {
    padding: 20,
    alignItems: 'center',
  },
  footerText: {
    color: '#999',
    fontSize: 12,
  }
});

export default Profile;
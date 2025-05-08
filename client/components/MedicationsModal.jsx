import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Animated,
  Dimensions,
  ScrollView,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons, FontAwesome, Feather } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

const MedicationsModal = ({
  visible,
  onClose,
  medications,
  onMedicationPress,
  onAddPress,
  formatTime,
  isDueNow,
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  
  useEffect(() => {
    if (visible) {
      // Reset animations first
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.9);
      
      // Animate in
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        })
      ]).start();
    }
  }, [visible]);
  
  const handleClose = () => {
    // Animate out
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.9,
        duration: 200,
        useNativeDriver: true,
      })
    ]).start(() => {
      onClose();
    });
  };
  
  return (
    <Modal
      transparent={true}
      visible={visible}
      animationType="none"
      statusBarTranslucent={true}
      onRequestClose={handleClose}
      hardwareAccelerated={true}
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.modalBackground}>
          <TouchableWithoutFeedback onPress={e => e.stopPropagation()}>
            <Animated.View 
              style={[
                styles.container,
                { 
                  opacity: fadeAnim,
                  transform: [{ scale: scaleAnim }]
                }
              ]}
            >
              <View style={styles.content}>
                <View style={styles.header}>
                  <Text style={styles.title}>All Medications</Text>
                  <TouchableOpacity 
                    style={styles.closeButton}
                    onPress={handleClose}
                  >
                    <Feather name="x" size={20} color="#8898aa" />
                  </TouchableOpacity>
                </View>
                
                {medications.length > 0 ? (
                  <ScrollView style={styles.scrollView}>
                    <View style={styles.grid}>
                      {medications.map((medicine) => (
                        <TouchableOpacity 
                          key={medicine._id}
                          style={[
                            styles.gridItem,
                            medicine.last_status && styles.gridItemTaken
                          ]}
                          onPress={() => {
                            handleClose();
                            setTimeout(() => {
                              onMedicationPress(medicine);
                            }, 300);
                          }}
                        >
                          <View style={styles.gridIconContainer}>
                            <MaterialCommunityIcons 
                              name="pill" 
                              size={26} 
                              color={medicine.last_status ? "#4cd964" : "#ff7e5f"} 
                            />
                            {medicine.last_status && (
                              <View style={styles.gridItemBadge}>
                                <FontAwesome name="check" size={10} color="#fff" />
                              </View>
                            )}
                            {isDueNow(medicine.time) && !medicine.last_status && (
                              <View style={styles.gridItemDueBadge}>
                                <MaterialCommunityIcons name="bell-ring" size={10} color="#fff" />
                              </View>
                            )}
                          </View>
                          <Text 
                            style={[
                              styles.gridItemName,
                              medicine.last_status && styles.gridItemNameTaken
                            ]}
                            numberOfLines={2}
                          >
                            {medicine.name}
                          </Text>
                          <Text style={styles.gridItemTime}>
                            {formatTime(medicine.time)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                ) : (
                  <View style={styles.emptyContainer}>
                    <MaterialCommunityIcons name="pill-off" size={50} color="#ddd" />
                    <Text style={styles.emptyText}>No medications scheduled for today</Text>
                  </View>
                )}
                
                <TouchableOpacity 
                  style={styles.addButton}
                  onPress={() => {
                    handleClose();
                    setTimeout(() => {
                      onAddPress();
                    }, 300);
                  }}
                >
                  <Text style={styles.addButtonText}>Add New Medication</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackground: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: width * 0.9,
    maxHeight: height * 0.8,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#fff',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingBottom: 15,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#32325d',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  scrollView: {
    flex: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginHorizontal: -5,
  },
  gridItem: {
    width: '48%',
    marginBottom: 15,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  gridItemTaken: {
    opacity: 0.7,
    borderColor: '#4cd964',
    borderWidth: 1,
  },
  gridIconContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    height: 60,
    marginBottom: 10,
  },
  gridItemBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#4cd964',
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridItemDueBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#ff3b30',
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridItemName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#32325d',
    textAlign: 'center',
    marginBottom: 5,
  },
  gridItemNameTaken: {
    color: '#8898aa',
  },
  gridItemTime: {
    fontSize: 12,
    color: '#8898aa',
    textAlign: 'center',
  },
  emptyContainer: {
    flex: 1,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#8898aa',
    marginVertical: 16,
    textAlign: 'center',
  },
  addButton: {
    backgroundColor: '#ff7e5f',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 30,
    marginTop: 15,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default MedicationsModal; 
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Box, Typography, Card, CardContent, Button, LinearProgress, 
  CircularProgress, Grid, Alert, Snackbar, IconButton, Chip
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PendingIcon from '@mui/icons-material/Pending';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CloseIcon from '@mui/icons-material/Close';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';
import { useNavigate } from 'react-router-dom';

// Simple audio for notifications
let notificationSound;
try {
  notificationSound = new Audio('/sounds/notification.mp3');
} catch (e) {
  console.log('Audio not supported');
}

const Home = () => {
  const navigate = useNavigate();
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [activeReminder, setActiveReminder] = useState(null);
  const [notification, setNotification] = useState(null);
  
  // Track which medicines have been notified today
  const notifiedMedicines = useRef(new Set());
  
  // Check if app is in focus
  const appFocused = useRef(true);
  
  // Function to format time for display
  const formatTime = (timeString) => {
    if (!timeString) return '';
    
    try {
      const [hours, minutes] = timeString.split(':').map(Number);
      const date = new Date();
      date.setHours(hours);
      date.setMinutes(minutes);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return timeString;
    }
  };

  // Fetch medicines scheduled for today
  const fetchMedicines = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('accessToken');
      const response = await axios.get(`${API_BASE_URL}/api/user/medicines/today`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data && response.data.medicines) {
        // Process medicines - sort by time and add display time
        const processedMedicines = response.data.medicines
          .map(med => ({
            ...med,
            displayTime: formatTime(med.time)
          }))
          .sort((a, b) => {
            const timeA = a.time.split(':').map(Number);
            const timeB = b.time.split(':').map(Number);
            return (timeA[0] * 60 + timeA[1]) - (timeB[0] * 60 + timeB[1]);
          });
          
        setMedicines(processedMedicines);
        
        // Calculate progress
        const taken = processedMedicines.filter(m => m.is_taken || m.last_status).length;
        const total = processedMedicines.length;
        setProgress(total > 0 ? (taken / total) * 100 : 0);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error fetching medicines:', error);
      setLoading(false);
      setNotification({
        message: 'Failed to load medications',
        severity: 'error'
      });
    }
  };

  // Take medicine function - simpler with just "take" action
  const takeMedicine = async (medicineId) => {
    try {
      const token = localStorage.getItem('accessToken');
      
      // First update locally for immediate UI feedback
      setMedicines(meds => 
        meds.map(med => 
          med._id === medicineId ? 
          { ...med, is_taken: true, last_status: true } : 
          med
        )
      );
      
      // Recalculate progress
      setMedicines(currentMeds => {
        const taken = currentMeds.filter(m => m.is_taken || m.last_status).length;
        const total = currentMeds.length;
        setProgress(total > 0 ? (taken / total) * 100 : 0);
        return currentMeds;
      });
      
      // Then update on server
      await axios.post(
        `${API_BASE_URL}/api/user/medicines/${medicineId}/status`,
        { completed: true },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Show confirmation notification
      setNotification({
        message: `Medicine marked as taken`,
        severity: 'success'
      });
      
      // Clear any active reminder for this medicine
      if (activeReminder && activeReminder._id === medicineId) {
        setActiveReminder(null);
      }
      
    } catch (error) {
      console.error('Error updating medicine status:', error);
      
      // Revert local state & show error
      fetchMedicines();
      
      setNotification({
        message: error.response?.data?.message || 'Failed to update status',
        severity: 'error'
      });
    }
  };

  // Navigation to calendar view
  const goToMedicineCalendar = () => {
    navigate('/calendar'); // Adjust based on your routing setup
  };

  // Check for medicines that need reminders
  const checkReminders = useCallback(() => {
    // Skip if there's already an active reminder
    if (activeReminder) return;
    
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTotalMinutes = currentHour * 60 + currentMinute;
    
    for (const medicine of medicines) {
      // Skip if already taken
      if (medicine.is_taken || medicine.last_status) continue;
      
      // Skip if already notified today
      if (notifiedMedicines.current.has(medicine._id)) continue;
      
      // Get medicine time
      const [hourStr, minuteStr] = medicine.time.split(':');
      const medicineHour = parseInt(hourStr, 10);
      const medicineMinute = parseInt(minuteStr, 10);
      const medicineTotalMinutes = medicineHour * 60 + medicineMinute;
      
      // Check if medicine is due now (within 5 minute window)
      const minutesUntilDose = medicineTotalMinutes - currentTotalMinutes;
      
      // If medicine is due now (±5 minutes) or overdue but less than 30 minutes past
      if ((minutesUntilDose >= -30 && minutesUntilDose <= 5)) {
        // Mark this medicine as notified
        notifiedMedicines.current.add(medicine._id);
        
        // Set as active reminder
        setActiveReminder(medicine);
        
        // Play notification sound if app is focused
        if (appFocused.current && notificationSound) {
          notificationSound.play().catch(e => console.log('Failed to play sound'));
        }
        
        // Show browser notification
        if (Notification.permission === "granted") {
          const notification = new Notification("Medicine Reminder", {
            body: `Time to take ${medicine.name} (${medicine.dosage})`,
            icon: "/favicon.ico"
          });
          
          notification.onclick = () => {
            window.focus();
            notification.close();
          };
        }
        
        // Only show one reminder at a time
        break;
      }
    }
  }, [medicines, activeReminder]);

  // Handle response to a medicine reminder
  const handleReminderResponse = (taken) => {
    if (activeReminder) {
      const medicineId = activeReminder._id;
      
      // Update the medicine status
      if (taken) {
        takeMedicine(medicineId);
      }
      
      // Close the reminder
      setActiveReminder(null);
    }
  };

  // Setup standard hooks
  useEffect(() => {
    if (Notification.permission !== "granted" && Notification.permission !== "denied") {
      Notification.requestPermission();
    }
    
    const handleVisibilityChange = () => {
      appFocused.current = document.visibilityState === 'visible';
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    fetchMedicines();
    const dataInterval = setInterval(fetchMedicines, 60000);
    const reminderInterval = setInterval(checkReminders, 30000);
    
    return () => {
      clearInterval(dataInterval);
      clearInterval(reminderInterval);
    };
  }, [checkReminders]);

  useEffect(() => {
    checkReminders();
  }, [medicines, checkReminders]);

  const handleNotificationClose = () => {
    setNotification(null);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <CircularProgress style={{ color: '#FF7F50' }} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>Today's Medications</Typography>
      
      {/* Active Reminder Alert */}
      {activeReminder && (
        <Alert 
          severity="warning"
          icon={<NotificationsActiveIcon fontSize="inherit" />}
          sx={{ 
            mb: 3, 
            animation: 'pulse 1.5s infinite',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#FFF5F0',
            borderLeft: '4px solid #FF7F50'
          }}
          action={
            <Box>
              <Button 
                variant="contained" 
                color="success" 
                size="small" 
                sx={{ mr: 1 }}
                onClick={() => handleReminderResponse(true)}
              >
                Take Now
              </Button>
              <Button 
                variant="outlined" 
                color="inherit" 
                size="small"
                onClick={() => handleReminderResponse(false)}
              >
                Dismiss
              </Button>
            </Box>
          }
        >
          <Box>
            <Typography variant="subtitle1" fontWeight="medium">
              It's time to take your medicine!
            </Typography>
            <Typography variant="body2">
              {activeReminder.name} ({activeReminder.dosage}) - {activeReminder.displayTime || formatTime(activeReminder.time)}
            </Typography>
          </Box>
        </Alert>
      )}
      
      {/* Calendar Button (replaces Schedule Preview) */}
      <Button 
        variant="outlined" 
        fullWidth 
        startIcon={<CalendarMonthIcon />}
        onClick={goToMedicineCalendar}
        sx={{
          mb: 3,
          borderColor: '#FF7F50',
          color: '#FF7F50',
          '&:hover': {
            borderColor: '#FF6347',
            backgroundColor: '#FFF5F0'
          },
          padding: 1.5
        }}
      >
        View Medicine Calendar
      </Button>
      
      {/* Progress Section */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>Today's Progress</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <Box sx={{ flexGrow: 1, mr: 1 }}>
            <LinearProgress 
              variant="determinate" 
              value={progress} 
              sx={{ 
                height: 10, 
                borderRadius: 5,
                backgroundColor: '#f5f5f5',
                '& .MuiLinearProgress-bar': {
                  backgroundColor: '#FF7F50'
                }
              }} 
            />
          </Box>
          <Typography variant="body2" color="text.secondary">
            {Math.round(progress)}%
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">
          {medicines.filter(med => med.is_taken || med.last_status).length} of {medicines.length} medications taken today
        </Typography>
      </Box>
      
      {/* Medications List */}
      {medicines.length > 0 ? (
        <Grid container spacing={2}>
          {medicines.map((medicine) => {
            const isTaken = medicine.is_taken || medicine.last_status;
            const isOverdue = medicine.time_passed && !isTaken;
            
            return (
              <Grid item xs={12} sm={6} md={4} key={medicine._id}>
                <Card 
                  sx={{ 
                    mb: 2, 
                    borderLeft: '4px solid',
                    borderColor: isTaken ? '#4CAF50' : isOverdue ? '#FF5252' : '#FF7F50',
                    backgroundColor: isTaken ? '#F1F8E9' : isOverdue ? '#FFF5F0' : '#fff'
                  }}
                  elevation={2}
                >
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="h6" component="div">{medicine.name}</Typography>
                      {isTaken ? (
                        <Chip 
                          icon={<CheckCircleIcon />} 
                          label="Taken" 
                          color="success" 
                          size="small" 
                          sx={{ fontWeight: 500 }}
                        />
                      ) : isOverdue ? (
                        <Chip 
                          icon={<AccessTimeIcon />} 
                          label="Overdue" 
                          color="error" 
                          size="small" 
                          sx={{ fontWeight: 500 }}
                        />
                      ) : (
                        <Chip 
                          icon={<PendingIcon />} 
                          label="Scheduled" 
                          color="warning" 
                          size="small" 
                          sx={{ fontWeight: 500 }}
                        />
                      )}
                    </Box>
                    
                    <Typography sx={{ mb: 1.5 }} color="text.secondary">
                      {medicine.dosage} - {medicine.displayTime || formatTime(medicine.time)}
                    </Typography>
                    
                    {medicine.notes && (
                      <Typography variant="body2" sx={{ mb: 1 }}>{medicine.notes}</Typography>
                    )}
                    
                    {/* Action Button - Only show the Take button if not taken yet */}
                    {!isTaken && (
                      <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
                        <Button 
                          variant="contained" 
                          color="primary"
                          fullWidth
                          onClick={() => takeMedicine(medicine._id)}
                          sx={{
                            backgroundColor: '#FF7F50',
                            '&:hover': {
                              backgroundColor: '#FF6347'
                            }
                          }}
                        >
                          Take Medicine
                        </Button>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      ) : (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="body1">No medications scheduled for today.</Typography>
          <Button
            variant="contained"
            sx={{
              mt: 2,
              backgroundColor: '#FF7F50',
              '&:hover': {
                backgroundColor: '#FF6347'
              }
            }}
            onClick={() => navigate('/add-medicine')} // Adjust route as needed
          >
            Add Medication
          </Button>
        </Box>
      )}
      
      {/* Notification Snackbar */}
      <Snackbar
        open={notification !== null}
        autoHideDuration={4000}
        onClose={handleNotificationClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={handleNotificationClose} 
          severity={notification?.severity || 'info'} 
          sx={{ width: '100%' }}
        >
          {notification?.message}
        </Alert>
      </Snackbar>
      
      {/* CSS for pulsing animation */}
      <style jsx global>{`
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.85; }
          100% { opacity: 1; }
        }
      `}</style>
    </Box>
  );
};

export default Home;

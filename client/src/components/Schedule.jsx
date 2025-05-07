import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Grid, Button, CircularProgress, Chip } from '@mui/material';
import { format, addDays, parseISO, startOfDay } from 'date-fns';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PendingIcon from '@mui/icons-material/Pending';

const Schedule = () => {
  // Start from today instead of beginning of week
  const [startDate, setStartDate] = useState(startOfDay(new Date()));
  const [schedule, setSchedule] = useState({});
  const [loading, setLoading] = useState(true);
  
  // Fetch medicine schedule
  const fetchSchedule = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      
      // Format date as YYYY-MM-DD
      const formattedStartDate = format(startDate, 'yyyy-MM-dd');
      const endDate = format(addDays(startDate, 6), 'yyyy-MM-dd');
      
      const response = await axios.get(
        `${API_BASE_URL}/api/user/medicines/schedule?start_date=${formattedStartDate}&end_date=${endDate}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data && response.data.schedule) {
        setSchedule(response.data.schedule);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error fetching schedule:', error);
      setLoading(false);
    }
  };
  
  // Handle medicine taken/untaken status
  const handleStatusChange = async (medicineId, completed) => {
    try {
      const token = localStorage.getItem('accessToken');
      await axios.post(
        `${API_BASE_URL}/api/user/medicines/${medicineId}/status`,
        { completed },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Refresh schedule to reflect changes
      fetchSchedule();
    } catch (error) {
      console.error('Error updating medicine status:', error);
    }
  };
  
  // Navigate to previous week
  const handlePrevWeek = () => {
    setStartDate(prevDate => addDays(prevDate, -7));
  };
  
  // Navigate to next week
  const handleNextWeek = () => {
    setStartDate(prevDate => addDays(prevDate, 7));
  };
  
  // Fetch schedule when startDate changes
  useEffect(() => {
    fetchSchedule();
  }, [startDate]);
  
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <CircularProgress />
      </Box>
    );
  }
  
  // Generate array of 7 days starting from startDate
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(startDate, i));
  const today = format(new Date(), 'yyyy-MM-dd');
  
  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Medication Schedule</Typography>
        <Box>
          <Button variant="outlined" onClick={handlePrevWeek} sx={{ mr: 1 }}>
            Previous Week
          </Button>
          <Button variant="outlined" onClick={handleNextWeek}>
            Next Week
          </Button>
        </Box>
      </Box>
      
      <Grid container spacing={2}>
        {weekDays.map(day => {
          const dateString = format(day, 'yyyy-MM-dd');
          const dayMedicines = schedule[dateString] || [];
          const isToday = dateString === today;
          
          return (
            <Grid item xs={12} sm={6} md={4} lg={3} key={dateString}>
              <Paper 
                sx={{ 
                  p: 2, 
                  bgcolor: isToday ? 'rgba(0, 128, 255, 0.1)' : 'background.paper',
                  border: isToday ? '1px solid rgba(0, 128, 255, 0.3)' : 'none'
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6">
                    {format(day, 'EEEE')}
                  </Typography>
                  <Typography variant="body2">
                    {format(day, 'MMM dd')}
                  </Typography>
                </Box>
                
                {isToday && (
                  <Chip label="Today" color="primary" size="small" sx={{ mb: 2 }} />
                )}
                
                {dayMedicines.length > 0 ? (
                  dayMedicines.map(medicine => (
                    <Box 
                      key={medicine.id} 
                      sx={{ 
                        mb: 2, 
                        p: 1.5, 
                        borderRadius: 1,
                        bgcolor: medicine.completed ? 'rgba(76, 175, 80, 0.1)' : 'rgba(255, 152, 0, 0.1)',
                        border: '1px solid',
                        borderColor: medicine.completed ? 'rgba(76, 175, 80, 0.3)' : 'rgba(255, 152, 0, 0.3)',
                      }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Box>
                          <Typography variant="subtitle1">{medicine.name}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {medicine.dosage} - {medicine.time}
                          </Typography>
                        </Box>
                        {medicine.completed ? (
                          <CheckCircleIcon color="success" />
                        ) : (
                          <PendingIcon color="warning" />
                        )}
                      </Box>
                      
                      {isToday && (
                        <Button 
                          fullWidth 
                          size="small" 
                          variant="outlined"
                          color={medicine.completed ? "error" : "success"}
                          onClick={() => handleStatusChange(medicine.id, !medicine.completed)}
                          sx={{ mt: 1 }}
                        >
                          {medicine.completed ? "Mark as Not Taken" : "Mark as Taken"}
                        </Button>
                      )}
                    </Box>
                  ))
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                    No medications scheduled
                  </Typography>
                )}
              </Paper>
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
};

export default Schedule;

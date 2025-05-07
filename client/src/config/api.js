// Get the server URL from environment variable or use a default
const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'http://192.168.1.4:5000';

export const API_BASE_URL = SERVER_URL;

// Helper function for time conversion - handle timezone display issues
export const formatTime = (time24hr) => {
  if (!time24hr) return '';
  
  try {
    // Ensure consistent format (HH:MM)
    let hour, minute;
    
    if (time24hr.includes('T')) {
      // Handle ISO format
      [hour, minute] = time24hr.split('T')[1].split(':');
    } else {
      // Handle HH:MM format
      [hour, minute] = time24hr.split(':');
    }
    
    hour = parseInt(hour, 10);
    minute = parseInt(minute, 10);
    
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  } catch (e) {
    console.error('Error formatting time:', e);
    return time24hr;
  }
};

// Convert 24-hour time to 12-hour display format
export const convertTo12Hour = (time24hr) => {
  if (!time24hr) return '';
  
  try {
    const [hours, minutes] = time24hr.split(':').map(Number);
    
    let period = 'AM';
    let hours12 = hours;
    
    if (hours >= 12) {
      period = 'PM';
      hours12 = hours === 12 ? 12 : hours - 12;
    }
    
    hours12 = hours12 === 0 ? 12 : hours12;
    
    return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
  } catch (e) {
    console.error('Error converting time format:', e);
    return time24hr;
  }
};

// Create a full date object from a time string for the current day
export const createTimeForToday = (timeString) => {
  try {
    const [hours, minutes] = timeString.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date;
  } catch (e) {
    console.error('Error creating date from time:', e);
    return new Date();
  }
};

// utils/helpers.js (Enhanced with queue management and new features)
import { DATE_FORMATS, ADD_ONS_CATALOG, QUEUE_SETTINGS, BOOKING_SETTINGS } from './constants';

/**
 * Format a date string or Date object using Intl.DateTimeFormat
 * @param {string|Date} date - Date to format
 * @param {object} options - Intl.DateTimeFormat options
 * @returns {string} - Formatted date string
 */
export const formatDate = (date, options = DATE_FORMATS.MEDIUM) => {
  if (!date) return '';
  
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', options).format(dateObj);
};

/**
 * Format time from 24h format to 12h format
 * @param {string} timeString - Time string in 24h format (HH:MM)
 * @returns {string} - Time string in 12h format
 */
export const formatTime = (timeString) => {
  if (!timeString) return '';
  
  const [hours, minutes] = timeString.split(':');
  const hour = parseInt(hours, 10);
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  
  return `${hour12}:${minutes} ${period}`;
};

/**
 * Format duration in minutes to human-readable format
 * @param {number} durationMinutes - Duration in minutes
 * @returns {string} - Formatted duration string
 */
export const formatDuration = (durationMinutes) => {
  if (durationMinutes < 60) {
    return `${durationMinutes} ${durationMinutes === 1 ? 'minute' : 'minutes'}`;
  } else {
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;
    
    if (minutes === 0) {
      return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
    } else {
      return `${hours} ${hours === 1 ? 'hour' : 'hours'} ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
    }
  }
};

/**
 * Format a price number to currency string
 * @param {number} price - Price to format
 * @param {string} currency - Currency code
 * @returns {string} - Formatted price string
 */
export const formatPrice = (price, currency = 'PHP') => {
  if (price === undefined || price === null) return '';
  
  // Format price for Philippine Peso with ₱ symbol
  if (currency === 'PHP') {
    return `₱${Number(price).toFixed(2)}`;
  }
  
  // For other currencies, use Intl.NumberFormat
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency
  }).format(price);
};

/**
 * Get today's date as ISO string (YYYY-MM-DD)
 * @returns {string} - Today's date as ISO string
 */
export const getTodayISOString = () => {
  return new Date().toISOString().split('T')[0];
};

/**
 * Calculate estimated wait time based on queue position and service durations
 * @param {number} position - Queue position
 * @param {Array} queue - Array of queue items with service durations
 * @param {number} averageServiceTime - Average service time in minutes
 * @returns {string} - Formatted wait time
 */
export const calculateWaitTime = (position, queue = [], averageServiceTime = QUEUE_SETTINGS.AVERAGE_SERVICE_TIME) => {
  if (!queue || queue.length === 0 || position <= 0) {
    return "0 min";
  }
  
  let waitTimeMinutes = 0;
  
  // Sum up service durations for all appointments ahead in the queue
  for (let i = 0; i < Math.min(position - 1, queue.length); i++) {
    const appointment = queue[i];
    const serviceDuration = appointment.service?.duration || averageServiceTime;
    const addOnsDuration = calculateAddOnsDuration(appointment.add_ons_data);
    waitTimeMinutes += serviceDuration + addOnsDuration;
  }
  
  // Format wait time
  if (waitTimeMinutes < 60) {
    return `${waitTimeMinutes} min`;
  } else {
    const hours = Math.floor(waitTimeMinutes / 60);
    const minutes = waitTimeMinutes % 60;
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
};

/**
 * Calculate total duration for add-ons
 * @param {string} addOnsData - JSON string of add-on IDs
 * @returns {number} - Total duration in minutes
 */
export const calculateAddOnsDuration = (addOnsData) => {
  if (!addOnsData) return 0;
  
  try {
    const addOnIds = JSON.parse(addOnsData);
    return addOnIds.reduce((total, addonId) => {
      const addon = ADD_ONS_CATALOG.find(a => a.id === addonId);
      return total + (addon?.duration || 0);
    }, 0);
  } catch {
    return 0;
  }
};

/**
 * Calculate total price for add-ons
 * @param {string} addOnsData - JSON string of add-on IDs
 * @returns {number} - Total price
 */
export const calculateAddOnsPrice = (addOnsData) => {
  if (!addOnsData) return 0;
  
  try {
    const addOnIds = JSON.parse(addOnsData);
    return addOnIds.reduce((total, addonId) => {
      const addon = ADD_ONS_CATALOG.find(a => a.id === addonId);
      return total + (addon?.price || 0);
    }, 0);
  } catch {
    return 0;
  }
};

/**
 * Get display text for multiple services
 * @param {object} appointment - Appointment object
 * @param {Array} services - Array of all available services
 * @returns {string} - Formatted services display text
 */
export const getServicesDisplay = (appointment, services = []) => {
  const servicesList = [];
  
  // Add primary service
  if (appointment.service) {
    servicesList.push(appointment.service.name);
  }
  
  // Add additional services
  if (appointment.services_data) {
    try {
      const serviceIds = JSON.parse(appointment.services_data);
      // Skip the first one as it's already added as primary service
      const additionalServiceIds = serviceIds.slice(1);
      
      additionalServiceIds.forEach(serviceId => {
        const service = services.find(s => s.id === serviceId);
        if (service) {
          servicesList.push(service.name);
        }
      });
      
      // If we couldn't find service details, just show count
      if (additionalServiceIds.length > 0 && servicesList.length === 1) {
        servicesList.push(`+${additionalServiceIds.length} more services`);
      }
    } catch (e) {
      console.error('Error parsing services data:', e);
    }
  }
  
  return servicesList.join(', ');
};

/**
 * Get display text for add-ons
 * @param {string} addOnsData - JSON string of add-on IDs
 * @returns {string} - Formatted add-ons display text
 */
export const getAddOnsDisplay = (addOnsData) => {
  if (!addOnsData) return '';
  
  try {
    const addOnIds = JSON.parse(addOnsData);
    const addOnNames = addOnIds.map(addonId => {
      const addon = ADD_ONS_CATALOG.find(a => a.id === addonId);
      return addon?.name || 'Unknown Add-on';
    });
    
    return addOnNames.join(', ');
  } catch {
    return '';
  }
};

/**
 * Calculate total appointment price including services, add-ons, and fees
 * @param {object} appointment - Appointment object
 * @returns {number} - Total price
 */
export const calculateTotalPrice = (appointment) => {
  let total = appointment.total_price || appointment.service?.price || 0;
  
  // Add urgent fee if applicable
  if (appointment.is_urgent) {
    total += QUEUE_SETTINGS.URGENT_FEE;
  }
  
  return total;
};

/**
 * Calculate total appointment duration including services and add-ons
 * @param {object} appointment - Appointment object
 * @returns {number} - Total duration in minutes
 */
export const calculateTotalDuration = (appointment) => {
  let duration = appointment.total_duration || appointment.service?.duration || 0;
  
  // If total_duration is not available, calculate from add-ons
  if (!appointment.total_duration && appointment.add_ons_data) {
    duration += calculateAddOnsDuration(appointment.add_ons_data);
  }
  
  return duration;
};

/**
 * Get queue position for a customer
 * @param {string} appointmentId - Appointment ID
 * @param {Array} queue - Array of queued appointments
 * @returns {number|null} - Queue position or null if not found
 */
export const getQueuePosition = (appointmentId, queue) => {
  const index = queue.findIndex(apt => apt.id === appointmentId);
  return index >= 0 ? index + 1 : null;
};

/**
 * Check if barber is at full capacity
 * @param {number} currentAppointments - Current number of appointments
 * @param {number} maxCapacity - Maximum capacity (optional)
 * @returns {boolean} - Whether barber is at full capacity
 */
export const isBarberAtCapacity = (currentAppointments, maxCapacity = QUEUE_SETTINGS.DEFAULT_CAPACITY) => {
  return currentAppointments >= maxCapacity;
};

/**
 * Get next available queue number
 * @param {Array} queue - Current queue
 * @returns {number} - Next available queue number
 */
export const getNextQueueNumber = (queue) => {
  if (!queue || queue.length === 0) return 1;
  
  const maxQueueNumber = Math.max(
    0,
    ...queue.map(apt => apt.queue_number || 0)
  );
  
  return maxQueueNumber + 1;
};

/**
 * Validate booking data
 * @param {object} bookingData - Booking data to validate
 * @returns {object} - Validation result with isValid and errors
 */
export const validateBookingData = (bookingData) => {
  const errors = [];
  
  // Required fields
  if (!bookingData.barber_id) {
    errors.push('Barber is required');
  }
  
  if (!bookingData.services || bookingData.services.length === 0) {
    errors.push('At least one service is required');
  }
  
  if (!bookingData.appointment_date) {
    errors.push('Appointment date is required');
  }
  
  // Validate date is not in the past
  const appointmentDate = new Date(bookingData.appointment_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (appointmentDate < today) {
    errors.push('Appointment date cannot be in the past');
  }
  
  // Validate advance booking limit
  const maxAdvanceDays = BOOKING_SETTINGS.ADVANCE_BOOKING_DAYS;
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + maxAdvanceDays);
  
  if (appointmentDate > maxDate) {
    errors.push(`Cannot book more than ${maxAdvanceDays} days in advance`);
  }
  
  // Validate service count
  if (bookingData.services && bookingData.services.length > BOOKING_SETTINGS.MAX_SERVICES_PER_BOOKING) {
    errors.push(`Maximum ${BOOKING_SETTINGS.MAX_SERVICES_PER_BOOKING} services allowed per booking`);
  }
  
  // Validate add-ons count
  if (bookingData.addOns && bookingData.addOns.length > BOOKING_SETTINGS.MAX_ADDONS_PER_BOOKING) {
    errors.push(`Maximum ${BOOKING_SETTINGS.MAX_ADDONS_PER_BOOKING} add-ons allowed per booking`);
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Format queue status for display
 * @param {object} queueInfo - Queue information
 * @returns {string} - Formatted queue status
 */
export const formatQueueStatus = (queueInfo) => {
  if (!queueInfo) return 'Unknown';
  
  const { current, queue, capacity } = queueInfo;
  const queueLength = queue?.length || 0;
  
  if (current) {
    return `Serving customer • ${queueLength} waiting`;
  } else if (queueLength === 0) {
    return 'No queue';
  } else if (queueLength >= (capacity || QUEUE_SETTINGS.DEFAULT_CAPACITY)) {
    return `Queue full (${queueLength})`;
  } else {
    return `${queueLength} in queue`;
  }
};

/**
 * Get barber status color class
 * @param {string} status - Barber status
 * @returns {string} - CSS class for status color
 */
export const getBarberStatusColor = (status) => {
  const statusMap = {
    'available': 'success',
    'busy': 'warning',
    'break': 'info',
    'offline': 'secondary'
  };
  
  return statusMap[status?.toLowerCase()] || 'primary';
};

/**
 * Get appointment status color class
 * @param {string} status - Appointment status
 * @returns {string} - CSS class for status color
 */
export const getStatusColor = (status) => {
  const statusMap = {
    'pending': 'warning',
    'scheduled': 'info',
    'ongoing': 'primary',
    'done': 'success',
    'cancelled': 'danger'
  };
  
  return statusMap[status?.toLowerCase()] || 'secondary';
};

/**
 * Get appropriate icon for appointment status
 * @param {string} status - Appointment status
 * @returns {string} - Bootstrap icon class
 */
export const getStatusIcon = (status) => {
  const iconMap = {
    'pending': 'bi-clock-fill',
    'scheduled': 'bi-calendar-check',
    'ongoing': 'bi-scissors',
    'done': 'bi-check-circle-fill',
    'cancelled': 'bi-x-circle-fill'
  };
  
  return iconMap[status?.toLowerCase()] || 'bi-question-circle';
};

/**
 * Truncate text with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} - Truncated text
 */
export const truncateText = (text, maxLength = 100) => {
  if (!text || text.length <= maxLength) {
    return text;
  }
  
  return `${text.substring(0, maxLength)}...`;
};

/**
 * Get initials from name
 * @param {string} name - Full name
 * @returns {string} - Initials
 */
export const getInitials = (name) => {
  if (!name) return '';
  
  return name
    .split(' ')
    .map(part => part.charAt(0))
    .join('')
    .toUpperCase();
};

/**
 * Check if two dates are the same day
 * @param {Date|string} date1 - First date
 * @param {Date|string} date2 - Second date
 * @returns {boolean} - Whether the dates are the same day
 */
export const isSameDay = (date1, date2) => {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
};

/**
 * Check if date is today
 * @param {Date|string} date - Date to check
 * @returns {boolean} - Whether the date is today
 */
export const isToday = (date) => {
  return isSameDay(date, new Date());
};

/**
 * Generate a random ID
 * @param {number} length - Length of the ID
 * @returns {string} - Random ID
 */
export const generateId = (length = 8) => {
  return Math.random().toString(36).substring(2, 2 + length);
};

/**
 * Deep clone an object
 * @param {object} obj - Object to clone
 * @returns {object} - Cloned object
 */
export const deepClone = (obj) => {
  return JSON.parse(JSON.stringify(obj));
};

/**
 * Debounce function calls
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} - Debounced function
 */
export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

/**
 * Download data as a CSV file
 * @param {Array} data - Array of objects to download
 * @param {string} filename - Filename for the CSV
 */
export const downloadCSV = (data, filename = 'download.csv') => {
  if (!data || !data.length) return;
  
  // Get headers from the first object
  const headers = Object.keys(data[0]);
  
  // Convert data to CSV format
  const csvRows = [
    headers.join(','), // Header row
    ...data.map(row => 
      headers.map(header => {
        const cell = row[header];
        // Handle commas and quotes in the data
        const cellStr = cell === null || cell === undefined ? '' : String(cell);
        return cellStr.includes(',') || cellStr.includes('"') 
          ? `"${cellStr.replace(/"/g, '""')}"` 
          : cellStr;
      }).join(',')
    )
  ];
  
  // Create CSV content
  const csvContent = csvRows.join('\n');
  
  // Create a blob and download link
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  // Create a temporary link and trigger download
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Calculate appointment analytics
 * @param {Array} appointments - Array of appointments
 * @returns {object} - Analytics data
 */
export const calculateAppointmentAnalytics = (appointments) => {
  if (!appointments || appointments.length === 0) {
    return {
      total: 0,
      completed: 0,
      cancelled: 0,
      pending: 0,
      revenue: 0,
      averageDuration: 0,
      completionRate: 0
    };
  }
  
  const analytics = {
    total: appointments.length,
    completed: 0,
    cancelled: 0,
    pending: 0,
    revenue: 0,
    totalDuration: 0
  };
  
  appointments.forEach(appointment => {
    switch (appointment.status) {
      case 'done':
        analytics.completed++;
        analytics.revenue += calculateTotalPrice(appointment);
        break;
      case 'cancelled':
        analytics.cancelled++;
        break;
      case 'pending':
        analytics.pending++;
        break;
    }
    
    analytics.totalDuration += calculateTotalDuration(appointment);
  });
  
  analytics.averageDuration = Math.round(analytics.totalDuration / appointments.length);
  analytics.completionRate = analytics.total > 0 ? (analytics.completed / analytics.total) * 100 : 0;
  
  return analytics;
};

export default {
  formatDate,
  formatTime,
  formatDuration,
  formatPrice,
  getTodayISOString,
  calculateWaitTime,
  calculateAddOnsDuration,
  calculateAddOnsPrice,
  getServicesDisplay,
  getAddOnsDisplay,
  calculateTotalPrice,
  calculateTotalDuration,
  getQueuePosition,
  isBarberAtCapacity,
  getNextQueueNumber,
  validateBookingData,
  formatQueueStatus,
  getBarberStatusColor,
  getStatusColor,
  getStatusIcon,
  truncateText,
  getInitials,
  isSameDay,
  isToday,
  generateId,
  deepClone,
  debounce,
  downloadCSV,
  calculateAppointmentAnalytics
};
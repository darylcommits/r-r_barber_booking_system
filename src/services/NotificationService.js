// services/NotificationService.js
import { supabase } from '../supabaseClient';

class NotificationService {
  constructor() {
    this.notifications = new Map();
  }

  // Initialize notification listener
  async initialize() {
    // Listen for appointment changes
    supabase
      .channel('appointments')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'appointments',
          filter: `customer_id=eq.${(await supabase.auth.getUser()).data.user?.id}`
        }, 
        (payload) => {
          this.handleAppointmentChange(payload);
        }
      )
      .subscribe();

    // Check for upcoming appointments on initialization
    this.checkUpcomingAppointments();

    // Set interval to check for reminders every minute
    setInterval(() => {
      this.checkUpcomingAppointments();
    }, 60000);
  }

  // Handle real-time appointment changes
  async handleAppointmentChange(payload) {
    const { eventType, new: newRecord, old: oldRecord } = payload;

    switch (eventType) {
      case 'INSERT':
        this.showNotification('New Appointment', `Your appointment has been scheduled for ${newRecord.appointment_date} at ${newRecord.appointment_time}`);
        break;
      case 'UPDATE':
        if (oldRecord.status !== newRecord.status) {
          this.handleStatusChange(newRecord);
        }
        if (oldRecord.appointment_date !== newRecord.appointment_date || oldRecord.appointment_time !== newRecord.appointment_time) {
          this.showNotification('Appointment Rescheduled', `Your appointment has been moved to ${newRecord.appointment_date} at ${newRecord.appointment_time}`);
        }
        break;
      case 'DELETE':
        this.showNotification('Appointment Cancelled', 'Your appointment has been cancelled');
        break;
    }
  }

  // Handle appointment status changes
  handleStatusChange(appointment) {
    const messages = {
      'ongoing': 'Your appointment is now in progress',
      'done': 'Your appointment has been completed. Thank you for visiting!',
      'cancelled': 'Your appointment has been cancelled'
    };

    if (messages[appointment.status]) {
      this.showNotification('Appointment Status Update', messages[appointment.status]);
    }
  }

  // Check for upcoming appointments and send reminders
  async checkUpcomingAppointments() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const in2Hours = new Date(now.getTime() + 2 * 60 * 60 * 1000);

      // Get appointments for next 24 hours
      const { data: appointments } = await supabase
        .from('appointments')
        .select(`
          *,
          barber:barber_id(full_name),
          service:service_id(name)
        `)
        .eq('customer_id', user.id)
        .eq('status', 'scheduled')
        .gte('appointment_date', now.toISOString().split('T')[0])
        .lte('appointment_date', tomorrow.toISOString().split('T')[0]);

      appointments?.forEach(appointment => {
        const appointmentTime = new Date(`${appointment.appointment_date}T${appointment.appointment_time}`);
        const timeDiff = appointmentTime.getTime() - now.getTime();

        // Send reminder 2 hours before
        if (timeDiff > 0 && timeDiff < 2 * 60 * 60 * 1000) {
          const key = `${appointment.id}_2hours`;
          if (!this.notifications.has(key)) {
            this.showNotification(
              'Appointment Reminder',
              `Your appointment with ${appointment.barber.full_name} for ${appointment.service.name} is in 2 hours`
            );
            this.notifications.set(key, true);
          }
        }

        // Send reminder 30 minutes before
        if (timeDiff > 0 && timeDiff < 30 * 60 * 1000) {
          const key = `${appointment.id}_30mins`;
          if (!this.notifications.has(key)) {
            this.showNotification(
              'Appointment Reminder',
              `Your appointment is in 30 minutes. Please arrive on time.`
            );
            this.notifications.set(key, true);
          }
        }
      });
    } catch (error) {
      console.error('Error checking upcoming appointments:', error);
    }
  }

  // Show notification based on platform
  showNotification(title, body) {
    // Check if we're in a mobile app (Capacitor)
    if (window.Capacitor) {
      this.showMobileNotification(title, body);
    } else {
      this.showWebNotification(title, body);
    }
  }

  // Show mobile push notification
  async showMobileNotification(title, body) {
    try {
      const { LocalNotifications } = window.Capacitor.Plugins;
      
      await LocalNotifications.schedule({
        notifications: [
          {
            title,
            body,
            id: Date.now(),
            schedule: { at: new Date() }
          }
        ]
      });
    } catch (error) {
      console.error('Error showing mobile notification:', error);
      // Fallback to browser notification
      this.showWebNotification(title, body);
    }
  }

  // Show web browser notification
  async showWebNotification(title, body) {
    // Request permission if not granted
    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        // Fallback to in-app notification
        this.showInAppNotification(title, body);
        return;
      }
    }

    // Show browser notification if permission is granted
    if (Notification.permission === 'granted') {
      const notification = new Notification(title, {
        body,
        icon: '/favicon.ico'
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } else {
      // Fallback to in-app notification
      this.showInAppNotification(title, body);
    }
  }

  // Show in-app notification (for when push notifications are not available)
  showInAppNotification(title, body) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'alert alert-info alert-dismissible fade show position-fixed';
    notification.style.top = '20px';
    notification.style.right = '20px';
    notification.style.zIndex = '9999';
    notification.style.minWidth = '300px';
    
    notification.innerHTML = `
      <h6 class="alert-heading">${title}</h6>
      <p class="mb-0">${body}</p>
      <button type="button" class="btn-close" aria-label="Close" onclick="this.parentElement.remove()"></button>
    `;

    // Add to page
    document.body.appendChild(notification);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 5000);
  }

  // Queue notification when user is in queue
  async notifyQueuePosition(appointmentId) {
    try {
      const { data: appointment } = await supabase
        .from('appointments')
        .select(`
          *,
          barber:barber_id(full_name),
          service:service_id(name)
        `)
        .eq('id', appointmentId)
        .single();

      if (!appointment) return;

      // Get current queue position
      const { data: queueData } = await supabase
        .from('appointments')
        .select('id')
        .eq('barber_id', appointment.barber_id)
        .eq('appointment_date', appointment.appointment_date)
        .eq('status', 'scheduled')
        .lt('appointment_time', appointment.appointment_time);

      const position = (queueData?.length || 0) + 1;

      // Notify when 2 people ahead
      if (position === 3) {
        this.showNotification(
          'Your Turn is Coming Up',
          'You are 3rd in line. Please be ready!'
        );
      }

      // Notify when next
      if (position === 1) {
        this.showNotification(
          'You\'re Next!',
          'Please proceed to the barber chair.'
        );
      }
    } catch (error) {
      console.error('Error checking queue position:', error);
    }
  }

  // Clear all notifications
  clearNotifications() {
    this.notifications.clear();
  }
}

// Export singleton instance
export const notificationService = new NotificationService();
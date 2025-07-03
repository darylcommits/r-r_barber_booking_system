// services/ApiService.js (Enhanced with queue management and new features)
import { supabase } from '../supabaseClient';

/**
 * Enhanced API Service for handling all barbershop operations
 */
class ApiService {
  
  // =====================
  // USER MANAGEMENT
  // =====================
  
  async getCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    return user;
  }

  async getUserProfile(userId) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (error) throw error;
    return data;
  }

  async updateUserProfile(userId, updates) {
    const { data, error } = await supabase
      .from('users')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async updateBarberStatus(barberId, status) {
    const { data, error } = await supabase
      .from('users')
      .update({
        barber_status: status,
        updated_at: new Date().toISOString()
      })
      .eq('id', barberId)
      .eq('role', 'barber')
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  // =====================
  // APPOINTMENT MANAGEMENT (Enhanced)
  // =====================

  async getAppointments(filters = {}) {
    let query = supabase
      .from('appointments')
      .select(`
        *,
        customer:customer_id(id, full_name, email, phone),
        barber:barber_id(id, full_name, email, phone, barber_status),
        service:service_id(id, name, price, duration, description)
      `);
    
    // Apply filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        if (key === 'date_range' && value.from && value.to) {
          query = query.gte('appointment_date', value.from).lte('appointment_date', value.to);
        } else if (key === 'search' && value.trim()) {
          // Enhanced search including services and add-ons
          query = query.or(`customer.full_name.ilike.%${value}%,barber.full_name.ilike.%${value}%,notes.ilike.%${value}%`);
        } else {
          query = query.eq(key, value);
        }
      }
    });
    
    // Default sorting by queue number, then by appointment time
    if (filters.sort_by) {
      query = query.order(filters.sort_by, { ascending: filters.sort_dir !== 'desc' });
    } else {
      query = query
        .order('appointment_date', { ascending: true })
        .order('queue_number', { ascending: true, nullsLast: true })
        .order('appointment_time', { ascending: true });
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    return data;
  }

  async createAppointmentRequest(appointmentData) {
    // Enhanced appointment creation with queue management
    const { data, error } = await supabase
      .from('appointments')
      .insert([{
        ...appointmentData,
        status: 'pending', // All new appointments start as pending
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select(`
        *,
        customer:customer_id(id, full_name, email, phone),
        barber:barber_id(id, full_name, email, phone),
        service:service_id(id, name, price, duration, description)
      `)
      .single();
    
    if (error) throw error;
    return data;
  }

  async confirmAppointment(appointmentId, queueNumber, isUrgent = false) {
    const updates = {
      status: 'scheduled',
      queue_number: queueNumber,
      updated_at: new Date().toISOString()
    };

    // If urgent, need to adjust other queue numbers
    if (isUrgent) {
      const appointment = await this.getAppointmentById(appointmentId);
      
      // Increment queue numbers for existing appointments
      await supabase
        .from('appointments')
        .update({ 
          queue_number: supabase.raw('queue_number + 1'),
          updated_at: new Date().toISOString()
        })
        .eq('barber_id', appointment.barber_id)
        .eq('appointment_date', appointment.appointment_date)
        .eq('status', 'scheduled')
        .gte('queue_number', 1);
      
      updates.queue_number = 1;
    }

    const { data, error } = await supabase
      .from('appointments')
      .update(updates)
      .eq('id', appointmentId)
      .select(`
        *,
        customer:customer_id(id, full_name, email, phone),
        barber:barber_id(id, full_name, email, phone),
        service:service_id(id, name, price, duration, description)
      `)
      .single();
    
    if (error) throw error;
    return data;
  }

  async declineAppointment(appointmentId, reason = '') {
    const { data, error } = await supabase
      .from('appointments')
      .update({
        status: 'cancelled',
        cancellation_reason: reason,
        updated_at: new Date().toISOString()
      })
      .eq('id', appointmentId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async updateAppointmentStatus(appointmentId, status) {
    const updates = {
      status,
      updated_at: new Date().toISOString()
    };

    // Handle queue number based on status
    if (status === 'ongoing') {
      updates.queue_number = 0; // 0 means currently being served
    } else if (status === 'done' || status === 'cancelled') {
      updates.queue_number = null; // Remove from queue
    }

    const { data, error } = await supabase
      .from('appointments')
      .update(updates)
      .eq('id', appointmentId)
      .select(`
        *,
        customer:customer_id(id, full_name, email, phone),
        barber:barber_id(id, full_name, email, phone),
        service:service_id(id, name, price, duration, description)
      `)
      .single();
    
    if (error) throw error;
    return data;
  }

  async rescheduleAppointment(appointmentId, newDate, newQueueNumber = null) {
    const updates = {
      appointment_date: newDate,
      status: 'pending', // Needs re-confirmation for new date
      queue_number: newQueueNumber,
      is_rebooking: true,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('appointments')
      .update(updates)
      .eq('id', appointmentId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async getAppointmentById(appointmentId) {
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        *,
        customer:customer_id(id, full_name, email, phone),
        barber:barber_id(id, full_name, email, phone),
        service:service_id(id, name, price, duration, description)
      `)
      .eq('id', appointmentId)
      .single();
    
    if (error) throw error;
    return data;
  }

  async deleteAppointment(appointmentId) {
    const { error } = await supabase
      .from('appointments')
      .delete()
      .eq('id', appointmentId);
    
    if (error) throw error;
    return true;
  }

  // =====================
  // QUEUE MANAGEMENT (New)
  // =====================

  async getBarberQueue(barberId, date) {
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        *,
        customer:customer_id(id, full_name, email, phone),
        service:service_id(id, name, price, duration, description)
      `)
      .eq('barber_id', barberId)
      .eq('appointment_date', date)
      .in('status', ['scheduled', 'ongoing'])
      .order('queue_number', { ascending: true, nullsLast: true });
    
    if (error) throw error;
    
    const current = data?.find(apt => apt.status === 'ongoing') || null;
    const queue = data?.filter(apt => apt.status === 'scheduled') || [];
    
    return { current, queue, total: data?.length || 0 };
  }

  async getPendingRequests(barberId, date = null) {
    let query = supabase
      .from('appointments')
      .select(`
        *,
        customer:customer_id(id, full_name, email, phone),
        service:service_id(id, name, price, duration, description)
      `)
      .eq('barber_id', barberId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (date) {
      query = query.eq('appointment_date', date);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    return data || [];
  }

  async getNextQueueNumber(barberId, date) {
    const { data, error } = await supabase
      .from('appointments')
      .select('queue_number')
      .eq('barber_id', barberId)
      .eq('appointment_date', date)
      .eq('status', 'scheduled')
      .order('queue_number', { ascending: false })
      .limit(1);
    
    if (error) throw error;
    
    const maxQueueNumber = data?.[0]?.queue_number || 0;
    return maxQueueNumber + 1;
  }

  async advanceQueue(barberId, date) {
    // Move the first person in queue to 'ongoing' status
    const { data: nextCustomer, error: nextError } = await supabase
      .from('appointments')
      .select('id')
      .eq('barber_id', barberId)
      .eq('appointment_date', date)
      .eq('status', 'scheduled')
      .order('queue_number', { ascending: true })
      .limit(1)
      .single();

    if (nextError && nextError.code !== 'PGRST116') throw nextError;
    
    if (nextCustomer) {
      return await this.updateAppointmentStatus(nextCustomer.id, 'ongoing');
    }
    
    return null;
  }

  // =====================
  // SERVICES MANAGEMENT (Enhanced)
  // =====================

  async getServices(includeInactive = false) {
    let query = supabase
      .from('services')
      .select('*');
    
    if (!includeInactive) {
      query = query.eq('is_active', true);
    }
    
    query = query.order('name');
    
    const { data, error } = await query;
    
    if (error) throw error;
    return data;
  }

  async createService(serviceData) {
    const { data, error } = await supabase
      .from('services')
      .insert([{
        ...serviceData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async updateService(serviceId, updates) {
    const { data, error } = await supabase
      .from('services')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', serviceId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async deleteService(serviceId) {
    const { error } = await supabase
      .from('services')
      .delete()
      .eq('id', serviceId);
    
    if (error) throw error;
    return true;
  }

  // =====================
  // ADD-ONS MANAGEMENT (New)
  // =====================

  getAddOns() {
    // Return predefined add-ons
    return [
      { id: 'addon1', name: 'Beard Trim', price: 50.00, duration: 15, category: 'beard_care', description: 'Professional beard trimming and styling' },
      { id: 'addon2', name: 'Hot Towel Treatment', price: 30.00, duration: 10, category: 'facial_care', description: 'Relaxing hot towel facial treatment' },
      { id: 'addon3', name: 'Scalp Massage', price: 80.00, duration: 20, category: 'wellness', description: 'Therapeutic scalp massage' },
      { id: 'addon4', name: 'Hair Wash', price: 40.00, duration: 15, category: 'hair_care', description: 'Professional hair washing and conditioning' },
      { id: 'addon5', name: 'Styling', price: 60.00, duration: 20, category: 'styling', description: 'Hair styling with premium products' },
      { id: 'addon6', name: 'Hair Wax Application', price: 25.00, duration: 5, category: 'styling', description: 'Professional hair wax styling' },
      { id: 'addon7', name: 'Eyebrow Trim', price: 35.00, duration: 10, category: 'grooming', description: 'Eyebrow trimming and shaping' },
      { id: 'addon8', name: 'Mustache Trim', price: 20.00, duration: 5, category: 'grooming', description: 'Precision mustache trimming' }
    ];
  }

  calculateAddOnsTotal(addOnIds) {
    const addOns = this.getAddOns();
    return addOnIds.reduce((total, addonId) => {
      const addon = addOns.find(a => a.id === addonId);
      return total + (addon?.price || 0);
    }, 0);
  }

  calculateAddOnsDuration(addOnIds) {
    const addOns = this.getAddOns();
    return addOnIds.reduce((total, addonId) => {
      const addon = addOns.find(a => a.id === addonId);
      return total + (addon?.duration || 0);
    }, 0);
  }

  // =====================
  // BARBER MANAGEMENT (Enhanced)
  // =====================

  async getBarbers(includeStatus = true) {
    let selectFields = 'id, full_name, email, phone';
    if (includeStatus) {
      selectFields += ', barber_status';
    }

    const { data, error } = await supabase
      .from('users')
      .select(selectFields)
      .eq('role', 'barber')
      .order('full_name');
    
    if (error) throw error;
    return data;
  }

  async getBarberCapacity(barberId, date) {
    const { count, error } = await supabase
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('barber_id', barberId)
      .eq('appointment_date', date)
      .in('status', ['scheduled', 'ongoing', 'pending']);
    
    if (error) throw error;
    
    const maxCapacity = 15; // Could be configurable per barber
    return {
      current: count || 0,
      max: maxCapacity,
      available: maxCapacity - (count || 0),
      isFullCapacity: (count || 0) >= maxCapacity
    };
  }

  async getBarberStatistics(barberId, dateFrom, dateTo) {
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        *,
        service:service_id(price)
      `)
      .eq('barber_id', barberId)
      .gte('appointment_date', dateFrom)
      .lte('appointment_date', dateTo);
    
    if (error) throw error;
    
    const completed = data?.filter(apt => apt.status === 'done') || [];
    const cancelled = data?.filter(apt => apt.status === 'cancelled') || [];
    const revenue = completed.reduce((sum, apt) => {
      const basePrice = apt.total_price || apt.service?.price || 0;
      const urgentFee = apt.is_urgent ? 100 : 0;
      return sum + basePrice + urgentFee;
    }, 0);
    
    return {
      totalAppointments: data?.length || 0,
      completedAppointments: completed.length,
      cancelledAppointments: cancelled.length,
      revenue,
      completionRate: data?.length > 0 ? (completed.length / data.length) * 100 : 0
    };
  }

  // =====================
  // NOTIFICATION MANAGEMENT (Enhanced)
  // =====================

  async createNotification(notification) {
    const { data, error } = await supabase
      .from('notifications')
      .insert([{
        ...notification,
        created_at: new Date().toISOString(),
        is_read: false
      }])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async getNotifications(userId, limit = 50) {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data;
  }

  async markNotificationAsRead(notificationId) {
    const { data, error } = await supabase
      .from('notifications')
      .update({ 
        is_read: true,
        read_at: new Date().toISOString()
      })
      .eq('id', notificationId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  // =====================
  // SYSTEM LOGGING (Enhanced)
  // =====================

  async logAction(userId, action, details = {}) {
    const { data, error } = await supabase
      .from('system_logs')
      .insert([{
        user_id: userId,
        action,
        details,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async getSystemLogs(filters = {}, limit = 100) {
    let query = supabase
      .from('system_logs')
      .select(`
        *,
        user:user_id(full_name, role)
      `)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (filters.user_id) {
      query = query.eq('user_id', filters.user_id);
    }
    
    if (filters.action) {
      query = query.eq('action', filters.action);
    }
    
    if (filters.date_from) {
      query = query.gte('created_at', filters.date_from);
    }
    
    if (filters.date_to) {
      query = query.lte('created_at', filters.date_to);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    return data;
  }

  // =====================
  // ANALYTICS & REPORTS (Enhanced)
  // =====================

  async getRevenueData(dateFrom, dateTo) {
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        appointment_date,
        total_price,
        is_urgent,
        service:service_id(price)
      `)
      .eq('status', 'done')
      .gte('appointment_date', dateFrom)
      .lte('appointment_date', dateTo);
    
    if (error) throw error;
    
    // Process data to get daily revenue including urgent fees
    const revenueByDate = {};
    data.forEach(appointment => {
      const date = appointment.appointment_date;
      const basePrice = appointment.total_price || appointment.service?.price || 0;
      const urgentFee = appointment.is_urgent ? 100 : 0;
      const totalPrice = basePrice + urgentFee;
      
      if (!revenueByDate[date]) {
        revenueByDate[date] = 0;
      }
      
      revenueByDate[date] += totalPrice;
    });
    
    return Object.entries(revenueByDate).map(([date, amount]) => ({
      date,
      amount
    }));
  }

  async getQueueAnalytics(dateFrom, dateTo) {
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        appointment_date,
        barber_id,
        queue_number,
        status,
        is_urgent,
        created_at,
        updated_at,
        barber:barber_id(full_name)
      `)
      .gte('appointment_date', dateFrom)
      .lte('appointment_date', dateTo);
    
    if (error) throw error;
    
    // Analyze queue performance
    const analytics = {
      totalBookings: data?.length || 0,
      urgentBookings: data?.filter(apt => apt.is_urgent).length || 0,
      averageQueuePosition: 0,
      queueEfficiency: 0,
      barberWorkload: {}
    };
    
    // Calculate average queue position
    const queuePositions = data?.filter(apt => apt.queue_number).map(apt => apt.queue_number) || [];
    if (queuePositions.length > 0) {
      analytics.averageQueuePosition = queuePositions.reduce((sum, pos) => sum + pos, 0) / queuePositions.length;
    }
    
    // Calculate barber workload
    data?.forEach(appointment => {
      const barberId = appointment.barber_id;
      const barberName = appointment.barber?.full_name || 'Unknown';
      
      if (!analytics.barberWorkload[barberId]) {
        analytics.barberWorkload[barberId] = {
          barberName,
          totalAppointments: 0,
          urgentAppointments: 0,
          completedAppointments: 0
        };
      }
      
      analytics.barberWorkload[barberId].totalAppointments += 1;
      
      if (appointment.is_urgent) {
        analytics.barberWorkload[barberId].urgentAppointments += 1;
      }
      
      if (appointment.status === 'done') {
        analytics.barberWorkload[barberId].completedAppointments += 1;
      }
    });
    
    return analytics;
  }

  // =====================
  // UTILITY METHODS (New)
  // =====================

  formatAppointmentData(appointment) {
    // Helper method to format appointment data for display
    const addOns = this.getAddOns();
    let formattedData = { ...appointment };
    
    // Parse and format services data
    if (appointment.services_data) {
      try {
        formattedData.additionalServices = JSON.parse(appointment.services_data);
      } catch (e) {
        formattedData.additionalServices = [];
      }
    }
    
    // Parse and format add-ons data
    if (appointment.add_ons_data) {
      try {
        const addOnIds = JSON.parse(appointment.add_ons_data);
        formattedData.addOns = addOnIds.map(addonId => 
          addOns.find(addon => addon.id === addonId)
        ).filter(Boolean);
      } catch (e) {
        formattedData.addOns = [];
      }
    }
    
    // Calculate total price including urgent fee
    formattedData.finalPrice = (appointment.total_price || 0) + (appointment.is_urgent ? 100 : 0);
    
    return formattedData;
  }

  calculateEstimatedWaitTime(queuePosition, averageServiceTime = 35) {
    const waitMinutes = (queuePosition - 1) * averageServiceTime;
    
    if (waitMinutes < 60) {
      return `${waitMinutes} min`;
    } else {
      const hours = Math.floor(waitMinutes / 60);
      const minutes = waitMinutes % 60;
      return `${hours}h ${minutes > 0 ? ` ${minutes}m` : ''}`;
    }
  }
}

// Export singleton instance
export const apiService = new ApiService();
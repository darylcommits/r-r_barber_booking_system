// components/barber/BarberSchedule.js (Complete Enhanced Version)
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import LoadingSpinner from '../common/LoadingSpinner';

const BarberSchedule = () => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [weekDays, setWeekDays] = useState([]);

  // Add-ons data for display
  const ADD_ONS_DATA = [
    { id: 'addon1', name: 'Beard Trim', price: 50.00, duration: 15 },
    { id: 'addon2', name: 'Hot Towel Treatment', price: 30.00, duration: 10 },
    { id: 'addon3', name: 'Scalp Massage', price: 80.00, duration: 20 },
    { id: 'addon4', name: 'Hair Wash', price: 40.00, duration: 15 },
    { id: 'addon5', name: 'Styling', price: 60.00, duration: 20 },
    { id: 'addon6', name: 'Hair Wax Application', price: 25.00, duration: 5 },
    { id: 'addon7', name: 'Eyebrow Trim', price: 35.00, duration: 10 },
    { id: 'addon8', name: 'Mustache Trim', price: 20.00, duration: 5 }
  ];

  useEffect(() => {
    getCurrentUser();
  }, []);

  useEffect(() => {
    if (user) {
      fetchAppointments();
      generateWeekDays();

      // Set up real-time subscription
      const channelName = `barber-schedule-${user.id}-${Date.now()}`;
      console.log(`📡 Setting up schedule subscription: ${channelName}`);
      
      const subscription = supabase
        .channel(channelName)
        .on('postgres_changes', 
          { 
            event: '*', 
            schema: 'public', 
            table: 'appointments',
            filter: `barber_id=eq.${user.id}`
          }, 
          (payload) => {
            console.log(`📥 Schedule received real-time update:`, payload);
            
            clearTimeout(window.scheduleUpdateTimeout);
            window.scheduleUpdateTimeout = setTimeout(() => {
              console.log('🔄 Schedule refreshing data...');
              fetchAppointments();
            }, 800);
          }
        )
        .subscribe((status, err) => {
          console.log(`📡 Schedule subscription status: ${status}`, err);
          if (status === 'SUBSCRIBED') {
            console.log('✅ Schedule real-time subscription active');
          } else if (status === 'CHANNEL_ERROR') {
            console.error('❌ Schedule subscription error:', err);
          }
        });

      // Custom event listener
      const handleAppointmentChange = (event) => {
        const { barberId } = event.detail;
        console.log(`📢 Schedule received custom event:`, event.detail);
        
        if (barberId === user.id) {
          clearTimeout(window.scheduleUpdateTimeout);
          window.scheduleUpdateTimeout = setTimeout(() => {
            console.log('🔄 Schedule updating from custom event...');
            fetchAppointments();
          }, 500);
        }
      };

      // Listen for force refresh events
      const handleForceRefresh = (event) => {
        if (event.detail.barberId === user.id) {
          console.log('🔄 Schedule force refresh triggered');
          fetchAppointments();
        }
      };

      window.addEventListener('appointmentStatusChanged', handleAppointmentChange);
      window.addEventListener('forceRefreshBarberData', handleForceRefresh);

      return () => {
        console.log('🧹 Cleaning up schedule subscriptions');
        subscription.unsubscribe();
        clearTimeout(window.scheduleUpdateTimeout);
        window.removeEventListener('appointmentStatusChanged', handleAppointmentChange);
        window.removeEventListener('forceRefreshBarberData', handleForceRefresh);
      };
    }
  }, [user, selectedDate]);

  const getCurrentUser = async () => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      setUser(user);
    } catch (err) {
      console.error('Error getting current user:', err);
      setError('Failed to authenticate user');
      setLoading(false);
    }
  };

  const generateWeekDays = () => {
    const days = [];
    const startDate = new Date(selectedDate);
    
    // Find the Monday of the current week
    const day = startDate.getDay();
    const diff = startDate.getDate() - day + (day === 0 ? -6 : 1);
    startDate.setDate(diff);
    
    // Generate array for the week (Mon-Sun)
    for (let i = 0; i < 7; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      days.push(date);
    }
    
    setWeekDays(days);
  };

  const fetchAppointments = async () => {
    try {
      setLoading(true);
      
      // Get start and end of the week
      const startOfWeek = new Date(weekDays[0] || selectedDate);
      const endOfWeek = new Date(weekDays[6] || selectedDate);
      startOfWeek.setHours(0, 0, 0, 0);
      endOfWeek.setHours(23, 59, 59, 999);
      
      const startDate = startOfWeek.toISOString().split('T')[0];
      const endDate = endOfWeek.toISOString().split('T')[0];
      
      console.log('Fetching schedule appointments from:', startDate, 'to:', endDate);
      
      // Fetch appointments for the week
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          *,
          customer:customer_id(id, full_name, email, phone),
          service:service_id(id, name, price, duration, description)
        `)
        .eq('barber_id', user.id)
        .gte('appointment_date', startDate)
        .lte('appointment_date', endDate)
        .order('appointment_date')
        .order('queue_number', { ascending: true });

      if (error) throw error;

      console.log('Schedule appointments fetched:', data?.length || 0);
      setAppointments(data || []);
    } catch (err) {
      console.error('Error fetching appointments:', err);
      setError('Failed to load schedule. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getServicesDisplay = (appointment) => {
    const services = [];
    
    if (appointment.service) {
      services.push(appointment.service.name);
    }
    
    if (appointment.services_data) {
      try {
        const serviceIds = JSON.parse(appointment.services_data);
        if (serviceIds.length > 1) {
          services.push(`+${serviceIds.length - 1} more`);
        }
      } catch (e) {
        console.error('Error parsing services data:', e);
      }
    }
    
    return services.join(', ');
  };

  const getAddOnsDisplay = (appointment) => {
    if (!appointment.add_ons_data) return '';
    
    try {
      const addOnIds = JSON.parse(appointment.add_ons_data);
      const addOnNames = addOnIds.map(addonId => {
        const addon = ADD_ONS_DATA.find(a => a.id === addonId);
        return addon?.name || 'Unknown Add-on';
      });
      
      return addOnNames.join(', ');
    } catch {
      return '';
    }
  };

  const getTotalPrice = (appointment) => {
    let total = appointment.total_price || appointment.service?.price || 0;
    if (appointment.is_urgent) {
      total += 100;
    }
    return total;
  };

  const handleBookingResponse = async (appointmentId, action, reason = '') => {
    try {
      const appointment = appointments.find(apt => apt.id === appointmentId);
      if (!appointment) return;

      console.log(`🔄 Schedule ${action} booking request:`, appointmentId);

      if (action === 'accept') {
        // Get current queue for this barber and date
        const dateAppointments = getAppointmentsForDate(selectedDate).filter(apt => apt.status === 'scheduled');
        
        const updates = {
          status: 'scheduled',
          updated_at: new Date().toISOString()
        };

        if (appointment.is_urgent) {
          updates.queue_number = 1;
          
          // Increment all existing queue numbers
          await supabase
            .from('appointments')
            .update({ queue_number: supabase.raw('queue_number + 1') })
            .eq('barber_id', user.id)
            .eq('appointment_date', appointment.appointment_date)
            .eq('status', 'scheduled');
        } else {
          const maxQueueNumber = Math.max(0, ...dateAppointments.map(apt => apt.queue_number || 0));
          updates.queue_number = maxQueueNumber + 1;
        }

        const { error } = await supabase
          .from('appointments')
          .update(updates)
          .eq('id', appointmentId);

        if (error) throw error;

        // Create notification for customer
        await supabase.from('notifications').insert({
          user_id: appointment.customer_id,
          title: 'Booking Confirmed! 🎉',
          message: `Your ${appointment.is_urgent ? 'urgent ' : ''}appointment has been confirmed. You are #${updates.queue_number} in the queue.`,
          type: 'appointment_confirmed',
          data: {
            appointment_id: appointmentId,
            queue_number: updates.queue_number,
            is_urgent: appointment.is_urgent
          }
        });

      } else {
        const { error } = await supabase
          .from('appointments')
          .update({ 
            status: 'cancelled',
            updated_at: new Date().toISOString(),
            cancellation_reason: reason || 'Declined by barber'
          })
          .eq('id', appointmentId);

        if (error) throw error;

        await supabase.from('notifications').insert({
          user_id: appointment.customer_id,
          title: 'Booking Request Declined',
          message: `Your appointment request has been declined. ${reason ? `Reason: ${reason}` : 'Please try booking with another barber or a different time.'}`,
          type: 'appointment_declined',
          data: { appointment_id: appointmentId, reason }
        });
      }

      // Log the action
      await supabase.from('system_logs').insert({
        user_id: user.id,
        action: action === 'accept' ? 'booking_request_accepted' : 'booking_request_declined',
        details: {
          appointment_id: appointmentId,
          customer_id: appointment.customer_id,
          reason: action === 'decline' ? reason : undefined
        }
      });

      // Broadcast change to all components
      window.dispatchEvent(new CustomEvent('appointmentStatusChanged', {
        detail: {
          appointmentId,
          newStatus: action === 'accept' ? 'scheduled' : 'cancelled',
          barberId: user.id,
          appointmentDate: appointment.appointment_date,
          timestamp: Date.now()
        }
      }));

      console.log(`✅ Schedule booking ${action} completed`);

      // Refresh appointments
      setTimeout(() => fetchAppointments(), 1000);
    } catch (err) {
      console.error('Error responding to booking request:', err);
      setError('Failed to process booking request. Please try again.');
    }
  };

  const handleAppointmentStatus = async (appointmentId, status) => {
    try {
      const appointment = appointments.find(apt => apt.id === appointmentId);
      if (!appointment) {
        throw new Error('Appointment not found');
      }

      // Check if appointment can be started
      if (status === 'ongoing' && appointment.status !== 'scheduled') {
        throw new Error('Only scheduled appointments can be started');
      }

      console.log(`🔄 Schedule starting status change: ${appointment.status} → ${status} for appointment ${appointmentId}`);

      // Optimistic update - update UI immediately
      setAppointments(prev => prev.map(apt => 
        apt.id === appointmentId 
          ? { 
              ...apt, 
              status, 
              queue_number: status === 'ongoing' ? 0 : 
                           status === 'done' || status === 'cancelled' ? null : 
                           apt.queue_number,
              updated_at: new Date().toISOString()
            }
          : apt
      ));

      const { error } = await supabase
        .from('appointments')
        .update({ 
          status, 
          updated_at: new Date().toISOString(),
          queue_number: status === 'done' || status === 'cancelled' ? null : 
                       status === 'ongoing' ? 0 : undefined
        })
        .eq('id', appointmentId);

      if (error) throw error;

      // Log the action
      await supabase.from('system_logs').insert({
        user_id: user.id,
        action: 'appointment_status_change',
        details: {
          appointment_id: appointmentId,
          new_status: status,
          previous_status: appointment.status
        }
      });

      // Create notification for customer
      const notificationData = {
        user_id: appointment.customer_id,
        type: 'appointment',
        data: { appointment_id: appointmentId, status }
      };

      switch (status) {
        case 'ongoing':
          notificationData.title = 'Your appointment has started! ✂️';
          notificationData.message = 'Your barber is ready for you now.';
          break;
        case 'done':
          notificationData.title = 'Appointment Completed ✅';
          notificationData.message = 'Thank you for visiting us! Please rate your experience.';
          break;
        case 'cancelled':
          notificationData.title = 'Appointment Cancelled ❌';
          notificationData.message = 'Your appointment has been cancelled by the barber.';
          break;
        default:
          notificationData.title = `Appointment ${status.charAt(0).toUpperCase() + status.slice(1)}`;
          notificationData.message = `Your appointment status has been updated to ${status}`;
      }

      await supabase.from('notifications').insert(notificationData);

      // If starting an appointment, notify other customers in queue about updated wait times
      if (status === 'ongoing') {
        const queuedAppointments = appointments.filter(apt => 
          apt.status === 'scheduled' && 
          apt.appointment_date === appointment.appointment_date &&
          apt.queue_number > 0
        ).sort((a, b) => (a.queue_number || 0) - (b.queue_number || 0));

        // Notify next customer
        if (queuedAppointments.length > 0) {
          const nextAppointment = queuedAppointments[0];
          await supabase.from('notifications').insert({
            user_id: nextAppointment.customer_id,
            title: 'You\'re up next! 🔔',
            message: 'Your appointment is coming up next. Please be ready.',
            type: 'queue',
            data: { appointment_id: nextAppointment.id, position: 1 }
          });
        }
      }

      // Broadcast change to all components with detailed information
      const changeEvent = new CustomEvent('appointmentStatusChanged', {
        detail: {
          appointmentId,
          newStatus: status,
          previousStatus: appointment.status,
          barberId: user.id,
          appointmentDate: appointment.appointment_date,
          timestamp: Date.now()
        }
      });
      window.dispatchEvent(changeEvent);

      console.log(`✅ Schedule status change completed: ${appointment.status} → ${status}`);

      // Refresh local data after a delay to ensure consistency
      setTimeout(() => {
        fetchAppointments();
      }, 1000);

    } catch (err) {
      console.error('❌ Error updating appointment status:', err);
      setError(err.message || 'Failed to update appointment status. Please try again.');
      
      // Revert optimistic update on error
      fetchAppointments();
    }
  };

  const handleDateChange = (date) => {
    setSelectedDate(date);
  };

  const navigateWeek = (direction) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + (direction * 7));
    setSelectedDate(newDate);
  };

  const isToday = (date) => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();
  };

  const isSelectedDate = (date) => {
    return date.getDate() === selectedDate.getDate() &&
      date.getMonth() === selectedDate.getMonth() &&
      date.getFullYear() === selectedDate.getFullYear();
  };

  const getAppointmentsForDate = (date) => {
    const formattedDate = date.toISOString().split('T')[0];
    return appointments.filter(apt => apt.appointment_date === formattedDate);
  };

  const formatTime = (timeString) => {
    if (!timeString) return '';
    
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours, 10);
    const period = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    
    return `${hour12}:${minutes} ${period}`;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'done':
        return 'success';
      case 'ongoing':
        return 'primary';
      case 'cancelled':
        return 'danger';
      case 'pending':
        return 'warning';
      case 'scheduled':
        return 'info';
      default:
        return 'secondary';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'done':
        return 'bi-check-circle-fill';
      case 'ongoing':
        return 'bi-scissors';
      case 'cancelled':
        return 'bi-x-circle-fill';
      case 'pending':
        return 'bi-clock-fill';
      case 'scheduled':
        return 'bi-calendar-check';
      default:
        return 'bi-circle';
    }
  };

  if (loading && !weekDays.length) {
    return <LoadingSpinner />;
  }

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>My Schedule</h2>
        <button className="btn btn-outline-primary" onClick={fetchAppointments}>
          <i className="bi bi-arrow-clockwise me-1"></i>
          Refresh
        </button>
      </div>
      
      {error && (
        <div className="alert alert-danger alert-dismissible fade show" role="alert">
          {error}
          <button 
            type="button"
            className="btn-close" 
            onClick={() => setError(null)}
            aria-label="Close"
          ></button>
        </div>
      )}

      {/* Week navigation */}
      <div className="card mb-4">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center">
            <button 
              className="btn btn-outline-primary" 
              onClick={() => navigateWeek(-1)}
            >
              <i className="bi bi-chevron-left"></i> Previous Week
            </button>
            
            <h5 className="mb-0">
              {weekDays.length > 0 ? (
                `${weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - 
                 ${weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
              ) : 'Loading...'}
            </h5>
            
            <button 
              className="btn btn-outline-primary" 
              onClick={() => navigateWeek(1)}
            >
              Next Week <i className="bi bi-chevron-right"></i>
            </button>
          </div>
        </div>
      </div>

      {/* Week view */}
      <div className="row mb-4">
        {weekDays.map((date, index) => (
          <div key={index} className="col">
            <div 
              className={`day-card card h-100 ${isToday(date) ? 'border-primary border-2' : ''} ${isSelectedDate(date) ? 'bg-primary bg-opacity-10' : ''}`}
              onClick={() => handleDateChange(date)}
              style={{ cursor: 'pointer' }}
            >
              <div className="card-header text-center p-2">
                <div className={`fw-bold ${isToday(date) ? 'text-primary' : ''}`}>
                  {date.toLocaleDateString('en-US', { weekday: 'short' })}
                </div>
                <small>
                  {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </small>
              </div>
              <div className="card-body p-1 text-center">
                {(() => {
                  const dateAppointments = getAppointmentsForDate(date);
                  if (dateAppointments.length === 0) {
                    return <small className="text-muted">No appointments</small>;
                  }
                  
                  const pendingCount = dateAppointments.filter(apt => apt.status === 'pending').length;
                  const scheduledCount = dateAppointments.filter(apt => apt.status === 'scheduled').length;
                  
                  return (
                    <div>
                      <div className="badge bg-primary rounded-pill mb-1">
                        {dateAppointments.length} {dateAppointments.length === 1 ? 'appt' : 'appts'}
                      </div>
                      {pendingCount > 0 && (
                        <div className="badge bg-warning rounded-pill">
                          {pendingCount} pending
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Day schedule */}
      <div className="card">
        <div className="card-header bg-primary text-white">
          <h5 className="mb-0">
            <i className="bi bi-calendar3 me-2"></i>
            {selectedDate.toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </h5>
        </div>
        <div className="card-body">
          {(() => {
            const dateAppointments = getAppointmentsForDate(selectedDate);
            
            if (loading) {
              return (
                <div className="text-center py-4">
                  <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </div>
                </div>
              );
            }
            
            if (dateAppointments.length === 0) {
              return (
                <div className="text-center py-5">
                  <div className="display-4 text-muted mb-3">
                    <i className="bi bi-calendar-x"></i>
                  </div>
                  <p className="text-muted">No appointments scheduled for this day</p>
                </div>
              );
            }
            
            return (
              <div className="table-responsive">
                <table className="table table-hover">
                  <thead>
                    <tr>
                      <th width="8%">Queue</th>
                      <th width="12%">Customer</th>
                      <th width="20%">Service</th>
                      <th width="8%">Duration</th>
                      <th width="8%">Price</th>
                      <th width="10%">Status</th>
                      <th width="10%">Contact</th>
                      <th width="24%">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dateAppointments.map((appointment) => (
                      <tr key={appointment.id} className={`${appointment.status === 'ongoing' ? 'table-primary' : ''} ${appointment.is_urgent ? 'border-start border-5 border-warning' : ''}`}>
                        <td>
                          <div className="d-flex align-items-center">
                            {appointment.is_urgent && (
                              <i className="bi bi-lightning-fill text-warning me-1" title="Urgent"></i>
                            )}
                            <span className={`badge bg-${getStatusColor(appointment.status)} me-1`}>
                              <i className={`bi ${getStatusIcon(appointment.status)} me-1`}></i>
                              {appointment.queue_number || '#'}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div>
                            <strong>{appointment.customer?.full_name || 'Unknown'}</strong>
                            {appointment.customer?.phone && (
                              <div className="small text-muted">
                                <i className="bi bi-telephone me-1"></i>
                                {appointment.customer.phone}
                              </div>
                            )}
                          </div>
                        </td>
                        <td>
                          <div>
                            <strong>{getServicesDisplay(appointment)}</strong>
                            {getAddOnsDisplay(appointment) && (
                              <div className="small text-info">
                                <i className="bi bi-plus-circle me-1"></i>
                                {getAddOnsDisplay(appointment)}
                              </div>
                            )}
                            {appointment.notes && (
                              <div className="small text-muted">
                                <i className="bi bi-chat-right-text me-1"></i>
                                {appointment.notes.length > 30 ? `${appointment.notes.substring(0, 30)}...` : appointment.notes}
                              </div>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className="badge bg-light text-dark">
                            {appointment.total_duration || appointment.service?.duration || '—'} min
                          </span>
                        </td>
                        <td>
                          <strong className="text-success">₱{getTotalPrice(appointment)}</strong>
                        </td>
                        <td>
                          <span className={`badge bg-${getStatusColor(appointment.status)}`}>
                            <i className={`bi ${getStatusIcon(appointment.status)} me-1`}></i>
                            {appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
                          </span>
                        </td>
                        <td>
                          <div className="btn-group-vertical" role="group">
                            {appointment.customer?.phone && (
                              <a 
                                href={`tel:${appointment.customer.phone}`}
                                className="btn btn-sm btn-outline-primary"
                                title="Call customer"
                              >
                                <i className="bi bi-telephone"></i>
                              </a>
                            )}
                            {appointment.customer?.email && (
                              <a 
                                href={`mailto:${appointment.customer.email}`}
                                className="btn btn-sm btn-outline-secondary"
                                title="Email customer"
                              >
                                <i className="bi bi-envelope"></i>
                              </a>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="btn-group" role="group">
                            {appointment.status === 'pending' && (
                              <>
                                <button
                                  className="btn btn-sm btn-success"
                                  onClick={() => handleBookingResponse(appointment.id, 'accept')}
                                  title="Accept booking request"
                                >
                                  <i className="bi bi-check-circle me-1"></i>
                                  Accept
                                </button>
                                <button
                                  className="btn btn-sm btn-outline-danger"
                                  onClick={() => {
                                    const reason = prompt('Reason for declining (optional):');
                                    if (reason !== null) {
                                      handleBookingResponse(appointment.id, 'decline', reason);
                                    }
                                  }}
                                  title="Decline booking request"
                                >
                                  <i className="bi bi-x-circle me-1"></i>
                                  Decline
                                </button>
                              </>
                            )}
                            
                            {appointment.status === 'scheduled' && (
                              <button
                                className="btn btn-sm btn-primary"
                                onClick={() => handleAppointmentStatus(appointment.id, 'ongoing')}
                                title="Start appointment"
                              >
                                <i className="bi bi-play-fill me-1"></i>
                                Start
                              </button>
                            )}
                            
                            {appointment.status === 'ongoing' && (
                              <button
                                className="btn btn-sm btn-success"
                                onClick={() => handleAppointmentStatus(appointment.id, 'done')}
                                title="Complete appointment"
                              >
                                <i className="bi bi-check-lg me-1"></i>
                                Complete
                              </button>
                            )}

                            {(appointment.status === 'scheduled' || appointment.status === 'pending') && (
                              <button
                                className="btn btn-sm btn-outline-danger"
                                onClick={() => {
                                  if (window.confirm('Are you sure you want to cancel this appointment?')) {
                                    handleAppointmentStatus(appointment.id, 'cancelled');
                                  }
                                }}
                                title="Cancel appointment"
                              >
                                <i className="bi bi-x-circle"></i>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
};

export default BarberSchedule;
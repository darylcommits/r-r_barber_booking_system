// components/dashboards/BarberDashboard.js (Complete Enhanced Version)
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import logoImage from '../../assets/images/raf-rok-logo.png';

const BarberDashboard = () => {
  const [todaySchedule, setTodaySchedule] = useState([]);
  const [queueStatus, setQueueStatus] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [currentAppointment, setCurrentAppointment] = useState(null);
  const [todayStats, setTodayStats] = useState({
    totalAppointments: 0,
    completedAppointments: 0,
    revenue: 0,
    pendingRequests: 0,
    queueLength: 0,
    averageWaitTime: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);
  const [barberInfo, setBarberInfo] = useState(null);
  const [animateCards, setAnimateCards] = useState(false);
  const [barberStatus, setBarberStatus] = useState('available');

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
    setTimeout(() => {
      setAnimateCards(true);
    }, 300);
  }, []);

  useEffect(() => {
    if (user) {
      getBarberInfo();
      fetchBarberData();
      
      // Set up real-time subscription with enhanced error handling
      const channelName = `barber-dashboard-${user.id}-${Date.now()}`;
      console.log(`📡 Setting up dashboard subscription: ${channelName}`);
      
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
            console.log(`📥 Dashboard received real-time update:`, payload);
            
            // Debounce rapid updates
            clearTimeout(window.dashboardUpdateTimeout);
            window.dashboardUpdateTimeout = setTimeout(() => {
              console.log('🔄 Dashboard refreshing data...');
              fetchBarberData();
            }, 800);
          }
        )
        .subscribe((status, err) => {
          console.log(`📡 Dashboard subscription status: ${status}`, err);
          if (status === 'SUBSCRIBED') {
            console.log('✅ Dashboard real-time subscription active');
          } else if (status === 'CHANNEL_ERROR') {
            console.error('❌ Dashboard subscription error:', err);
          }
        });

      // Set up periodic refresh as backup
      const interval = setInterval(() => {
        console.log('🔄 Dashboard periodic refresh');
        fetchBarberData();
      }, 30000);

      // Listen for custom events from other components
      const handleAppointmentChange = (event) => {
        const { appointmentId, newStatus, barberId, timestamp } = event.detail;
        console.log(`📢 Dashboard received custom event:`, event.detail);
        
        if (barberId === user.id) {
          // Update immediately if it's our barber
          clearTimeout(window.dashboardUpdateTimeout);
          window.dashboardUpdateTimeout = setTimeout(() => {
            console.log('🔄 Dashboard updating from custom event...');
            fetchBarberData();
          }, 500);
        }
      };

      // Listen for force refresh events
      const handleForceRefresh = (event) => {
        if (event.detail.barberId === user.id) {
          console.log('🔄 Dashboard force refresh triggered');
          fetchBarberData();
        }
      };

      window.addEventListener('appointmentStatusChanged', handleAppointmentChange);
      window.addEventListener('forceRefreshBarberData', handleForceRefresh);

      return () => {
        console.log('🧹 Cleaning up dashboard subscriptions');
        clearInterval(interval);
        clearTimeout(window.dashboardUpdateTimeout);
        subscription.unsubscribe();
        window.removeEventListener('appointmentStatusChanged', handleAppointmentChange);
        window.removeEventListener('forceRefreshBarberData', handleForceRefresh);
      };
    }
  }, [user]);

  const getCurrentUser = async () => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      setUser(user);
    } catch (error) {
      console.error('Error getting current user:', error);
      setError('Failed to load user data');
      setLoading(false);
    }
  };
  
  const getBarberInfo = async () => {
    try {
      if (!user) return;
      
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();
        
      if (error) throw error;
      setBarberInfo(data);
      setBarberStatus(data.barber_status || 'available');
      
    } catch (error) {
      console.error('Error getting barber info:', error);
      setError('Failed to load barber info');
    }
  };

  const fetchBarberData = async () => {
    try {
      if (!user) return;

      setError('');
      const today = new Date().toISOString().split('T')[0];
      
      console.log('Fetching barber data for:', user.id, 'on:', today);
      
      // Fetch today's schedule (all appointments) with more detailed query
      const { data: schedule, error: scheduleError } = await supabase
        .from('appointments')
        .select(`
          *,
          customer:customer_id(full_name, email, phone),
          service:service_id(name, price, duration)
        `)
        .eq('barber_id', user.id)
        .eq('appointment_date', today)
        .order('created_at', { ascending: false });

      if (scheduleError) {
        console.error('Schedule fetch error:', scheduleError);
        throw scheduleError;
      }

      console.log('Fetched schedule:', schedule);

      const safeSchedule = Array.isArray(schedule) ? schedule : [];

      // Separate appointments by status with better filtering
      const current = safeSchedule.find(apt => apt.status === 'ongoing') || null;
      const queue = safeSchedule
        .filter(apt => apt.status === 'scheduled')
        .sort((a, b) => (a.queue_number || 0) - (b.queue_number || 0));
      const pending = safeSchedule
        .filter(apt => apt.status === 'pending')
        .sort((a, b) => {
          // Sort urgent requests first, then by creation time
          if (a.is_urgent && !b.is_urgent) return -1;
          if (!a.is_urgent && b.is_urgent) return 1;
          return new Date(b.created_at) - new Date(a.created_at);
        });
      const completed = safeSchedule.filter(apt => apt.status === 'done');

      console.log('Separated appointments:', {
        current,
        queue: queue.length,
        pending: pending.length,
        completed: completed.length
      });

      setTodaySchedule(safeSchedule);
      setCurrentAppointment(current);
      setQueueStatus(queue);
      setPendingRequests(pending);

      // Calculate revenue
      const revenueToday = completed.reduce((sum, apt) => {
        const basePrice = apt.total_price || apt.service?.price || 0;
        const urgentFee = apt.is_urgent ? 100 : 0;
        return sum + basePrice + urgentFee;
      }, 0);

      // Calculate average wait time
      const totalWaitTime = queue.reduce((total, apt) => {
        const serviceDuration = apt.total_duration || apt.service?.duration || 30;
        return total + serviceDuration;
      }, 0);
      const averageWaitTime = queue.length > 0 ? Math.ceil(totalWaitTime / queue.length) : 0;

      setTodayStats({
        totalAppointments: safeSchedule.length,
        completedAppointments: completed.length,
        revenue: revenueToday,
        pendingRequests: pending.length,
        queueLength: queue.length,
        averageWaitTime
      });

    } catch (error) {
      console.error('Error fetching barber data:', error);
      setError('Failed to load appointments. Please try again.');
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
      const appointment = pendingRequests.find(req => req.id === appointmentId);
      if (!appointment) return;

      console.log(`🔄 Dashboard ${action} booking request:`, appointmentId);

      if (action === 'accept') {
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
          const maxQueueNumber = Math.max(0, ...queueStatus.map(apt => apt.queue_number || 0));
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

        // Log the action
        await supabase.from('system_logs').insert({
          user_id: user.id,
          action: 'booking_request_accepted',
          details: {
            appointment_id: appointmentId,
            customer_id: appointment.customer_id,
            queue_number: updates.queue_number
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

        // Log the action
        await supabase.from('system_logs').insert({
          user_id: user.id,
          action: 'booking_request_declined',
          details: {
            appointment_id: appointmentId,
            customer_id: appointment.customer_id,
            reason: reason
          }
        });
      }

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

      console.log(`✅ Dashboard booking ${action} completed`);
      
      // Refresh data
      setTimeout(() => fetchBarberData(), 1000);
    } catch (err) {
      console.error('Error responding to booking request:', err);
      setError('Failed to process booking request. Please try again.');
    }
  };

  const handleAppointmentStatus = async (appointmentId, status) => {
    try {
      const appointment = todaySchedule.find(apt => apt.id === appointmentId);
      if (!appointment) {
        throw new Error('Appointment not found');
      }

      console.log(`🔄 Dashboard starting status change: ${appointment.status} → ${status} for appointment ${appointmentId}`);

      // Optimistic update - update UI immediately
      if (status === 'ongoing') {
        setCurrentAppointment(appointment);
        setQueueStatus(prev => prev.filter(apt => apt.id !== appointmentId));
      } else if (status === 'done' && currentAppointment?.id === appointmentId) {
        setCurrentAppointment(null);
      }

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
          notificationData.message = 'Your appointment has been cancelled.';
          break;
        default:
          notificationData.title = `Appointment ${status.charAt(0).toUpperCase() + status.slice(1)}`;
          notificationData.message = `Your appointment status has been updated to ${status}`;
      }

      await supabase.from('notifications').insert(notificationData);
      
      // Notify next customer if completing appointment
      if (status === 'done' && queueStatus.length > 0) {
        const nextAppointment = queueStatus[0];
        await supabase.from('notifications').insert({
          user_id: nextAppointment.customer_id,
          title: 'You\'re up next! 🔔',
          message: 'Your appointment is coming up next. Please be ready.',
          type: 'queue',
          data: { appointment_id: nextAppointment.id, position: 1 }
        });
      }

      // Broadcast change to all components
      window.dispatchEvent(new CustomEvent('appointmentStatusChanged', {
        detail: {
          appointmentId,
          newStatus: status,
          previousStatus: appointment.status,
          barberId: user.id,
          appointmentDate: appointment.appointment_date,
          timestamp: Date.now()
        }
      }));

      console.log(`✅ Dashboard status change completed: ${appointment.status} → ${status}`);

      // Refresh data
      setTimeout(() => fetchBarberData(), 1000);
    } catch (error) {
      console.error('Error updating appointment status:', error);
      setError('Failed to update appointment status. Please try again.');
      
      // Revert optimistic updates on error
      fetchBarberData();
    }
  };

  const updateBarberStatus = async (newStatus) => {
    try {
      const { error } = await supabase
        .from('users')
        .update({ 
          barber_status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (error) throw error;
      setBarberStatus(newStatus);

    } catch (error) {
      console.error('Error updating barber status:', error);
      setError('Failed to update status. Please try again.');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'available': return 'success';
      case 'busy': return 'warning';
      case 'break': return 'info';
      case 'offline': return 'secondary';
      default: return 'primary';
    }
  };

  const formatTimeRemaining = (minutes) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins > 0 ? `${mins}m` : ''}`;
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center min-vh-100">
        <div className="spinner-grow text-primary" role="status" style={{ width: '3rem', height: '3rem' }}>
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container py-4">
        <div className="alert alert-danger shadow-sm" role="alert">
          <div className="d-flex align-items-center">
            <i className="bi bi-exclamation-triangle-fill me-2 fs-4"></i>
            <div>
              <h4 className="alert-heading">Error</h4>
              <p className="mb-1">{error}</p>
            </div>
          </div>
          <button className="btn btn-danger mt-2" onClick={fetchBarberData}>
            <i className="bi bi-arrow-clockwise me-2"></i>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid py-4 dashboard-container">
      {/* Barber Welcome Header */}
      <div className="row mb-4">
        <div className="col">
          <div className="barber-welcome-header p-4 rounded shadow-sm d-flex align-items-center">
            <div>
              <div className="d-flex align-items-center mb-2">
                <img 
                  src={logoImage} 
                  alt="Raf & Rok" 
                  className="dashboard-logo me-3" 
                  height="40"
                  style={{
                    backgroundColor: '#ffffff',
                    padding: '3px',
                    borderRadius: '5px'
                  }}
                />
                <h1 className="h3 mb-0 text-white">Welcome, {barberInfo?.full_name || 'Barber'}</h1>
              </div>
              <p className="text-light mb-0">
                <i className="bi bi-calendar3 me-2"></i>
                Manage your queue and booking requests
              </p>
            </div>
            <div className="ms-auto text-end">
              <div className="h4 mb-2 text-white">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
              
              {/* Barber Status Toggle */}
              <div className="dropdown">
                <button 
                  className={`btn btn-${getStatusColor(barberStatus)} dropdown-toggle`}
                  type="button" 
                  data-bs-toggle="dropdown"
                >
                  <i className="bi bi-person-badge me-2"></i>
                  {barberStatus.charAt(0).toUpperCase() + barberStatus.slice(1)}
                </button>
                <ul className="dropdown-menu">
                  <li><button className="dropdown-item" onClick={() => updateBarberStatus('available')}>
                    <i className="bi bi-check-circle me-2 text-success"></i>Available
                  </button></li>
                  <li><button className="dropdown-item" onClick={() => updateBarberStatus('busy')}>
                    <i className="bi bi-exclamation-circle me-2 text-warning"></i>Busy
                  </button></li>
                  <li><button className="dropdown-item" onClick={() => updateBarberStatus('break')}>
                    <i className="bi bi-pause-circle me-2 text-info"></i>On Break
                  </button></li>
                  <li><button className="dropdown-item" onClick={() => updateBarberStatus('offline')}>
                    <i className="bi bi-x-circle me-2 text-secondary"></i>Offline
                  </button></li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Urgent Pending Requests Alert */}
      {pendingRequests.filter(req => req.is_urgent).length > 0 && (
        <div className="alert alert-danger shadow-sm mb-4" role="alert">
          <div className="d-flex align-items-center">
            <div className="me-3">
              <i className="bi bi-lightning-fill fs-4"></i>
            </div>
            <div className="flex-grow-1">
              <h5 className="alert-heading mb-1">🚨 URGENT Booking Requests!</h5>
              <p className="mb-0">
                You have {pendingRequests.filter(req => req.is_urgent).length} urgent booking request{pendingRequests.filter(req => req.is_urgent).length > 1 ? 's' : ''} that need immediate attention.
              </p>
            </div>
            <button className="btn btn-danger" onClick={() => document.getElementById('pending-requests').scrollIntoView({ behavior: 'smooth' })}>
              <i className="bi bi-eye me-1"></i>
              Review Now
            </button>
          </div>
        </div>
      )}

      {/* Regular Pending Requests Alert */}
      {pendingRequests.length > 0 && pendingRequests.filter(req => !req.is_urgent).length > 0 && (
        <div className="alert alert-warning shadow-sm mb-4" role="alert">
          <div className="d-flex align-items-center">
            <div className="me-3">
              <i className="bi bi-bell-fill fs-4"></i>
            </div>
            <div className="flex-grow-1">
              <h5 className="alert-heading mb-1">New Booking Requests!</h5>
              <p className="mb-0">
                You have {pendingRequests.filter(req => !req.is_urgent).length} booking request{pendingRequests.filter(req => !req.is_urgent).length > 1 ? 's' : ''} waiting for your confirmation.
              </p>
            </div>
            <button className="btn btn-warning" onClick={() => document.getElementById('pending-requests').scrollIntoView({ behavior: 'smooth' })}>
              <i className="bi bi-eye me-1"></i>
              Review Requests
            </button>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="row mb-4">
        <div className="col-md-2 mb-3">
          <div className={`card stats-card bg-gradient-primary text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`}>
            <div className="card-body">
              <h6 className="card-title mb-1">Total Today</h6>
              <h2 className="mb-0">{todayStats.totalAppointments}</h2>
            </div>
          </div>
        </div>
        
        <div className="col-md-2 mb-3">
          <div className={`card stats-card bg-gradient-success text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`}>
            <div className="card-body">
              <h6 className="card-title mb-1">Completed</h6>
              <h2 className="mb-0">{todayStats.completedAppointments}</h2>
            </div>
          </div>
        </div>
        
        <div className="col-md-2 mb-3">
          <div className={`card stats-card bg-gradient-info text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`}>
            <div className="card-body">
              <h6 className="card-title mb-1">Revenue</h6>
              <h2 className="mb-0">₱{todayStats.revenue.toFixed(0)}</h2>
            </div>
          </div>
        </div>
        
        <div className="col-md-2 mb-3">
          <div className={`card stats-card ${pendingRequests.length > 0 ? 'bg-gradient-warning' : 'bg-gradient-secondary'} text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`}>
            <div className="card-body">
              <h6 className="card-title mb-1">Pending</h6>
              <h2 className="mb-0">{todayStats.pendingRequests}</h2>
            </div>
          </div>
        </div>

        <div className="col-md-2 mb-3">
          <div className={`card stats-card bg-gradient-dark text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`}>
            <div className="card-body">
              <h6 className="card-title mb-1">Queue</h6>
              <h2 className="mb-0">{todayStats.queueLength}</h2>
            </div>
          </div>
        </div>

        <div className="col-md-2 mb-3">
          <div className={`card stats-card bg-gradient-secondary text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`}>
            <div className="card-body">
              <h6 className="card-title mb-1">Avg Wait</h6>
              <h2 className="mb-0">{todayStats.averageWaitTime}m</h2>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Booking Requests */}
      {pendingRequests.length > 0 && (
        <div id="pending-requests" className="card mb-4 border-warning">
          <div className="card-header bg-warning text-dark">
            <h5 className="mb-0">
              <i className="bi bi-bell me-2"></i>
              Pending Booking Requests ({pendingRequests.length})
              {pendingRequests.some(req => req.is_urgent) && (
                <span className="badge bg-danger ms-2">
                  <i className="bi bi-lightning-fill me-1"></i>
                  {pendingRequests.filter(req => req.is_urgent).length} URGENT
                </span>
              )}
            </h5>
          </div>
          <div className="card-body">
            <div className="row">
              {pendingRequests.map((request) => (
                <div key={request.id} className="col-md-6 mb-3">
                  <div className={`card h-100 ${request.is_urgent ? 'border-danger border-2' : 'border-secondary'}`}>
                    <div className="card-body">
                      <div className="d-flex justify-content-between align-items-start mb-2">
                        <h6 className="card-title mb-0">{request.customer?.full_name}</h6>
                        <div className="d-flex gap-1">
                          {request.is_urgent && (
                            <span className="badge bg-danger">
                              <i className="bi bi-lightning-fill me-1"></i>URGENT
                            </span>
                          )}
                          {request.is_rebooking && (
                            <span className="badge bg-info">RESCHEDULE</span>
                          )}
                        </div>
                      </div>
                      
                      <div className="mb-2">
                        <small className="text-muted">
                          <i className="bi bi-calendar me-1"></i>
                          {new Date(request.appointment_date).toLocaleDateString()}
                          <i className="bi bi-clock ms-2 me-1"></i>
                          {new Date(request.created_at).toLocaleTimeString()}
                        </small>
                      </div>

                      <div className="mb-2">
                        <strong>Services:</strong>
                        <div className="text-muted small">{getServicesDisplay(request)}</div>
                      </div>

                      {getAddOnsDisplay(request) && (
                        <div className="mb-2">
                          <strong>Add-ons:</strong>
                          <div className="text-muted small">{getAddOnsDisplay(request)}</div>
                        </div>
                      )}

                      <div className="mb-2">
                        <strong>Total:</strong> 
                        <span className="text-success ms-1 fw-bold">₱{getTotalPrice(request)}</span>
                        <small className="text-muted ms-2">
                          ({request.total_duration || (request.service?.duration || 30)} min)
                        </small>
                      </div>

                      {request.notes && (
                        <div className="mb-3">
                          <strong>Notes:</strong>
                          <div className="text-muted small bg-light p-2 rounded">{request.notes}</div>
                        </div>
                      )}

                      <div className="d-flex justify-content-between gap-2">
                        <button
                          className={`btn ${request.is_urgent ? 'btn-danger' : 'btn-success'} btn-sm flex-fill`}
                          onClick={() => handleBookingResponse(request.id, 'accept')}
                        >
                          <i className="bi bi-check-circle me-1"></i>
                          {request.is_urgent ? 'Accept URGENT' : 'Accept'}
                        </button>
                        <button
                          className="btn btn-outline-danger btn-sm"
                          onClick={() => {
                            const reason = prompt('Reason for declining (optional):');
                            if (reason !== null) { // Allow empty string but not null (cancelled)
                              handleBookingResponse(request.id, 'decline', reason);
                            }
                          }}
                        >
                          <i className="bi bi-x-circle me-1"></i>
                          Decline
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Current Customer */}
      {currentAppointment && (
        <div className="card mb-4 border-primary">
          <div className="card-header bg-primary text-white">
            <h5 className="mb-0">
              <i className="bi bi-scissors me-2"></i>
              Currently Serving
            </h5>
          </div>
          <div className="card-body">
            <div className="row align-items-center">
              <div className="col-md-4">
                <div className="text-center">
                  <div className="rounded-circle bg-primary bg-opacity-10 p-4 d-inline-block mb-3">
                    <i className="bi bi-person-circle fs-1 text-primary"></i>
                  </div>
                  <h4>{currentAppointment.customer?.full_name}</h4>
                  <p className="text-muted">{currentAppointment.customer?.phone}</p>
                  {currentAppointment.customer?.phone && (
                    <a href={`tel:${currentAppointment.customer.phone}`} className="btn btn-outline-primary btn-sm">
                      <i className="bi bi-telephone me-1"></i>Call
                    </a>
                  )}
                </div>
              </div>
              
              <div className="col-md-5">
                <h5>Service Details</h5>
                <p><strong>Services:</strong> {getServicesDisplay(currentAppointment)}</p>
                {getAddOnsDisplay(currentAppointment) && (
                  <p><strong>Add-ons:</strong> {getAddOnsDisplay(currentAppointment)}</p>
                )}
                <p><strong>Total:</strong> <span className="text-success fw-bold">₱{getTotalPrice(currentAppointment)}</span></p>
                <p><strong>Duration:</strong> {(currentAppointment.total_duration || currentAppointment.service?.duration)} min</p>
                {currentAppointment.notes && (
                  <p><strong>Notes:</strong> <span className="bg-light p-2 rounded d-inline-block">{currentAppointment.notes}</span></p>
                )}
              </div>
              
              <div className="col-md-3 text-center">
                <button
                  className="btn btn-success btn-lg w-100"
                  onClick={() => handleAppointmentStatus(currentAppointment.id, 'done')}
                >
                  <i className="bi bi-check-circle me-2"></i>
                  Complete Service
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="row">
        {/* Queue Status */}
        <div className="col-md-8 mb-4">
          <div className="card shadow-sm">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h5 className="mb-0">
                <i className="bi bi-list-ol me-2"></i>
                Today's Queue ({queueStatus.length})
              </h5>
              <div>
                <Link to="/queue" className="btn btn-primary btn-sm me-2">
                  Manage Queue
                </Link>
                <button className="btn btn-outline-primary btn-sm" onClick={fetchBarberData}>
                  <i className="bi bi-arrow-clockwise"></i>
                </button>
              </div>
            </div>
            <div className="card-body">
              {queueStatus.length === 0 ? (
                <div className="text-center py-5">
                  <div className="display-4 text-muted mb-3">
                    <i className="bi bi-list-ul"></i>
                  </div>
                  <h5>Queue is Empty</h5>
                  <p className="text-muted">No customers waiting in the queue.</p>
                </div>
              ) : (
                <div className="list-group">
                  {queueStatus.slice(0, 5).map((appointment, index) => (
                    <div key={appointment.id} className={`list-group-item ${index === 0 ? 'border-start border-5 border-primary' : ''}`}>
                      <div className="d-flex justify-content-between align-items-center">
                        <div className="d-flex align-items-center">
                          <div className={`rounded-circle ${appointment.is_urgent ? 'bg-danger' : 'bg-primary'} text-white d-flex align-items-center justify-content-center me-3`} style={{ width: '40px', height: '40px' }}>
                            {appointment.is_urgent ? <i className="bi bi-lightning-fill"></i> : (appointment.queue_number || index + 1)}
                          </div>
                          <div>
                            <h6 className="mb-1">{appointment.customer?.full_name}</h6>
                            <p className="mb-0 text-muted">{getServicesDisplay(appointment)}</p>
                            {getAddOnsDisplay(appointment) && (
                              <small className="text-info">Add-ons: {getAddOnsDisplay(appointment)}</small>
                            )}
                          </div>
                        </div>
                        <div className="text-end">
                          <div className="text-success fw-bold">₱{getTotalPrice(appointment)}</div>
                          <small className="text-muted">
                            {appointment.total_duration || appointment.service?.duration} min
                          </small>
                          {appointment.is_urgent && (
                            <div><span className="badge bg-danger">URGENT</span></div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {queueStatus.length > 5 && (
                    <div className="list-group-item text-center">
                      <Link to="/queue" className="btn btn-outline-primary">
                        View All {queueStatus.length} Customers
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Quick Actions & Next Up */}
        <div className="col-md-4">
          {/* Next Customer */}
          {!currentAppointment && queueStatus.length > 0 && (
            <div className="card shadow-sm mb-4">
              <div className="card-header bg-info text-white">
                <h6 className="mb-0">
                  <i className="bi bi-person-up me-2"></i>
                  Next Customer
                </h6>
              </div>
              <div className="card-body text-center">
                <h5>{queueStatus[0].customer?.full_name}</h5>
                <p className="text-muted">{getServicesDisplay(queueStatus[0])}</p>
                <button
                  className="btn btn-primary"
                  onClick={() => handleAppointmentStatus(queueStatus[0].id, 'ongoing')}
                >
                  <i className="bi bi-play-fill me-1"></i>
                  Start Service
                </button>
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="card shadow-sm">
            <div className="card-header">
              <h6 className="mb-0">
                <i className="bi bi-lightning-charge me-2"></i>
                Quick Actions
              </h6>
            </div>
            <div className="card-body">
              <div className="d-grid gap-2">
                <Link to="/queue" className="btn btn-primary">
                  <i className="bi bi-people me-2"></i>
                  Manage Queue
                </Link>
                <Link to="/schedule" className="btn btn-info">
                  <i className="bi bi-calendar-week me-2"></i>
                  Full Schedule
                </Link>
                <button 
                  className="btn btn-success"
                  onClick={() => updateBarberStatus(barberStatus === 'available' ? 'break' : 'available')}
                >
                  <i className={`bi ${barberStatus === 'available' ? 'bi-pause' : 'bi-play'} me-2`}></i>
                  {barberStatus === 'available' ? 'Take Break' : 'Resume Work'}
                </button>
                <button className="btn btn-outline-secondary" onClick={fetchBarberData}>
                  <i className="bi bi-arrow-clockwise me-2"></i>
                  Refresh Data
                </button>
              </div>
              
              {todayStats.queueLength > 0 && (
                <div className="mt-3 p-2 bg-light rounded">
                  <small className="text-muted">
                    <i className="bi bi-info-circle me-1"></i>
                    Estimated time to clear queue: {formatTimeRemaining(todayStats.queueLength * todayStats.averageWaitTime)}
                  </small>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BarberDashboard;
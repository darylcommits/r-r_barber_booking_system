// components/barber/BarberQueue.js (Complete Enhanced Version)
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import LoadingSpinner from '../common/LoadingSpinner';

const BarberQueue = () => {
  const [currentAppointment, setCurrentAppointment] = useState(null);
  const [queuedAppointments, setQueuedAppointments] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState({
    completed: 0,
    remaining: 0,
    totalTime: 0,
    pendingRequests: 0
  });
  const [autoRefresh, setAutoRefresh] = useState(true);

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
      fetchQueueData();
      
      const channelName = `barber-queue-${user.id}-${Date.now()}`;
      console.log(`📡 Setting up queue subscription: ${channelName}`);
      
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
            console.log(`📥 Queue received real-time update:`, payload);
            
            clearTimeout(window.queueUpdateTimeout);
            window.queueUpdateTimeout = setTimeout(() => {
              console.log('🔄 Queue refreshing data...');
              fetchQueueData();
            }, 800);
          }
        )
        .subscribe((status, err) => {
          console.log(`📡 Queue subscription status: ${status}`, err);
          if (status === 'SUBSCRIBED') {
            console.log('✅ Queue real-time subscription active');
          } else if (status === 'CHANNEL_ERROR') {
            console.error('❌ Queue subscription error:', err);
          }
        });
      
      // Auto-refresh interval
      let interval;
      if (autoRefresh) {
        interval = setInterval(() => {
          console.log('🔄 Queue periodic refresh');
          fetchQueueData();
        }, 20000);
      }

      // Custom event listener
      const handleAppointmentChange = (event) => {
        const { barberId } = event.detail;
        console.log(`📢 Queue received custom event:`, event.detail);
        
        if (barberId === user.id) {
          clearTimeout(window.queueUpdateTimeout);
          window.queueUpdateTimeout = setTimeout(() => {
            console.log('🔄 Queue updating from custom event...');
            fetchQueueData();
          }, 500);
        }
      };

      // Listen for force refresh events
      const handleForceRefresh = (event) => {
        if (event.detail.barberId === user.id) {
          console.log('🔄 Queue force refresh triggered');
          fetchQueueData();
        }
      };

      window.addEventListener('appointmentStatusChanged', handleAppointmentChange);
      window.addEventListener('forceRefreshBarberData', handleForceRefresh);
      
      return () => {
        console.log('🧹 Cleaning up queue subscriptions');
        subscription.unsubscribe();
        if (interval) clearInterval(interval);
        clearTimeout(window.queueUpdateTimeout);
        window.removeEventListener('appointmentStatusChanged', handleAppointmentChange);
        window.removeEventListener('forceRefreshBarberData', handleForceRefresh);
      };
    }
  }, [user, autoRefresh]);

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

  const fetchQueueData = async () => {
    try {
      setLoading(true);
      
      // Get today's date
      const today = new Date().toISOString().split('T')[0];
      
      console.log('Fetching queue data for:', user.id, 'on:', today);
      
      // Fetch current (ongoing) appointment
      const { data: currentData, error: currentError } = await supabase
        .from('appointments')
        .select(`
          *,
          customer:customer_id(id, full_name, email, phone),
          service:service_id(id, name, price, duration, description)
        `)
        .eq('barber_id', user.id)
        .eq('appointment_date', today)
        .eq('status', 'ongoing')
        .order('appointment_time')
        .limit(1)
        .single();
      
      if (currentError && currentError.code !== 'PGRST116') {
        throw currentError;
      }
      
      // Fetch queue (scheduled appointments)
      const { data: queueData, error: queueError } = await supabase
        .from('appointments')
        .select(`
          *,
          customer:customer_id(id, full_name, email, phone),
          service:service_id(id, name, price, duration, description)
        `)
        .eq('barber_id', user.id)
        .eq('appointment_date', today)
        .eq('status', 'scheduled')
        .order('queue_number', { ascending: true });
      
      if (queueError) throw queueError;

      // Fetch pending requests
      const { data: pendingData, error: pendingError } = await supabase
        .from('appointments')
        .select(`
          *,
          customer:customer_id(id, full_name, email, phone),
          service:service_id(id, name, price, duration, description)
        `)
        .eq('barber_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      
      if (pendingError) throw pendingError;
      
      // Fetch completed appointments count
      const { count: completedCount, error: completedError } = await supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('barber_id', user.id)
        .eq('appointment_date', today)
        .eq('status', 'done');
      
      if (completedError) throw completedError;
      
      console.log('Queue data fetched:', {
        current: currentData ? 'Found' : 'None',
        queue: queueData?.length || 0,
        pending: pendingData?.length || 0,
        completed: completedCount || 0
      });
      
      // Update state
      setCurrentAppointment(currentData || null);
      setQueuedAppointments(queueData || []);
      setPendingRequests(pendingData || []);
      
      // Calculate stats
      const remainingCount = (queueData?.length || 0);
      const totalTimeMinutes = queueData?.reduce((total, apt) => {
        const serviceDuration = apt.service?.duration || 30;
        const addOnsDuration = calculateAddOnsDuration(apt.add_ons_data);
        return total + serviceDuration + addOnsDuration;
      }, 0) || 0;
      
      setStats({
        completed: completedCount || 0,
        remaining: remainingCount,
        totalTime: totalTimeMinutes,
        pendingRequests: pendingData?.length || 0
      });
      
    } catch (err) {
      console.error('Error fetching queue data:', err);
      setError('Failed to load queue data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const calculateAddOnsDuration = (addOnsData) => {
    if (!addOnsData) return 0;
    
    try {
      const addOnIds = JSON.parse(addOnsData);
      return addOnIds.reduce((total, addonId) => {
        const addon = ADD_ONS_DATA.find(a => a.id === addonId);
        return total + (addon?.duration || 0);
      }, 0);
    } catch {
      return 0;
    }
  };

  const getServicesDisplay = (appointment) => {
    const services = [];
    
    // Add primary service
    if (appointment.service) {
      services.push(appointment.service.name);
    }
    
    // Add additional services
    if (appointment.services_data) {
      try {
        const serviceIds = JSON.parse(appointment.services_data);
        // Skip the first one as it's already added as primary service
        const additionalServiceIds = serviceIds.slice(1);
        // You would need to fetch service details for these IDs
        // For now, just indicate there are additional services
        if (additionalServiceIds.length > 0) {
          services.push(`+${additionalServiceIds.length} more services`);
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
    
    // Add urgent fee if applicable
    if (appointment.is_urgent) {
      total += 100;
    }
    
    return total;
  };

  const handleBookingResponse = async (appointmentId, action, reason = '') => {
    try {
      const appointment = pendingRequests.find(req => req.id === appointmentId);
      if (!appointment) return;

      console.log(`🔄 Queue ${action} booking request:`, appointmentId);

      if (action === 'accept') {
        // Accept the booking
        const updates = {
          status: 'scheduled',
          updated_at: new Date().toISOString()
        };

        // If urgent, insert at the beginning and adjust other queue numbers
        if (appointment.is_urgent) {
          updates.queue_number = 1;
          
          // First, increment all existing queue numbers
          await supabase
            .from('appointments')
            .update({ queue_number: supabase.raw('queue_number + 1') })
            .eq('barber_id', user.id)
            .eq('appointment_date', appointment.appointment_date)
            .eq('status', 'scheduled');
        } else {
          // Get next queue number
          const maxQueueNumber = Math.max(
            0,
            ...queuedAppointments.map(apt => apt.queue_number || 0)
          );
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
          title: 'Appointment Confirmed!',
          message: `Your ${appointment.is_urgent ? 'urgent ' : ''}appointment has been confirmed by ${user.user_metadata?.full_name || 'your barber'}.`,
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
            is_urgent: appointment.is_urgent,
            queue_number: updates.queue_number
          }
        });

      } else {
        // Decline the booking
        const { error } = await supabase
          .from('appointments')
          .update({ 
            status: 'cancelled',
            updated_at: new Date().toISOString(),
            cancellation_reason: reason || 'Declined by barber'
          })
          .eq('id', appointmentId);

        if (error) throw error;

        // Create notification for customer
        await supabase.from('notifications').insert({
          user_id: appointment.customer_id,
          title: 'Appointment Declined',
          message: `Your appointment request has been declined. ${reason ? `Reason: ${reason}` : 'Please try booking with another barber or a different time.'}`,
          type: 'appointment_declined',
          data: {
            appointment_id: appointmentId,
            reason: reason
          }
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

      console.log(`✅ Queue booking ${action} completed`);

      // Refresh queue data
      setTimeout(() => fetchQueueData(), 1000);
    } catch (err) {
      console.error('Error responding to booking request:', err);
      setError('Failed to process booking request. Please try again.');
    }
  };

  const handleAppointmentStatus = async (appointmentId, status) => {
    try {
      const appointment = currentAppointment?.id === appointmentId 
        ? currentAppointment 
        : queuedAppointments.find(apt => apt.id === appointmentId);

      if (!appointment) {
        throw new Error('Appointment not found');
      }

      console.log(`🔄 Queue updating appointment ${appointmentId} to ${status}`);

      // Optimistic updates
      if (appointmentId === currentAppointment?.id && status === 'done') {
        setCurrentAppointment(null);
      }

      if (status === 'ongoing') {
        const appointmentToStart = queuedAppointments.find(apt => apt.id === appointmentId);
        if (appointmentToStart) {
          setCurrentAppointment(appointmentToStart);
          setQueuedAppointments(prev => prev.filter(apt => apt.id !== appointmentId));
        }
      }

      // Database update
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
        action: `appointment_marked_${status}`,
        details: {
          appointment_id: appointmentId
        }
      });

      // Create customer notification
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
          notificationData.message = `Your appointment has been marked as ${status}`;
      }

      await supabase.from('notifications').insert(notificationData);

      // Notify next customer if appointment completed
      if (status === 'done' && queuedAppointments.length > 0) {
        const nextAppointment = queuedAppointments[0];
        await supabase.from('notifications').insert({
          user_id: nextAppointment.customer_id,
          title: 'You\'re up next! 🔔',
          message: 'Your appointment is coming up next. Please be ready.',
          type: 'queue',
          data: { appointment_id: nextAppointment.id, position: 1 }
        });
      }

      // Broadcast change
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

      console.log(`✅ Queue successfully updated appointment to ${status}`);

      // Refresh data
      setTimeout(() => fetchQueueData(), 1000);

    } catch (err) {
      console.error('❌ Queue error updating appointment status:', err);
      setError('Failed to update appointment status. Please try again.');
      
      // Refresh on error to revert optimistic updates
      fetchQueueData();
    }
  };

  const formatTime = (timeString) => {
    if (!timeString) return '';
    
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours, 10);
    const period = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    
    return `${hour12}:${minutes} ${period}`;
  };

  const formatTimeRemaining = (durationMinutes) => {
    if (durationMinutes < 60) {
      return `${durationMinutes} minutes`;
    } else {
      const hours = Math.floor(durationMinutes / 60);
      const minutes = durationMinutes % 60;
      return `${hours} ${hours === 1 ? 'hour' : 'hours'}${minutes > 0 ? ` ${minutes} min` : ''}`;
    }
  };

  if (loading && !currentAppointment && queuedAppointments.length === 0) {
    return <LoadingSpinner />;
  }

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Today's Queue & Requests</h2>
        <div className="d-flex align-items-center">
          <div className="form-check form-switch me-3">
            <input
              className="form-check-input"
              type="checkbox"
              id="autoRefreshSwitch"
              checked={autoRefresh}
              onChange={() => setAutoRefresh(!autoRefresh)}
            />
            <label className="form-check-label" htmlFor="autoRefreshSwitch">
              Auto-refresh
            </label>
          </div>
          <button 
            className="btn btn-outline-primary"
            onClick={fetchQueueData}
          >
            <i className="bi bi-arrow-clockwise me-1"></i>
            Refresh
          </button>
        </div>
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

      {/* Stats */}
      <div className="row mb-4">
        <div className="col-md-3 mb-3">
          <div className="card bg-success text-white h-100">
            <div className="card-body">
              <h6 className="card-title">Completed Today</h6>
              <h3 className="mb-0">{stats.completed}</h3>
            </div>
          </div>
        </div>
        
        <div className="col-md-3 mb-3">
          <div className="card bg-warning text-white h-100">
            <div className="card-body">
              <h6 className="card-title">In Queue</h6>
              <h3 className="mb-0">{stats.remaining}</h3>
            </div>
          </div>
        </div>
        
        <div className="col-md-3 mb-3">
          <div className="card bg-info text-white h-100">
            <div className="card-body">
              <h6 className="card-title">Est. Time Remaining</h6>
              <h3 className="mb-0">{stats.totalTime ? formatTimeRemaining(stats.totalTime) : '0 min'}</h3>
            </div>
          </div>
        </div>

        <div className="col-md-3 mb-3">
          <div className="card bg-primary text-white h-100">
            <div className="card-body">
              <h6 className="card-title">Pending Requests</h6>
              <h3 className="mb-0">{stats.pendingRequests}</h3>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Booking Requests */}
      {pendingRequests.length > 0 && (
        <div className="card mb-4 border-warning">
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
                  <div className={`card ${request.is_urgent ? 'border-danger border-2' : 'border-secondary'}`}>
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
                        <span className="text-success ms-1">₱{getTotalPrice(request)}</span>
                        <small className="text-muted ms-2">
                          ({request.total_duration || (request.service?.duration || 30)} min)
                        </small>
                      </div>

                      {request.notes && (
                        <div className="mb-2">
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
                            if (reason !== null) {
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

      {/* Current appointment */}
      {currentAppointment ? (
        <div className="card mb-4 border-primary">
          <div className="card-header bg-primary text-white">
            <h5 className="mb-0">
              <i className="bi bi-scissors me-2"></i>
              Currently Serving
            </h5>
          </div>
          <div className="card-body">
            <div className="row">
              <div className="col-md-4 mb-3 mb-md-0">
                <div className="text-center">
                  <div className="rounded-circle bg-primary bg-opacity-10 p-4 d-inline-block mb-3">
                    <i className="bi bi-person-circle fs-1 text-primary"></i>
                  </div>
                  <h4>{currentAppointment.customer?.full_name}</h4>
                  <div className="mb-2">
                    {currentAppointment.customer?.phone && (
                      <a 
                        href={`tel:${currentAppointment.customer.phone}`}
                        className="btn btn-sm btn-outline-primary me-2"
                      >
                        <i className="bi bi-telephone me-1"></i>
                        Call
                      </a>
                    )}
                    {currentAppointment.customer?.email && (
                      <a 
                        href={`mailto:${currentAppointment.customer.email}`}
                        className="btn btn-sm btn-outline-primary"
                      >
                        <i className="bi bi-envelope me-1"></i>
                        Email
                      </a>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="col-md-5 mb-3 mb-md-0">
                <div className="card h-100">
                  <div className="card-body">
                    <h5 className="card-title">Service Details</h5>
                    <dl className="row mb-0">
                      <dt className="col-sm-4">Services:</dt>
                      <dd className="col-sm-8">{getServicesDisplay(currentAppointment)}</dd>
                      
                      {getAddOnsDisplay(currentAppointment) && (
                        <>
                          <dt className="col-sm-4">Add-ons:</dt>
                          <dd className="col-sm-8">{getAddOnsDisplay(currentAppointment)}</dd>
                        </>
                      )}
                      
                      <dt className="col-sm-4">Total:</dt>
                      <dd className="col-sm-8">₱{getTotalPrice(currentAppointment)}</dd>
                      
                      <dt className="col-sm-4">Duration:</dt>
                      <dd className="col-sm-8">
                        {currentAppointment.total_duration || currentAppointment.service?.duration} minutes
                      </dd>
                    </dl>
                    {currentAppointment.notes && (
                      <>
                        <dt>Notes:</dt>
                        <dd className="bg-light p-2 rounded">{currentAppointment.notes}</dd>
                      </>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="col-md-3 d-flex align-items-center justify-content-center">
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
      ) : (
        <div className="card mb-4 border-primary">
          <div className="card-body text-center py-5">
            <div className="display-1 text-muted mb-3">
              <i className="bi bi-scissors"></i>
            </div>
            <h4 className="text-muted mb-3">No customer currently being served</h4>
            {queuedAppointments.length > 0 && (
              <button
                className="btn btn-primary"
                onClick={() => handleAppointmentStatus(queuedAppointments[0].id, 'ongoing')}
              >
                <i className="bi bi-play-fill me-1"></i>
                Start Next Appointment
              </button>
            )}
          </div>
        </div>
      )}

      {/* Queue */}
      <div className="card">
        <div className="card-header">
          <h5 className="mb-0">
            <i className="bi bi-people-fill me-2"></i>
            Queue <span className="badge bg-secondary">{queuedAppointments.length}</span>
          </h5>
        </div>
        <div className="card-body">
          {queuedAppointments.length === 0 ? (
            <div className="text-center py-5">
              <div className="display-4 text-muted mb-3">
                <i className="bi bi-list-check"></i>
              </div>
              <p className="text-muted">No customers waiting in the queue</p>
              <Link to="/schedule" className="btn btn-outline-primary">
                View Full Schedule
              </Link>
            </div>
          ) : (
            <div className="list-group">
              {queuedAppointments.map((appointment, index) => (
                <div key={appointment.id} className="list-group-item">
                  <div className="row align-items-center">
                    <div className="col-md-1 text-center">
                      <div className={`rounded-circle ${appointment.is_urgent ? 'bg-danger' : 'bg-primary'} text-white d-flex align-items-center justify-content-center mx-auto`} style={{ width: '40px', height: '40px' }}>
                        {appointment.is_urgent && <i className="bi bi-lightning-fill"></i>}
                        {!appointment.is_urgent && (appointment.queue_number || index + 1)}
                      </div>
                    </div>
                    
                    <div className="col-md-3">
                      <h5 className="mb-0">{appointment.customer?.full_name}</h5>
                      <small className="text-muted">
                        {appointment.customer?.phone && (
                          <span>
                            <i className="bi bi-telephone me-1"></i>
                            {appointment.customer.phone}
                          </span>
                        )}
                      </small>
                      {appointment.is_urgent && (
                        <div className="mt-1">
                          <span className="badge bg-danger">URGENT</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="col-md-3">
                      <h6 className="mb-0">{getServicesDisplay(appointment)}</h6>
                      <small className="text-muted">
                        {appointment.total_duration || appointment.service?.duration} min • 
                        ₱{getTotalPrice(appointment)}
                      </small>
                      {getAddOnsDisplay(appointment) && (
                        <div className="small text-info">
                          Add-ons: {getAddOnsDisplay(appointment)}
                        </div>
                      )}
                    </div>
                    
                    <div className="col-md-2">
                      <div className="text-muted small">
                        Queue #{appointment.queue_number || index + 1}
                      </div>
                      {appointment.notes && (
                        <div className="small text-muted mt-1">
                          <i className="bi bi-chat-right-text me-1"></i>
                          Has notes
                        </div>
                      )}
                    </div>
                    
                    <div className="col-md-3 text-end">
                      {index === 0 && !currentAppointment ? (
                        <button
                          className="btn btn-primary"
                          onClick={() => handleAppointmentStatus(appointment.id, 'ongoing')}
                        >
                          <i className="bi bi-play-fill me-1"></i>
                          Start Service
                        </button>
                      ) : (
                        <button
                          className="btn btn-outline-danger btn-sm"
                          onClick={() => {
                            if (window.confirm('Are you sure you want to cancel this appointment?')) {
                              handleAppointmentStatus(appointment.id, 'cancelled');
                            }
                          }}
                        >
                          <i className="bi bi-x-circle me-1"></i>
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BarberQueue;
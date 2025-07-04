// components/dashboards/ManagerDashboard.js (Enhanced with analytics and queue management)
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { apiService } from '../../services/ApiService';
import logoImage from '../../assets/images/raf-rok-logo.png';

const ManagerDashboard = () => {
  const [stats, setStats] = useState({
    totalAppointments: 0,
    todayAppointments: 0,
    pendingRequests: 0,
    urgentBookings: 0,
    totalRevenue: 0,
    totalCustomers: 0,
    totalBarbers: 0,
    activeQueues: 0,
    averageWaitTime: 0,
    completionRate: 0
  });
  
  const [recentAppointments, setRecentAppointments] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [barberQueues, setBarberQueues] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [queueAnalytics, setQueueAnalytics] = useState({});
  const [capacityOverview, setCapacityOverview] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [animateCards, setAnimateCards] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(null);

  useEffect(() => {
    fetchDashboardData();
    fetchQueueAnalytics();
    fetchCapacityOverview();
    
    // Trigger card animations after component mounts
    setTimeout(() => {
      setAnimateCards(true);
    }, 300);
    
    // Set up real-time subscription for appointments
    const subscription = supabase
      .channel('manager-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => {
        fetchDashboardData();
        fetchQueueAnalytics();
        fetchCapacityOverview();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
        fetchDashboardData();
      })
      .subscribe();

    // Set up auto-refresh
    const interval = setInterval(() => {
      fetchDashboardData();
      fetchQueueAnalytics();
      fetchCapacityOverview();
    }, 60000); // Refresh every minute
    
    setRefreshInterval(interval);

    return () => {
      subscription.unsubscribe();
      if (interval) clearInterval(interval);
    };
  }, []);

  const fetchDashboardData = async () => {
    try {
      setError('');
      
      // Get today's date
      const today = new Date();
      const todayString = today.toISOString().split('T')[0];
      
      // Fetch all statistics in parallel
      const [
        { count: totalAppointments },
        { count: todayAppointments },
        { count: pendingRequests },
        { count: urgentBookings },
        { count: totalCustomers },
        { count: totalBarbers },
        { data: completedAppointments },
        { data: appointments },
        { data: logs }
      ] = await Promise.all([
        // Total appointments
        supabase
          .from('appointments')
          .select('*', { count: 'exact', head: true }),
        
        // Today's appointments
        supabase
          .from('appointments')
          .select('*', { count: 'exact', head: true })
          .eq('appointment_date', todayString),
        
        // Pending requests (all barbers)
        supabase
          .from('appointments')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending'),
        
        // Urgent bookings today
        supabase
          .from('appointments')
          .select('*', { count: 'exact', head: true })
          .eq('appointment_date', todayString)
          .eq('is_urgent', true),
        
        // Total customers
        supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'customer'),
        
        // Total barbers
        supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'barber'),
        
        // Calculate revenue (completed appointments)
        supabase
          .from('appointments')
          .select(`
            total_price,
            is_urgent,
            service:service_id(price)
          `)
          .eq('status', 'done'),
        
        // Recent appointments
        supabase
          .from('appointments')
          .select(`
            *,
            customer:customer_id(full_name, email, phone),
            barber:barber_id(full_name),
            service:service_id(name, price, duration)
          `)
          .order('created_at', { ascending: false })
          .limit(10),
        
        // Recent logs
        supabase
          .from('system_logs')
          .select(`
            *,
            user:user_id(full_name, role)
          `)
          .order('created_at', { ascending: false })
          .limit(10)
      ]);

      // Calculate total revenue including urgent fees
      const totalRevenue = completedAppointments?.reduce((sum, appointment) => {
        let price = appointment.total_price || appointment.service?.price || 0;
        if (appointment.is_urgent) {
          price += 100; // Urgent fee
        }
        return sum + price;
      }, 0) || 0;

      // Calculate completion rate
      const totalScheduled = appointments?.filter(apt => 
        ['scheduled', 'done', 'cancelled'].includes(apt.status)
      ).length || 0;
      const completed = appointments?.filter(apt => apt.status === 'done').length || 0;
      const completionRate = totalScheduled > 0 ? (completed / totalScheduled) * 100 : 0;

      // Get barber queues for today
      const barbers = await apiService.getBarbers();
      const queuePromises = barbers.map(async (barber) => {
        const queueInfo = await apiService.getBarberQueue(barber.id, todayString);
        return {
          barber,
          ...queueInfo
        };
      });
      
      const queues = await Promise.all(queuePromises);
      const activeQueues = queues.filter(q => q.queueCount > 0).length;
      const totalWaitTime = queues.reduce((total, q) => total + q.totalWaitTime, 0);
      const averageWaitTime = queues.length > 0 ? totalWaitTime / queues.length : 0;

      setStats({
        totalAppointments: totalAppointments || 0,
        todayAppointments: todayAppointments || 0,
        pendingRequests: pendingRequests || 0,
        urgentBookings: urgentBookings || 0,
        totalRevenue,
        totalCustomers: totalCustomers || 0,
        totalBarbers: totalBarbers || 0,
        activeQueues,
        averageWaitTime: Math.round(averageWaitTime),
        completionRate: Math.round(completionRate)
      });

      setRecentAppointments(appointments || []);
      setRecentLogs(logs || []);
      setBarberQueues(queues);

      // Get pending requests details
      const { data: pendingDetails } = await supabase
        .from('appointments')
        .select(`
          *,
          customer:customer_id(full_name, email, phone),
          barber:barber_id(full_name),
          service:service_id(name, price, duration)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5);
      
      setPendingRequests(pendingDetails || []);

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setError('Failed to load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchQueueAnalytics = async () => {
    try {
      const today = new Date();
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      const analytics = await apiService.getQueueAnalytics(
        weekAgo.toISOString().split('T')[0],
        today.toISOString().split('T')[0]
      );
      
      setQueueAnalytics(analytics);
    } catch (error) {
      console.error('Error fetching queue analytics:', error);
    }
  };

  const fetchCapacityOverview = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const capacity = await apiService.getAllBarbersCapacity(today);
      setCapacityOverview(capacity);
    } catch (error) {
      console.error('Error fetching capacity overview:', error);
    }
  };

  const handleAppointmentStatus = async (appointmentId, status) => {
    try {
      await apiService.updateAppointment(appointmentId, { status });
      
      // Log the action
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await apiService.logAction(user.id, 'appointment_status_change', {
          appointment_id: appointmentId,
          new_status: status,
          changed_by: 'manager'
        });
      }

      // Create notification for customer
      const appointment = recentAppointments.find(apt => apt.id === appointmentId);
      if (appointment) {
        await apiService.createNotification({
          user_id: appointment.customer_id,
          title: `Appointment ${status.charAt(0).toUpperCase() + status.slice(1)}`,
          message: `Your appointment has been ${status} by the manager`,
          type: 'appointment',
          data: {
            appointment_id: appointmentId,
            status: status
          }
        });
      }

      // Refresh data
      fetchDashboardData();
    } catch (error) {
      console.error('Error updating appointment status:', error);
      alert('Failed to update appointment status. Please try again.');
    }
  };

  const handlePendingRequest = async (appointmentId, action) => {
    try {
      const appointment = pendingRequests.find(req => req.id === appointmentId);
      if (!appointment) return;

      if (action === 'approve') {
        const queueNumber = await apiService.getNextQueueNumber(
          appointment.barber_id, 
          appointment.appointment_date
        );
        
        await apiService.confirmAppointment(appointmentId, queueNumber);
        
        await apiService.createNotification({
          user_id: appointment.customer_id,
          title: 'Appointment Approved!',
          message: 'Your appointment has been approved by management.',
          type: 'appointment_confirmed',
          data: { appointment_id: appointmentId, queue_number: queueNumber }
        });
      } else {
        await apiService.declineAppointment(appointmentId, 'Declined by management');
        
        await apiService.createNotification({
          user_id: appointment.customer_id,
          title: 'Appointment Declined',
          message: 'Your appointment request has been declined by management.',
          type: 'appointment_declined',
          data: { appointment_id: appointmentId }
        });
      }

      fetchDashboardData();
    } catch (error) {
      console.error('Error handling pending request:', error);
      alert('Failed to process request. Please try again.');
    }
  };

  // Format human-readable timestamp from ISO date
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  // Format action for display
  const formatAction = (action) => {
    return action
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Calculate estimated wait time for queue position
  const calculateWaitTime = (queueCount, averageServiceTime = 35) => {
    const waitTimeMinutes = queueCount * averageServiceTime;
    
    if (waitTimeMinutes >= 60) {
      const hours = Math.floor(waitTimeMinutes / 60);
      const minutes = waitTimeMinutes % 60;
      return `${hours}h ${minutes}m`;
    }
    
    return `${waitTimeMinutes} min`;
  };

  const getCapacityColor = (capacity, maxCapacity) => {
    const percentage = (capacity / maxCapacity) * 100;
    if (percentage >= 90) return 'danger';
    if (percentage >= 70) return 'warning';
    return 'success';
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
          <button className="btn btn-danger mt-2" onClick={fetchDashboardData}>
            <i className="bi bi-arrow-clockwise me-2"></i>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid py-4 dashboard-container">
      {/* Manager Welcome Header */}
      <div className="row mb-4">
        <div className="col">
          <div className="manager-welcome-header p-4 rounded shadow-sm d-flex align-items-center">
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
                <h1 className="h3 mb-0 text-white">Manager Dashboard</h1>
              </div>
              <p className="text-light mb-0">
                <i className="bi bi-graph-up me-2"></i>
                Complete overview of barbershop operations and queue management
              </p>
            </div>
            <div className="ms-auto text-end text-light">
              <div className="h4 mb-0">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
              <div className="text-light">
                <i className="bi bi-calendar-check me-2"></i>
                Real-time Operations
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Stats Cards */}
      <div className="row mb-4">
        <div className="col-md-3 col-lg-2 mb-3">
          <div 
            className={`card stats-card bg-gradient-primary text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`}
            style={{ animationDelay: '0.1s' }}
          >
            <div className="card-body d-flex align-items-center">
              <div>
                <h6 className="card-title mb-1">Today's Appointments</h6>
                <h2 className="mb-0">{stats.todayAppointments}</h2>
              </div>
              <div className="ms-auto card-icon">
                <i className="bi bi-calendar-check"></i>
              </div>
            </div>
          </div>
        </div>
        
        <div className="col-md-3 col-lg-2 mb-3">
          <div 
            className={`card stats-card bg-gradient-warning text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`}
            style={{ animationDelay: '0.2s' }}
          >
            <div className="card-body d-flex align-items-center">
              <div>
                <h6 className="card-title mb-1">Pending Requests</h6>
                <h2 className="mb-0">{stats.pendingRequests}</h2>
              </div>
              <div className="ms-auto card-icon">
                <i className="bi bi-clock-fill"></i>
              </div>
            </div>
          </div>
        </div>
        
        <div className="col-md-3 col-lg-2 mb-3">
          <div 
            className={`card stats-card bg-gradient-danger text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`}
            style={{ animationDelay: '0.3s' }}
          >
            <div className="card-body d-flex align-items-center">
              <div>
                <h6 className="card-title mb-1">Urgent Bookings</h6>
                <h2 className="mb-0">{stats.urgentBookings}</h2>
              </div>
              <div className="ms-auto card-icon">
                <i className="bi bi-lightning-fill"></i>
              </div>
            </div>
          </div>
        </div>
        
        <div className="col-md-3 col-lg-2 mb-3">
          <div 
            className={`card stats-card bg-gradient-success text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`}
            style={{ animationDelay: '0.4s' }}
          >
            <div className="card-body d-flex align-items-center">
              <div>
                <h6 className="card-title mb-1">Total Revenue</h6>
                <h2 className="mb-0">₱{stats.totalRevenue.toFixed(0)}</h2>
              </div>
              <div className="ms-auto card-icon">
                <i className="bi bi-cash-coin"></i>
              </div>
            </div>
          </div>
        </div>
        
        <div className="col-md-3 col-lg-2 mb-3">
          <div 
            className={`card stats-card bg-gradient-info text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`}
            style={{ animationDelay: '0.5s' }}
          >
            <div className="card-body d-flex align-items-center">
              <div>
                <h6 className="card-title mb-1">Active Queues</h6>
                <h2 className="mb-0">{stats.activeQueues}</h2>
              </div>
              <div className="ms-auto card-icon">
                <i className="bi bi-people-fill"></i>
              </div>
            </div>
          </div>
        </div>
        
        <div className="col-md-3 col-lg-2 mb-3">
          <div 
            className={`card stats-card bg-gradient-secondary text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`}
            style={{ animationDelay: '0.6s' }}
          >
            <div className="card-body d-flex align-items-center">
              <div>
                <h6 className="card-title mb-1">Completion Rate</h6>
                <h2 className="mb-0">{stats.completionRate}%</h2>
              </div>
              <div className="ms-auto card-icon">
                <i className="bi bi-check-circle"></i>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Capacity Overview */}
      <div className="row mb-4">
        <div className="col-12">
          <div className="card shadow-sm">
            <div className="card-header">
              <h5 className="mb-0">
                <i className="bi bi-speedometer me-2"></i>
                Barber Capacity Overview
              </h5>
            </div>
            <div className="card-body">
              <div className="row">
                {capacityOverview.map((barber) => (
                  <div key={barber.barber_id} className="col-md-4 col-lg-3 mb-3">
                    <div className="card border-0 bg-light">
                      <div className="card-body p-3">
                        <h6 className="card-title">{barber.barber_name}</h6>
                        <div className="progress mb-2" style={{ height: '10px' }}>
                          <div 
                            className={`progress-bar bg-${getCapacityColor(barber.current_capacity, barber.max_capacity)}`}
                            style={{ width: `${(barber.current_capacity / barber.max_capacity) * 100}%` }}
                          ></div>
                        </div>
                        <div className="d-flex justify-content-between">
                          <small>{barber.current_capacity}/{barber.max_capacity}</small>
                          <small className="text-muted">
                            {barber.is_full ? 'FULL' : `${barber.available_slots} available`}
                          </small>
                        </div>
                        {barber.estimated_wait_time > 0 && (
                          <div className="mt-1">
                            <small className="text-info">
                              <i className="bi bi-clock me-1"></i>
                              Wait: {calculateWaitTime(barber.current_capacity)}
                            </small>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Requests Alert */}
      {pendingRequests.length > 0 && (
        <div className="row mb-4">
          <div className="col-12">
            <div className="alert alert-warning shadow-sm">
              <div className="d-flex align-items-center">
                <i className="bi bi-exclamation-triangle me-2 fs-4"></i>
                <div className="flex-grow-1">
                  <h5 className="alert-heading">Pending Booking Requests</h5>
                  <p className="mb-0">You have {pendingRequests.length} booking requests awaiting approval.</p>
                </div>
                <button 
                  className="btn btn-warning"
                  onClick={() => document.getElementById('pending-requests').scrollIntoView()}
                >
                  Review Requests
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="row">
        {/* Recent Appointments */}
        <div className="col-md-8 mb-4">
          <div className="card shadow-sm appointments-card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <div className="d-flex align-items-center">
                <i className="bi bi-calendar-week me-2 header-icon"></i>
                <h5 className="card-title mb-0">Recent Appointments</h5>
              </div>
              <button className="btn btn-light btn-sm" onClick={fetchDashboardData}>
                <i className="bi bi-arrow-clockwise me-1"></i>
                Refresh
              </button>
            </div>
            <div className="card-body">
              {recentAppointments.length === 0 ? (
                <div className="empty-state text-center py-4">
                  <div className="empty-icon">
                    <i className="bi bi-calendar-x"></i>
                  </div>
                  <h5>No Appointments Found</h5>
                  <p className="text-muted">There are no appointments in the system yet.</p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table align-middle">
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Barber</th>
                        <th>Service</th>
                        <th>Date & Time</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentAppointments.slice(0, 8).map((appointment) => (
                        <tr key={appointment.id} className={appointment.status === 'ongoing' ? 'table-active current-row' : ''}>
                          <td>
                            <div className="d-flex align-items-center">
                              <div className="avatar-placeholder me-2">
                                {appointment.customer?.full_name?.charAt(0) || '?'}
                              </div>
                              <div>
                                <div>{appointment.customer?.full_name || 'Unknown'}</div>
                                {appointment.customer?.phone && (
                                  <div className="phone-number">
                                    <i className="bi bi-telephone me-1"></i>
                                    {appointment.customer.phone}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="barber-name">
                              <i className="bi bi-scissors me-1"></i>
                              {appointment.barber?.full_name || 'Unknown'}
                            </div>
                          </td>
                          <td>
                            <div className="service-name">{appointment.service?.name || 'Unknown'}</div>
                            <div className="service-details">
                              <span className="duration">
                                <i className="bi bi-clock me-1"></i>
                                {appointment.total_duration || appointment.service?.duration} min
                              </span>
                              <span className="price ms-2">
                                <i className="bi bi-cash me-1"></i>
                                ₱{appointment.total_price || appointment.service?.price}
                              </span>
                              {appointment.is_urgent && (
                                <span className="badge bg-warning ms-2">URGENT</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <div className="date-info">
                              <i className="bi bi-calendar3 me-1"></i>
                              {appointment.appointment_date}
                            </div>
                            {appointment.queue_number && (
                              <div className="queue-info">
                                <i className="bi bi-list-ol me-1"></i>
                                Queue #{appointment.queue_number}
                              </div>
                            )}
                          </td>
                          <td>
                            <span className={`status-badge status-${appointment.status}`}>
                              {appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
                            </span>
                          </td>
                          <td>
                            {appointment.status === 'scheduled' && (
                              <div className="btn-group" role="group">
                                <button
                                  className="btn btn-sm btn-primary action-btn"
                                  onClick={() => handleAppointmentStatus(appointment.id, 'ongoing')}
                                >
                                  <i className="bi bi-play-fill me-1"></i>
                                  Start
                                </button>
                                <button
                                  className="btn btn-sm btn-danger action-btn"
                                  onClick={() => handleAppointmentStatus(appointment.id, 'cancelled')}
                                >
                                  <i className="bi bi-x-lg me-1"></i>
                                  Cancel
                                </button>
                              </div>
                            )}
                            {appointment.status === 'ongoing' && (
                              <button
                                className="btn btn-sm btn-success action-btn"
                                onClick={() => handleAppointmentStatus(appointment.id, 'done')}
                              >
                                <i className="bi bi-check-lg me-1"></i>
                                Complete
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Pending Requests & Activity */}
        <div className="col-md-4 mb-4">
          {/* Pending Requests */}
          <div id="pending-requests" className="card shadow-sm mb-4">
            <div className="card-header">
              <div className="d-flex align-items-center">
                <i className="bi bi-bell me-2 header-icon"></i>
                <h5 className="card-title mb-0">Pending Requests</h5>
                <span className="badge bg-warning ms-2">{pendingRequests.length}</span>
              </div>
            </div>
            <div className="card-body p-0">
              <div className="pending-requests-feed">
                {pendingRequests.length === 0 ? (
                  <div className="empty-state text-center py-4">
                    <div className="empty-icon">
                      <i className="bi bi-check-circle"></i>
                    </div>
                    <h5>No Pending Requests</h5>
                    <p className="text-muted">All booking requests have been processed.</p>
                  </div>
                ) : (
                  pendingRequests.map((request) => (
                    <div key={request.id} className="pending-request-item p-3 border-bottom">
                      <div className="d-flex justify-content-between align-items-start mb-2">
                        <div>
                          <h6 className="mb-1">{request.customer?.full_name}</h6>
                          <small className="text-muted">
                            {request.service?.name} with {request.barber?.full_name}
                          </small>
                        </div>
                        {request.is_urgent && (
                          <span className="badge bg-danger">URGENT</span>
                        )}
                      </div>
                      
                      <div className="mb-2">
                        <small className="text-muted">
                          <i className="bi bi-calendar me-1"></i>
                          {new Date(request.appointment_date).toLocaleDateString()}
                        </small>
                        <br />
                        <small className="text-success">
                          <i className="bi bi-cash me-1"></i>
                          ₱{request.total_price || request.service?.price}
                        </small>
                      </div>
                      
                      <div className="d-flex gap-2">
                        <button
                          className="btn btn-sm btn-success flex-fill"
                          onClick={() => handlePendingRequest(request.id, 'approve')}
                        >
                          <i className="bi bi-check me-1"></i>
                          Approve
                        </button>
                        <button
                          className="btn btn-sm btn-outline-danger flex-fill"
                          onClick={() => handlePendingRequest(request.id, 'decline')}
                        >
                          <i className="bi bi-x me-1"></i>
                          Decline
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* System Activity Log */}
          <div className="card shadow-sm">
            <div className="card-header">
              <div className="d-flex align-items-center">
                <i className="bi bi-activity me-2 header-icon"></i>
                <h5 className="card-title mb-0">Recent Activity</h5>
              </div>
            </div>
            <div className="card-body p-0">
              <div className="activity-feed">
                {recentLogs.length === 0 ? (
                  <div className="empty-state text-center py-4">
                    <div className="empty-icon">
                      <i className="bi bi-clock-history"></i>
                    </div>
                    <h5>No Recent Activity</h5>
                    <p className="text-muted">System activity will appear here.</p>
                  </div>
                ) : (
                  recentLogs.slice(0, 5).map((log) => (
                    <div key={log.id} className="activity-item p-3 border-bottom">
                      <div className="activity-icon me-3">
                        <div className={`activity-icon-bg icon-${
                          log.action.includes('success') ? 'success' :
                          log.action.includes('failed') ? 'danger' :
                          log.action.includes('appointment') ? 'primary' :
                          log.action.includes('login') ? 'info' :
                          'secondary'
                        }`}>
                          <i className={`bi ${
                            log.action.includes('login') ? 'bi-box-arrow-in-right' :
                            log.action.includes('appointment') ? 'bi-calendar' :
                            log.action.includes('registration') ? 'bi-person-plus' :
                            'bi-activity'
                          }`}></i>
                        </div>
                      </div>
                      <div className="activity-content">
                        <div className="d-flex justify-content-between mb-1">
                          <div className="activity-title">{formatAction(log.action)}</div>
                          <div className="activity-time">
                            {formatTimestamp(log.created_at)}
                          </div>
                        </div>
                        <div className="activity-user">
                          {log.user ? (
                            <span>
                              <i className="bi bi-person me-1"></i>
                              {log.user.full_name} 
                              <span className="user-role">({log.user.role})</span>
                            </span>
                          ) : (
                            <span className="system-user">System</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="card-footer bg-light">
              <div className="d-flex justify-content-between align-items-center">
                <small className="text-muted">Showing last {Math.min(recentLogs.length, 5)} activities</small>
                <button className="btn btn-sm btn-light" onClick={fetchDashboardData}>
                  <i className="bi bi-arrow-clockwise me-1"></i>
                  Refresh
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ManagerDashboard;
// components/dashboards/CustomerDashboard.js (Enhanced with queue status and new features)
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import logoImage from '../../assets/images/raf-rok-logo.png';

const CustomerDashboard = () => {
  const [upcomingAppointments, setUpcomingAppointments] = useState([]);
  const [queuePositions, setQueuePositions] = useState({});
  const [barberStatuses, setBarberStatuses] = useState({});
  const [pendingRequests, setPendingRequests] = useState([]);
  const [userStats, setUserStats] = useState({
    totalAppointments: 0,
    favoriteBarber: null,
    lastVisit: null,
    totalSpent: 0,
    upcomingCount: 0
  });
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [animateCards, setAnimateCards] = useState(false);
  const [animateActions, setAnimateActions] = useState(false);
  const [realTimeUpdates, setRealTimeUpdates] = useState(true);

  useEffect(() => {
    getCurrentUser();
    
    setTimeout(() => {
      setAnimateCards(true);
      setTimeout(() => {
        setAnimateActions(true);
      }, 300);
    }, 300);
  }, []);

  useEffect(() => {
    if (user) {
      fetchCustomerData();
      
      // Set up real-time subscription for appointments
      const subscription = supabase
        .channel('customer-appointments')
        .on('postgres_changes', 
          { 
            event: '*', 
            schema: 'public', 
            table: 'appointments',
            filter: `customer_id=eq.${user.id}`
          }, 
          () => {
            if (realTimeUpdates) {
              fetchCustomerData();
            }
          }
        )
        .subscribe();
      
      // Set up interval for queue position updates
      const interval = setInterval(() => {
        if (realTimeUpdates && upcomingAppointments.length > 0) {
          updateQueuePositions();
        }
      }, 30000); // Update every 30 seconds
      
      return () => {
        subscription.unsubscribe();
        clearInterval(interval);
      };
    }
  }, [user, realTimeUpdates, upcomingAppointments]);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
  };

  const fetchCustomerData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) return;

      // Fetch upcoming appointments
      const today = new Date().toISOString().split('T')[0];
      const { data: appointments, error: appointmentsError } = await supabase
        .from('appointments')
        .select(`
          *,
          barber:barber_id(id, full_name, email, barber_status),
          service:service_id(id, name, price, duration)
        `)
        .eq('customer_id', user.id)
        .gte('appointment_date', today)
        .in('status', ['scheduled', 'ongoing', 'pending'])
        .order('appointment_date')
        .order('queue_number', { ascending: true });

      if (appointmentsError) throw appointmentsError;

      // Separate pending requests from confirmed appointments
      const confirmedAppointments = appointments?.filter(apt => apt.status !== 'pending') || [];
      const pendingAppointments = appointments?.filter(apt => apt.status === 'pending') || [];

      setUpcomingAppointments(confirmedAppointments);
      setPendingRequests(pendingAppointments);

      // Fetch barber statuses
      const barberIds = [...new Set(appointments?.map(apt => apt.barber_id) || [])];
      const barberStatusMap = {};
      
      for (const barberId of barberIds) {
        const appointment = appointments.find(apt => apt.barber_id === barberId);
        if (appointment?.barber) {
          barberStatusMap[barberId] = appointment.barber.barber_status || 'available';
        }
      }
      setBarberStatuses(barberStatusMap);

      // Update queue positions for today's appointments
      await updateQueuePositions(confirmedAppointments);

      // Fetch user statistics
      const { count: totalAppointments } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('customer_id', user.id);

      // Calculate total spent
      const { data: completedAppointments } = await supabase
        .from('appointments')
        .select('total_price, service:service_id(price), is_urgent')
        .eq('customer_id', user.id)
        .eq('status', 'done');

      const totalSpent = completedAppointments?.reduce((sum, apt) => {
        const price = apt.total_price || apt.service?.price || 0;
        const urgentFee = apt.is_urgent ? 100 : 0;
        return sum + price + urgentFee;
      }, 0) || 0;

      // Find favorite barber
      const { data: appointmentsByBarber } = await supabase
        .from('appointments')
        .select(`
          barber_id,
          barber:barber_id(full_name)
        `)
        .eq('customer_id', user.id)
        .eq('status', 'done');

      const barberCounts = {};
      appointmentsByBarber?.forEach(apt => {
        barberCounts[apt.barber_id] = (barberCounts[apt.barber_id] || 0) + 1;
      });

      const favoriteBarber = Object.keys(barberCounts).reduce((a, b) => 
        barberCounts[a] > barberCounts[b] ? a : b, null);

      const favoriteBarberInfo = appointmentsByBarber?.find(apt => apt.barber_id === favoriteBarber)?.barber;

      // Get last visit
      const { data: lastAppointment } = await supabase
        .from('appointments')
        .select('appointment_date')
        .eq('customer_id', user.id)
        .eq('status', 'done')
        .order('appointment_date', { ascending: false })
        .limit(1);

      setUserStats({
        totalAppointments: totalAppointments || 0,
        favoriteBarber: favoriteBarberInfo,
        lastVisit: lastAppointment?.[0]?.appointment_date,
        totalSpent,
        upcomingCount: confirmedAppointments.length
      });

    } catch (error) {
      console.error('Error fetching customer data:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateQueuePositions = async (appointments = upcomingAppointments) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const todayAppointments = appointments.filter(apt => 
        apt.appointment_date === today && apt.status === 'scheduled'
      );

      const positions = {};
      
      for (const appointment of todayAppointments) {
        const { data: queueData, error } = await supabase
          .from('appointments')
          .select('id, queue_number, customer:customer_id(full_name)')
          .eq('barber_id', appointment.barber_id)
          .eq('appointment_date', today)
          .eq('status', 'scheduled')
          .order('queue_number', { ascending: true });

        if (!error && queueData) {
          const currentIndex = queueData.findIndex(apt => apt.id === appointment.id);
          const position = currentIndex + 1;
          const estimatedWait = currentIndex * 35; // 35 minutes average per customer
          
          positions[appointment.id] = {
            position,
            totalInQueue: queueData.length,
            estimatedWait: estimatedWait < 60 ? `${estimatedWait} min` : 
                          `${Math.floor(estimatedWait / 60)}h ${estimatedWait % 60}m`,
            customersAhead: queueData.slice(0, currentIndex).map(apt => apt.customer.full_name)
          };
        }
      }
      
      setQueuePositions(positions);
    } catch (err) {
      console.error('Error fetching queue positions:', err);
    }
  };

  const handleCancelAppointment = async (appointmentId) => {
    if (!window.confirm('Are you sure you want to cancel this appointment?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('appointments')
        .update({ 
          status: 'cancelled',
          updated_at: new Date().toISOString(),
          queue_number: null,
          cancellation_reason: 'Cancelled by customer'
        })
        .eq('id', appointmentId);

      if (error) throw error;

      // Create notification for barber
      const appointment = upcomingAppointments.find(apt => apt.id === appointmentId);
      if (appointment) {
        await supabase.from('notifications').insert({
          user_id: appointment.barber_id,
          title: 'Appointment Cancelled',
          message: `${user.user_metadata?.full_name || user.email} has cancelled their appointment.`,
          type: 'appointment_cancelled',
          data: {
            appointment_id: appointmentId,
            customer_name: user.user_metadata?.full_name || user.email
          }
        });
      }

      await supabase.from('system_logs').insert({
        user_id: user.id,
        action: 'appointment_cancelled_by_customer',
        details: { appointment_id: appointmentId }
      });

      fetchCustomerData();
    } catch (err) {
      console.error('Error cancelling appointment:', err);
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

  const getTotalPrice = (appointment) => {
    let total = appointment.total_price || appointment.service?.price || 0;
    if (appointment.is_urgent) {
      total += 100;
    }
    return total;
  };

  const getBarberStatusColor = (status) => {
    switch (status) {
      case 'available': return 'success';
      case 'busy': return 'warning';
      case 'break': return 'info';
      case 'offline': return 'secondary';
      default: return 'primary';
    }
  };

  const getBarberStatusText = (status) => {
    switch (status) {
      case 'available': return 'Available';
      case 'busy': return 'Busy';
      case 'break': return 'On Break';
      case 'offline': return 'Offline';
      default: return 'Unknown';
    }
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

  return (
    <div className="container-fluid py-4 dashboard-container">
      {/* Customer Welcome Header */}
      <div className="row mb-4">
        <div className="col">
          <div className="customer-welcome-header p-4 rounded shadow-sm d-flex align-items-center">
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
                <h1 className="h3 mb-0 text-white">Welcome back!</h1>
              </div>
              <p className="text-light mb-0">
                <i className="bi bi-calendar3 me-2"></i>
                Your appointments and queue status
              </p>
            </div>
            <div className="ms-auto text-end text-light">
              <div className="h4 mb-0">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
              <div className="text-light d-flex align-items-center justify-content-end">
                <div className="form-check form-switch">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="realTimeToggle"
                    checked={realTimeUpdates}
                    onChange={(e) => setRealTimeUpdates(e.target.checked)}
                  />
                  <label className="form-check-label text-light" htmlFor="realTimeToggle">
                    <i className="bi bi-broadcast me-1"></i>
                    Live Updates
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="row mb-4">
        <div className="col-md-3 mb-3">
          <Link 
            to="/book" 
            className={`card quick-action-card shadow-sm h-100 text-decoration-none ${animateActions ? 'action-card-animated' : ''}`}
            style={{ animationDelay: '0.1s' }}
          >
            <div className="card-body text-center">
              <div className="quick-action-icon primary-action mb-3">
                <i className="bi bi-calendar-plus"></i>
              </div>
              <h5 className="card-title">Book Appointment</h5>
              <p className="card-text text-muted">Schedule your next visit</p>
            </div>
          </Link>
        </div>
        
        <div className="col-md-3 mb-3">
          <Link 
            to="/haircut-recommender" 
            className={`card quick-action-card shadow-sm h-100 text-decoration-none ${animateActions ? 'action-card-animated' : ''}`}
            style={{ animationDelay: '0.2s' }}
          >
            <div className="card-body text-center">
              <div className="quick-action-icon success-action mb-3">
                <i className="bi bi-magic"></i>
              </div>
              <h5 className="card-title">Style Recommender</h5>
              <p className="card-text text-muted">Get personalized suggestions</p>
            </div>
          </Link>
        </div>
        
        <div className="col-md-3 mb-3">
          <Link 
            to="/appointments" 
            className={`card quick-action-card shadow-sm h-100 text-decoration-none ${animateActions ? 'action-card-animated' : ''}`}
            style={{ animationDelay: '0.3s' }}
          >
            <div className="card-body text-center">
              <div className="quick-action-icon info-action mb-3">
                <i className="bi bi-calendar-check"></i>
              </div>
              <h5 className="card-title">My Appointments</h5>
              <p className="card-text text-muted">View appointment history</p>
            </div>
          </Link>
        </div>

        <div className="col-md-3 mb-3">
          <Link 
            to="/products" 
            className={`card quick-action-card shadow-sm h-100 text-decoration-none ${animateActions ? 'action-card-animated' : ''}`}
            style={{ animationDelay: '0.4s' }}
          >
            <div className="card-body text-center">
              <div className="quick-action-icon warning-action mb-3">
                <i className="bi bi-bag"></i>
              </div>
              <h5 className="card-title">Shop Products</h5>
              <p className="card-text text-muted">Browse our products</p>
            </div>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="row mb-4">
        <div className="col-md-3 mb-3">
          <div 
            className={`card stats-card bg-gradient-primary text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`}
            style={{ animationDelay: '0.1s' }}
          >
            <div className="card-body d-flex align-items-center">
              <div>
                <h6 className="card-title mb-1">Total Visits</h6>
                <h2 className="mb-0">{userStats.totalAppointments}</h2>
              </div>
              <div className="ms-auto card-icon">
                <i className="bi bi-calendar-check"></i>
              </div>
            </div>
          </div>
        </div>
        
        <div className="col-md-3 mb-3">
          <div 
            className={`card stats-card bg-gradient-success text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`}
            style={{ animationDelay: '0.2s' }}
          >
            <div className="card-body d-flex align-items-center">
              <div>
                <h6 className="card-title mb-1">Total Spent</h6>
                <h2 className="mb-0">₱{userStats.totalSpent.toFixed(0)}</h2>
              </div>
              <div className="ms-auto card-icon">
                <i className="bi bi-wallet2"></i>
              </div>
            </div>
          </div>
        </div>
        
        <div className="col-md-3 mb-3">
          <div 
            className={`card stats-card bg-gradient-info text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`}
            style={{ animationDelay: '0.3s' }}
          >
            <div className="card-body d-flex align-items-center">
              <div>
                <h6 className="card-title mb-1">Upcoming</h6>
                <h2 className="mb-0">{userStats.upcomingCount}</h2>
              </div>
              <div className="ms-auto card-icon">
                <i className="bi bi-clock"></i>
              </div>
            </div>
          </div>
        </div>

        <div className="col-md-3 mb-3">
          <div 
            className={`card stats-card bg-gradient-warning text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`}
            style={{ animationDelay: '0.4s' }}
          >
            <div className="card-body d-flex align-items-center">
              <div>
                <h6 className="card-title mb-1">Favorite Barber</h6>
                <h2 className="mb-0" style={{ fontSize: '1.2rem' }}>
                  {userStats.favoriteBarber?.full_name || 'None yet'}
                </h2>
              </div>
              <div className="ms-auto card-icon">
                <i className="bi bi-star"></i>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Requests Alert */}
      {pendingRequests.length > 0 && (
        <div className="alert alert-warning shadow-sm mb-4" role="alert">
          <div className="d-flex align-items-center">
            <div className="me-3">
              <i className="bi bi-clock-fill fs-4"></i>
            </div>
            <div className="flex-grow-1">
              <h5 className="alert-heading mb-1">Pending Requests</h5>
              <p className="mb-0">
                You have {pendingRequests.length} booking request{pendingRequests.length > 1 ? 's' : ''} waiting for barber confirmation.
              </p>
            </div>
            <Link to="/appointments" className="btn btn-warning">
              View Details
            </Link>
          </div>
        </div>
      )}

      <div className="row">
        {/* Upcoming Appointments */}
        <div className="col-md-8 mb-4">
          <div className="card shadow-sm appointments-card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <div className="d-flex align-items-center">
                <i className="bi bi-calendar-week me-2 header-icon"></i>
                <h5 className="card-title mb-0">Upcoming Appointments</h5>
              </div>
              <Link to="/book" className="btn btn-primary btn-sm">
                <i className="bi bi-plus-lg me-1"></i>
                Book New
              </Link>
            </div>
            <div className="card-body">
              {upcomingAppointments.length === 0 ? (
                <div className="empty-state text-center py-5">
                  <div className="empty-icon mb-3">
                    <i className="bi bi-calendar-x"></i>
                  </div>
                  <h5>No Upcoming Appointments</h5>
                  <p className="text-muted mb-4">You don't have any appointments scheduled yet.</p>
                  <Link to="/book" className="btn btn-primary">
                    <i className="bi bi-calendar-plus me-2"></i>
                    Book Your First Appointment
                  </Link>
                </div>
              ) : (
                <div className="row">
                  {upcomingAppointments.map((appointment) => (
                    <div key={appointment.id} className="col-md-6 mb-3">
                      <div className={`card appointment-card h-100 ${appointment.status === 'ongoing' ? 'border-success' : 'border-primary'}`}>
                        <div className="card-body">
                          <div className="d-flex justify-content-between align-items-start mb-2">
                            <div>
                              <h6 className="card-title mb-1">{getServicesDisplay(appointment)}</h6>
                              <p className="text-muted mb-1">
                                <i className="bi bi-person me-1"></i>
                                {appointment.barber?.full_name}
                              </p>
                              <p className="text-muted mb-1">
                                <i className="bi bi-calendar me-1"></i>
                                {new Date(appointment.appointment_date).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="text-end">
                              <span className={`badge bg-${getBarberStatusColor(barberStatuses[appointment.barber_id])}`}>
                                {getBarberStatusText(barberStatuses[appointment.barber_id])}
                              </span>
                              {appointment.is_urgent && (
                                <div className="mt-1">
                                  <span className="badge bg-warning">
                                    <i className="bi bi-lightning-fill me-1"></i>URGENT
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="mb-2">
                            <span className="text-success fw-bold">₱{getTotalPrice(appointment)}</span>
                            <span className="text-muted ms-2">
                              ({appointment.total_duration || appointment.service?.duration} min)
                            </span>
                          </div>

                          {appointment.status === 'ongoing' && (
                            <div className="alert alert-success py-2 mb-2">
                              <small>
                                <i className="bi bi-scissors me-1"></i>
                                Your appointment is in progress!
                              </small>
                            </div>
                          )}

                          {appointment.status === 'scheduled' && queuePositions[appointment.id] && (
                            <div className="alert alert-info py-2 mb-2">
                              <small>
                                <i className="bi bi-people me-1"></i>
                                Queue position: #{queuePositions[appointment.id].position} of {queuePositions[appointment.id].totalInQueue}
                                <br />
                                <i className="bi bi-clock me-1"></i>
                                Est. wait: {queuePositions[appointment.id].estimatedWait}
                              </small>
                            </div>
                          )}

                          {appointment.status === 'scheduled' && (
                            <div className="d-flex gap-2">
                              <Link
                                to={`/book?rebook=${appointment.id}`}
                                className="btn btn-sm btn-outline-primary"
                                title="Reschedule"
                              >
                                <i className="bi bi-arrow-repeat"></i>
                              </Link>
                              <button
                                className="btn btn-sm btn-outline-danger"
                                onClick={() => handleCancelAppointment(appointment.id)}
                                title="Cancel"
                              >
                                <i className="bi bi-x-circle"></i>
                              </button>
                            </div>
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

        {/* Queue Status & Tips */}
        <div className="col-md-4 mb-4">
          {/* Live Queue Status */}
          <div className="card shadow-sm queue-status-card mb-4">
            <div className="card-header">
              <div className="d-flex align-items-center">
                <i className="bi bi-broadcast me-2 header-icon"></i>
                <h5 className="card-title mb-0">Live Queue Status</h5>
              </div>
            </div>
            <div className="card-body">
              {Object.keys(queuePositions).length > 0 ? (
                Object.entries(queuePositions).map(([appointmentId, queueInfo]) => {
                  const appointment = upcomingAppointments.find(apt => apt.id === appointmentId);
                  return (
                    <div key={appointmentId} className="mb-3 p-3 bg-light rounded">
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <h6 className="mb-0">{appointment?.barber?.full_name}</h6>
                        <span className="badge bg-primary">#{queueInfo.position}</span>
                      </div>
                      <div className="small text-muted">
                        <div>Queue: {queueInfo.position} of {queueInfo.totalInQueue}</div>
                        <div>Wait time: {queueInfo.estimatedWait}</div>
                        {queueInfo.customersAhead.length > 0 && (
                          <div className="mt-1">
                            <strong>Ahead of you:</strong>
                            <div>{queueInfo.customersAhead.slice(0, 2).join(', ')}{queueInfo.customersAhead.length > 2 ? ` and ${queueInfo.customersAhead.length - 2} more` : ''}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-3">
                  <i className="bi bi-info-circle fs-1 text-muted mb-2"></i>
                  <p className="text-muted">No active queue positions</p>
                </div>
              )}
            </div>
          </div>

          {/* Tips Card */}
          <div className="card shadow-sm tips-card">
            <div className="card-header">
              <div className="d-flex align-items-center">
                <i className="bi bi-lightbulb me-2 header-icon"></i>
                <h5 className="card-title mb-0">Tips & Info</h5>
              </div>
            </div>
            <div className="card-body">
              <ul className="tips-list">
                <li className="tip-item">
                  <div className="tip-icon primary-tip">
                    <i className="bi bi-lightning"></i>
                  </div>
                  <div className="tip-content">
                    Use urgent booking to skip the queue for emergencies (+₱100)
                  </div>
                </li>
                <li className="tip-item">
                  <div className="tip-icon success-tip">
                    <i className="bi bi-clock"></i>
                  </div>
                  <div className="tip-content">
                    Arrive 5 minutes before your estimated time
                  </div>
                </li>
                <li className="tip-item">
                  <div className="tip-icon info-tip">
                    <i className="bi bi-phone"></i>
                  </div>
                  <div className="tip-content">
                    Enable notifications for queue position updates
                  </div>
                </li>
                <li className="tip-item">
                  <div className="tip-icon warning-tip">
                    <i className="bi bi-plus-circle"></i>
                  </div>
                  <div className="tip-content">
                    Try our add-on services for the complete experience
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerDashboard;
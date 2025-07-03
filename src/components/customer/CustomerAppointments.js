// components/customer/CustomerAppointments.js (Complete Enhanced Version)
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import LoadingSpinner from '../common/LoadingSpinner';

const CustomerAppointments = () => {
  const [appointments, setAppointments] = useState([]);
  const [filteredAppointments, setFilteredAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [user, setUser] = useState(null);
  const [queuePositions, setQueuePositions] = useState({});

  const navigate = useNavigate();

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
    getUser();
  }, []);

  useEffect(() => {
    if (user) {
      fetchAppointments();
      
      // Set up real-time subscription with enhanced channel name
      const channelName = `customer-appointments-${user.id}-${Date.now()}`;
      console.log(`📡 Setting up customer appointments subscription: ${channelName}`);
      
      const subscription = supabase
        .channel(channelName)
        .on('postgres_changes', 
          { 
            event: '*', 
            schema: 'public', 
            table: 'appointments',
            filter: `customer_id=eq.${user.id}`
          }, 
          (payload) => {
            console.log(`📥 Customer received appointment update:`, payload);
            
            // Debounce rapid updates
            clearTimeout(window.customerUpdateTimeout);
            window.customerUpdateTimeout = setTimeout(() => {
              console.log('🔄 Customer refreshing appointments...');
              fetchAppointments();
            }, 800);
          }
        )
        .subscribe((status, err) => {
          console.log(`📡 Customer subscription status: ${status}`, err);
          if (status === 'SUBSCRIBED') {
            console.log('✅ Customer real-time subscription active');
          } else if (status === 'CHANNEL_ERROR') {
            console.error('❌ Customer subscription error:', err);
          }
        });
      
      return () => {
        console.log('🧹 Cleaning up customer subscription');
        subscription.unsubscribe();
        clearTimeout(window.customerUpdateTimeout);
      };
    }
  }, [user]);

  useEffect(() => {
    applyFilters();
  }, [appointments, filter, searchQuery]);

  useEffect(() => {
    if (user && appointments.length > 0) {
      fetchQueuePositions();
    }
  }, [user, appointments]);

  const getUser = async () => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      setUser(user);
    } catch (error) {
      console.error('Error getting user:', error);
      setError('Failed to authenticate user');
    }
  };

  const fetchAppointments = async () => {
    try {
      setLoading(true);
      
      console.log('Fetching customer appointments for:', user.id);
      
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          *,
          barber:barber_id(id, full_name, email, phone),
          service:service_id(id, name, price, duration, description)
        `)
        .eq('customer_id', user.id)
        .order('appointment_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      console.log('Customer appointments fetched:', data?.length || 0);
      setAppointments(data || []);
      setFilteredAppointments(data || []);
    } catch (err) {
      console.error('Error fetching appointments:', err);
      setError('Failed to load appointments. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const fetchQueuePositions = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const todayAppointments = appointments.filter(apt => 
        apt.appointment_date === today && 
        (apt.status === 'scheduled' || apt.status === 'pending')
      );

      const positions = {};
      
      for (const appointment of todayAppointments) {
        if (appointment.status === 'scheduled') {
          // Get queue position
          const { data: queueData, error } = await supabase
            .from('appointments')
            .select('id, queue_number')
            .eq('barber_id', appointment.barber_id)
            .eq('appointment_date', today)
            .eq('status', 'scheduled')
            .order('queue_number', { ascending: true });

          if (!error && queueData) {
            const position = queueData.findIndex(apt => apt.id === appointment.id) + 1;
            const estimatedWait = position * 35; // 35 minutes average per customer
            
            positions[appointment.id] = {
              position,
              estimatedWait: estimatedWait < 60 ? `${estimatedWait} min` : 
                            `${Math.floor(estimatedWait / 60)}h ${estimatedWait % 60}m`
            };
          }
        }
      }
      
      setQueuePositions(positions);
    } catch (err) {
      console.error('Error fetching queue positions:', err);
    }
  };

  const applyFilters = () => {
    if (!appointments.length) return;

    const today = new Date().toISOString().split('T')[0];
    
    let filtered = [...appointments];
    
    // Apply status filter
    switch (filter) {
      case 'upcoming':
        filtered = filtered.filter(apt => 
          (apt.appointment_date >= today && ['scheduled', 'pending'].includes(apt.status)) ||
          apt.status === 'ongoing'
        );
        break;
      case 'past':
        filtered = filtered.filter(apt => 
          apt.appointment_date < today || apt.status === 'done'
        );
        break;
      case 'pending':
        filtered = filtered.filter(apt => apt.status === 'pending');
        break;
      case 'cancelled':
        filtered = filtered.filter(apt => apt.status === 'cancelled');
        break;
      default:
        // 'all' - no filtering needed
        break;
    }
    
    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(apt => 
        apt.barber?.full_name.toLowerCase().includes(query) ||
        apt.service?.name.toLowerCase().includes(query) ||
        (apt.notes && apt.notes.toLowerCase().includes(query)) ||
        getServicesDisplay(apt).toLowerCase().includes(query) ||
        getAddOnsDisplay(apt).toLowerCase().includes(query)
      );
    }
    
    setFilteredAppointments(filtered);
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
        if (serviceIds.length > 1) {
          services.push(`+${serviceIds.length - 1} more services`);
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

  const handleCancelAppointment = async (appointmentId) => {
    if (!window.confirm('Are you sure you want to cancel this appointment?')) {
      return;
    }

    try {
      console.log('🔄 Customer cancelling appointment:', appointmentId);

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
      const appointment = appointments.find(apt => apt.id === appointmentId);
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

      // Add log entry
      await supabase.from('system_logs').insert({
        user_id: user.id,
        action: 'appointment_cancelled_by_customer',
        details: {
          appointment_id: appointmentId
        }
      });

      console.log('✅ Customer appointment cancelled successfully');

      // Refresh appointments
      setTimeout(() => fetchAppointments(), 1000);
    } catch (err) {
      console.error('❌ Error cancelling appointment:', err);
      setError('Failed to cancel appointment. Please try again.');
    }
  };

  const handleReschedule = (appointment) => {
    // Navigate to booking page with rebook parameter
    navigate(`/book?rebook=${appointment.id}`);
  };

  const handleCloneAppointment = async (appointment) => {
    // Navigate to booking page with pre-filled data
    const searchParams = new URLSearchParams({
      barber: appointment.barber_id,
      service: appointment.service_id,
      services: appointment.services_data || JSON.stringify([appointment.service_id]),
      addons: appointment.add_ons_data || '[]',
      notes: appointment.notes || ''
    });
    
    navigate(`/book?${searchParams.toString()}`);
  };

  const formatAppointmentDate = (dateString) => {
    if (!dateString) return 'N/A';
    
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'done':
        return 'bg-success';
      case 'ongoing':
        return 'bg-primary';
      case 'cancelled':
        return 'bg-danger';
      case 'pending':
        return 'bg-warning text-dark';
      case 'scheduled':
        return 'bg-info';
      default:
        return 'bg-secondary';
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

  const getPendingStatusText = (appointment) => {
    if (appointment.status === 'pending') {
      return 'Waiting for barber confirmation';
    }
    return '';
  };

  const getEstimatedWaitTime = (appointment) => {
    if (appointment.status === 'scheduled' && queuePositions[appointment.id]) {
      return queuePositions[appointment.id].estimatedWait;
    }
    return null;
  };

  const getQueuePosition = (appointment) => {
    if (appointment.status === 'scheduled' && queuePositions[appointment.id]) {
      return queuePositions[appointment.id].position;
    }
    return null;
  };

  if (loading && !appointments.length) {
    return <LoadingSpinner />;
  }

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2>My Appointments</h2>
          <p className="text-muted mb-0">Track your queue position and appointment status</p>
        </div>
        <Link to="/book" className="btn btn-primary">
          <i className="bi bi-calendar-plus me-2"></i>
          Book New Appointment
        </Link>
      </div>

      {error && (
        <div className="alert alert-danger alert-dismissible fade show" role="alert">
          <div className="d-flex align-items-center">
            <i className="bi bi-exclamation-triangle-fill me-2 fs-4"></i>
            <div>{error}</div>
          </div>
          <button type="button" className="btn-close" onClick={() => setError(null)}></button>
        </div>
      )}

      {/* Filters */}
      <div className="card mb-4">
        <div className="card-body">
          <div className="row align-items-center">
            <div className="col-md-6 mb-3 mb-md-0">
              <div className="btn-group" role="group">
                <button 
                  type="button" 
                  className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => setFilter('all')}
                >
                  All
                </button>
                <button 
                  type="button" 
                  className={`btn ${filter === 'upcoming' ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => setFilter('upcoming')}
                >
                  Upcoming
                </button>
                <button 
                  type="button" 
                  className={`btn ${filter === 'pending' ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => setFilter('pending')}
                >
                  Pending
                </button>
                <button 
                  type="button" 
                  className={`btn ${filter === 'past' ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => setFilter('past')}
                >
                  Past
                </button>
                <button 
                  type="button" 
                  className={`btn ${filter === 'cancelled' ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => setFilter('cancelled')}
                >
                  Cancelled
                </button>
              </div>
            </div>
            <div className="col-md-6">
              <div className="input-group">
                <input
                  type="text"
                  className="form-control"
                  placeholder="Search appointments..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <button 
                  className="btn btn-outline-secondary" 
                  type="button"
                  onClick={() => setSearchQuery('')}
                >
                  <i className="bi bi-x"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {filteredAppointments.length === 0 ? (
        <div className="text-center py-5">
          <div className="display-4 text-muted mb-3">
            <i className="bi bi-calendar-x"></i>
          </div>
          <h4 className="text-muted">
            {filter !== 'all' ? 
              `No ${filter} appointments found` : 
              "You don't have any appointments yet"}
          </h4>
          <p className="text-muted mb-4">
            {filter !== 'all' ? 
              `Try adjusting your filter or search terms.` : 
              "Book your first appointment to get started."}
          </p>
          <Link to="/book" className="btn btn-primary btn-lg">
            <i className="bi bi-calendar-plus me-2"></i>
            Book Your First Appointment
          </Link>
        </div>
      ) : (
        <div className="row">
          {filteredAppointments.map((appointment) => (
            <div key={appointment.id} className="col-md-6 col-lg-4 mb-4">
              <div className={`card h-100 ${appointment.status === 'ongoing' ? 'border-primary border-2' : ''} ${appointment.is_urgent ? 'border-warning border-2' : ''}`}>
                <div className="card-header d-flex justify-content-between align-items-center">
                  <div className="d-flex align-items-center">
                    <i className={`bi ${getStatusIcon(appointment.status)} me-2`}></i>
                    <span className={`badge ${getStatusBadgeClass(appointment.status)} me-2`}>
                      {appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
                    </span>
                    {appointment.is_urgent && (
                      <span className="badge bg-warning text-dark">
                        <i className="bi bi-lightning-fill me-1"></i>URGENT
                      </span>
                    )}
                  </div>
                  <small className="text-muted">
                    {formatAppointmentDate(appointment.appointment_date)}
                  </small>
                </div>
                
                <div className="card-body">
                  <div className="d-flex mb-3">
                    <div className="flex-shrink-0">
                      <div className="bg-light rounded-circle p-3 text-center" style={{ width: '60px', height: '60px' }}>
                        <i className="bi bi-scissors fs-4"></i>
                      </div>
                    </div>
                    <div className="ms-3 flex-grow-1">
                      <h5 className="card-title mb-1">{getServicesDisplay(appointment)}</h5>
                      <p className="card-text text-muted mb-1">
                        <i className="bi bi-person me-1"></i> {appointment.barber?.full_name}
                      </p>
                      <p className="card-text text-muted mb-1">
                        <i className="bi bi-clock me-1"></i> 
                        {appointment.total_duration || appointment.service?.duration} min
                      </p>
                      <p className="card-text text-success mb-0 fw-bold">
                        <i className="bi bi-currency-dollar me-1"></i> ₱{getTotalPrice(appointment)}
                      </p>
                    </div>
                  </div>
                  
                  {getAddOnsDisplay(appointment) && (
                    <div className="mb-2">
                      <small className="text-muted">Add-ons:</small>
                      <div className="small text-info">{getAddOnsDisplay(appointment)}</div>
                    </div>
                  )}

                  {appointment.status === 'pending' && (
                    <div className="alert alert-warning py-2 mb-2">
                      <small>
                        <i className="bi bi-clock me-1"></i>
                        {getPendingStatusText(appointment)}
                      </small>
                    </div>
                  )}

                  {appointment.status === 'scheduled' && getQueuePosition(appointment) && (
                    <div className="alert alert-info py-2 mb-2">
                      <small>
                        <i className="bi bi-people me-1"></i>
                        Queue position: #{getQueuePosition(appointment)}
                        <br />
                        <i className="bi bi-clock me-1"></i>
                        Est. wait: {getEstimatedWaitTime(appointment)}
                      </small>
                    </div>
                  )}

                  {appointment.status === 'ongoing' && (
                    <div className="alert alert-primary py-2 mb-2">
                      <small>
                        <i className="bi bi-scissors me-1"></i>
                        Your appointment is in progress!
                      </small>
                    </div>
                  )}

                  {appointment.status === 'done' && (
                    <div className="alert alert-success py-2 mb-2">
                      <small>
                        <i className="bi bi-check-circle me-1"></i>
                        Service completed successfully
                      </small>
                    </div>
                  )}

                  {appointment.status === 'cancelled' && (
                    <div className="alert alert-danger py-2 mb-2">
                      <small>
                        <i className="bi bi-x-circle me-1"></i>
                        Appointment was cancelled
                        {appointment.cancellation_reason && (
                          <><br />Reason: {appointment.cancellation_reason}</>
                        )}
                      </small>
                    </div>
                  )}
                  
                  {appointment.notes && (
                    <div className="mb-2">
                      <small className="text-muted">Notes:</small>
                      <p className="small mb-0 bg-light p-2 rounded">{appointment.notes}</p>
                    </div>
                  )}
                </div>

                <div className="card-footer bg-transparent">
                  <div className="d-flex justify-content-between align-items-center">
                    {/* Action buttons based on status */}
                    <div className="d-flex gap-2">
                      {appointment.status === 'scheduled' && (
                        <>
                          <button
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => handleReschedule(appointment)}
                            title="Reschedule"
                          >
                            <i className="bi bi-arrow-repeat"></i>
                          </button>
                          <button
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => handleCancelAppointment(appointment.id)}
                            title="Cancel"
                          >
                            <i className="bi bi-x-circle"></i>
                          </button>
                        </>
                      )}

                      {appointment.status === 'pending' && (
                        <button
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => handleCancelAppointment(appointment.id)}
                          title="Cancel Request"
                        >
                          <i className="bi bi-x-circle me-1"></i>
                          Cancel Request
                        </button>
                      )}

                      {appointment.status === 'done' && (
                        <>
                          <button
                            className="btn btn-sm btn-outline-success"
                            onClick={() => handleCloneAppointment(appointment)}
                            title="Book Same Service Again"
                          >
                            <i className="bi bi-arrow-clockwise me-1"></i>
                            Book Again
                          </button>
                          <button
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => {
                              // Navigate to rating/review (you can implement this)
                              alert('Rating feature coming soon!');
                            }}
                            title="Rate & Review"
                          >
                            <i className="bi bi-star"></i>
                          </button>
                        </>
                      )}

                      {appointment.status === 'cancelled' && (
                        <button
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => handleCloneAppointment(appointment)}
                          title="Book Same Service Again"
                        >
                          <i className="bi bi-arrow-clockwise me-1"></i>
                          Book Again
                        </button>
                      )}

                      {appointment.status === 'ongoing' && (
                        <small className="text-primary">
                          <i className="bi bi-info-circle me-1"></i>
                          Service in progress...
                        </small>
                      )}
                    </div>

                    <small className="text-muted">
                      {new Date(appointment.created_at).toLocaleDateString()}
                    </small>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Auto-refresh indicator */}
      <div className="position-fixed bottom-0 start-0 p-3" style={{ zIndex: 1040 }}>
        <small className="badge bg-secondary">
          <i className="bi bi-arrow-clockwise me-1"></i>
          Auto-updating
        </small>
      </div>
    </div>
  );
};

export default CustomerAppointments;
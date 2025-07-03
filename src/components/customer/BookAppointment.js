// components/customer/BookAppointment.js (Complete Enhanced Version)
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import logoImage from '../../assets/images/raf-rok-logo.png';

const BookAppointment = () => {
  const [barbers, setBarbers] = useState([]);
  const [services, setServices] = useState([]);
  const [addOns, setAddOns] = useState([]);
  const [selectedBarber, setSelectedBarber] = useState('');
  const [selectedServices, setSelectedServices] = useState([]);
  const [selectedAddOns, setSelectedAddOns] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);
  const [isRebooking, setIsRebooking] = useState(false);
  const [rebookingAppointment, setRebookingAppointment] = useState(null);
  const [barberQueues, setBarberQueues] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [animateForm, setAnimateForm] = useState(false);
  const [queueCapacity] = useState(15);
  const [user, setUser] = useState(null);
  
  const navigate = useNavigate();

  // Add-ons data
  const ADD_ONS_DATA = [
    { id: 'addon1', name: 'Beard Trim', price: 50.00, duration: 15, description: 'Professional beard trimming and styling' },
    { id: 'addon2', name: 'Hot Towel Treatment', price: 30.00, duration: 10, description: 'Relaxing hot towel facial treatment' },
    { id: 'addon3', name: 'Scalp Massage', price: 80.00, duration: 20, description: 'Therapeutic scalp massage' },
    { id: 'addon4', name: 'Hair Wash', price: 40.00, duration: 15, description: 'Professional hair washing and conditioning' },
    { id: 'addon5', name: 'Styling', price: 60.00, duration: 20, description: 'Hair styling with premium products' },
    { id: 'addon6', name: 'Hair Wax Application', price: 25.00, duration: 5, description: 'Professional hair wax styling' },
    { id: 'addon7', name: 'Eyebrow Trim', price: 35.00, duration: 10, description: 'Eyebrow trimming and shaping' },
    { id: 'addon8', name: 'Mustache Trim', price: 20.00, duration: 5, description: 'Precision mustache trimming' }
  ];

  useEffect(() => {
    getCurrentUser();
  }, []);

  useEffect(() => {
    if (user) {
      fetchBarbersAndServices();
      fetchBarberQueues();
      
      // Check if this is a rebooking from URL params
      const urlParams = new URLSearchParams(window.location.search);
      const rebookId = urlParams.get('rebook');
      if (rebookId) {
        handleRebookingFromUrl(rebookId);
      }
      
      setTimeout(() => {
        setAnimateForm(true);
      }, 300);

      // Set up real-time queue updates
      const interval = setInterval(fetchBarberQueues, 10000); // Update every 10 seconds
      
      // Set up real-time subscription for queue updates
      const channelName = `booking-queue-updates-${user.id}-${Date.now()}`;
      console.log(`📡 Setting up booking queue subscription: ${channelName}`);
      
      const subscription = supabase
        .channel(channelName)
        .on('postgres_changes', 
          { 
            event: '*', 
            schema: 'public', 
            table: 'appointments'
          }, 
          (payload) => {
            console.log(`📥 Booking received queue update:`, payload);
            
            // Debounce rapid updates
            clearTimeout(window.bookingQueueTimeout);
            window.bookingQueueTimeout = setTimeout(() => {
              console.log('🔄 Booking refreshing queue data...');
              fetchBarberQueues();
            }, 1000);
          }
        )
        .subscribe((status, err) => {
          console.log(`📡 Booking queue subscription status: ${status}`, err);
        });

      return () => {
        clearInterval(interval);
        subscription.unsubscribe();
        clearTimeout(window.bookingQueueTimeout);
      };
    }
  }, [user]);

  useEffect(() => {
    if (selectedBarber && selectedDate) {
      updateBarberQueueInfo();
    }
  }, [selectedBarber, selectedDate]);

  const getCurrentUser = async () => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      setUser(user);
    } catch (error) {
      console.error('Error getting current user:', error);
      setError('Failed to authenticate user');
    }
  };

  const fetchBarbersAndServices = async () => {
    try {
      console.log('Fetching barbers and services...');
      
      // Fetch barbers
      const { data: barbersData, error: barbersError } = await supabase
        .from('users')
        .select('id, full_name, email, phone, barber_status')
        .eq('role', 'barber')
        .order('full_name');

      if (barbersError) throw barbersError;
      console.log('Barbers fetched:', barbersData?.length || 0);
      setBarbers(Array.isArray(barbersData) ? barbersData : []);

      // Fetch services
      const { data: servicesData, error: servicesError } = await supabase
        .from('services')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (servicesError) throw servicesError;
      console.log('Services fetched:', servicesData?.length || 0);
      setServices(Array.isArray(servicesData) ? servicesData : []);
      setAddOns(ADD_ONS_DATA);
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to load barbers and services');
    }
  };

  const fetchBarberQueues = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      console.log('Fetching barber queues for:', today);
      
      // Fetch current queue status for all barbers
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select(`
          *,
          customer:customer_id(full_name),
          service:service_id(name, duration),
          barber:barber_id(full_name)
        `)
        .eq('appointment_date', today)
        .in('status', ['scheduled', 'ongoing', 'pending']);

      if (error) throw error;

      // Ensure appointments is an array
      const safeAppointments = Array.isArray(appointments) ? appointments : [];
      console.log('Queue appointments fetched:', safeAppointments.length);

      // Group by barber
      const queues = {};
      barbers.forEach(barber => {
        const barberAppointments = safeAppointments.filter(apt => apt.barber_id === barber.id);
        const currentlyServing = barberAppointments.find(apt => apt.status === 'ongoing');
        const queuedAppointments = barberAppointments.filter(apt => apt.status === 'scheduled');
        const pendingRequests = barberAppointments.filter(apt => apt.status === 'pending');
        
        queues[barber.id] = {
          current: currentlyServing,
          queue: Array.isArray(queuedAppointments) ? queuedAppointments.sort((a, b) => (a.queue_number || 0) - (b.queue_number || 0)) : [],
          pending: Array.isArray(pendingRequests) ? pendingRequests : [],
          queueCount: Array.isArray(queuedAppointments) ? queuedAppointments.length : 0,
          isFullCapacity: Array.isArray(queuedAppointments) ? queuedAppointments.length >= queueCapacity : false,
          averageWaitTime: calculateAverageWaitTime(queuedAppointments),
          nextQueueNumber: getNextQueueNumber(queuedAppointments),
          barberStatus: barber.barber_status || 'available'
        };
      });

      setBarberQueues(queues);
      console.log('Barber queues updated:', Object.keys(queues).length);
    } catch (error) {
      console.error('Error fetching barber queues:', error);
    }
  };

  const updateBarberQueueInfo = async () => {
    if (!selectedBarber || !selectedDate) return;

    try {
      console.log('Updating queue info for barber:', selectedBarber, 'date:', selectedDate);
      
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('barber_id', selectedBarber)
        .eq('appointment_date', selectedDate)
        .in('status', ['scheduled', 'ongoing', 'pending']);

      if (error) throw error;

      // Ensure appointments is an array
      const safeAppointments = Array.isArray(appointments) ? appointments : [];
      const queuedAppointments = safeAppointments.filter(apt => apt.status === 'scheduled');
      const isFullCapacity = queuedAppointments.length >= queueCapacity;

      setBarberQueues(prev => ({
        ...prev,
        [selectedBarber]: {
          ...prev[selectedBarber],
          queueCount: queuedAppointments.length,
          isFullCapacity,
          averageWaitTime: calculateAverageWaitTime(queuedAppointments),
          nextQueueNumber: getNextQueueNumber(queuedAppointments)
        }
      }));
    } catch (error) {
      console.error('Error updating barber queue info:', error);
    }
  };

  const calculateAverageWaitTime = (appointments) => {
    // Add proper null checks
    if (!appointments || !Array.isArray(appointments) || appointments.length === 0) return 35; // Default 35 min
    
    const totalDuration = appointments.reduce((total, apt) => {
      return total + (apt?.total_duration || apt?.service?.duration || 30);
    }, 0);
    
    return Math.ceil(totalDuration / appointments.length);
  };

  const getNextQueueNumber = (queuedAppointments) => {
    // Add better null checks
    if (!queuedAppointments || !Array.isArray(queuedAppointments) || queuedAppointments.length === 0) {
      return 1;
    }
    
    const maxQueueNumber = Math.max(
      0,
      ...queuedAppointments.map(apt => apt?.queue_number || 0)
    );
    
    return maxQueueNumber + 1;
  };

  const calculateTotal = () => {
    const servicesTotal = selectedServices.reduce((total, serviceId) => {
      const service = services.find(s => s.id === serviceId);
      return total + (service?.price || 0);
    }, 0);
    
    const addOnsTotal = selectedAddOns.reduce((total, addonId) => {
      const addon = addOns.find(a => a.id === addonId);
      return total + (addon?.price || 0);
    }, 0);

    const urgentFee = isUrgent ? 100 : 0;
    
    return servicesTotal + addOnsTotal + urgentFee;
  };

  const calculateTotalDuration = () => {
    const servicesDuration = selectedServices.reduce((total, serviceId) => {
      const service = services.find(s => s.id === serviceId);
      return total + (service?.duration || 0);
    }, 0);
    
    const addOnsDuration = selectedAddOns.reduce((total, addonId) => {
      const addon = addOns.find(a => a.id === addonId);
      return total + (addon?.duration || 0);
    }, 0);
    
    return servicesDuration + addOnsDuration;
  };

  const getEstimatedWaitTime = (barberId) => {
    const barberQueue = barberQueues[barberId];
    if (!barberQueue) return '0 min';
    
    const queuePosition = isUrgent ? 1 : (barberQueue.queueCount || 0) + 1;
    const averageServiceTime = barberQueue.averageWaitTime || 35;
    const waitMinutes = (queuePosition - 1) * averageServiceTime;
    
    if (waitMinutes < 60) {
      return `${waitMinutes} min`;
    } else {
      const hours = Math.floor(waitMinutes / 60);
      const minutes = waitMinutes % 60;
      return `${hours}h ${minutes > 0 ? ` ${minutes}m` : ''}`;
    }
  };

  const getQueuePosition = (barberId) => {
    const barberQueue = barberQueues[barberId];
    if (!barberQueue) return 'TBD';
    
    return isUrgent ? '1 (Priority)' : `${(barberQueue.queueCount || 0) + 1} (Pending)`;
  };

  const getBarberStatusInfo = (barber) => {
    const queue = barberQueues[barber.id];
    const status = queue?.barberStatus || barber.barber_status || 'available';
    
    switch (status) {
      case 'available':
        return { text: 'Available', class: 'text-success', icon: 'bi-check-circle' };
      case 'busy':
        return { text: 'Busy', class: 'text-warning', icon: 'bi-exclamation-circle' };
      case 'break':
        return { text: 'On Break', class: 'text-info', icon: 'bi-pause-circle' };
      case 'offline':
        return { text: 'Offline', class: 'text-secondary', icon: 'bi-x-circle' };
      default:
        return { text: 'Available', class: 'text-success', icon: 'bi-check-circle' };
    }
  };

  const handleRebookingFromUrl = async (appointmentId) => {
    try {
      console.log('Loading rebooking appointment:', appointmentId);
      
      const { data: appointment, error } = await supabase
        .from('appointments')
        .select(`
          *,
          service:service_id(id, name),
          barber:barber_id(id, full_name)
        `)
        .eq('id', appointmentId)
        .single();

      if (error) throw error;

      if (appointment) {
        console.log('Rebooking appointment loaded:', appointment);
        setIsRebooking(true);
        setRebookingAppointment(appointment);
        setSelectedBarber(appointment.barber_id);
        setSelectedServices([appointment.service_id]);
        setSelectedDate(appointment.appointment_date);
        setNotes(appointment.notes || '');
        setIsUrgent(appointment.is_urgent || false);
        
        // Parse add-ons if stored in appointment
        if (appointment.add_ons_data) {
          try {
            const addOnIds = JSON.parse(appointment.add_ons_data);
            if (Array.isArray(addOnIds)) {
              setSelectedAddOns(addOnIds);
            }
          } catch (e) {
            console.error('Error parsing add-ons data:', e);
            setSelectedAddOns([]);
          }
        }

        // Parse services if stored in appointment
        if (appointment.services_data) {
          try {
            const serviceIds = JSON.parse(appointment.services_data);
            if (Array.isArray(serviceIds)) {
              setSelectedServices(serviceIds);
            }
          } catch (e) {
            console.error('Error parsing services data:', e);
          }
        }
      }
    } catch (error) {
      console.error('Error loading rebooking appointment:', error);
      setError('Failed to load appointment for rescheduling');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (!user) {
        throw new Error('You must be logged in to book an appointment');
      }

      if (!selectedServices || selectedServices.length === 0) {
        throw new Error('Please select at least one service');
      }

      if (!selectedDate) {
        throw new Error('Please select a date');
      }

      if (!selectedBarber) {
        throw new Error('Please select a barber');
      }

      // Check if barber is available
      const barberQueue = barberQueues[selectedBarber];
      const barberStatus = barberQueue?.barberStatus || 'available';
      
      if (barberStatus === 'offline') {
        throw new Error('Selected barber is currently offline. Please choose another barber.');
      }

      // Check if barber is at full capacity and not urgent
      if (barberQueue && barberQueue.isFullCapacity && !isUrgent) {
        throw new Error('Barber queue is full. Please select another barber or mark as urgent.');
      }

      console.log('🔄 Submitting booking request...');

      // Create appointment data with pending status for barber confirmation
      const appointmentData = {
        customer_id: user.id,
        barber_id: selectedBarber,
        service_id: selectedServices[0], // Primary service
        appointment_date: selectedDate,
        appointment_time: '09:00', // Default time - queue system doesn't rely on specific times
        status: 'pending', // Start as pending for barber confirmation
        queue_number: null, // Will be assigned when barber confirms
        notes: notes.trim() || null,
        is_urgent: isUrgent,
        is_rebooking: isRebooking,
        rebooking_from: rebookingAppointment?.id || null,
        // Store additional data as JSON
        services_data: JSON.stringify(selectedServices),
        add_ons_data: JSON.stringify(selectedAddOns),
        total_price: calculateTotal(),
        total_duration: calculateTotalDuration(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('appointments')
        .insert([appointmentData])
        .select()
        .single();

      if (error) throw error;

      console.log('✅ Appointment created:', data.id);

      // Create notification for barber with proper type
      const notificationData = {
        user_id: selectedBarber,
        title: isUrgent ? 'URGENT Booking Request' : 'New Booking Request',
        message: `${user.user_metadata?.full_name || user.email} has requested ${isUrgent ? 'an urgent ' : ''}appointment. Please confirm or decline.`,
        type: isUrgent ? 'urgent_booking' : 'booking_request',
        data: {
          appointment_id: data.id,
          customer_name: user.user_metadata?.full_name || user.email,
          is_urgent: isUrgent,
          total_price: calculateTotal(),
          service_names: selectedServices.map(id => services.find(s => s.id === id)?.name).filter(Boolean).join(', ')
        },
        created_at: new Date().toISOString()
      };

      const { error: notificationError } = await supabase
        .from('notifications')
        .insert(notificationData);

      if (notificationError) {
        console.warn('Failed to create notification:', notificationError);
        // Don't fail the whole process for notification error
      }

      // Log the booking request
      await supabase.from('system_logs').insert({
        user_id: user.id,
        action: isRebooking ? 'appointment_reschedule_requested' : 'booking_requested',
        details: {
          appointment_id: data.id,
          barber_id: selectedBarber,
          services: selectedServices,
          add_ons: selectedAddOns,
          total_price: calculateTotal(),
          is_urgent: isUrgent
        },
        created_at: new Date().toISOString()
      });

      const barberName = barbers.find(b => b.id === selectedBarber)?.full_name || 'barber';
      
      setSuccess(
        isUrgent 
          ? '🚨 Urgent booking request sent! You will be prioritized when confirmed.' 
          : `✅ Booking request sent to ${barberName}! You'll receive a confirmation shortly.`
      );
      
      // Reset form
      setSelectedServices([]);
      setSelectedAddOns([]);
      setNotes('');
      setIsUrgent(false);
      setIsRebooking(false);
      setRebookingAppointment(null);
      
      // Redirect after delay
      setTimeout(() => {
        navigate('/appointments');
      }, 3000);

    } catch (error) {
      console.error('❌ Error submitting booking:', error);
      setError(error.message || 'Failed to submit booking request');
    } finally {
      setLoading(false);
    }
  };

  const handleServiceToggle = (serviceId) => {
    setSelectedServices(prev => 
      prev.includes(serviceId) 
        ? prev.filter(id => id !== serviceId)
        : [...prev, serviceId]
    );
  };

  const handleAddOnToggle = (addonId) => {
    setSelectedAddOns(prev => 
      prev.includes(addonId) 
        ? prev.filter(id => id !== addonId)
        : [...prev, addonId]
    );
  };

  // Get minimum date (today)
  const today = new Date().toISOString().split('T')[0];

  if (!user) {
    return (
      <div className="container py-4">
        <div className="text-center">
          <h3>Please log in to book an appointment</h3>
          <button className="btn btn-primary" onClick={() => navigate('/login')}>
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-4">
      {/* Header with logo */}
      <div className="row mb-4">
        <div className="col">
          <div className="booking-header p-4 rounded shadow-sm d-flex align-items-center">
            <div>
              <div className="d-flex align-items-center mb-2">
                <img 
                  src={logoImage} 
                  alt="Raf & Rok" 
                  className="booking-logo me-3" 
                  height="40"
                  style={{
                    backgroundColor: '#ffffff',
                    padding: '3px',
                    borderRadius: '5px'
                  }}
                />
                <h1 className="h3 mb-0 text-white">
                  {isRebooking ? 'Reschedule Appointment' : 'Book Appointment'}
                </h1>
              </div>
              <p className="text-light mb-0">
                <i className="bi bi-people me-2"></i>
                {isRebooking ? 'Update your queue position' : 'Join the queue and get your position'}
              </p>
            </div>
            <div className="ms-auto">
              <button 
                className="btn btn-light" 
                onClick={() => navigate('/dashboard')}
              >
                <i className="bi bi-arrow-left me-2"></i>
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="row justify-content-center">
        <div className="col-md-12 col-lg-10">
          <div className={`card booking-card shadow-sm ${animateForm ? 'form-animated' : ''}`}>
            {/* Alerts */}
            {error && (
              <div className="alert alert-danger alert-dismissible m-3 mb-0 fade show" role="alert">
                <div className="d-flex align-items-center">
                  <i className="bi bi-exclamation-triangle-fill me-2 fs-4"></i>
                  <div>{error}</div>
                </div>
                <button type="button" className="btn-close" onClick={() => setError('')}></button>
              </div>
            )}

            {success && (
              <div className="alert alert-success alert-dismissible m-3 mb-0 fade show" role="alert">
                <div className="d-flex align-items-center">
                  <i className="bi bi-check-circle-fill me-2 fs-4"></i>
                  <div>{success}</div>
                </div>
                <button type="button" className="btn-close" onClick={() => setSuccess('')}></button>
              </div>
            )}

            <div className="card-body p-4">
              <form onSubmit={handleSubmit}>
                <div className="row">
                  {/* Left Column - Selection */}
                  <div className="col-md-8">
                    {/* Barber Selection */}
                    <div className="mb-4">
                      <label htmlFor="barber" className="form-label fw-bold">
                        <i className="bi bi-scissors me-2 text-primary"></i>
                        Select Barber Queue
                      </label>
                      <select
                        className="form-select"
                        id="barber"
                        value={selectedBarber}
                        onChange={(e) => setSelectedBarber(e.target.value)}
                        required
                      >
                        <option value="">Choose a barber...</option>
                        {barbers.map((barber) => {
                          const statusInfo = getBarberStatusInfo(barber);
                          const queue = barberQueues[barber.id];
                          return (
                            <option 
                              key={barber.id} 
                              value={barber.id}
                              disabled={statusInfo.text === 'Offline'}
                            >
                              {barber.full_name} - {statusInfo.text}
                              {queue?.isFullCapacity && ' (Queue Full)'}
                            </option>
                          );
                        })}
                      </select>
                      
                      {/* Real-time Queue Status */}
                      {selectedBarber && barberQueues[selectedBarber] && (
                        <div className="mt-3 p-3 border rounded bg-light">
                          <div className="row text-center">
                            <div className="col-3">
                              <div className="text-primary fw-bold fs-4">
                                {barberQueues[selectedBarber].queueCount || 0}
                              </div>
                              <div className="text-muted small">In Queue</div>
                            </div>
                            <div className="col-3">
                              <div className="text-success fw-bold fs-4">
                                {isUrgent ? '1' : 'TBD'}
                              </div>
                              <div className="text-muted small">{isUrgent ? 'Priority' : 'Pending'}</div>
                            </div>
                            <div className="col-3">
                              <div className="text-info fw-bold fs-4">
                                {getEstimatedWaitTime(selectedBarber)}
                              </div>
                              <div className="text-muted small">Est. Wait</div>
                            </div>
                            <div className="col-3">
                              <div className={`fw-bold fs-4 ${barberQueues[selectedBarber].isFullCapacity ? 'text-danger' : 'text-success'}`}>
                                {barberQueues[selectedBarber].isFullCapacity ? 'FULL' : 'OPEN'}
                              </div>
                              <div className="text-muted small">Status</div>
                            </div>
                          </div>
                          
                          {/* Barber Status */}
                          {selectedBarber && (() => {
                            const barber = barbers.find(b => b.id === selectedBarber);
                            const statusInfo = getBarberStatusInfo(barber);
                            return (
                              <div className="mt-2 text-center">
                                <small className={statusInfo.class}>
                                  <i className={`bi ${statusInfo.icon} me-1`}></i>
                                  Barber is {statusInfo.text}
                                </small>
                              </div>
                            );
                          })()}
                          
                          {barberQueues[selectedBarber].current && (
                            <div className="mt-3 p-2 bg-success bg-opacity-10 rounded text-center">
                              <small className="text-success">
                                <i className="bi bi-scissors me-1"></i>
                                Now serving: Queue #{barberQueues[selectedBarber].current.queue_number || 'N/A'}
                              </small>
                            </div>
                          )}

                          <div className="mt-2 text-center">
                            <small className="text-muted">
                              <i className="bi bi-info-circle me-1"></i>
                              Queue updates automatically every 10 seconds
                            </small>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Services Selection */}
                    <div className="mb-4">
                      <label className="form-label fw-bold">
                        <i className="bi bi-list-check me-2 text-primary"></i>
                        Select Services (Multiple allowed)
                      </label>
                      <div className="row">
                        {services.map((service) => (
                          <div key={service.id} className="col-md-6 mb-3">
                            <div className={`card h-100 service-card ${selectedServices.includes(service.id) ? 'border-primary bg-primary bg-opacity-10' : ''}`}>
                              <div className="card-body p-3">
                                <div className="form-check">
                                  <input
                                    className="form-check-input"
                                    type="checkbox"
                                    id={`service-${service.id}`}
                                    checked={selectedServices.includes(service.id)}
                                    onChange={() => handleServiceToggle(service.id)}
                                  />
                                  <label className="form-check-label w-100" htmlFor={`service-${service.id}`}>
                                    <div className="d-flex justify-content-between align-items-center mb-2">
                                      <h6 className="mb-0">{service.name}</h6>
                                      <span className="badge bg-success">₱{service.price}</span>
                                    </div>
                                    <p className="text-muted small mb-2">{service.description}</p>
                                    <div className="d-flex justify-content-between">
                                      <small className="text-muted">
                                        <i className="bi bi-clock me-1"></i>
                                        {service.duration} min
                                      </small>
                                    </div>
                                  </label>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Add-ons Selection */}
                    {selectedServices.length > 0 && (
                      <div className="mb-4">
                        <label className="form-label fw-bold">
                          <i className="bi bi-plus-circle me-2 text-primary"></i>
                          Add-ons (Optional)
                        </label>
                        <div className="row">
                          {addOns.map((addon) => (
                            <div key={addon.id} className="col-md-4 mb-2">
                              <div className={`card addon-card ${selectedAddOns.includes(addon.id) ? 'border-secondary bg-light' : ''}`}>
                                <div className="card-body p-2">
                                  <div className="form-check">
                                    <input
                                      className="form-check-input"
                                      type="checkbox"
                                      id={`addon-${addon.id}`}
                                      checked={selectedAddOns.includes(addon.id)}
                                      onChange={() => handleAddOnToggle(addon.id)}
                                    />
                                    <label className="form-check-label w-100" htmlFor={`addon-${addon.id}`}>
                                      <div className="d-flex justify-content-between align-items-center">
                                        <div>
                                          <div className="fw-medium">{addon.name}</div>
                                          <small className="text-muted">{addon.duration} min</small>
                                        </div>
                                        <span className="text-success fw-bold">₱{addon.price}</span>
                                      </div>
                                    </label>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Date Selection */}
                    <div className="mb-4">
                      <label htmlFor="date" className="form-label fw-bold">
                        <i className="bi bi-calendar3 me-2 text-primary"></i>
                        Select Date
                      </label>
                      <input
                        type="date"
                        className="form-control"
                        id="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        min={today}
                        required
                      />
                      <div className="form-text">
                        <i className="bi bi-info-circle me-1"></i>
                        Queue position is based on arrival order, not specific times
                      </div>
                    </div>

                    {/* Notes */}
                    <div className="mb-4">
                      <label htmlFor="notes" className="form-label fw-bold">
                        <i className="bi bi-chat-right-text me-2 text-primary"></i>
                        Special Requests (Optional)
                      </label>
                      <textarea
                        className="form-control"
                        id="notes"
                        rows="3"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Any specific requests, preferred hairstyle, or special instructions..."
                      ></textarea>
                    </div>

                    {/* Urgent Booking */}
                    <div className="mb-4">
                      <div className="form-check p-3 border rounded bg-warning bg-opacity-10">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id="urgent"
                          checked={isUrgent}
                          onChange={(e) => setIsUrgent(e.target.checked)}
                        />
                        <label className="form-check-label fw-medium" htmlFor="urgent">
                          <i className="bi bi-lightning-fill me-2 text-warning"></i>
                          Priority Queue (Skip to Front)
                          <div className="small text-muted mt-1">
                            Jump to position #1 in the queue for emergency appointments. Additional ₱100 fee applies.
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Right Column - Queue Summary */}
                  <div className="col-md-4">
                    {/* Queue Summary */}
                    <div className="card bg-light border-0 sticky-top">
                      <div className="card-body">
                        <h5 className="card-title d-flex align-items-center">
                          <i className="bi bi-receipt me-2 text-primary"></i>
                          Queue Summary
                        </h5>
                        <hr />
                        
                        {selectedBarber && (
                          <div className="mb-3">
                            <strong>Barber Queue:</strong>
                            <div className="text-muted">
                              {barbers.find(b => b.id === selectedBarber)?.full_name}
                            </div>
                          </div>
                        )}

                        {selectedBarber && barberQueues[selectedBarber] && (
                          <div className="mb-3">
                            <strong>Queue Position:</strong>
                            <div className="text-warning fs-5 fw-bold">
                              {isUrgent ? 'Priority #1 (Pending)' : 'Pending Confirmation'}
                            </div>
                            <small className="text-muted">
                              Position will be assigned when barber confirms
                            </small>
                          </div>
                        )}

                        {selectedServices.length > 0 && (
                          <div className="mb-3">
                            <strong>Services:</strong>
                            {selectedServices.map(serviceId => {
                              const service = services.find(s => s.id === serviceId);
                              return (
                                <div key={serviceId} className="d-flex justify-content-between mt-1">
                                  <span>{service?.name}</span>
                                  <span className="text-success">₱{service?.price}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {selectedAddOns.length > 0 && (
                          <div className="mb-3">
                            <strong>Add-ons:</strong>
                            {selectedAddOns.map(addonId => {
                              const addon = addOns.find(a => a.id === addonId);
                              return (
                                <div key={addonId} className="d-flex justify-content-between mt-1">
                                  <span>{addon?.name}</span>
                                  <span className="text-success">₱{addon?.price}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {isUrgent && (
                          <div className="mb-3">
                            <div className="d-flex justify-content-between">
                              <span className="text-warning">
                                <i className="bi bi-lightning-fill me-1"></i>
                                Priority Fee
                              </span>
                              <span className="text-warning">₱100</span>
                            </div>
                          </div>
                        )}

                        {selectedDate && (
                          <div className="mb-3">
                            <strong>Date:</strong>
                            <div className="text-muted">
                              {new Date(selectedDate).toLocaleDateString('en-US', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                              })}
                            </div>
                          </div>
                        )}

                        {(selectedServices.length > 0 || selectedAddOns.length > 0) && (
                          <>
                            <hr />
                            <div className="d-flex justify-content-between mb-2">
                              <strong>Total Duration:</strong>
                              <strong>{calculateTotalDuration()} minutes</strong>
                            </div>
                            <div className="d-flex justify-content-between fs-5">
                              <strong>Total Price:</strong>
                              <strong className="text-success">₱{calculateTotal()}</strong>
                            </div>
                          </>
                        )}

                        {selectedBarber && !isUrgent && barberQueues[selectedBarber] && (
                          <div className="mt-3 p-2 bg-info bg-opacity-10 rounded">
                            <small>
                              <i className="bi bi-info-circle me-1"></i>
                              People in queue: {barberQueues[selectedBarber].queueCount || 0}
                              <br />
                              <strong>Pending barber confirmation</strong>
                            </small>
                          </div>
                        )}

                        {isUrgent && (
                          <div className="mt-3 p-2 bg-warning bg-opacity-10 rounded">
                            <small className="text-warning">
                              <i className="bi bi-lightning-fill me-1"></i>
                              Priority request - will be first when confirmed!
                            </small>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <hr className="my-4" />

                <div className="d-flex justify-content-between">
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-lg"
                    onClick={() => navigate('/dashboard')}
                  >
                    <i className="bi bi-x-lg me-2"></i>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary btn-lg"
                    disabled={loading || !selectedBarber || selectedServices.length === 0 || !selectedDate}
                  >
                    {loading ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                        {isRebooking ? 'Updating Queue...' : 'Joining Queue...'}
                      </>
                    ) : (
                      <>
                        <i className="bi bi-send me-2"></i>
                        {isRebooking ? 'Send Reschedule Request' : 'Send Booking Request'}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookAppointment;
// components/manager/ManageAppointments.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { apiService } from '../../services/ApiService';
import { formatDate, formatTime, getStatusColor } from '../utils/helpers';
import { APPOINTMENT_STATUS } from '../utils/constants';
import LoadingSpinner from '../common/LoadingSpinner';
import SearchAndFilter from '../common/SearchAndFilter';

const ManageAppointments = () => {
  const [appointments, setAppointments] = useState([]);
  const [barbers, setBarbers] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [availableSlots, setAvailableSlots] = useState([]);
  
  const [filters, setFilters] = useState({
    status: '',
    barber_id: '',
    date_range: 'today',
    search: ''
  });
  
  const [formData, setFormData] = useState({
    customer_id: '',
    barber_id: '',
    service_id: '',
    appointment_date: '',
    appointment_time: '',
    notes: '',
    status: ''
  });
  
  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    fetchInitialData();
    
    // Set up subscription for appointment changes
    const subscription = supabase
      .channel('appointments-changes')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'appointments'
        }, 
        () => {
          fetchAppointments();
        }
      )
      .subscribe();
    
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    fetchAppointments();
  }, [filters]);

  useEffect(() => {
    if (formData.barber_id && formData.appointment_date) {
      fetchAvailableSlots();
    }
  }, [formData.barber_id, formData.appointment_date]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      
      // Fetch all in parallel
      const [barbersResult, servicesResult] = await Promise.all([
        fetchBarbers(),
        fetchServices()
      ]);
      
      setBarbers(barbersResult);
      setServices(servicesResult);
      
      // Then fetch appointments
      await fetchAppointments();
      
    } catch (error) {
      console.error('Error fetching initial data:', error);
      setError('Failed to load initial data. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  };

  const fetchBarbers = async () => {
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, email')
      .eq('role', 'barber')
      .order('full_name');
    
    if (error) throw error;
    return data || [];
  };

  const fetchServices = async () => {
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('is_active', true)
      .order('name');
    
    if (error) throw error;
    return data || [];
  };

  const fetchAppointments = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Build query based on filters
      let query = supabase
        .from('appointments')
        .select(`
          *,
          customer:customer_id(id, full_name, email, phone),
          barber:barber_id(id, full_name, email, phone),
          service:service_id(id, name, price, duration, description)
        `)
        .order('appointment_date', { ascending: false })
        .order('appointment_time', { ascending: false });
      
      // Apply status filter
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      
      // Apply barber filter
      if (filters.barber_id) {
        query = query.eq('barber_id', filters.barber_id);
      }
      
      // Apply date range filter
      if (filters.date_range) {
        const today = new Date().toISOString().split('T')[0];
        
        if (filters.date_range === 'today') {
          query = query.eq('appointment_date', today);
        } else if (filters.date_range === 'week') {
          const weekLater = new Date();
          weekLater.setDate(weekLater.getDate() + 7);
          const weekLaterStr = weekLater.toISOString().split('T')[0];
          
          query = query.gte('appointment_date', today).lte('appointment_date', weekLaterStr);
        } else if (filters.date_range === 'month') {
          const monthLater = new Date();
          monthLater.setMonth(monthLater.getMonth() + 1);
          const monthLaterStr = monthLater.toISOString().split('T')[0];
          
          query = query.gte('appointment_date', today).lte('appointment_date', monthLaterStr);
        } else if (filters.date_range === 'custom' && filters.start_date && filters.end_date) {
          query = query.gte('appointment_date', filters.start_date).lte('appointment_date', filters.end_date);
        }
      }
      
      // Apply search filter
      if (filters.search) {
        // This is a simplified approach. For better performance,
        // you might want to use text search or create specific indexes
        query = query.or(`customer.full_name.ilike.%${filters.search}%,barber.full_name.ilike.%${filters.search}%`);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      setAppointments(data || []);
      
    } catch (error) {
      console.error('Error fetching appointments:', error);
      setError('Failed to load appointments. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableSlots = async () => {
    try {
      // Get existing appointments for the selected barber and date
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select('appointment_time, service:service_id(duration)')
        .eq('barber_id', formData.barber_id)
        .eq('appointment_date', formData.appointment_date)
        .in('status', ['scheduled', 'ongoing']);

      if (error) throw error;

      // Generate time slots (9 AM to 6 PM, 30-minute intervals)
      const timeSlots = [];
      for (let hour = 9; hour < 18; hour++) {
        for (let minute of ['00', '30']) {
          const time = `${hour.toString().padStart(2, '0')}:${minute}`;
          timeSlots.push(time);
        }
      }

      // Filter out booked slots
      const bookedTimes = appointments?.map(apt => apt.appointment_time) || [];
      const available = timeSlots.filter(time => {
        // If editing an appointment, allow its original time
        if (selectedAppointment && selectedAppointment.appointment_time === time) {
          return true;
        }
        
        // Otherwise, exclude booked times
        return !bookedTimes.includes(time);
      });

      setAvailableSlots(available);
    } catch (error) {
      console.error('Error fetching available slots:', error);
      setFormErrors(prev => ({
        ...prev,
        appointment_time: 'Failed to load available time slots'
      }));
    }
  };

  const handleFilterChange = (newFilters) => {
    setFilters(prev => ({
      ...prev,
      ...newFilters
    }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear validation error for this field
    if (formErrors[name]) {
      setFormErrors(prev => ({
        ...prev,
        [name]: null
      }));
    }
  };

  const validateForm = () => {
    const errors = {};
    
    // Required fields
    if (!formData.barber_id) {
      errors.barber_id = 'Barber is required';
    }
    
    if (!formData.service_id) {
      errors.service_id = 'Service is required';
    }
    
    if (!formData.appointment_date) {
      errors.appointment_date = 'Date is required';
    }
    
    if (!formData.appointment_time) {
      errors.appointment_time = 'Time is required';
    }
    
    if (!formData.status) {
      errors.status = 'Status is required';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    try {
      setLoading(true);
      
      const updates = {
        barber_id: formData.barber_id,
        service_id: formData.service_id,
        appointment_date: formData.appointment_date,
        appointment_time: formData.appointment_time,
        notes: formData.notes,
        status: formData.status,
        updated_at: new Date().toISOString()
      };
      
      // Update appointment
      const { data, error } = await supabase
        .from('appointments')
        .update(updates)
        .eq('id', selectedAppointment.id)
        .select(`
          *,
          customer:customer_id(id, full_name, email, phone),
          barber:barber_id(id, full_name, email, phone),
          service:service_id(id, name, price, duration, description)
        `)
        .single();
      
      if (error) throw error;
      
      // Update local state
      setAppointments(prev => 
        prev.map(apt => apt.id === selectedAppointment.id ? data : apt)
      );
      
      // Create notification for customer
      await supabase.from('notifications').insert({
        user_id: selectedAppointment.customer_id,
        title: 'Appointment Updated',
        message: `Your appointment has been updated by the manager. Please check your appointments for details.`,
        type: 'appointment',
        data: {
          appointment_id: selectedAppointment.id,
          update_type: 'modified'
        }
      });
      
      // Close modal and reset form
      closeEditModal();
      
    } catch (error) {
      console.error('Error updating appointment:', error);
      setError('Failed to update appointment. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (appointmentId, status) => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('appointments')
        .update({ 
          status,
          updated_at: new Date().toISOString(),
          // Update queue position when status changes
          queue_number: status === 'done' || status === 'cancelled' ? null : 
                      status === 'ongoing' ? 0 : undefined  // 0 for ongoing (currently being served)
        })
        .eq('id', appointmentId)
        .select(`
          *,
          customer:customer_id(id, full_name, email, phone),
          barber:barber_id(id, full_name, email, phone),
          service:service_id(id, name, price, duration, description)
        `)
        .single();
      
      if (error) throw error;
      
      // Update local state
      setAppointments(prev => 
        prev.map(apt => apt.id === appointmentId ? data : apt)
      );
      
      // Create notification for customer
      await supabase.from('notifications').insert({
        user_id: data.customer_id,
        title: `Appointment ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        message: `Your appointment has been marked as ${status} by the manager.`,
        type: 'appointment',
        data: {
          appointment_id: appointmentId,
          status
        }
      });
      
    } catch (error) {
      console.error('Error updating appointment status:', error);
      setError('Failed to update appointment status. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = (appointment) => {
    setSelectedAppointment(appointment);
    setShowDetailsModal(true);
  };

  const handleEdit = (appointment) => {
    setSelectedAppointment(appointment);
    setFormData({
      customer_id: appointment.customer_id,
      barber_id: appointment.barber_id,
      service_id: appointment.service_id,
      appointment_date: appointment.appointment_date,
      appointment_time: appointment.appointment_time,
      notes: appointment.notes || '',
      status: appointment.status
    });
    setShowEditModal(true);
  };

  const closeDetailsModal = () => {
    setSelectedAppointment(null);
    setShowDetailsModal(false);
  };

  const closeEditModal = () => {
    setSelectedAppointment(null);
    setFormData({
      customer_id: '',
      barber_id: '',
      service_id: '',
      appointment_date: '',
      appointment_time: '',
      notes: '',
      status: ''
    });
    setFormErrors({});
    setShowEditModal(false);
  };

  if (loading && !appointments.length && !barbers.length && !services.length) {
    return <LoadingSpinner />;
  }

  return (
    <div className="container-fluid py-4">
      <h2 className="mb-4">Manage Appointments</h2>

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

      {/* Search and Filters */}
      <SearchAndFilter 
        type="appointments"
        onResults={setAppointments}
        initialFilters={filters}
      />

      {/* Appointments Table */}
      <div className="card">
        <div className="card-body">
          {appointments.length === 0 ? (
            <div className="text-center py-5">
              <div className="text-muted mb-3">
                <i className="bi bi-calendar-x fs-1"></i>
              </div>
              <p>No appointments found matching your criteria.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th>Date & Time</th>
                    <th>Customer</th>
                    <th>Barber</th>
                    <th>Service</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {appointments.map((appointment) => (
                    <tr key={appointment.id}>
                      <td>
                        {formatDate(appointment.appointment_date)} <br />
                        <small className="text-muted">{formatTime(appointment.appointment_time)}</small>
                      </td>
                      <td>
                        {appointment.customer?.full_name || 'Unknown'} <br />
                        <small className="text-muted">{appointment.customer?.phone || 'No phone'}</small>
                      </td>
                      <td>{appointment.barber?.full_name || 'Unknown'}</td>
                      <td>
                        {appointment.service?.name || 'Unknown'} <br />
                        <small className="text-muted">{appointment.service?.duration} min</small>
                      </td>
                      <td>
                        <span className={`badge bg-${getStatusColor(appointment.status)}`}>
                          {appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
                        </span>
                      </td>
                      <td>
                        <div className="dropdown">
                          <button className="btn btn-sm btn-outline-secondary dropdown-toggle" type="button" id={`dropdown-${appointment.id}`} data-bs-toggle="dropdown" aria-expanded="false">
                            Actions
                          </button>
                          <ul className="dropdown-menu" aria-labelledby={`dropdown-${appointment.id}`}>
                            <li>
                              <button className="dropdown-item" onClick={() => handleViewDetails(appointment)}>
                                <i className="bi bi-eye me-2"></i>View Details
                              </button>
                            </li>
                            <li>
                              <button className="dropdown-item" onClick={() => handleEdit(appointment)}>
                                <i className="bi bi-pencil me-2"></i>Edit
                              </button>
                            </li>
                            <li><hr className="dropdown-divider" /></li>
                            <li className="dropdown-header">Change Status</li>
                            {Object.values(APPOINTMENT_STATUS).map(status => (
                              <li key={status}>
                                {status !== appointment.status && (
                                  <button 
                                    className="dropdown-item"
                                    onClick={() => handleStatusChange(appointment.id, status)}
                                  >
                                    <i className={`bi bi-check-circle me-2 text-${getStatusColor(status)}`}></i>
                                    Mark as {status.charAt(0).toUpperCase() + status.slice(1)}
                                  </button>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Details Modal */}
      {showDetailsModal && selectedAppointment && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Appointment Details</h5>
                <button 
                  type="button" 
                  className="btn-close" 
                  onClick={closeDetailsModal}
                ></button>
              </div>
              <div className="modal-body">
                <div className="mb-3 pb-3 border-bottom">
                  <span className={`badge bg-${getStatusColor(selectedAppointment.status)} mb-2`}>
                    {selectedAppointment.status.charAt(0).toUpperCase() + selectedAppointment.status.slice(1)}
                  </span>
                  <h5>
                    {formatDate(selectedAppointment.appointment_date)} at {formatTime(selectedAppointment.appointment_time)}
                  </h5>
                </div>
                
                <div className="row mb-3">
                  <div className="col-md-6">
                    <h6>Customer</h6>
                    <p className="mb-0">{selectedAppointment.customer?.full_name}</p>
                    <p className="mb-0">{selectedAppointment.customer?.email}</p>
                    <p className="mb-0">{selectedAppointment.customer?.phone}</p>
                  </div>
                  <div className="col-md-6">
                    <h6>Barber</h6>
                    <p className="mb-0">{selectedAppointment.barber?.full_name}</p>
                    <p className="mb-0">{selectedAppointment.barber?.email}</p>
                  </div>
                </div>
                
                <div className="mb-3">
                  <h6>Service</h6>
                  <p className="mb-0">{selectedAppointment.service?.name}</p>
                  <p className="mb-0">Duration: {selectedAppointment.service?.duration} minutes</p>
                  <p className="mb-0">Price: ₱{selectedAppointment.service?.price}</p>
                </div>
                
                {selectedAppointment.notes && (
                  <div className="mb-3">
                    <h6>Notes</h6>
                    <p className="mb-0">{selectedAppointment.notes}</p>
                  </div>
                )}
                
                <div className="mb-3">
                  <h6>System Info</h6>
                  <p className="mb-0">Created: {formatDate(selectedAppointment.created_at, { 
                    year: 'numeric', 
                    month: 'short', 
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}</p>
                  <p className="mb-0">Last Updated: {formatDate(selectedAppointment.updated_at, { 
                    year: 'numeric', 
                    month: 'short', 
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}</p>
                </div>
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={closeDetailsModal}
                >
                  Close
                </button>
                <button 
                  type="button" 
                  className="btn btn-primary"
                  onClick={() => {
                    closeDetailsModal();
                    handleEdit(selectedAppointment);
                  }}
                >
                  Edit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedAppointment && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Edit Appointment</h5>
                <button 
                  type="button" 
                  className="btn-close" 
                  onClick={closeEditModal}
                ></button>
              </div>
              <div className="modal-body">
                <form onSubmit={handleSubmit}>
                  <div className="mb-3">
                    <label htmlFor="customer" className="form-label">Customer</label>
                    <input
                      type="text"
                      className="form-control"
                      id="customer"
                      value={selectedAppointment.customer?.full_name}
                      disabled
                    />
                    <div className="form-text">Customer cannot be changed</div>
                  </div>
                  
                  <div className="mb-3">
                    <label htmlFor="barber_id" className="form-label">Barber</label>
                    <select
                      className={`form-select ${formErrors.barber_id ? 'is-invalid' : ''}`}
                      id="barber_id"
                      name="barber_id"
                      value={formData.barber_id}
                      onChange={handleChange}
                      required
                    >
                      <option value="">Select Barber</option>
                      {barbers.map((barber) => (
                        <option key={barber.id} value={barber.id}>
                          {barber.full_name}
                        </option>
                      ))}
                    </select>
                    {formErrors.barber_id && (
                      <div className="invalid-feedback">{formErrors.barber_id}</div>
                    )}
                  </div>
                  
                  <div className="mb-3">
                    <label htmlFor="service_id" className="form-label">Service</label>
                    <select
                      className={`form-select ${formErrors.service_id ? 'is-invalid' : ''}`}
                      id="service_id"
                      name="service_id"
                      value={formData.service_id}
                      onChange={handleChange}
                      required
                    >
                      <option value="">Select Service</option>
                      {services.map((service) => (
                        <option key={service.id} value={service.id}>
                          {service.name} - ₱{service.price} ({service.duration} min)
                        </option>
                      ))}
                    </select>
                    {formErrors.service_id && (
                      <div className="invalid-feedback">{formErrors.service_id}</div>
                    )}
                  </div>
                  
                  <div className="row mb-3">
                    <div className="col-md-6">
                      <label htmlFor="appointment_date" className="form-label">Date</label>
                      <input
                        type="date"
                        className={`form-control ${formErrors.appointment_date ? 'is-invalid' : ''}`}
                        id="appointment_date"
                        name="appointment_date"
                        value={formData.appointment_date}
                        onChange={handleChange}
                        required
                      />
                      {formErrors.appointment_date && (
                        <div className="invalid-feedback">{formErrors.appointment_date}</div>
                      )}
                    </div>
                    
                    <div className="col-md-6">
                      <label htmlFor="appointment_time" className="form-label">Time</label>
                      <select
                        className={`form-select ${formErrors.appointment_time ? 'is-invalid' : ''}`}
                        id="appointment_time"
                        name="appointment_time"
                        value={formData.appointment_time}
                        onChange={handleChange}
                        required
                        disabled={!formData.barber_id || !formData.appointment_date}
                      >
                        <option value="">Select Time</option>
                        {availableSlots.map((time) => (
                          <option key={time} value={time}>
                            {formatTime(time)}
                          </option>
                        ))}
                      </select>
                      {formErrors.appointment_time && (
                        <div className="invalid-feedback">{formErrors.appointment_time}</div>
                      )}
                      {formData.barber_id && formData.appointment_date && availableSlots.length === 0 && (
                        <div className="form-text text-danger">
                          No available slots for this date. Please try another date.
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="mb-3">
                    <label htmlFor="status" className="form-label">Status</label>
                    <select
                      className={`form-select ${formErrors.status ? 'is-invalid' : ''}`}
                      id="status"
                      name="status"
                      value={formData.status}
                      onChange={handleChange}
                      required
                    >
                      <option value="">Select Status</option>
                      {Object.values(APPOINTMENT_STATUS).map((status) => (
                        <option key={status} value={status}>
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </option>
                      ))}
                    </select>
                    {formErrors.status && (
                      <div className="invalid-feedback">{formErrors.status}</div>
                    )}
                  </div>
                  
                  <div className="mb-3">
                    <label htmlFor="notes" className="form-label">Notes</label>
                    <textarea
                      className="form-control"
                      id="notes"
                      name="notes"
                      value={formData.notes}
                      onChange={handleChange}
                      rows="3"
                    ></textarea>
                  </div>
                  
                  <div className="d-flex justify-content-end gap-2">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={closeEditModal}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={loading}
                    >
                      {loading ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                          Saving...
                        </>
                      ) : (
                        'Save Changes'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageAppointments;
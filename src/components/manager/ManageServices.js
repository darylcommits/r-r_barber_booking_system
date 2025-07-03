// components/manager/ManageServices.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { apiService } from '../../services/ApiService';
import { formatPrice } from '../utils/helpers';
import { isValidPrice } from '../utils/validators';
import LoadingSpinner from '../common/LoadingSpinner';

const ManageServices = () => {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedService, setSelectedService] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    duration: '',
    is_active: true
  });
  
  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    fetchServices();
    
    // Set up subscription for service changes
    const subscription = supabase
      .channel('services-changes')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'services'
        }, 
        () => {
          fetchServices();
        }
      )
      .subscribe();
    
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchServices = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await apiService.getServices(true);
      setServices(data);
    } catch (error) {
      console.error('Error fetching services:', error);
      setError('Failed to load services. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    // Handle checkbox differently
    const val = type === 'checkbox' ? checked : value;
    
    setFormData(prev => ({
      ...prev,
      [name]: val
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
    if (!formData.name.trim()) {
      errors.name = 'Service name is required';
    }
    
    if (!formData.price) {
      errors.price = 'Price is required';
    } else if (!isValidPrice(formData.price)) {
      errors.price = 'Price must be a valid number with up to 2 decimal places';
    }
    
    if (!formData.duration) {
      errors.duration = 'Duration is required';
    } else if (isNaN(formData.duration) || parseInt(formData.duration) <= 0) {
      errors.duration = 'Duration must be a positive number';
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
      
      // Prepare data with correct types
      const serviceData = {
        ...formData,
        price: parseFloat(formData.price),
        duration: parseInt(formData.duration)
      };
      
      let result;
      
      if (isEditing && selectedService) {
        // Update existing service
        result = await apiService.updateService(selectedService.id, serviceData);
        
        // Update local state
        setServices(prev => 
          prev.map(service => 
            service.id === selectedService.id ? result : service
          )
        );
      } else {
        // Create new service
        result = await apiService.createService(serviceData);
        
        // Update local state
        setServices(prev => [...prev, result]);
      }
      
      // Close modal and reset form
      resetFormAndCloseModal();
      
    } catch (error) {
      console.error('Error saving service:', error);
      setError('Failed to save service. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (service) => {
    setSelectedService(service);
    setFormData({
      name: service.name,
      description: service.description || '',
      price: service.price.toString(),
      duration: service.duration.toString(),
      is_active: service.is_active
    });
    setIsEditing(true);
    setShowModal(true);
  };

  const handleDelete = async (serviceId) => {
    if (!window.confirm('Are you sure you want to delete this service?')) {
      return;
    }
    
    try {
      setLoading(true);
      
      await apiService.deleteService(serviceId);
      
      // Update local state
      setServices(prev => prev.filter(service => service.id !== serviceId));
      
    } catch (error) {
      console.error('Error deleting service:', error);
      setError('Failed to delete service. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (service) => {
    try {
      setLoading(true);
      
      const result = await apiService.updateService(service.id, {
        is_active: !service.is_active
      });
      
      // Update local state
      setServices(prev => 
        prev.map(s => s.id === service.id ? result : s)
      );
      
    } catch (error) {
      console.error('Error updating service status:', error);
      setError('Failed to update service status. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddNew = () => {
    setFormData({
      name: '',
      description: '',
      price: '',
      duration: '',
      is_active: true
    });
    setIsEditing(false);
    setSelectedService(null);
    setShowModal(true);
  };

  const resetFormAndCloseModal = () => {
    setFormData({
      name: '',
      description: '',
      price: '',
      duration: '',
      is_active: true
    });
    setFormErrors({});
    setIsEditing(false);
    setSelectedService(null);
    setShowModal(false);
  };

  if (loading && !services.length) {
    return <LoadingSpinner />;
  }

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Manage Services</h2>
        <button 
          className="btn btn-primary" 
          onClick={handleAddNew}
        >
          <i className="bi bi-plus-circle me-2"></i>
          Add New Service
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

      {/* Services Table */}
      <div className="card">
        <div className="card-body">
          {services.length === 0 ? (
            <div className="text-center py-4">
              <div className="text-muted mb-3">
                <i className="bi bi-inbox fs-1"></i>
              </div>
              <p>No services found. Click "Add New Service" to create one.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Description</th>
                    <th>Price</th>
                    <th>Duration</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((service) => (
                    <tr key={service.id} className={!service.is_active ? 'table-secondary' : ''}>
                      <td>{service.name}</td>
                      <td>{service.description || '-'}</td>
                      <td>{formatPrice(service.price)}</td>
                      <td>{service.duration} min</td>
                      <td>
                        <span className={`badge bg-${service.is_active ? 'success' : 'secondary'}`}>
                          {service.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <div className="btn-group" role="group">
                          <button
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => handleEdit(service)}
                          >
                            <i className="bi bi-pencil"></i>
                          </button>
                          <button
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => handleDelete(service.id)}
                          >
                            <i className="bi bi-trash"></i>
                          </button>
                          <button
                            className="btn btn-sm btn-outline-warning"
                            onClick={() => handleToggleActive(service)}
                            title={service.is_active ? 'Deactivate' : 'Activate'}
                          >
                            <i className={`bi bi-${service.is_active ? 'eye-slash' : 'eye'}`}></i>
                          </button>
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

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  {isEditing ? 'Edit Service' : 'Add New Service'}
                </h5>
                <button 
                  type="button" 
                  className="btn-close" 
                  onClick={resetFormAndCloseModal}
                ></button>
              </div>
              <div className="modal-body">
                <form onSubmit={handleSubmit}>
                  <div className="mb-3">
                    <label htmlFor="name" className="form-label">Service Name</label>
                    <input
                      type="text"
                      className={`form-control ${formErrors.name ? 'is-invalid' : ''}`}
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                    />
                    {formErrors.name && (
                      <div className="invalid-feedback">{formErrors.name}</div>
                    )}
                  </div>
                  
                  <div className="mb-3">
                    <label htmlFor="description" className="form-label">Description</label>
                    <textarea
                      className="form-control"
                      id="description"
                      name="description"
                      value={formData.description}
                      onChange={handleChange}
                      rows="3"
                    ></textarea>
                  </div>
                  
                  <div className="row mb-3">
                    <div className="col-md-6">
                      <label htmlFor="price" className="form-label">Price (₱)</label>
                      <input
                        type="number"
                        className={`form-control ${formErrors.price ? 'is-invalid' : ''}`}
                        id="price"
                        name="price"
                        value={formData.price}
                        onChange={handleChange}
                        step="0.01"
                        min="0"
                        required
                      />
                      {formErrors.price && (
                        <div className="invalid-feedback">{formErrors.price}</div>
                      )}
                    </div>
                    
                    <div className="col-md-6">
                      <label htmlFor="duration" className="form-label">Duration (minutes)</label>
                      <input
                        type="number"
                        className={`form-control ${formErrors.duration ? 'is-invalid' : ''}`}
                        id="duration"
                        name="duration"
                        value={formData.duration}
                        onChange={handleChange}
                        min="1"
                        required
                      />
                      {formErrors.duration && (
                        <div className="invalid-feedback">{formErrors.duration}</div>
                      )}
                    </div>
                  </div>
                  
                  <div className="mb-3 form-check">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      id="is_active"
                      name="is_active"
                      checked={formData.is_active}
                      onChange={handleChange}
                    />
                    <label className="form-check-label" htmlFor="is_active">Active</label>
                  </div>
                  
                  <div className="d-flex justify-content-end gap-2">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={resetFormAndCloseModal}
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
                        'Save Service'
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

export default ManageServices;
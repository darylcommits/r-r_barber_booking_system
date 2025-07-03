// components/auth/Register.js
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import './Register.css'; // Import the matching CSS file

const Register = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    fullName: '',
    phone: '',
    role: 'customer' // Default role is customer
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      console.log('Starting registration with role:', formData.role);
      
      // Sign up user with metadata
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.fullName,
            role: formData.role,
            phone: formData.phone
          }
        }
      });

      if (authError) throw authError;

      console.log('Auth user created:', authData.user?.id);
      console.log('User metadata:', authData.user?.user_metadata);

      // Wait for auth to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (!authData.user) {
        throw new Error('User creation failed or confirmation required');
      }

      // Create user profile using upsert to handle duplicates
      const { error: profileError } = await supabase
        .from('users')
        .upsert([{
          id: authData.user.id,
          email: formData.email,
          full_name: formData.fullName,
          phone: formData.phone,
          role: formData.role // Make sure to use the role from the form
        }], {
          onConflict: 'id'
        });

      if (profileError) {
        console.error('Profile creation error:', profileError);
        // Don't throw - the auth user was created successfully
      } else {
        console.log('User profile created with role:', formData.role);
      }

      // Sign them in immediately 
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });

      if (signInError) {
        console.error('Sign in error:', signInError);
        setSuccess('Registration successful! Please sign in.');
        setTimeout(() => {
          navigate('/login');
        }, 2000);
      } else {
        console.log('Sign in successful, user role should be:', formData.role);
        
        // Extra step: update session with role information
        const { error: sessionError } = await supabase.auth.refreshSession();
        if (sessionError) {
          console.error('Session refresh error:', sessionError);
        }
        
        setSuccess('Registration successful! Redirecting...');
        setTimeout(() => {
          // Force reload to ensure all auth data is updated
          window.location.href = '/dashboard';
        }, 1000);
      }
      
    } catch (error) {
      console.error('Registration error:', error);
      setError(error.message || 'Failed to register. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dark-onboarding">
      <div className="dark-slide-card register-card">
        <div className="barber-logo">
          <div className="logo-image-container logo-placeholder">
            <span className="logo-fallback-text">R&R</span>
          </div>
          <div className="logo-text">
            <h1>R&RBooker</h1>
            <p>Create Account</p>
          </div>
        </div>

        {error && (
          <div className="error-alert" role="alert">
            {error}
          </div>
        )}

        {success && (
          <div className="success-alert" role="alert">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="register-form">
          <div className="form-group">
            <label htmlFor="fullName">Full Name</label>
            <input
              type="text"
              id="fullName"
              name="fullName"
              value={formData.fullName}
              onChange={handleChange}
              required
              className="dark-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              className="dark-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              minLength={6}
              className="dark-input"
            />
            <div className="form-hint">Password must be at least 6 characters long.</div>
          </div>

          <div className="form-group">
            <label htmlFor="phone">Phone Number</label>
            <input
              type="tel"
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className="dark-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="role">Account Type</label>
            <select
              id="role"
              name="role"
              value={formData.role}
              onChange={handleChange}
              required
              className="dark-select"
            >
              <option value="customer">Customer</option>
            </select>
          </div>

          <button
            type="submit"
            className="action-button"
            disabled={loading}
          >
            {loading ? (
              <span className="spinner" role="status" aria-hidden="true"></span>
            ) : null}
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <div className="login-link">
          <p>
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;
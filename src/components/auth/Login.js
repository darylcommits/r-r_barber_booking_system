// components/auth/Login.js
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import OnboardingSlides from '../onboarding/OnboardingSlides';
import './Login.css'; // Import the matching CSS file

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showOnboarding, setShowOnboarding] = useState(true);
  const navigate = useNavigate();

  // On component mount, check if we should show onboarding
  useEffect(() => {
    // Always show onboarding before login
    setShowOnboarding(true);
  }, []);

  const handleOnboardingComplete = () => {
    // Switch to login form
    setShowOnboarding(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Log the login action
      await supabase.from('system_logs').insert({
        user_id: data.user.id,
        action: 'login_success',
        details: { email },
      });

      navigate('/dashboard');
    } catch (error) {
      setError(error.message);
      
      // Log failed login attempt
      await supabase.from('system_logs').insert({
        action: 'login_failed',
        details: { email, error: error.message },
      });
    } finally {
      setLoading(false);
    }
  };

  // If showOnboarding is true, render the onboarding slides
  if (showOnboarding) {
    return <OnboardingSlides onComplete={handleOnboardingComplete} />;
  }

  // Otherwise render the login form with matching dark theme
  return (
    <div className="dark-onboarding">
      <div className="dark-slide-card login-card">
        <div className="barber-logo">
          <div className="logo-image-container logo-placeholder">
            <span className="logo-fallback-text">R&R</span>
          </div>
          <div className="logo-text">
            <h1>R&RBooker</h1>
            <p>Welcome back</p>
          </div>
        </div>

        {error && (
          <div className="error-alert" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="dark-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="dark-input"
            />
          </div>

          <button
            type="submit"
            className="action-button"
            disabled={loading}
          >
            {loading ? (
              <span className="spinner" role="status" aria-hidden="true"></span>
            ) : null}
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="register-link">
          <p>
            Don't have an account? <Link to="/register">Sign up</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
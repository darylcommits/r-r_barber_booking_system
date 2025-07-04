// components/common/Navigation.js (With clickable logout button and manager dropdowns)
import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import Notifications from './Notifications';
import { ROUTES } from '../utils/constants';
import logoImage from '../../assets/images/raf-rok-logo.png';

const Navigation = ({ userRole }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentUser, setCurrentUser] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [animatedItems, setAnimatedItems] = useState([]);

  // Memoize the signOut function to ensure stability between renders
  const handleSignOut = useCallback(async () => {
    console.log('Sign out clicked');
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      console.log('Successfully signed out');
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }, [navigate]);

  useEffect(() => {
    console.log('Current userRole:', userRole);
    
    const fetchCurrentUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        setCurrentUser(data.user);
      }
    };

    fetchCurrentUser();

    // Add scroll listener for navbar animation
    const handleScroll = () => {
      const offset = window.scrollY;
      if (offset > 50) {
        setScrolled(true);
      } else {
        setScrolled(false);
      }
    };

    window.addEventListener('scroll', handleScroll);

    // Animate nav items on initial load
    const timer = setTimeout(() => {
      const navItems = document.querySelectorAll('.nav-item');
      const itemsList = [];
      navItems.forEach((item, index) => {
        setTimeout(() => {
          itemsList.push(index);
          setAnimatedItems([...itemsList]);
        }, index * 100);
      });
    }, 300);

    // Add explicit logout button event listener
    // This ensures the button is clickable even if React events are not firing
    const setupLogoutButton = () => {
      const logoutBtn = document.querySelector('.admin-logout-btn');
      if (logoutBtn) {
        // Remove any existing listeners to prevent duplicates
        const newBtn = logoutBtn.cloneNode(true);
        if (logoutBtn.parentNode) {
          logoutBtn.parentNode.replaceChild(newBtn, logoutBtn);
        }
        newBtn.addEventListener('click', handleSignOut);
      }
    };

    // Setup logout button when component mounts and whenever userRole changes
    setupLogoutButton();
    
    // Setup the button again after a short delay to ensure DOM is fully rendered
    const buttonSetupTimer = setTimeout(setupLogoutButton, 500);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(timer);
      clearTimeout(buttonSetupTimer);
    };
  }, [handleSignOut, userRole]);

  // Close navbar collapse on mobile when navigating
  const handleNavClick = () => {
    setExpanded(false);
  };

  // Check if user is admin/manager
  const isAdmin = userRole === 'manager' || userRole === 'admin';
  
  console.log('Is admin?', isAdmin);

  return (
    <nav 
      className={`navbar navbar-expand-lg navbar-dark ${scrolled ? 'scrolled' : ''}`}
      style={{
        background: 'linear-gradient(90deg, #1e1e1e 0%, #2c2c2c 100%)',
        padding: scrolled ? '0.5rem 1rem' : '1rem',
        transition: 'all 0.3s ease',
        boxShadow: scrolled ? '0 4px 12px rgba(0, 0, 0, 0.15)' : 'none',
        zIndex: 1030 // Ensure navbar is above other elements
      }}
    >
      <div className="container-fluid">
        <Link 
          className="navbar-brand d-flex align-items-center" 
          to="/dashboard"
          style={{ 
            transition: 'transform 0.5s ease',
            transform: scrolled ? 'scale(0.95)' : 'scale(1)'
          }}
        >
          {/* Logo with text */}
          <div className="d-flex align-items-center">
            <img 
              src={logoImage} 
              alt="raf" 
              height="45" 
              className="navbar-logo"
              style={{ 
                transition: 'all 0.5s ease',
                filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))',
                backgroundColor: '#ffffff',
                padding: '3px',
                borderRadius: '5px'
              }}
            />
            <div className="d-flex flex-column ms-2">
              <span 
                className="logo-text text-white fw-bold" 
                style={{ 
                  fontSize: scrolled ? '1.3rem' : '1.5rem',
                  lineHeight: '1.1', 
                  letterSpacing: '1px',
                  transition: 'all 0.3s ease',
                  textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)'
                }}
              >
                RAF & ROK
              </span>
              <span 
                className="logo-subtitle text-light" 
                style={{ 
                  fontSize: '0.7rem', 
                  letterSpacing: '2px', 
                  opacity: scrolled ? '0.7' : '0.9',
                  transition: 'all 0.3s ease',
                  transform: scrolled ? 'translateY(-1px)' : 'translateY(0)'
                }}
              >
                BARBERSHOP
              </span>
            </div>
          </div>
        </Link>
        
        <button
          className="navbar-toggler border-0"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#navbarNav"
          aria-controls="navbarNav"
          aria-expanded={expanded ? "true" : "false"}
          onClick={() => setExpanded(!expanded)}
          style={{
            transition: 'all 0.3s ease',
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)'
          }}
        >
          <span className="navbar-toggler-icon"></span>
        </button>
        
        <div className={`collapse navbar-collapse ${expanded ? "show" : ""}`} id="navbarNav">
          <ul className="navbar-nav me-auto">
            <li 
              className={`nav-item ${animatedItems.includes(0) ? 'animated-item' : ''}`}
              style={{ transform: animatedItems.includes(0) ? 'translateY(0)' : 'translateY(20px)', opacity: animatedItems.includes(0) ? 1 : 0, transition: 'all 0.5s ease' }}
            >
              <Link 
                className={`nav-link ${location.pathname === ROUTES.DASHBOARD ? 'active' : ''}`} 
                to={ROUTES.DASHBOARD} 
                onClick={handleNavClick}
              >
                <i className="bi bi-speedometer2 me-1"></i>
                Dashboard
              </Link>
            </li>
            
            {userRole === 'manager' && (
              <>
                <li 
                  className={`nav-item dropdown ${animatedItems.includes(1) ? 'animated-item' : ''}`}
                  style={{ transform: animatedItems.includes(1) ? 'translateY(0)' : 'translateY(20px)', opacity: animatedItems.includes(1) ? 1 : 0, transition: 'all 0.5s ease' }}
                >
                  <Link
                    className={`nav-link dropdown-toggle ${location.pathname.startsWith('/manage') ? 'active' : ''}`}
                    to="#"
                    role="button"
                    data-bs-toggle="dropdown"
                    aria-expanded="false"
                  >
                    <i className="bi bi-gear me-1"></i>
                    Manage
                  </Link>
                  <ul className="dropdown-menu custom-dropdown">
                    <li>
                      <Link className="dropdown-item" to={ROUTES.MANAGE_BARBERS} onClick={handleNavClick}>
                        <i className="bi bi-scissors me-2"></i>
                        Barbers
                      </Link>
                    </li>
                    <li>
                      <Link className="dropdown-item" to={ROUTES.MANAGE_SERVICES} onClick={handleNavClick}>
                        <i className="bi bi-list-check me-2"></i>
                        Services
                      </Link>
                    </li>
                    <li>
                      <Link className="dropdown-item" to={ROUTES.MANAGE_PRODUCTS} onClick={handleNavClick}>
                        <i className="bi bi-box me-2"></i>
                        Products
                      </Link>
                    </li>
                    <li><hr className="dropdown-divider" /></li>
                    <li>
                      <Link className="dropdown-item" to={ROUTES.MANAGE_APPOINTMENTS} onClick={handleNavClick}>
                        <i className="bi bi-calendar-check me-2"></i>
                        Appointments
                      </Link>
                    </li>
                    <li>
                      <Link className="dropdown-item" to={ROUTES.REPORTS} onClick={handleNavClick}>
                        <i className="bi bi-graph-up me-2"></i>
                        Reports
                      </Link>
                    </li>
                  </ul>
                </li>
              </>
            )}
            
            {userRole === 'barber' && (
              <>
                <li 
                  className={`nav-item ${animatedItems.includes(1) ? 'animated-item' : ''}`}
                  style={{ transform: animatedItems.includes(1) ? 'translateY(0)' : 'translateY(20px)', opacity: animatedItems.includes(1) ? 1 : 0, transition: 'all 0.5s ease' }}
                >
                  <Link 
                    className={`nav-link ${location.pathname === ROUTES.SCHEDULE ? 'active' : ''}`} 
                    to={ROUTES.SCHEDULE} 
                    onClick={handleNavClick}
                  >
                    <i className="bi bi-calendar3 me-1"></i>
                    My Schedule
                  </Link>
                </li>
                <li 
                  className={`nav-item ${animatedItems.includes(2) ? 'animated-item' : ''}`}
                  style={{ transform: animatedItems.includes(2) ? 'translateY(0)' : 'translateY(20px)', opacity: animatedItems.includes(2) ? 1 : 0, transition: 'all 0.5s ease' }}
                >
                  <Link 
                    className={`nav-link ${location.pathname === ROUTES.QUEUE ? 'active' : ''}`} 
                    to={ROUTES.QUEUE} 
                    onClick={handleNavClick}
                  >
                    <i className="bi bi-people me-1"></i>
                    Queue
                  </Link>
                </li>
              </>
            )}
            
            {userRole === 'customer' && (
              <>
                <li 
                  className={`nav-item ${animatedItems.includes(1) ? 'animated-item' : ''}`}
                  style={{ transform: animatedItems.includes(1) ? 'translateY(0)' : 'translateY(20px)', opacity: animatedItems.includes(1) ? 1 : 0, transition: 'all 0.5s ease' }}
                >
                  <Link 
                    className={`nav-link ${location.pathname === ROUTES.BOOK_APPOINTMENT ? 'active' : ''}`} 
                    to={ROUTES.BOOK_APPOINTMENT} 
                    onClick={handleNavClick}
                  >
                    <i className="bi bi-calendar-plus me-1"></i>
                    Book Appointment
                  </Link>
                </li>
                <li 
                  className={`nav-item ${animatedItems.includes(2) ? 'animated-item' : ''}`}
                  style={{ transform: animatedItems.includes(2) ? 'translateY(0)' : 'translateY(20px)', opacity: animatedItems.includes(2) ? 1 : 0, transition: 'all 0.5s ease' }}
                >
                  <Link 
                    className={`nav-link ${location.pathname === ROUTES.MY_APPOINTMENTS ? 'active' : ''}`} 
                    to={ROUTES.MY_APPOINTMENTS} 
                    onClick={handleNavClick}
                  >
                    <i className="bi bi-calendar-check me-1"></i>
                    My Appointments
                  </Link>
                </li>
                <li 
                  className={`nav-item ${animatedItems.includes(3) ? 'animated-item' : ''}`}
                  style={{ transform: animatedItems.includes(3) ? 'translateY(0)' : 'translateY(20px)', opacity: animatedItems.includes(3) ? 1 : 0, transition: 'all 0.5s ease' }}
                >
                  <Link 
                    className={`nav-link ${location.pathname === ROUTES.HAIRCUT_RECOMMENDER ? 'active' : ''}`} 
                    to={ROUTES.HAIRCUT_RECOMMENDER} 
                    onClick={handleNavClick}
                  >
                    <i className="bi bi-magic me-1"></i>
                    Haircut Recommender
                  </Link>
                </li>
                <li 
                  className={`nav-item ${animatedItems.includes(4) ? 'animated-item' : ''}`}
                  style={{ transform: animatedItems.includes(4) ? 'translateY(0)' : 'translateY(20px)', opacity: animatedItems.includes(4) ? 1 : 0, transition: 'all 0.5s ease' }}
                >
                  <Link 
                    className={`nav-link ${location.pathname === ROUTES.SHOP_PRODUCTS ? 'active' : ''}`} 
                    to={ROUTES.SHOP_PRODUCTS} 
                    onClick={handleNavClick}
                  >
                    <i className="bi bi-shop me-1"></i>
                    Shop Products
                  </Link>
                </li>
              </>
            )}
          </ul>
          
          <ul className="navbar-nav navbar-right">
            {/* Notifications Component */}
            <li className="nav-item">
              <Notifications />
            </li>
            
            {/* Cart Icon - for Customers */}
            {userRole === 'customer' && (
              <li className="nav-item">
                <Link 
                  className={`nav-link ${location.pathname === '/cart' ? 'active' : ''}`} 
                  to="/cart" 
                  onClick={handleNavClick}
                >
                  <i className="bi bi-cart me-1"></i>
                  Cart
                </Link>
              </li>
            )}
            
            {/* Admin Logout Button - Fixed to ensure it's clickable */}
            {isAdmin && (
              <li className="nav-item nav-logout-container ms-lg-3 me-lg-2 d-flex align-items-center">
                {/* Simple a tag to ensure maximum compatibility */}
                <a 
                  onClick={(e) => {
                    e.preventDefault();
                    handleSignOut();
                  }}
                  
                >
                 
                  
                </a>
              </li>
            )}
            
            {/* User Profile Dropdown */}
            <li className="nav-item dropdown">
              <Link
                className="nav-link dropdown-toggle user-dropdown d-flex align-items-center"
                to="#"
                role="button"
                data-bs-toggle="dropdown"
                aria-expanded="false"
              >
               
                <div className="d-flex align-items-center ms-1">
                  <img 
                    src={logoImage} 
                    alt="Role"
                    height="18"
                    className="me-1 role-icon"
                    style={{
                      backgroundColor: '#ffffff',
                      padding: '1px',
                      borderRadius: '3px'
                    }}
                  />
                  <span className="role-badge">
                    {userRole || 'loading...'}
                  </span>
                </div>
              </Link>
              <ul className="dropdown-menu dropdown-menu-end custom-dropdown" style={{zIndex: 1031}}>
                <li>
                  <Link className="dropdown-item" to={ROUTES.PROFILE} onClick={handleNavClick}>
                    <i className="bi bi-person me-2"></i>
                    My Profile
                  </Link>
                </li>
                <li>
                  <Link className="dropdown-item" to={ROUTES.SETTINGS} onClick={handleNavClick}>
                    <i className="bi bi-gear me-2"></i>
                    Settings
                  </Link>
                </li>
                <li><hr className="dropdown-divider" /></li>
                <li>
                  <button className="dropdown-item logout-btn" onClick={handleSignOut}>
                    <i className="bi bi-box-arrow-right me-2"></i>
                    Sign Out
                  </button>
                </li>
              </ul>
            </li>
          </ul>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
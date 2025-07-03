// components/common/Notifications.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../supabaseClient';

const Notifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    fetchNotifications();
    
    // Set up real-time subscription for notifications
    const user = supabase.auth.getUser();
    if (user) {
      const subscription = supabase
        .channel('notifications')
        .on('postgres_changes', 
          { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'notifications',
            filter: user?.data?.user ? `user_id=eq.${user.data.user.id}` : undefined
          }, 
          () => {
            fetchNotifications();
          }
        )
        .subscribe();

      return () => {
        subscription.unsubscribe();
      };
    }
  }, []);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) return;

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      setNotifications(data || []);
      
      // Count unread
      const unread = data?.filter(notification => !notification.read).length || 0;
      setUnreadCount(unread);
    } catch (err) {
      console.error('Error fetching notifications:', err);
      setError('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (notificationId) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId);

      if (error) throw error;
      
      // Update local state
      setNotifications(prevNotifications => 
        prevNotifications.map(notification => 
          notification.id === notificationId 
            ? { ...notification, read: true } 
            : notification
        )
      );
      
      // Update unread count
      setUnreadCount(prevCount => Math.max(0, prevCount - 1));
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) return;

      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('read', false);

      if (error) throw error;
      
      // Update local state
      setNotifications(prevNotifications => 
        prevNotifications.map(notification => ({ ...notification, read: true }))
      );
      
      // Update unread count
      setUnreadCount(0);
    } catch (err) {
      console.error('Error marking all notifications as read:', err);
    }
  };

  const formatNotificationTime = (timestamp) => {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffMinutes = Math.floor((now - date) / (1000 * 60));
    
    if (diffMinutes < 1) {
      return 'Just now';
    } else if (diffMinutes < 60) {
      return `${diffMinutes} min ago`;
    } else if (diffMinutes < 1440) {
      const hours = Math.floor(diffMinutes / 60);
      return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'appointment':
        return 'bi-calendar-check';
      case 'queue':
        return 'bi-people';
      case 'reminder':
        return 'bi-bell';
      default:
        return 'bi-info-circle';
    }
  };

  return (
    <div className="dropdown">
      <button 
        className="btn btn-link text-decoration-none position-relative"
        onClick={() => setShowNotifications(!showNotifications)}
        aria-expanded={showNotifications}
      >
        <i className="bi bi-bell fs-5"></i>
        {unreadCount > 0 && (
          <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">
            {unreadCount}
            <span className="visually-hidden">unread notifications</span>
          </span>
        )}
      </button>
      
      {showNotifications && (
        <div 
          className="dropdown-menu dropdown-menu-end show shadow" 
          style={{ width: '320px', maxHeight: '400px', overflowY: 'auto' }}
        >
          <div className="d-flex justify-content-between align-items-center p-3 border-bottom">
            <h6 className="mb-0">Notifications</h6>
            {unreadCount > 0 && (
              <button 
                className="btn btn-sm btn-link text-decoration-none"
                onClick={handleMarkAllAsRead}
              >
                Mark all as read
              </button>
            )}
          </div>
          
          {loading ? (
            <div className="p-3 text-center">
              <div className="spinner-border spinner-border-sm text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
            </div>
          ) : error ? (
            <div className="p-3 text-center text-danger">
              <i className="bi bi-exclamation-circle me-2"></i>
              {error}
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-4 text-center text-muted">
              <i className="bi bi-bell-slash fs-4 mb-2"></i>
              <p className="mb-0">No notifications</p>
            </div>
          ) : (
            <>
              {notifications.map(notification => (
                <div 
                  key={notification.id} 
                  className={`notification-item p-3 border-bottom ${!notification.read ? 'bg-light' : ''}`}
                >
                  <div className="d-flex">
                    <div className="me-3">
                      <div className={`rounded-circle bg-${
                        notification.type === 'appointment' ? 'primary' :
                        notification.type === 'queue' ? 'success' :
                        notification.type === 'reminder' ? 'warning' :
                        'secondary'
                      } bg-opacity-10 p-2 text-center`} style={{ width: '40px', height: '40px' }}>
                        <i className={`bi ${getNotificationIcon(notification.type)} fs-5`}></i>
                      </div>
                    </div>
                    <div className="flex-grow-1">
                      <div className="d-flex justify-content-between align-items-start">
                        <h6 className="mb-1">{notification.title}</h6>
                        <small className="text-muted">
                          {formatNotificationTime(notification.created_at)}
                        </small>
                      </div>
                      <p className="mb-1 small">{notification.message}</p>
                      {!notification.read && (
                        <button 
                          className="btn btn-sm btn-link text-decoration-none p-0"
                          onClick={() => handleMarkAsRead(notification.id)}
                        >
                          Mark as read
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              
              <div className="p-3 text-center">
                <Link 
                  to="/notifications" 
                  className="btn btn-sm btn-link text-decoration-none"
                  onClick={() => setShowNotifications(false)}
                >
                  View all notifications
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default Notifications;
// components/reports/Reports.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';

const Reports = () => {
  const [reportType, setReportType] = useState('revenue');
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reportTypes = [
    { value: 'revenue', label: 'Revenue Report' },
    { value: 'appointments', label: 'Appointments Report' },
    { value: 'customers', label: 'Customer Analytics' },
    { value: 'services', label: 'Service Performance' },
    { value: 'inventory', label: 'Inventory Report' },
    { value: 'system', label: 'System Activity Logs' }
  ];

  useEffect(() => {
    if (dateRange.start && dateRange.end) {
      generateReport();
    }
  }, [reportType, dateRange]);

  const generateReport = async () => {
    setLoading(true);
    setError('');
    
    try {
      let data;
      switch (reportType) {
        case 'revenue':
          data = await generateRevenueReport();
          break;
        case 'appointments':
          data = await generateAppointmentsReport();
          break;
        case 'customers':
          data = await generateCustomerReport();
          break;
        case 'services':
          data = await generateServiceReport();
          break;
        case 'inventory':
          data = await generateInventoryReport();
          break;
        case 'system':
          data = await generateSystemReport();
          break;
        default:
          throw new Error('Invalid report type');
      }
      
      setReportData(data);
      
      // Log report generation
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('system_logs').insert({
        user_id: user.id,
        action: 'report_generated',
        details: {
          report_type: reportType,
          date_range: dateRange
        }
      });
    } catch (err) {
      console.error('Report generation error:', err);
      setError('Failed to generate report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const generateRevenueReport = async () => {
    // Get completed appointments with services
    const { data: appointments } = await supabase
      .from('appointments')
      .select(`
        *,
        service:service_id(name, price),
        barber:barber_id(full_name)
      `)
      .eq('status', 'done')
      .gte('appointment_date', dateRange.start)
      .lte('appointment_date', dateRange.end);

    // Calculate total revenue
    const totalRevenue = appointments?.reduce((sum, apt) => sum + (apt.service?.price || 0), 0) || 0;

    // Revenue by barber
    const revenueByBarber = {};
    appointments?.forEach(apt => {
      const barberId = apt.barber_id;
      if (!revenueByBarber[barberId]) {
        revenueByBarber[barberId] = {
          name: apt.barber?.full_name || 'Unknown',
          revenue: 0,
          appointments: 0
        };
      }
      revenueByBarber[barberId].revenue += apt.service?.price || 0;
      revenueByBarber[barberId].appointments += 1;
    });

    // Revenue by service
    const revenueByService = {};
    appointments?.forEach(apt => {
      const serviceId = apt.service_id;
      if (!revenueByService[serviceId]) {
        revenueByService[serviceId] = {
          name: apt.service?.name || 'Unknown',
          revenue: 0,
          count: 0
        };
      }
      revenueByService[serviceId].revenue += apt.service?.price || 0;
      revenueByService[serviceId].count += 1;
    });

    // Daily revenue
    const dailyRevenue = {};
    appointments?.forEach(apt => {
      const date = apt.appointment_date;
      if (!dailyRevenue[date]) {
        dailyRevenue[date] = 0;
      }
      dailyRevenue[date] += apt.service?.price || 0;
    });

    return {
      summary: {
        totalRevenue,
        totalAppointments: appointments?.length || 0,
        averageTransaction: appointments?.length ? totalRevenue / appointments.length : 0
      },
      revenueByBarber: Object.values(revenueByBarber),
      revenueByService: Object.values(revenueByService),
      dailyRevenue
    };
  };

  const generateAppointmentsReport = async () => {
    const { data: appointments } = await supabase
      .from('appointments')
      .select(`
        *,
        customer:customer_id(full_name),
        barber:barber_id(full_name),
        service:service_id(name)
      `)
      .gte('appointment_date', dateRange.start)
      .lte('appointment_date', dateRange.end);

    // Status breakdown
    const statusBreakdown = {
      scheduled: 0,
      ongoing: 0,
      done: 0,
      cancelled: 0
    };

    appointments?.forEach(apt => {
      statusBreakdown[apt.status] = (statusBreakdown[apt.status] || 0) + 1;
    });

    // Appointments by barber
    const appointmentsByBarber = {};
    appointments?.forEach(apt => {
      const barberId = apt.barber_id;
      if (!appointmentsByBarber[barberId]) {
        appointmentsByBarber[barberId] = {
          name: apt.barber?.full_name || 'Unknown',
          total: 0,
          statusBreakdown: { ...statusBreakdown }
        };
      }
      appointmentsByBarber[barberId].total += 1;
      appointmentsByBarber[barberId].statusBreakdown[apt.status] += 1;
    });

    return {
      summary: {
        total: appointments?.length || 0,
        statusBreakdown
      },
      appointmentsByBarber: Object.values(appointmentsByBarber),
      appointments: appointments || []
    };
  };

  const generateCustomerReport = async () => {
    // Get all customers
    const { data: customers } = await supabase
      .from('users')
      .select('id, full_name, email, created_at')
      .eq('role', 'customer');

    // Get appointment data for customers
    const customerStats = {};
    
    for (const customer of customers || []) {
      const { data: appointments } = await supabase
        .from('appointments')
        .select('*, service:service_id(price)')
        .eq('customer_id', customer.id)
        .gte('appointment_date', dateRange.start)
        .lte('appointment_date', dateRange.end);

      customerStats[customer.id] = {
        ...customer,
        appointments: appointments?.length || 0,
        totalSpent: appointments?.reduce((sum, apt) => sum + (apt.service?.price || 0), 0) || 0,
        lastVisit: appointments?.[0]?.appointment_date || null
      };
    }

    // New customers in period
    const newCustomers = customers?.filter(c => 
      new Date(c.created_at) >= new Date(dateRange.start) &&
      new Date(c.created_at) <= new Date(dateRange.end)
    ).length || 0;

    return {
      summary: {
        totalCustomers: customers?.length || 0,
        newCustomers,
        repeatCustomers: Object.values(customerStats).filter(c => c.appointments > 1).length
      },
      customerStats: Object.values(customerStats)
    };
  };

  const generateServiceReport = async () => {
    const { data: services } = await supabase
      .from('services')
      .select('*');

    const servicePerformance = {};

    for (const service of services || []) {
      const { data: appointments } = await supabase
        .from('appointments')
        .select('*')
        .eq('service_id', service.id)
        .gte('appointment_date', dateRange.start)
        .lte('appointment_date', dateRange.end);

      servicePerformance[service.id] = {
        ...service,
        bookings: appointments?.length || 0,
        revenue: (appointments?.length || 0) * service.price
      };
    }

    return {
      servicePerformance: Object.values(servicePerformance),
      mostPopular: Object.values(servicePerformance).sort((a, b) => b.bookings - a.bookings)[0],
      mostRevenue: Object.values(servicePerformance).sort((a, b) => b.revenue - a.revenue)[0]
    };
  };

  const generateInventoryReport = async () => {
    const { data: products } = await supabase
      .from('products')
      .select('*');

    // Products needing restock
    const needsRestock = products?.filter(p => p.stock_quantity < 10) || [];

    // Low stock items
    const lowStock = products?.filter(p => p.stock_quantity < 5) || [];

    // Get sales data
    const { data: orders } = await supabase
      .from('orders')
      .select('items')
      .gte('created_at', dateRange.start)
      .lte('created_at', dateRange.end);

    const productSales = {};
    orders?.forEach(order => {
      order.items?.forEach(item => {
        if (!productSales[item.id]) {
          productSales[item.id] = {
            name: item.name,
            quantity: 0,
            revenue: 0
          };
        }
        productSales[item.id].quantity += item.quantity;
        productSales[item.id].revenue += item.price * item.quantity;
      });
    });

    return {
      summary: {
        totalProducts: products?.length || 0,
        needsRestock: needsRestock.length,
        lowStock: lowStock.length
      },
      productSales: Object.values(productSales),
      needsRestock,
      lowStock
    };
  };

  const generateSystemReport = async () => {
    const { data: logs, count } = await supabase
      .from('system_logs')
      .select('*', { count: 'exact' })
      .gte('created_at', dateRange.start)
      .lte('created_at', dateRange.end)
      .order('created_at', { ascending: false })
      .limit(1000);

    // Group by action
    const actionBreakdown = {};
    logs?.forEach(log => {
      actionBreakdown[log.action] = (actionBreakdown[log.action] || 0) + 1;
    });

    // Failed login attempts
    const failedLogins = logs?.filter(log => log.action === 'login_failed').length || 0;

    return {
      summary: {
        totalLogs: count || 0,
        failedLogins,
        actionBreakdown
      },
      recentLogs: logs || []
    };
  };

  const exportReport = () => {
    const filename = `${reportType}_report_${dateRange.start}_to_${dateRange.end}.csv`;
    
    // Convert data to CSV
    let csv = '';
    
    switch (reportType) {
      case 'revenue':
        csv = convertRevenueToCSV(reportData);
        break;
      case 'appointments':
        csv = convertAppointmentsToCSV(reportData);
        break;
      // Add more export formats as needed
      default:
        csv = 'Export format not available for this report type';
    }
    
    // Create download link
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const convertRevenueToCSV = (data) => {
    if (!data) return '';
    
    let csv = 'Revenue Report\n';
    csv += `Total Revenue,${data.summary.totalRevenue}\n`;
    csv += `Total Appointments,${data.summary.totalAppointments}\n`;
    csv += `Average Transaction,${data.summary.averageTransaction}\n\n`;
    
    csv += 'Revenue by Barber\n';
    csv += 'Barber,Revenue,Appointments\n';
    data.revenueByBarber.forEach(barber => {
      csv += `${barber.name},${barber.revenue},${barber.appointments}\n`;
    });
    
    return csv;
  };

  const convertAppointmentsToCSV = (data) => {
    if (!data) return '';
    
    let csv = 'Appointments Report\n';
    csv += `Total Appointments,${data.summary.total}\n`;
    
    csv += 'Status Breakdown\n';
    Object.entries(data.summary.statusBreakdown).forEach(([status, count]) => {
      csv += `${status},${count}\n`;
    });
    
    return csv;
  };

  return (
    <div className="container py-4">
      <div className="card">
        <div className="card-header">
          <div className="row align-items-center">
            <div className="col-md-8">
              <h3 className="mb-0">Reports & Analytics</h3>
            </div>
            <div className="col-md-4 text-end">
              {reportData && (
                <button className="btn btn-success" onClick={exportReport}>
                  <i className="bi bi-download me-2"></i>
                  Export Report
                </button>
              )}
            </div>
          </div>
        </div>
        
        <div className="card-body">
          <div className="row mb-4">
            <div className="col-md-4">
              <label className="form-label">Report Type</label>
              <select
                className="form-select"
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
              >
                {reportTypes.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="col-md-4">
              <label className="form-label">Start Date</label>
              <input
                type="date"
                className="form-control"
                value={dateRange.start}
                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              />
            </div>
            
            <div className="col-md-4">
              <label className="form-label">End Date</label>
              <input
                type="date"
                className="form-control"
                value={dateRange.end}
                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              />
            </div>
          </div>

          {error && (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
            </div>
          ) : reportData && (
            <div>
              {/* Render report based on type */}
              {reportType === 'revenue' && <RevenueReportView data={reportData} />}
              {reportType === 'appointments' && <AppointmentsReportView data={reportData} />}
              {reportType === 'customers' && <CustomerReportView data={reportData} />}
              {reportType === 'services' && <ServiceReportView data={reportData} />}
              {reportType === 'inventory' && <InventoryReportView data={reportData} />}
              {reportType === 'system' && <SystemReportView data={reportData} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Individual report view components
const RevenueReportView = ({ data }) => (
  <div>
    <div className="row mb-4">
      <div className="col-md-4">
        <div className="card bg-success text-white">
          <div className="card-body">
            <h6>Total Revenue</h6>
            <h3>₱{data.summary.totalRevenue.toFixed(2)}</h3>
          </div>
        </div>
      </div>
      <div className="col-md-4">
        <div className="card bg-primary text-white">
          <div className="card-body">
            <h6>Total Appointments</h6>
            <h3>{data.summary.totalAppointments}</h3>
          </div>
        </div>
      </div>
      <div className="col-md-4">
        <div className="card bg-info text-white">
          <div className="card-body">
            <h6>Average Transaction</h6>
            <h3>₱{data.summary.averageTransaction.toFixed(2)}</h3>
          </div>
        </div>
      </div>
    </div>

    <div className="row">
      <div className="col-md-6">
        <h5>Revenue by Barber</h5>
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Barber</th>
                <th>Revenue</th>
                <th>Appointments</th>
              </tr>
            </thead>
            <tbody>
              {data.revenueByBarber.map((barber, index) => (
                <tr key={index}>
                  <td>{barber.name}</td>
                  <td>₱{barber.revenue.toFixed(2)}</td>
                  <td>{barber.appointments}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      <div className="col-md-6">
        <h5>Revenue by Service</h5>
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Service</th>
                <th>Revenue</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {data.revenueByService.map((service, index) => (
                <tr key={index}>
                  <td>{service.name}</td>
                  <td>₱{service.revenue.toFixed(2)}</td>
                  <td>{service.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
);

const AppointmentsReportView = ({ data }) => (
  <div>
    <div className="row mb-4">
      <div className="col-md-3">
        <div className="card bg-primary text-white">
          <div className="card-body">
            <h6>Total Appointments</h6>
            <h3>{data.summary.total}</h3>
          </div>
        </div>
      </div>
      <div className="col-md-3">
        <div className="card bg-success text-white">
          <div className="card-body">
            <h6>Completed</h6>
            <h3>{data.summary.statusBreakdown.done}</h3>
          </div>
        </div>
      </div>
      <div className="col-md-3">
        <div className="card bg-warning text-white">
          <div className="card-body">
            <h6>Scheduled</h6>
            <h3>{data.summary.statusBreakdown.scheduled}</h3>
          </div>
        </div>
      </div>
      <div className="col-md-3">
        <div className="card bg-danger text-white">
          <div className="card-body">
            <h6>Cancelled</h6>
            <h3>{data.summary.statusBreakdown.cancelled}</h3>
          </div>
        </div>
      </div>
    </div>

    <h5>Appointments by Barber</h5>
    <div className="table-responsive">
      <table className="table">
        <thead>
          <tr>
            <th>Barber</th>
            <th>Total</th>
            <th>Scheduled</th>
            <th>Ongoing</th>
            <th>Done</th>
            <th>Cancelled</th>
          </tr>
        </thead>
        <tbody>
          {data.appointmentsByBarber.map((barber, index) => (
            <tr key={index}>
              <td>{barber.name}</td>
              <td>{barber.total}</td>
              <td>{barber.statusBreakdown.scheduled}</td>
              <td>{barber.statusBreakdown.ongoing}</td>
              <td>{barber.statusBreakdown.done}</td>
              <td>{barber.statusBreakdown.cancelled}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const CustomerReportView = ({ data }) => (
  <div>
    <div className="row mb-4">
      <div className="col-md-4">
        <div className="card bg-primary text-white">
          <div className="card-body">
            <h6>Total Customers</h6>
            <h3>{data.summary.totalCustomers}</h3>
          </div>
        </div>
      </div>
      <div className="col-md-4">
        <div className="card bg-success text-white">
          <div className="card-body">
            <h6>New Customers</h6>
            <h3>{data.summary.newCustomers}</h3>
          </div>
        </div>
      </div>
      <div className="col-md-4">
        <div className="card bg-info text-white">
          <div className="card-body">
            <h6>Repeat Customers</h6>
            <h3>{data.summary.repeatCustomers}</h3>
          </div>
        </div>
      </div>
    </div>

    <h5>Customer Statistics</h5>
    <div className="table-responsive">
      <table className="table">
        <thead>
          <tr>
            <th>Customer</th>
            <th>Appointments</th>
            <th>Total Spent</th>
            <th>Last Visit</th>
          </tr>
        </thead>
        <tbody>
          {data.customerStats.map((customer) => (
            <tr key={customer.id}>
              <td>{customer.full_name}</td>
              <td>{customer.appointments}</td>
              <td>₱{customer.totalSpent.toFixed(2)}</td>
              <td>{customer.lastVisit ? new Date(customer.lastVisit).toLocaleDateString() : 'Never'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const ServiceReportView = ({ data }) => (
  <div>
    <div className="row mb-4">
      <div className="col-md-6">
        <div className="card bg-primary text-white">
          <div className="card-body">
            <h6>Most Popular Service</h6>
            <h3>{data.mostPopular?.name || 'N/A'}</h3>
            <p className="mb-0">{data.mostPopular?.bookings || 0} bookings</p>
          </div>
        </div>
      </div>
      <div className="col-md-6">
        <div className="card bg-success text-white">
          <div className="card-body">
            <h6>Highest Revenue Service</h6>
            <h3>{data.mostRevenue?.name || 'N/A'}</h3>
            <p className="mb-0">₱{data.mostRevenue?.revenue?.toFixed(2) || '0.00'}</p>
          </div>
        </div>
      </div>
    </div>

    <h5>Service Performance</h5>
    <div className="table-responsive">
      <table className="table">
        <thead>
          <tr>
            <th>Service</th>
            <th>Price</th>
            <th>Bookings</th>
            <th>Revenue</th>
          </tr>
        </thead>
        <tbody>
          {data.servicePerformance.map((service) => (
            <tr key={service.id}>
              <td>{service.name}</td>
              <td>₱{service.price.toFixed(2)}</td>
              <td>{service.bookings}</td>
              <td>₱{service.revenue.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const InventoryReportView = ({ data }) => (
  <div>
    <div className="row mb-4">
      <div className="col-md-4">
        <div className="card bg-primary text-white">
          <div className="card-body">
            <h6>Total Products</h6>
            <h3>{data.summary.totalProducts}</h3>
          </div>
        </div>
      </div>
      <div className="col-md-4">
        <div className="card bg-warning text-white">
          <div className="card-body">
            <h6>Needs Restock</h6>
            <h3>{data.summary.needsRestock}</h3>
          </div>
        </div>
      </div>
      <div className="col-md-4">
        <div className="card bg-danger text-white">
          <div className="card-body">
            <h6>Low Stock</h6>
            <h3>{data.summary.lowStock}</h3>
          </div>
        </div>
      </div>
    </div>

    <div className="row">
      <div className="col-md-6">
        <h5>Products Needing Restock</h5>
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Current Stock</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.needsRestock.map((product) => (
                <tr key={product.id}>
                  <td>{product.name}</td>
                  <td>{product.stock_quantity}</td>
                  <td>
                    <span className={`badge bg-${product.stock_quantity < 5 ? 'danger' : 'warning'}`}>
                      {product.stock_quantity < 5 ? 'Critical' : 'Low Stock'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="col-md-6">
        <h5>Product Sales</h5>
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Quantity Sold</th>
                <th>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {data.productSales.map((product, index) => (
                <tr key={index}>
                  <td>{product.name}</td>
                  <td>{product.quantity}</td>
                  <td>₱{product.revenue.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
);

const SystemReportView = ({ data }) => (
  <div>
    <div className="row mb-4">
      <div className="col-md-6">
        <div className="card bg-primary text-white">
          <div className="card-body">
            <h6>Total Logs</h6>
            <h3>{data.summary.totalLogs}</h3>
          </div>
        </div>
      </div>
      <div className="col-md-6">
        <div className="card bg-danger text-white">
          <div className="card-body">
            <h6>Failed Login Attempts</h6>
            <h3>{data.summary.failedLogins}</h3>
          </div>
        </div>
      </div>
    </div>

    <div className="row">
      <div className="col-md-6">
        <h5>Action Breakdown</h5>
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(data.summary.actionBreakdown).map(([action, count]) => (
                <tr key={action}>
                  <td>{action.replace(/_/g, ' ').toUpperCase()}</td>
                  <td>{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="col-md-6">
        <h5>Recent Logs</h5>
        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>User ID</th>
              </tr>
            </thead>
            <tbody>
              {data.recentLogs.slice(0, 20).map((log) => (
                <tr key={log.id}>
                  <td>{new Date(log.created_at).toLocaleString()}</td>
                  <td>{log.action}</td>
                  <td>{log.user_id?.substring(0, 8) || 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
);

export default Reports;
// src/components/AdminRevenue.js
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext'; // To get currentUser and check admin status

const RAILWAY_BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';

const AdminRevenue = ({ showMessage }) => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [revenueData, setRevenueData] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('monthly'); // 'daily', 'weekly', 'monthly', 'yearly', 'all_time'

  // Admin emails (should match backend for consistency)
  const ADMIN_EMAILS = ['typemywordz@gmail.com', 'gracenyaitara@gmail.com'];
  const isAdmin = ADMIN_EMAILS.includes(currentUser?.email);

  const fetchRevenueDetails = useCallback(async (period) => {
    if (!isAdmin) {
      showMessage('Access denied. Admin privileges required.', 'error');
      setLoading(false);
      return;
    }

    setLoading(true);
    setRevenueData(null); // Clear previous data
    try {
      // Pass user_email in headers for backend admin check
      const response = await fetch(`${RAILWAY_BACKEND_URL}/api/admin/revenue-data?period=${period}`, {
        headers: {
          'X-User-Email': currentUser.email,
        },
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setRevenueData(data);
      showMessage(`Revenue data for ${period.replace('_', ' ')} loaded.`, 'success'); // Improved message
    } catch (error) {
      console.error('Error fetching revenue data:', error);
      showMessage('Failed to fetch revenue data: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, currentUser?.email, showMessage]);

  useEffect(() => {
    if (isAdmin) {
      fetchRevenueDetails(selectedPeriod);
    }
  }, [isAdmin, selectedPeriod, fetchRevenueDetails]); // Refetch when period changes

  if (!isAdmin) {
    return (
      <div style={{
        padding: '50px',
        textAlign: 'center',
        backgroundColor: '#f8f9fa',
        minHeight: '100vh'
      }}>
        <h2 style={{ color: '#dc3545' }}>⛔ Access Denied</h2>
        <p>You don't have permission to view the revenue dashboard.</p>
      </div>
    );
  }

  return (
    <div style={{
      backgroundColor: '#f8f9fa',
      minHeight: '100vh',
      padding: '20px'
    }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <header style={{
          textAlign: 'center',
          marginBottom: '30px',
          padding: '20px',
          backgroundColor: 'white',
          borderRadius: '10px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
        }}>
          <h1 style={{ color: '#28a745', margin: '0 0 10px 0' }}>
            💰 Revenue Analytics
          </h1>
          <p style={{ color: '#666', margin: '0' }}>
            In-depth revenue analysis for TypeMyworDz
          </p>
        </header>

        {/* Period Filters */}
        <div style={{ marginBottom: '30px', textAlign: 'center' }}>
          {['daily', 'weekly', 'monthly', 'yearly', 'all_time'].map(period => (
            <button
              key={period}
              onClick={() => setSelectedPeriod(period)}
              style={{
                padding: '10px 20px',
                margin: '0 10px',
                backgroundColor: selectedPeriod === period ? '#28a745' : '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '20px',
                cursor: 'pointer',
                fontSize: '1rem',
                textTransform: 'capitalize'
              }}
            >
              {period.replace('_', ' ')}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '50px' }}>
            <h2>📈 Loading Revenue Data...</h2>
          </div>
        ) : revenueData ? (
          <>
            {/* Summary Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '20px',
              marginBottom: '30px'
            }}>
              <div style={{
                backgroundColor: 'white',
                padding: '20px',
                borderRadius: '10px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                textAlign: 'center'
              }}>
                <h3 style={{ color: '#28a745', margin: '0 0 10px 0' }}>Total Revenue ({selectedPeriod.replace('_', ' ')})</h3>
                <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0', color: '#333' }}>
                  USD {revenueData.totalRevenue.toFixed(2)}
                </p>
              </div>
              <div style={{
                backgroundColor: 'white',
                padding: '20px',
                borderRadius: '10px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                textAlign: 'center'
              }}>
                <h3 style={{ color: '#007bff', margin: '0 0 10px 0' }}>Transactions ({selectedPeriod.replace('_', ' ')})</h3>
                <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0', color: '#333' }}>
                  {revenueData.transactionsCount}
                </p>
              </div>
              <div style={{
                backgroundColor: 'white',
                padding: '20px',
                borderRadius: '10px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                textAlign: 'center'
              }}>
                <h3 style={{ color: '#6c5ce7', margin: '0 0 10px 0' }}>Period</h3>
                <p style={{ fontSize: '1.2rem', fontWeight: 'bold', margin: '0', color: '#333' }}>
                  {selectedPeriod === 'all_time' ? 'All Time' : `${new Date(revenueData.startDate).toLocaleDateString()} - ${new Date(revenueData.endDate).toLocaleDateString()}`}
                </p>
              </div>
            </div>

            {/* Revenue by Plan */}
            <div style={{
              backgroundColor: 'white',
              padding: '20px',
              borderRadius: '10px',
              boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
              marginBottom: '30px'
            }}>
              <h3 style={{ color: '#333', marginBottom: '20px' }}>Revenue Breakdown by Plan ({selectedPeriod.replace('_', ' ')})</h3>
              {Object.keys(revenueData.revenueByPlan).length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8f9fa' }}>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Plan Name</th>
                      <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>Revenue (USD)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(revenueData.revenueByPlan).map(([plan, amount], index) => (
                      <tr key={plan} style={{ backgroundColor: index % 2 === 0 ? 'white' : '#f8f9fa' }}>
                        <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6' }}>{plan}</td>
                        <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>{amount.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ textAlign: 'center', color: '#666' }}>No revenue recorded for this period.</p>
              )}
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '50px' }}>
            <p style={{ color: '#666' }}>No revenue data available or an error occurred.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminRevenue;

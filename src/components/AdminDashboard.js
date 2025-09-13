// src/components/AdminDashboard.js

import React, { useState, useEffect, useCallback } from 'react'; // Corrected import
import { useAuth } from '../contexts/AuthContext';
import { fetchUserTranscriptions, deleteTranscription } from '../userService'; 
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore';
import { db } from '../firebase';

const AdminDashboard = () => {
  const { currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [transcriptions, setTranscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalRevenue: 0,
    totalTranscriptions: 0,
    planDistribution: {},
    recentSignups: 0
  });

  // Admin emails
  const ADMIN_EMAILS = ['typemywordz@gmail.com', 'gracenyaitara@gmail.com'];
  const isAdmin = ADMIN_EMAILS.includes(currentUser?.email);

  useEffect(() => {
    if (isAdmin) {
      fetchAdminData();
    }
  }, [isAdmin]);

  const fetchAdminData = async () => {
    try {
      setLoading(true);
      
      // Fetch all users
      const usersRef = collection(db, 'users');
      const usersSnapshot = await getDocs(usersRef);
      const usersData = [];
      usersSnapshot.forEach((doc) => {
        usersData.push({ id: doc.id, ...doc.data() });
      });

      // Fetch all transcriptions
      const transcriptionsRef = collection(db, 'transcriptions');
      const transcriptionsSnapshot = await getDocs(transcriptionsRef);
      const transcriptionsData = [];
      transcriptionsSnapshot.forEach((doc) => {
        transcriptionsData.push({ id: doc.id, ...doc.data() });
      });

      setUsers(usersData);
      setTranscriptions(transcriptionsData);
      
      // Calculate statistics
      calculateStats(usersData, transcriptionsData);
      
    } catch (error) {
      console.error('Error fetching admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (usersData, transcriptionsData) => {
    const planDistribution = {};
    let totalRevenue = 0;
    let recentSignups = 0;
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    usersData.forEach(user => {
      // Plan distribution
      planDistribution[user.plan] = (planDistribution[user.plan] || 0) + 1;
      
      // Revenue calculation (assuming a simple model for now)
      // For now, let's set a placeholder price for admin display
      const planPrice = user.plan === 'business' ? 20 : 0; // Placeholder price for business plan
      totalRevenue += planPrice;
      
      // Recent signups (last 7 days)
      if (user.createdAt && user.createdAt.toDate() > oneWeekAgo) {
        recentSignups++;
      }
    });

    setStats({
      totalUsers: usersData.length,
      totalRevenue: totalRevenue,
      totalTranscriptions: transcriptionsData.length,
      planDistribution,
      recentSignups
    });
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    return timestamp.toDate().toLocaleDateString();
  };

  const exportUserData = () => {
    const csvContent = [
      ['Email', 'Plan', 'Monthly Minutes', 'Total Minutes', 'Created At', 'Last Active'].join(','),
      ...users.map(user => [
        user.email,
        user.plan,
        user.monthlyMinutes || 0, // Default to 0 if null/undefined
        user.totalMinutes || 0, // Default to 0 if null/undefined
        formatDate(user.createdAt),
        formatDate(user.lastActive)
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'typemywordz-users.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isAdmin) {
    return (
      <div style={{ 
        padding: '50px', 
        textAlign: 'center',
        backgroundColor: '#f8f9fa',
        minHeight: '100vh'
      }}>
        <h2 style={{ color: '#dc3545' }}>⛔ Access Denied</h2>
        <p>You don't have permission to view the admin dashboard.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ 
        padding: '50px', 
        textAlign: 'center',
        backgroundColor: '#f8f9fa',
        minHeight: '100vh'
      }}>
        <h2>📊 Loading Admin Dashboard...</h2>
      </div>
    );
  }

  return (
    <div style={{ 
      backgroundColor: '#f8f9fa',
      minHeight: '100vh',
      padding: '20px'
    }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <header style={{ 
          textAlign: 'center', 
          marginBottom: '30px',
          padding: '20px',
          backgroundColor: 'white',
          borderRadius: '10px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
        }}>
          <h1 style={{ color: '#6c5ce7', margin: '0 0 10px 0' }}>
            👑 TypeMyworDz Admin Dashboard
          </h1>
          <p style={{ color: '#666', margin: '0' }}>
            Business Overview & User Management
          </p>
        </header>

        {/* Stats Cards */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
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
            <h3 style={{ color: '#007bff', margin: '0 0 10px 0' }}>👥 Total Users</h3>
            <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0', color: '#333' }}>
              {stats.totalUsers}
            </p>
          </div>

          <div style={{ 
            backgroundColor: 'white', 
            padding: '20px', 
            borderRadius: '10px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            textAlign: 'center'
          }}>
            <h3 style={{ color: '#28a745', margin: '0 0 10px 0' }}>💰 Monthly Revenue</h3>
            <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0', color: '#333' }}>
              ${stats.totalRevenue.toFixed(2)}
            </p>
          </div>

          <div style={{ 
            backgroundColor: 'white', 
            padding: '20px', 
            borderRadius: '10px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            textAlign: 'center'
          }}>
            <h3 style={{ color: '#6c5ce7', margin: '0 0 10px 0' }}>📄 Total Transcriptions</h3>
            <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0', color: '#333' }}>
              {stats.totalTranscriptions}
            </p>
          </div>

          <div style={{ 
            backgroundColor: 'white', 
            padding: '20px', 
            borderRadius: '10px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ color: '#ffc107', margin: '0 0 10px 0' }}>🆕 New Users (7 days)</h3>
            <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0', color: '#333' }}>
              {stats.recentSignups}
            </p>
          </div>
        </div>

        {/* Plan Distribution */}
        <div style={{ 
          backgroundColor: 'white', 
          padding: '20px', 
          borderRadius: '10px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          marginBottom: '30px'
        }}>
          <h3 style={{ color: '#333', marginBottom: '20px' }}>📊 Plan Distribution</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' }}>
            {Object.entries(stats.planDistribution).map(([plan, count]) => (
              <div key={plan} style={{ 
                padding: '15px', 
                backgroundColor: '#f8f9fa', 
                borderRadius: '8px',
                textAlign: 'center'
              }}>
                <h4 style={{ margin: '0 0 5px 0', textTransform: 'capitalize' }}>{plan}</h4>
                <p style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: '0' }}>{count}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Export Button */}
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <button
            onClick={exportUserData}
            style={{
              padding: '12px 30px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '16px',
              boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
            }}
          >
            📥 Export User Data (CSV)
          </button>
        </div>

        {/* Users Table */}
        <div style={{ 
          backgroundColor: 'white', 
          padding: '20px', 
          borderRadius: '10px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          overflowX: 'auto'
        }}>
          <h3 style={{ color: '#333', marginBottom: '20px' }}>👥 All Users</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Email</th>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Plan</th>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Usage</th>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Total Minutes</th>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Joined</th>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Last Active</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, index) => (
                <tr key={user.id} style={{ 
                  backgroundColor: index % 2 === 0 ? 'white' : '#f8f9fa'
                }}>
                  <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6' }}>
                    {user.email}
                    {ADMIN_EMAILS.includes(user.email) && (
                      <span style={{ 
                        marginLeft: '5px', 
                        fontSize: '12px', 
                        backgroundColor: '#ffc107', 
                        color: 'black',
                        padding: '2px 6px', 
                        borderRadius: '3px' 
                      }}>
                        ADMIN
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6' }}>
                    <span style={{ 
                      textTransform: 'capitalize',
                      backgroundColor: user.plan === 'free' ? '#6c757d' : '#007bff',
                      color: 'white',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px'
                    }}>
                      {user.plan}
                    </span>
                  </td>
                  <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6' }}>
                    {user.monthlyMinutes || 0} / {user.plan === 'business' ? 'Unlimited' : 30}
                  </td>
                  <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6' }}>
                    {user.totalMinutes || 0}
                  </td>
                  <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6' }}>
                    {formatDate(user.createdAt)}
                  </td>
                  <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6' }}>
                    {formatDate(user.lastActive)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
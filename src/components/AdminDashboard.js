// src/components/AdminDashboard.js

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchAllUsers, fetchUserTranscriptions } from '../userService'; // Removed getMonthlyRevenue
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore';
import { db } from '../firebase';
// ADDED: Import AdminAIFormatter
import AdminAIFormatter from './AdminAIFormatter';
// REMOVED: Import AdminRevenue component

const AdminDashboard = ({ showMessage, latestTranscription }) => { // Removed monthlyRevenue prop
  const { currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [transcriptions, setTranscriptions] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview'); 
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalTranscriptions: 0,
    totalMinutesTranscribed: 0,
    planDistribution: {},
    recentSignups: 0,
    totalRevenueCounter: 0, // NEW: Real-time revenue counter
    activePaidUsers: 0 // NEW: Active paid users counter
  });

  // Define plan prices for the real-time revenue counter
  const PLAN_PRICES_USD = {
    'One-Day Plan': 1.00,
    'Three-Day Plan': 2.00,
    'One-Week Plan': 3.00,
    'Monthly Plan': 9.99,
    'Yearly Plan': 99.99,
    'free': 0.00 // Free plan contributes 0 to revenue
  };

  // Admin emails
  const ADMIN_EMAILS = ['typemywordz@gmail.com', 'gracenyaitara@gmail.com'];
  const isAdmin = ADMIN_EMAILS.includes(currentUser?.email);

  const fetchAdminData = useCallback(async () => {
    try {
      setLoading(true);
      
      if (!currentUser || !currentUser.email) {
        throw new Error("Admin user not identified.");
      }

      const usersData = await fetchAllUsers();
      setUsers(usersData);

      const transcriptionsRef = collection(db, 'transcriptions');
      const transcriptionsSnapshot = await getDocs(transcriptionsRef);
      const transcriptionsData = [];
      let totalDurationSeconds = 0;
      transcriptionsSnapshot.forEach((doc) => {
        const transcriptionData = doc.data();
        transcriptionsData.push({ id: doc.id, ...transcriptionData });
        totalDurationSeconds += transcriptionData.duration || 0;
      });
      setTranscriptions(transcriptionsData);
      
      const planDistribution = {};
      let recentSignups = 0;
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      let currentTotalRevenueCounter = 0; // Initialize revenue counter
      let currentActivePaidUsers = 0; // Initialize active paid users counter
      const now = new Date();

      usersData.forEach(user => {
        planDistribution[user.plan] = (planDistribution[user.plan] || 0) + 1;
        
        if (user.createdAt && user.createdAt.toDate) {
          const userCreatedAt = user.createdAt.toDate();
          if (userCreatedAt > oneWeekAgo) {
            recentSignups++;
          }
        } else if (user.createdAt && new Date(user.createdAt) > oneWeekAgo) {
          recentSignups++;
        }

        // Calculate real-time revenue and active paid users
        if (user.plan !== 'free') {
          // Check if the plan is currently active or considered 'unlimited' for long-term plans
          let isActive = false;
          if (user.expiresAt && user.expiresAt.toDate) {
            isActive = user.expiresAt.toDate() > now;
          } else if (user.expiresAt && new Date(user.expiresAt) > now) {
            isActive = true;
          } else if (user.plan === 'Monthly Plan' || user.plan === 'Yearly Plan') {
            // For monthly/yearly plans, if expiresAt is not clearly past, consider active
            // This is a simplification; a more robust check would involve subscription status
            isActive = true; 
          }

          if (isActive) {
            currentTotalRevenueCounter += PLAN_PRICES_USD[user.plan] || 0;
            currentActivePaidUsers++;
          }
        }
      });

      setStats({
        totalUsers: usersData.length,
        totalTranscriptions: transcriptionsData.length,
        totalMinutesTranscribed: Math.round(totalDurationSeconds / 60),
        planDistribution,
        recentSignups,
        totalRevenueCounter: currentTotalRevenueCounter, // Set real-time revenue
        activePaidUsers: currentActivePaidUsers // Set active paid users
      });
      
    } catch (error) {
      console.error('Error fetching admin data:', error);
      if (showMessage) {
        showMessage('Error loading admin data: ' + error.message, 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [currentUser, showMessage]);

  useEffect(() => {
    if (isAdmin) {
      fetchAdminData();
    }
  }, [isAdmin, fetchAdminData]);

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = timestamp instanceof Date ? timestamp : (timestamp.toDate ? timestamp.toDate() : new Date(timestamp));
    return date.toLocaleDateString();
  };

  const exportUserData = () => {
    const csvContent = [
      ['Email', 'Plan', 'Usage (mins)', 'Expires At', 'Total Minutes Transcribed', 'Total Transcripts', 'Joined', 'Last Active'].join(','),
      ...users.map(user => [
        user.email,
        user.plan,
        user.totalMinutesUsed || 0,
        user.expiresAt ? formatDate(user.expiresAt) : 'N/A',
        user.totalMinutesTranscribedByUser || 0,
        user.totalTranscriptsByUser || 0,
        formatDate(user.createdAt),
        formatDate(user.lastAccessed)
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
      <div style={{ maxWidth: '1200px', margin: '0 auto' }} >
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
            Business Overview &amp; User Management
          </p>
        </header>

        {/* Tab Navigation */}
        <div style={{ marginBottom: '30px', textAlign: 'center' }}>
          <button
            onClick={() => setActiveTab('overview')}
            style={{
              padding: '10px 20px',
              margin: '0 10px',
              backgroundColor: activeTab === 'overview' ? '#6c5ce7' : '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '20px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            📊 Overview
          </button>
          <button
            onClick={() => setActiveTab('users')}
            style={{
              padding: '10px 20px',
              margin: '0 10px',
              backgroundColor: activeTab === 'users' ? '#6c5ce7' : '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '20px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            👥 Users
          </button>
          <button
            onClick={() => setActiveTab('aiFormatter')}
            style={{
              padding: '10px 20px',
              margin: '0 10px',
              backgroundColor: activeTab === 'aiFormatter' ? '#6c5ce7' : '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '20px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            🤖 AI Formatter
          </button>
          {/* REMOVED: Revenue Tab button */}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <>
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

              {/* NEW: Total Revenue (Active Subscriptions) Card */}
              <div style={{ 
                backgroundColor: 'white', 
                padding: '20px', 
                borderRadius: '10px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                textAlign: 'center'
              }}>
                <h3 style={{ color: '#28a745', margin: '0 0 10px 0' }}>💰 Total Revenue (Active)</h3>
                <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0', color: '#333' }}>
                  USD {stats.totalRevenueCounter.toFixed(2)}
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

              {/* NEW: Active Paid Users Card (repurposed from Transactions) */}
              <div style={{ 
                backgroundColor: 'white', 
                padding: '20px', 
                borderRadius: '10px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                textAlign: 'center'
              }}>
                <h3 style={{ color: '#ffc107', margin: '0 0 10px 0' }}>✅ Active Paid Users</h3>
                <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0', color: '#333' }}>
                  {stats.activePaidUsers}
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
                  boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
                }}
              >
                📥 Export User Data (CSV)
              </button>
            </div>
          </>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
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
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Usage (mins)</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Expires At</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Total Mins Transcribed</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Total Transcripts</th>
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
                      {user.plan === 'free'
                        ? `${user.totalMinutesUsed || 0} / 30`
                        : 'Unlimited'
                      }
                    </td>
                    <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6' }}>
                      {user.expiresAt ? formatDate(user.expiresAt) : 'N/A'}
                    </td>
                    <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6' }}>{user.totalMinutesTranscribedByUser || 0}</td>
                    <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6' }}>{user.totalTranscriptsByUser || 0}</td>
                    <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6' }}>
                      {formatDate(user.createdAt)}
                    </td>
                    <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6' }}>
                      {formatDate(user.lastAccessed)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div> 
        )}

        {/* AI Formatter Tab */}
        {activeTab === 'aiFormatter' && (
          <AdminAIFormatter showMessage={showMessage} latestTranscription={latestTranscription} />
        )}

        {/* REMOVED: Revenue Tab content */}
      </div> 
    </div> 
  );
};

export default AdminDashboard;

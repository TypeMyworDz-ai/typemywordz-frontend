// src/components/AdminDashboard.js

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchAllUsers, fetchUserTranscriptions, getMonthlyRevenue } from '../userService'; // Import fetchAllUsers and getMonthlyRevenue
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore';
import { db } from '../firebase';
// ADDED: Import AdminAIFormatter
import AdminAIFormatter from './AdminAIFormatter';
// NEW: Import AdminRevenue component
import AdminRevenue from './AdminRevenue';

const AdminDashboard = ({ showMessage, monthlyRevenue: propMonthlyRevenue }) => { // Added showMessage and propMonthlyRevenue props
  const { currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [transcriptions, setTranscriptions] = useState([]); // This state is not directly used for the table anymore, but kept for other potential uses
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview'); // Added activeTab state
  const [stats, setStats] = useState({
    totalUsers: 0,
    // REMOVED: monthlyRevenue: 0, // Removed from stats as it has its own dedicated tab
    totalTranscriptions: 0,
    totalMinutesTranscribed: 0, // NEW: Added for total minutes
    planDistribution: {},
    recentSignups: 0
  });

  // Admin emails
  const ADMIN_EMAILS = ['typemywordz@gmail.com', 'gracenyaitara@gmail.com'];
  const isAdmin = ADMIN_EMAILS.includes(currentUser?.email);

  const fetchAdminData = useCallback(async () => { // Made fetchAdminData a useCallback
    try {
      setLoading(true);
      
      if (!currentUser || !currentUser.email) {
        throw new Error("Admin user not identified.");
      }

      // Fetch all users using the new fetchAllUsers which includes aggregated transcription data
      const usersData = await fetchAllUsers();
      setUsers(usersData);

      // Fetch all transcriptions (still useful for total count and duration for overview)
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
      
      // Calculate statistics
      const planDistribution = {};
      // REMOVED: fetchedMonthlyRevenue as it's now handled by the AdminRevenue component
      let recentSignups = 0;
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      usersData.forEach(user => {
        // Plan distribution
        planDistribution[user.plan] = (planDistribution[user.plan] || 0) + 1;
        
        // Recent signups (last 7 days)
        if (user.createdAt && user.createdAt.toDate) { // Check if it's a Firestore Timestamp
          const userCreatedAt = user.createdAt.toDate();
          if (userCreatedAt > oneWeekAgo) {
            recentSignups++;
          }
        } else if (user.createdAt && new Date(user.createdAt) > oneWeekAgo) { // Fallback for plain Date strings
          recentSignups++;
        }
      });

      setStats({
        totalUsers: usersData.length,
        // REMOVED: monthlyRevenue: fetchedMonthlyRevenue, // Removed from stats
        totalTranscriptions: transcriptionsData.length,
        totalMinutesTranscribed: Math.round(totalDurationSeconds / 60), // Set total minutes
        planDistribution,
        recentSignups
      });
      
    } catch (error) {
      console.error('Error fetching admin data:', error);
      if (showMessage) {
        showMessage('Error loading admin data: ' + error.message, 'error'); // Changed message type
      }
    } finally {
      setLoading(false);
    }
  }, [currentUser, showMessage]); // Added currentUser and showMessage to dependencies

  useEffect(() => {
    if (isAdmin) {
      fetchAdminData();
    }
  }, [isAdmin, fetchAdminData]); // Added fetchAdminData to dependencies

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    // Ensure timestamp is a Date object
    const date = timestamp instanceof Date ? timestamp : (timestamp.toDate ? timestamp.toDate() : new Date(timestamp));
    return date.toLocaleDateString();
  };

  const exportUserData = () => {
    const csvContent = [
      ['Email', 'Plan', 'Usage (mins)', 'Expires At', 'Total Minutes Transcribed', 'Total Transcripts', 'Joined', 'Last Active'].join(','), // UPDATED headers
      ...users.map(user => [
        user.email,
        user.plan,
        user.totalMinutesUsed || 0, // Use totalMinutesUsed
        user.expiresAt ? formatDate(user.expiresAt) : 'N/A', // NEW: Expires At
        user.totalMinutesTranscribedByUser || 0, // NEW: Total Minutes Transcribed
        user.totalTranscriptsByUser || 0, // NEW: Total Transcripts
        formatDate(user.createdAt),
        formatDate(user.lastAccessed) // Use lastAccessed
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
          {/* NEW: Revenue Tab */}
          <button
            onClick={() => setActiveTab('revenue')}
            style={{
              padding: '10px 20px',
              margin: '0 10px',
              backgroundColor: activeTab === 'revenue' ? '#28a745' : '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '20px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            💰 Revenue
          </button>
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

              {/* REMOVED: Monthly Revenue Card as it has its own dedicated tab */}
              {/*
              <div style={{ 
                backgroundColor: 'white', 
                padding: '20px', 
                borderRadius: '10px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                textAlign: 'center'
              }}>
                <h3 style={{ color: '#28a745', margin: '0 0 10px 0' }}>💰 Monthly Revenue</h3>
                <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0', color: '#333' }}>
                  USD {stats.monthlyRevenue.toFixed(2)}
                </p>
              </div>
              */}

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
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                textAlign: 'center'
              }}>
                <h3 style={{ color: '#ffc107', margin: '0 0 10px 0' }} >🆕 New Users (7 days)</h3>
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
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Usage (mins)</th> {/* UPDATED Header */}
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Expires At</th> {/* NEW Header */}
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Total Mins Transcribed</th> {/* NEW Header */}
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Total Transcripts</th> {/* NEW Header */}
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
                        : 'Unlimited' // Paid plans have unlimited usage
                      }
                    </td>
                    <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6' }}> {/* NEW: Expires At column */}
                      {user.expiresAt ? formatDate(user.expiresAt) : 'N/A'}
                    </td>
                    <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6' }}>{user.totalMinutesTranscribedByUser || 0}</td> {/* NEW: Total Minutes Transcribed */}
                    <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6' }}>{user.totalTranscriptsByUser || 0}</td> {/* NEW: Total Transcripts */}
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
          <AdminAIFormatter showMessage={showMessage} />
        )}

        {/* NEW: Revenue Tab */}
        {activeTab === 'revenue' && (
          <AdminRevenue showMessage={showMessage} />
        )}
      </div> 
    </div> 
  );
};

export default AdminDashboard;

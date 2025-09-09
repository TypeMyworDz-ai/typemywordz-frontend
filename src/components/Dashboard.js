// src/components/Dashboard.js

import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { PLAN_LIMITS, getUserProfile } from '../userService';

const Dashboard = () => {
  const { currentUser } = useAuth();
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (currentUser) {
        try {
          const profile = await getUserProfile(currentUser.uid);
          setUserProfile(profile);
        } catch (error) {
          console.error('Error fetching user profile:', error);
        } finally {
          setLoading(false);
        }
      }
    };

    fetchUserProfile();
  }, [currentUser]);

  if (loading || !userProfile) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <p>Loading your dashboard...</p>
      </div>
    );
  }

  const currentPlan = PLAN_LIMITS[userProfile.plan];
  const usagePercentage = currentPlan.monthlyMinutes === -1 
    ? 0 
    : Math.min((userProfile.monthlyMinutes / currentPlan.monthlyMinutes) * 100, 100);

  const isNearLimit = usagePercentage > 80;
  const isOverLimit = usagePercentage >= 100;

  return (
    <div style={{ 
      maxWidth: '800px', 
      margin: '20px auto', 
      padding: '20px',
      fontFamily: 'Arial, sans-serif'
    }}>
      {/* Header */}
      <div style={{ 
        textAlign: 'center', 
        marginBottom: '30px',
        padding: '20px',
        backgroundColor: '#f8f9fa',
        borderRadius: '10px'
      }}>
        <h2 style={{ margin: '0 0 10px 0', color: '#333' }}>
          Welcome to your Dashboard!
        </h2>
        <p style={{ margin: '0', color: '#666' }}>
          {currentUser.email}
        </p>
      </div>

      {/* Current Plan Card */}
      <div style={{ 
        border: '2px solid #007bff', 
        borderRadius: '10px', 
        padding: '20px', 
        marginBottom: '20px',
        backgroundColor: 'white'
      }}>
        <h3 style={{ margin: '0 0 15px 0', color: '#007bff' }}>
          Current Plan: {currentPlan.name}
        </h3>
        <p style={{ margin: '0 0 10px 0', fontSize: '18px' }}>
          <strong>
            {currentPlan.monthlyMinutes === -1 
              ? 'Unlimited minutes' 
              : `${currentPlan.monthlyMinutes} minutes per month`
            }
          </strong>
        </p>
        <p style={{ margin: '0', color: '#666' }}>
          Price: {currentPlan.price === 0 ? 'Free' : `$${currentPlan.price}/month`}
        </p>
      </div>

      {/* Usage Meter */}
      <div style={{ 
        border: '1px solid #ddd', 
        borderRadius: '10px', 
        padding: '20px', 
        marginBottom: '20px',
        backgroundColor: 'white'
      }}>
        <h3 style={{ margin: '0 0 15px 0', color: '#333' }}>
          This Month's Usage
        </h3>
        
        <div style={{ marginBottom: '15px' }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            marginBottom: '5px' 
          }}>
            <span>Minutes Used:</span>
            <span>
              <strong>
                {userProfile.monthlyMinutes} / {
                  currentPlan.monthlyMinutes === -1 
                    ? '∞' 
                    : currentPlan.monthlyMinutes
                }
              </strong>
            </span>
          </div>
          
          {/* Progress Bar */}
          {currentPlan.monthlyMinutes !== -1 && (
            <div style={{ 
              width: '100%', 
              height: '20px', 
              backgroundColor: '#e9ecef', 
              borderRadius: '10px',
              overflow: 'hidden'
            }}>
              <div style={{ 
                width: `${Math.min(usagePercentage, 100)}%`, 
                height: '100%', 
                backgroundColor: isOverLimit ? '#dc3545' : isNearLimit ? '#ffc107' : '#28a745',
                transition: 'width 0.3s ease'
              }} />
            </div>
          )}
        </div>

        {/* Usage Warnings */}
        {isOverLimit && (
          <div style={{ 
            backgroundColor: '#f8d7da', 
            color: '#721c24', 
            padding: '10px', 
            borderRadius: '5px',
            marginTop: '10px'
          }}>
            ⚠️ You've exceeded your monthly limit! Upgrade to continue transcribing.
          </div>
        )}
        
        {isNearLimit && !isOverLimit && (
          <div style={{ 
            backgroundColor: '#fff3cd', 
            color: '#856404', 
            padding: '10px', 
            borderRadius: '5px',
            marginTop: '10px'
          }}>
            ⚡ You're running low on minutes! Consider upgrading soon.
          </div>
        )}

        <p style={{ margin: '10px 0 0 0', color: '#666', fontSize: '14px' }}>
          Total minutes transcribed: <strong>{userProfile.totalMinutes}</strong>
        </p>
      </div>

      {/* Upgrade Options */}
      {userProfile.plan !== 'business' && (
        <div style={{ 
          border: '1px solid #28a745', 
          borderRadius: '10px', 
          padding: '20px', 
          backgroundColor: '#f8fff9'
        }}>
          <h3 style={{ margin: '0 0 15px 0', color: '#28a745' }}>
            🚀 Upgrade Your Plan
          </h3>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
            gap: '15px' 
          }}>
            {Object.entries(PLAN_LIMITS).map(([planKey, plan]) => {
              if (planKey === userProfile.plan) return null;
              
              return (
                <div key={planKey} style={{ 
                  border: '1px solid #ddd', 
                  borderRadius: '8px', 
                  padding: '15px',
                  backgroundColor: 'white',
                  textAlign: 'center'
                }}>
                  <h4 style={{ margin: '0 0 10px 0', color: '#333' }}>
                    {plan.name}
                  </h4>
                  <p style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: 'bold' }}>
                    {plan.price === 0 ? 'Free' : `$${plan.price}/month`}
                  </p>
                  <p style={{ margin: '0 0 15px 0', color: '#666' }}>
                    {plan.monthlyMinutes === -1 
                      ? 'Unlimited minutes' 
                      : `${plan.monthlyMinutes} minutes/month`
                    }
                  </p>
                  <button
                    style={{
                      width: '100%',
                      padding: '8px 16px',
                      backgroundColor: '#007bff',
                      color: 'white',
                      border: 'none',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                    onClick={() => alert(`Upgrade to ${plan.name} coming soon!`)}
                  >
                    Upgrade Now
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
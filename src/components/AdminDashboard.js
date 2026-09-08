import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import {
  getMonthlyRevenue,
  markFeedbackRead,
} from '../userService';
import { db } from '../firebase';
import { ADMIN_EMAILS, isAdminEmail, isCompAccessEmail } from '../adminEmails';
import { fetchCreditBalance, isOnCreditsOnly } from '../creditsService';
import AdminAIFormatter from './AdminAIFormatter';
import ConfirmDialog from './ConfirmDialog';
import './AdminDashboard.css';

const BACKEND_URL =
  process.env.REACT_APP_RAILWAY_BACKEND_URL ||
  'https://backendforrailway-production-7128.up.railway.app';

const toDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDate = (value, includeTime = false) => {
  const date = toDate(value);
  if (!date) return 'Not recorded';
  return date.toLocaleDateString(undefined, includeTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'medium' });
};

const finiteNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const formatNumber = (value) => finiteNumber(value).toLocaleString();

const countBy = (items, key) => items.reduce((counts, item) => {
  const label = item[key] || 'Unknown';
  counts[label] = (counts[label] || 0) + 1;
  return counts;
}, {});

const topEntry = (counts) => Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || null;

const readCollection = async (name) => {
  try {
    const snapshot = await getDocs(collection(db, name));
    return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  } catch (error) {
    console.warn(`Admin collection ${name} could not be read:`, error);
    return [];
  }
};

// A slow credit service must not hold the entire admin page hostage. The
// balance is helpful context, but the dashboard can still show the account
// and its Firestore history when the service is temporarily unavailable.
const readBalanceSafely = async (uid, email) => {
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 7000));
  return Promise.race([fetchCreditBalance(uid, email), timeout]);
};

const accessLabel = (user) => {
  if (isAdminEmail(user.email)) return { text: 'Admin access', tone: 'ai' };
  if (isCompAccessEmail(user.email)) return { text: 'Complimentary', tone: 'ai' };
  if (user.balance?.planActive && user.plan !== 'free') return { text: user.plan, tone: 'action' };
  if (isOnCreditsOnly(user.balance, user)) return { text: 'Credits only', tone: 'action' };
  if (user.plan === 'free' && !user.hasReceivedInitialFreeMinutes) return { text: 'Free trial', tone: 'warn' };
  return { text: 'Free plan', tone: '' };
};

const creditLabel = (user) => {
  if (user.balance?.exempt || user.balance?.unlimited || isAdminEmail(user.email) || isCompAccessEmail(user.email)) {
    return 'No limit';
  }
  if (!user.balance) return 'Not available';
  const spendable = finiteNumber(user.balance.spendable);
  const frozen = finiteNumber(user.balance.frozen);
  return `${formatNumber(spendable)} available${frozen ? ` · ${formatNumber(frozen)} held` : ''}`;
};

const planExpiry = (user) => user.balance?.planCreditsExpireAt || user.expiresAt;

const AdminDashboard = ({ showMessage, latestTranscription }) => {
  const { currentUser } = useAuth();
  const isAdmin = isAdminEmail(currentUser?.email);
  const [activeTab, setActiveTab] = useState('overview');
  const [users, setUsers] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [traffic, setTraffic] = useState([]);
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    activePaidUsers: 0,
    totalTranscriptions: 0,
    totalMinutesTranscribed: 0,
    recentRevenue: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const fetchAdminData = useCallback(async () => {
    if (!currentUser?.email || !isAdminEmail(currentUser.email)) return;
    setRefreshing(true);
    try {
      // Read each collection once. The previous implementation called
      // fetchAllUsers(), which fetched every transcription, and then fetched
      // every transcription again for the dashboard totals.
      const [rawUsers, transcriptions, feedbackRows, trafficRows, revenue] = await Promise.all([
        readCollection('users'),
        readCollection('transcriptions'),
        readCollection('feedback'),
        readCollection('trafficEvents'),
        getMonthlyRevenue(),
      ]);

      const transcriptionStats = transcriptions.reduce((byUser, item) => {
        const key = item.userId;
        if (!key) return byUser;
        if (!byUser[key]) byUser[key] = { totalMinutesTranscribed: 0, totalTranscripts: 0 };
        const seconds = Number(item.duration);
        if (Number.isFinite(seconds) && seconds > 0) {
          byUser[key].totalMinutesTranscribed += Math.ceil(seconds / 60);
        }
        byUser[key].totalTranscripts += 1;
        return byUser;
      }, {});

      const enrichedUsers = await Promise.all(rawUsers.map(async (user) => {
        const totals = transcriptionStats[user.uid || user.id] || { totalMinutesTranscribed: 0, totalTranscripts: 0 };
        const balance = await readBalanceSafely(user.uid || user.id, user.email);
        return {
          ...user,
          balance,
          totalMinutesTranscribedByUser: totals.totalMinutesTranscribed,
          totalTranscriptsByUser: totals.totalTranscripts,
        };
      }));

      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 86400000);
      const totalMinutes = transcriptions.reduce((total, item) => {
        const seconds = Number(item.duration);
        return Number.isFinite(seconds) && seconds > 0 ? total + Math.ceil(seconds / 60) : total;
      }, 0);

      setUsers(enrichedUsers);
      setFeedback(feedbackRows.sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0)));
      setTraffic(trafficRows);
      setStats({
        totalUsers: enrichedUsers.length,
        activeUsers: enrichedUsers.filter((user) => (toDate(user.lastAccessed)?.getTime() || 0) >= oneWeekAgo.getTime()).length,
        activePaidUsers: enrichedUsers.filter((user) => user.balance?.planActive || isOnCreditsOnly(user.balance, user) || isAdminEmail(user.email) || isCompAccessEmail(user.email)).length,
        totalTranscriptions: transcriptions.length,
        totalMinutesTranscribed: totalMinutes,
        recentRevenue: finiteNumber(revenue),
      });
    } catch (error) {
      console.error('Error loading admin data:', error);
      showMessage?.(`Admin data could not be loaded: ${error.message}`, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentUser, showMessage]);

  useEffect(() => {
    if (isAdmin) fetchAdminData();
  }, [isAdmin, fetchAdminData]);

  const trafficSnapshot = useMemo(() => {
    const cutoff = Date.now() - 30 * 86400000;
    const recent = traffic.filter((event) => (toDate(event.createdAt)?.getTime() || 0) >= cutoff);
    const visitors = new Set(recent.map((event) => event.visitorId).filter(Boolean));
    const pages = countBy(recent, 'page');
    const sources = countBy(recent, 'source');
    const daily = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (6 - index));
      const next = new Date(date.getTime() + 86400000);
      return {
        label: date.toLocaleDateString(undefined, { weekday: 'short' }),
        count: recent.filter((event) => {
          const time = toDate(event.createdAt)?.getTime() || 0;
          return time >= date.getTime() && time < next.getTime();
        }).length,
      };
    });
    return {
      recent,
      visitors: visitors.size,
      pageViews: recent.length,
      topPage: topEntry(pages),
      topSource: topEntry(sources),
      daily,
    };
  }, [traffic]);

  const planDistribution = useMemo(() => countBy(users.map((user) => ({ plan: accessLabel(user).text })), 'plan'), [users]);
  const unreadFeedback = feedback.filter((item) => !item.readAt).length;
  const maxDaily = Math.max(1, ...trafficSnapshot.daily.map((item) => item.count));

  const filteredUsers = users.filter((user) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return `${user.email} ${user.name || ''} ${accessLabel(user).text}`.toLowerCase().includes(needle);
  });

  const exportUserData = () => {
    const rows = [
      ['Email', 'Access', 'Credits available', 'Credits held', 'Plan expiry', 'Total minutes', 'Transcripts', 'Joined', 'Last active'],
      ...users.map((user) => [
        user.email,
        accessLabel(user).text,
        user.balance?.spendable ?? '',
        user.balance?.frozen ?? '',
        formatDate(planExpiry(user)),
        Number.isFinite(Number(user.totalMinutesTranscribedByUser)) ? user.totalMinutesTranscribedByUser : '',
        user.totalTranscriptsByUser || 0,
        formatDate(user.createdAt),
        formatDate(user.lastAccessed),
      ]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'typemywordz-admin-users.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteUser = async () => {
    if (!confirmingDelete || !currentUser) return;
    setDeleteBusy(true);
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`${BACKEND_URL}/api/admin/delete-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: confirmingDelete.email, uid: confirmingDelete.uid || confirmingDelete.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || 'The account could not be deleted.');
      showMessage?.(`${confirmingDelete.email} was removed.`, 'success');
      setConfirmingDelete(null);
      await fetchAdminData();
    } catch (error) {
      showMessage?.(`The account was not removed: ${error.message}`, 'error');
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleReadFeedback = async (item) => {
    if (item.readAt) return;
    try {
      await markFeedbackRead(item.id);
      setFeedback((current) => current.map((row) => row.id === item.id ? { ...row, readAt: new Date() } : row));
    } catch (error) {
      showMessage?.('This feedback could not be marked as read.', 'error');
    }
  };

  if (!isAdmin) {
    return <div className="tm-admin-denied"><h2>Admin access only</h2><p>This area is reserved for authorised TypeMyworDz administrators.</p></div>;
  }

  if (loading) {
    return <div className="tm-admin-loading"><h2>Preparing your dashboard</h2><p>Gathering users, usage, traffic and support messages.</p></div>;
  }

  return (
    <div className="tm-admin-shell">
      <div className="tm-admin-inner">
        <header className="tm-admin-head">
          <div>
            <p className="tm-admin-kicker">Operations</p>
            <h1 className="tm-admin-title">TypeMyworDz admin</h1>
            <p className="tm-admin-sub">A clear view of the people, work and questions behind the app.</p>
          </div>
          <button type="button" className="tm-admin-refresh" onClick={fetchAdminData} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh data'}</button>
        </header>

        <div className="tm-admin-tabs" role="tablist" aria-label="Admin sections">
          {[
            ['overview', 'Overview'],
            ['users', 'Users'],
            ['support', `Support${unreadFeedback ? ` · ${unreadFeedback}` : ''}`],
            ['aiFormatter', 'AI formatter'],
          ].map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={activeTab === id} className="tm-admin-tab" onClick={() => setActiveTab(id)}>{label}</button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <>
            <div className="tm-admin-grid">
              <div className="tm-admin-stat"><div className="tm-admin-stat-label">People with accounts</div><div className="tm-admin-stat-value">{formatNumber(stats.totalUsers)}</div><div className="tm-admin-stat-note">All roles in the AI app</div></div>
              <div className="tm-admin-stat"><div className="tm-admin-stat-label">Active this week</div><div className="tm-admin-stat-value">{formatNumber(stats.activeUsers)}</div><div className="tm-admin-stat-note">Signed in during the last 7 days</div></div>
              <div className="tm-admin-stat"><div className="tm-admin-stat-label">Paid or complimentary access</div><div className="tm-admin-stat-value">{formatNumber(stats.activePaidUsers)}</div><div className="tm-admin-stat-note">Plans, purchased credits or exemptions</div></div>
              <div className="tm-admin-stat"><div className="tm-admin-stat-label">Feedback waiting</div><div className="tm-admin-stat-value">{formatNumber(unreadFeedback)}</div><div className="tm-admin-stat-note">Open the Support section to reply</div></div>
            </div>

            <div className="tm-admin-columns">
              <section className="tm-admin-panel">
                <div className="tm-admin-panel-head"><div><h2 className="tm-admin-panel-title">Traffic, last 30 days</h2><p className="tm-admin-panel-note">Anonymous in-app telemetry: visitors, pages and referring sources.</p></div><a className="tm-admin-link" href="https://analytics.google.com/" target="_blank" rel="noreferrer">Open Google Analytics</a></div>
                <div className="tm-admin-grid">
                  <div className="tm-admin-stat"><div className="tm-admin-stat-label">Visitors</div><div className="tm-admin-stat-value">{formatNumber(trafficSnapshot.visitors)}</div></div>
                  <div className="tm-admin-stat"><div className="tm-admin-stat-label">Page views</div><div className="tm-admin-stat-value">{formatNumber(trafficSnapshot.pageViews)}</div></div>
                </div>
                {trafficSnapshot.pageViews ? <>
                  <div className="tm-admin-list"><div className="tm-admin-list-row"><div className="tm-admin-list-main"><strong>Most visited page</strong><span>{trafficSnapshot.topPage?.[0]}</span></div><div className="tm-admin-list-value">{trafficSnapshot.topPage?.[1]}</div></div><div className="tm-admin-list-row"><div className="tm-admin-list-main"><strong>Top source</strong><span>{trafficSnapshot.topSource?.[0]}</span></div><div className="tm-admin-list-value">{trafficSnapshot.topSource?.[1]}</div></div></div>
                  <div className="tm-admin-bars" aria-label="Page views over the last seven days">{trafficSnapshot.daily.map((day) => <div className="tm-admin-bar-wrap" key={day.label}><span className="tm-admin-bar-label">{day.label}</span><div className="tm-admin-bar" style={{ height: `${Math.max(2, (day.count / maxDaily) * 100)}%` }} title={`${day.count} page views`} /></div>)}</div>
                </> : <div className="tm-admin-empty">Traffic will appear here as visitors use the app. Google Analytics remains the detailed source for geographic reporting.</div>}
              </section>

              <section className="tm-admin-panel">
                <div className="tm-admin-panel-head"><div><h2 className="tm-admin-panel-title">Account mix</h2><p className="tm-admin-panel-note">Labels now reflect what the account can actually use.</p></div></div>
                <div className="tm-admin-plan-grid">{Object.entries(planDistribution).map(([label, count]) => <div className="tm-admin-plan" key={label}><strong>{label}</strong><span>{count} account{count === 1 ? '' : 's'}</span></div>)}</div>
                <div className="tm-admin-list" style={{ marginTop: 18 }}><div className="tm-admin-list-row"><div className="tm-admin-list-main"><strong>Transcripts completed</strong><span>Across all retained records</span></div><div className="tm-admin-list-value">{formatNumber(stats.totalTranscriptions)}</div></div><div className="tm-admin-list-row"><div className="tm-admin-list-main"><strong>Minutes measured</strong><span>Invalid Infinity durations excluded</span></div><div className="tm-admin-list-value">{formatNumber(stats.totalMinutesTranscribed)}</div></div><div className="tm-admin-list-row"><div className="tm-admin-list-main"><strong>Recorded revenue</strong><span>Payment ledger total</span></div><div className="tm-admin-list-value">${stats.recentRevenue.toFixed(2)}</div></div></div>
              </section>
            </div>
          </>
        )}

        {activeTab === 'users' && (
          <section className="tm-admin-panel tm-admin-table-panel">
            <div className="tm-admin-table-toolbar"><div><h2 className="tm-admin-panel-title">Users and access</h2><p className="tm-admin-panel-note">Credits come from the server ledger; they are not guessed from the plan label.</p></div><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input className="tm-admin-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search email or access" aria-label="Search users" /><button type="button" className="tm-admin-btn" onClick={exportUserData}>Export CSV</button></div></div>
            <div className="tm-admin-table-scroll"><table className="tm-admin-table"><thead><tr><th>Account</th><th>Access</th><th>Credits</th><th>Plan expiry</th><th>Minutes</th><th>Transcripts</th><th>Joined</th><th>Last active</th><th>Action</th></tr></thead><tbody>{filteredUsers.map((user) => { const access = accessLabel(user); const minutes = Number(user.totalMinutesTranscribedByUser); return <tr key={user.id}><td><div className="tm-admin-email">{user.email}{ADMIN_EMAILS.includes(user.email) && <span className="tm-admin-badge ai" style={{ marginLeft: 7 }}>Admin</span>}</div>{user.name && <div className="tm-admin-name">{user.name}</div>}</td><td><span className={`tm-admin-badge ${access.tone}`}>{access.text}</span></td><td>{creditLabel(user)}</td><td>{formatDate(planExpiry(user))}</td><td>{Number.isFinite(minutes) ? formatNumber(minutes) : 'Not measured'}</td><td>{formatNumber(user.totalTranscriptsByUser || 0)}</td><td>{formatDate(user.createdAt)}</td><td>{formatDate(user.lastAccessed)}</td><td>{isAdminEmail(user.email) ? <span className="tm-admin-small">Protected</span> : <button type="button" className="tm-admin-btn tm-admin-btn-danger" onClick={() => setConfirmingDelete(user)}>Remove</button>}</td></tr>; })}</tbody></table>{!filteredUsers.length && <div className="tm-admin-empty">No accounts match that search.</div>}</div>
          </section>
        )}

        {activeTab === 'support' && (
          <section className="tm-admin-panel"><div className="tm-admin-panel-head"><div><h2 className="tm-admin-panel-title">Support and feedback</h2><p className="tm-admin-panel-note">Feedback is saved in Firestore and also emailed to info@typemywordz.ai.</p></div></div>{feedback.length ? <div className="tm-admin-feedback">{feedback.map((item) => <article className={`tm-admin-feedback-card ${item.readAt ? '' : 'unread'}`} key={item.id}><div className="tm-admin-feedback-meta"><div><strong>{item.name || 'Anonymous'}</strong><span>{item.email}</span></div><span>{formatDate(item.createdAt, true)}</span></div><div className="tm-admin-feedback-body">{item.feedback}</div><div className="tm-admin-feedback-actions"><a className="tm-admin-btn" href={`mailto:${item.email}?subject=${encodeURIComponent('Re: TypeMyworDz feedback')}`}>Reply by email</a>{!item.readAt && <button type="button" className="tm-admin-btn" onClick={() => handleReadFeedback(item)}>Mark as read</button>}</div></article>)}</div> : <div className="tm-admin-empty">No feedback has been submitted yet.</div>}</section>
        )}

        {activeTab === 'aiFormatter' && <AdminAIFormatter showMessage={showMessage} latestTranscription={latestTranscription} />}
      </div>
      <ConfirmDialog open={Boolean(confirmingDelete)} title="Remove this account?" body={confirmingDelete ? `${confirmingDelete.email} will lose access, its profile will be removed, and its saved transcripts and Ask chats will be deleted. This cannot be undone.` : ''} confirmLabel="Remove account" cancelLabel="Keep account" tone="danger" busy={deleteBusy} onCancel={() => setConfirmingDelete(null)} onConfirm={handleDeleteUser} />
    </div>
  );
};

export default AdminDashboard;

import React from 'react';
import DirectMessages from './DirectMessages';
import './NotificationsCenter.css';

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
};

const actionLabel = (item) => {
  if (item.kind === 'direct_message' || item.kind === 'job_message') return 'Open conversation';
  if (item.route === 'human_worker') return 'Open Work Room';
  if (item.route === 'human_ops') return 'Open job queue';
  if (item.route === 'human_job') return 'Open job';
  return 'Open';
};

export function NotificationAlert({ item, onOpenNotification }) {
  const needsAction = Boolean(item.requires_action && !item.action_completed_at);
  const label = actionLabel(item);
  const open = () => onOpenNotification?.(item);
  return (
    <article
      className={`tm-notification-alert${needsAction ? ' needs-action' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`${label}: ${item.title}`}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      }}
    >
      <span className="tm-notification-alert-bar" aria-hidden="true" />
      <div className="tm-notification-alert-copy"><strong>{item.title}</strong><span>{item.body}</span></div>
      <span className="tm-notification-alert-actions"><span className="tm-notification-alert-action">{label}</span></span>
    </article>
  );
}

export default function NotificationsCenter({
  notifications = [],
  unreadCount = 0,
  loading = false,
  activeTab = 'all',
  onTabChange,
  onOpenNotification,
  selectedThreadId = '',
  onMessagesRead,
  showMessage,
}) {
  return (
    <section className="tm-notifications-page" aria-labelledby="tm-notifications-title">
      <header className="tm-notifications-head">
        <div>
          <p className="tm-notifications-kicker">Your workspace</p>
          <h1 id="tm-notifications-title">Notifications</h1>
          <p>Messages and job updates stay here until you have read or handled them.</p>
        </div>
        <div className="tm-notifications-total" aria-live="polite">
          <strong>{unreadCount > 99 ? '99+' : unreadCount}</strong>
          <span>unread</span>
        </div>
      </header>

      <div className="tm-notifications-tabs" role="tablist" aria-label="Notification sections">
        <button type="button" role="tab" aria-selected={activeTab === 'all'} className={activeTab === 'all' ? 'is-active' : ''} onClick={() => onTabChange?.('all')}>
          All activity
        </button>
        <button type="button" role="tab" aria-selected={activeTab === 'messages'} className={activeTab === 'messages' ? 'is-active' : ''} onClick={() => onTabChange?.('messages')}>
          Messages
        </button>
      </div>

      {activeTab === 'messages' ? (
        <DirectMessages
          compact
          initialThreadId={selectedThreadId}
          onMessagesRead={onMessagesRead}
          showMessage={showMessage}
        />
      ) : (
        <div className="tm-notifications-list" aria-live="polite">
          {loading && !notifications.length ? (
            <div className="tm-notifications-empty"><strong>Loading your updates</strong><span>Messages and job alerts will appear here.</span></div>
          ) : !notifications.length ? (
            <div className="tm-notifications-empty"><strong>You are up to date</strong><span>New messages and Human Work updates will appear here.</span></div>
          ) : notifications.map((item) => {
            const unread = !item.read_at;
            const needsAction = Boolean(item.requires_action && !item.action_completed_at);
            const message = item.kind === 'direct_message' || item.kind === 'job_message';
            return (
              <article className={`tm-notification-row${unread ? ' is-unread' : ''}${needsAction ? ' needs-action' : ''}`} key={item.id}>
                <span className="tm-notification-mark" aria-hidden="true" />
                <div className="tm-notification-copy">
                  <div className="tm-notification-title-line">
                    <h2>{item.title}</h2>
                    {needsAction ? <span className="tm-notification-state is-action">Needs action</span> : unread ? <span className="tm-notification-state">Unread</span> : <span className="tm-notification-state is-read">Read</span>}
                  </div>
                  <p>{item.body}</p>
                  <time dateTime={item.created_at || undefined}>{formatDate(item.created_at)}</time>
                </div>
                <div className="tm-notification-actions">
                  <button type="button" className="tm-notification-open" onClick={() => onOpenNotification?.(item)}>{actionLabel(item)}</button>
                  {message && Number(item.unread_count) > 1 && <span className="tm-notification-message-count">{item.unread_count} unread</span>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

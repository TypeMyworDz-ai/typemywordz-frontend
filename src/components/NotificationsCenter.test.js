import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import NotificationsCenter, { NotificationAlert } from './NotificationsCenter';

jest.mock('./DirectMessages', () => ({
  __esModule: true,
  default: () => require('react').createElement('div', null, 'Conversation inbox'),
}));

const sampleNotification = {
  id: 'assignment-1',
  kind: 'human_job_assigned',
  title: 'A new Human Work job is ready',
  body: 'Open your Work Room to review the assignment.',
  route: 'human_worker',
  created_at: '2026-09-25T12:00:00Z',
  read_at: null,
  requires_action: true,
  action_completed_at: null,
};

test('shows unread activity with a direct open action and no snooze control', () => {
  const onOpenNotification = jest.fn();
  render(
    <NotificationsCenter
      notifications={[sampleNotification]}
      unreadCount={1}
      onOpenNotification={onOpenNotification}
    />
  );

  expect(screen.getByRole('heading', { name: 'Notifications' })).toBeInTheDocument();
  expect(screen.getByText('A new Human Work job is ready')).toBeInTheDocument();
  expect(screen.getByText('Needs action')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /snooze/i })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open Work Room' }));

  expect(onOpenNotification).toHaveBeenCalledWith(sampleNotification);
});

test('clicking anywhere in a persistent alert opens it and keyboard activation works', () => {
  const onOpenNotification = jest.fn();
  render(<NotificationAlert item={sampleNotification} onOpenNotification={onOpenNotification} />);
  const alert = screen.getByRole('button', { name: 'Open Work Room: A new Human Work job is ready' });

  fireEvent.click(screen.getByText(sampleNotification.body));
  expect(onOpenNotification).toHaveBeenCalledWith(sampleNotification);
  fireEvent.keyDown(alert, { key: 'Enter' });
  expect(onOpenNotification).toHaveBeenCalledTimes(2);
});

test('shows a useful empty state when there are no notifications', () => {
  render(<NotificationsCenter notifications={[]} unreadCount={0} />);
  expect(screen.getByText('You are up to date')).toBeInTheDocument();
});

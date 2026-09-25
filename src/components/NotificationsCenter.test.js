import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import NotificationsCenter from './NotificationsCenter';

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

test('shows persistent unread activity with open and snooze actions', () => {
  const onOpenNotification = jest.fn();
  const onSnoozeNotification = jest.fn();
  render(
    <NotificationsCenter
      notifications={[sampleNotification]}
      unreadCount={1}
      onOpenNotification={onOpenNotification}
      onSnoozeNotification={onSnoozeNotification}
    />
  );

  expect(screen.getByRole('heading', { name: 'Notifications' })).toBeInTheDocument();
  expect(screen.getByText('A new Human Work job is ready')).toBeInTheDocument();
  expect(screen.getByText('Needs action')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open Work Room' }));
  fireEvent.click(screen.getByRole('button', { name: 'Snooze 5 min' }));

  expect(onOpenNotification).toHaveBeenCalledWith(sampleNotification);
  expect(onSnoozeNotification).toHaveBeenCalledWith(sampleNotification);
});

test('shows a useful empty state when there are no notifications', () => {
  render(<NotificationsCenter notifications={[]} unreadCount={0} />);
  expect(screen.getByText('You are up to date')).toBeInTheDocument();
});

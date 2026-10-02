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

test('offers Cancel without navigating and keeps Open as a separate action', () => {
  const onOpenNotification = jest.fn();
  const onDismissNotification = jest.fn();
  render(
    <NotificationsCenter
      notifications={[sampleNotification]}
      unreadCount={1}
      onOpenNotification={onOpenNotification}
      onDismissNotification={onDismissNotification}
    />
  );

  expect(screen.getByRole('heading', { name: 'Notifications' })).toBeInTheDocument();
  expect(screen.getByText('A new Human Work job is ready')).toBeInTheDocument();
  expect(screen.getByText('Needs action')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onDismissNotification).toHaveBeenCalledWith(sampleNotification);
  expect(onOpenNotification).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Open Work Room' }));
  expect(onOpenNotification).toHaveBeenCalledWith(sampleNotification);
});

test('persistent alert has separate Open and Cancel buttons', () => {
  const onOpenNotification = jest.fn();
  const onDismissNotification = jest.fn();
  render(<NotificationAlert item={sampleNotification} onOpenNotification={onOpenNotification} onDismissNotification={onDismissNotification} />);

  fireEvent.click(screen.getByRole('button', { name: 'Cancel notification: A new Human Work job is ready' }));
  expect(onDismissNotification).toHaveBeenCalledWith(sampleNotification);
  expect(onOpenNotification).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Open Work Room: A new Human Work job is ready' }));
  expect(onOpenNotification).toHaveBeenCalledWith(sampleNotification);
});

test('shows a useful empty state when there are no notifications', () => {
  render(<NotificationsCenter notifications={[]} unreadCount={0} />);
  expect(screen.getByText('You are up to date')).toBeInTheDocument();
});

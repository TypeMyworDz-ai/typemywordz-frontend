import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminGeneralGuidelinesPanel from './AdminGeneralGuidelinesPanel';

const user = { getIdToken: async () => 'token' };
const json = (body, ok = true) => Promise.resolve({ ok, json: async () => body });

test('loads, edits and saves the General Jobs guidelines', async () => {
  const calls = [];
  global.fetch = jest.fn((url, options = {}) => {
    calls.push([String(url), options.method || 'GET', options.body]);
    return json({ text: 'Rule one.', using_default: true });
  });
  render(<AdminGeneralGuidelinesPanel currentUser={user} showMessage={() => {}} />);
  const box = await screen.findByRole('textbox', { name: 'General Jobs guidelines' });
  expect(box).toHaveValue('Rule one.');
  fireEvent.change(box, { target: { value: 'Rule one. Rule two.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save guidelines' }));
  await waitFor(() => expect(calls.some(([u, m, b]) => u.endsWith('/api/admin/general-job-guidelines') && m === 'PUT' && JSON.parse(b).text === 'Rule one. Rule two.')).toBe(true));
});

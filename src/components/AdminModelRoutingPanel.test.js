import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminModelRoutingPanel from './AdminModelRoutingPanel';

const sharedModels = [
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', provider: 'gemini' },
  { id: 'gpt-5.6-terra', label: 'ChatGPT 5.6 Terra', provider: 'openai' },
];
const payload = {
  models: sharedModels,
  routes: [
    { key: 'general', label: 'General Jobs agent (Super Admin)', default: ['gemini-3.8-flash', 'gpt-5.6-terra'], models: ['gemini-3.8-flash', 'gpt-5.6-terra'], customised: false, available_models: [...sharedModels, { id: 'mistral-large-4', label: 'Mistral Large 4 (Preview)', provider: 'mistral' }] },
    { key: 'general_subadmin', label: 'General Jobs agent (Sub-admins)', default: ['gpt-5.6-terra', 'gemini-3.8-flash'], models: ['gpt-5.6-terra', 'gemini-3.8-flash'], customised: false, available_models: sharedModels },
  ],
};

test('shows each job type and saves a changed primary model', async () => {
  const calls = [];
  global.fetch = jest.fn((url, options = {}) => {
    calls.push([options.method || 'GET', options.body]);
    return Promise.resolve({ ok: true, json: () => Promise.resolve(options.method === 'PUT' ? { status: 'saved' } : payload) });
  });
  render(<AdminModelRoutingPanel currentUser={{ getIdToken: () => Promise.resolve('t') }} showMessage={() => {}} />);
  expect(await screen.findByText('General Jobs agent (Super Admin)')).toBeInTheDocument();
  expect(screen.getByText('General Jobs agent (Sub-admins)')).toBeInTheDocument();
  await userEvent.selectOptions(screen.getAllByRole('combobox')[0], 'gpt-5.6-terra');
  await userEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]);
  await waitFor(() => expect(calls.some(([method, body]) => method === 'PUT' && JSON.parse(body).key === 'general')).toBe(true));
});

test('offers Mistral Large 4 only for Super Admin General Jobs', async () => {
  const calls = [];
  global.fetch = jest.fn((url, options = {}) => {
    calls.push([options.method || 'GET', options.body]);
    return Promise.resolve({ ok: true, json: () => Promise.resolve(options.method === 'PUT' ? { status: 'saved' } : payload) });
  });
  render(<AdminModelRoutingPanel currentUser={{ getIdToken: () => Promise.resolve('t') }} showMessage={() => {}} />);
  await screen.findByText('General Jobs agent (Super Admin)');
  const selects = screen.getAllByRole('combobox');
  const generalChoices = [...selects[0].options].map((option) => option.value);
  const subAdminChoices = [...selects[3].options].map((option) => option.value);
  expect(generalChoices).toContain('mistral-large-4');
  expect(subAdminChoices).not.toContain('mistral-large-4');
  expect(payload.models.some((model) => model.id === 'mistral-large-4')).toBe(false);
  await userEvent.selectOptions(selects[0], 'mistral-large-4');
  await userEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]);
  await waitFor(() => {
    const saved = calls.find(([method]) => method === 'PUT');
    expect(saved).toBeDefined();
    expect(JSON.parse(saved[1])).toMatchObject({ key: 'general', models: ['mistral-large-4', 'gpt-5.6-terra'] });
  });
});

test('saves the sub-admin General Jobs route independently', async () => {
  const calls = [];
  global.fetch = jest.fn((url, options = {}) => {
    calls.push([options.method || 'GET', options.body]);
    return Promise.resolve({ ok: true, json: () => Promise.resolve(options.method === 'PUT' ? { status: 'saved' } : payload) });
  });
  render(<AdminModelRoutingPanel currentUser={{ getIdToken: () => Promise.resolve('t') }} showMessage={() => {}} />);
  await screen.findByText('General Jobs agent (Sub-admins)');
  await userEvent.selectOptions(screen.getAllByRole('combobox')[3], 'gemini-3.8-flash');
  await userEvent.click(screen.getAllByRole('button', { name: 'Save' })[1]);
  await waitFor(() => expect(calls.some(([method, body]) => method === 'PUT' && JSON.parse(body).key === 'general_subadmin')).toBe(true));
});

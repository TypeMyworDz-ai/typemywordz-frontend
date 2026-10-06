import { fetchCreditBalance } from './creditsService';

const balance = { planCredits: 8, topUpCredits: 2, total: 10, spendable: 10 };

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => balance });
});

afterEach(() => jest.clearAllMocks());

test('main admin balance requests the authenticated billable AI view', async () => {
  const currentUser = { getIdToken: jest.fn().mockResolvedValue('verified-token') };
  const result = await fetchCreditBalance('admin-uid', 'typemywordz@gmail.com', currentUser);

  expect(result).toEqual(balance);
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining('billable_ai_balance=true'),
    { headers: { Authorization: 'Bearer verified-token' } },
  );
  expect(currentUser.getIdToken).toHaveBeenCalledTimes(1);
});

test('regular worker balance requests do not use the billable-admin override', async () => {
  const result = await fetchCreditBalance('worker-uid', 'worker@example.com');

  expect(result).toEqual(balance);
  expect(global.fetch).toHaveBeenCalledWith(
    expect.not.stringContaining('billable_ai_balance=true'),
    { headers: {} },
  );
});

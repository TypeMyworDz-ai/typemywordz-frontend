jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ currentUser: null }) }));

import { canUseGuidelineFormatter } from './FormatWithGuidelines';

test.each([
  'info@typemywordz.ai',
  'typemywordz@gmail.com',
  'gracenyaitara@gmail.com',
])('allows the guideline formatter for %s', (email) => {
  expect(canUseGuidelineFormatter(email)).toBe(true);
});

test('normalizes email casing and whitespace', () => {
  expect(canUseGuidelineFormatter('  TypeMyworDz@gmail.com  ')).toBe(true);
});

test('does not show the private formatter to other accounts', () => {
  expect(canUseGuidelineFormatter('client@example.com')).toBe(false);
  expect(canUseGuidelineFormatter('')).toBe(false);
});

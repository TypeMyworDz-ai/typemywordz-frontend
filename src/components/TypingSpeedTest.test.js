import { calculateNetWpm, correctCharacterCount } from './TypingSpeedTest';

describe('trainee typing-speed calculation', () => {
  test('100 correctly matched characters in 30 seconds is exactly 40 WPM', () => {
    expect(calculateNetWpm(100, 30)).toBe(40);
  });

  test('a score below 100 correct characters does not meet the 40 WPM gate', () => {
    expect(calculateNetWpm(99, 30)).toBe(39);
  });

  test('counts matching characters without adding a separate accuracy cutoff', () => {
    expect(correctCharacterCount('abXd', 'abcd')).toBe(3);
    expect(calculateNetWpm(100, 30)).toBeGreaterThanOrEqual(40);
  });

  test('ignores typed characters beyond the passage', () => {
    expect(correctCharacterCount('abcd-extra', 'abcd')).toBe(4);
  });
});

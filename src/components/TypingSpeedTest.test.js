import { calculateNetWpm, correctCharacterCount } from './TypingSpeedTest';

describe('trainee typing-speed calculation', () => {
  test('125 correctly matched characters in 30 seconds is exactly 50 WPM', () => {
    expect(calculateNetWpm(125, 30)).toBe(50);
  });

  test('a score below 125 correct characters does not meet the 50 WPM gate', () => {
    expect(calculateNetWpm(124, 30)).toBe(49);
  });

  test('counts matching characters without adding a separate accuracy cutoff', () => {
    expect(correctCharacterCount('abXd', 'abcd')).toBe(3);
    expect(calculateNetWpm(125, 30)).toBeGreaterThanOrEqual(50);
  });

  test('ignores typed characters beyond the passage', () => {
    expect(correctCharacterCount('abcd-extra', 'abcd')).toBe(4);
  });
});

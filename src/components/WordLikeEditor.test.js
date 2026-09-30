import { sanitizePastedHtml, domToPlainText, plainTextToHtml } from './WordLikeEditor';

describe('Word-like editor paste handling', () => {
  test('keeps bold and indents, turns Word tab spans into tab characters and drops scripts', () => {
    const html = '<p class=MsoNormal style="margin:0in;text-indent:.5in"><b>Heading</b><span style="mso-tab-count:1">  </span>Body<script>alert(1)</script></p>';
    const clean = sanitizePastedHtml(html);
    expect(clean).toContain('<b>Heading</b>');
    expect(clean).toContain('\t');
    expect(clean).toContain('text-indent:.5in');
    expect(clean).not.toContain('script');
    expect(clean).not.toContain('class=');
  });

  test('source line wraps inside a paragraph are not turned into line breaks', () => {
    expect(sanitizePastedHtml('<p>one\r\n   two</p>')).toBe('<p>one two</p>');
  });

  test('plain text round-trips through the editor markup', () => {
    const holder = document.createElement('div');
    holder.innerHTML = plainTextToHtml('first\n\nsecond');
    expect(domToPlainText(holder)).toBe('first\n\nsecond');
  });

  test('dividers are left out of the plain text', () => {
    const holder = document.createElement('div');
    holder.innerHTML = '<div data-tm-skip="1">Part 1 by Worker 1</div><div data-tm-part="a">Hello</div>';
    expect(domToPlainText(holder)).toBe('Hello');
  });
});

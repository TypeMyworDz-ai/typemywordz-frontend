import React from 'react';
import { act, render, screen } from '@testing-library/react';
import WordLikeEditor, { sanitizePastedHtml, domToPlainText, plainTextToHtml } from './WordLikeEditor';
import FinalTranscriptView from './FinalTranscriptView';
import { encodeWhitespaceForWord, htmlToDocxParagraphs, nodeToWordHtml } from '../utils/transcriptExport';

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

  test('tabs and double spaces are written the way Word reads them', () => {
    const html = encodeWhitespaceForWord('\tHello.  World');
    expect(html).toContain('mso-tab-count:1');
    expect(html).toContain('mso-spacerun:yes');
    const holder = document.createElement('div');
    holder.innerHTML = '<div>\tOne.  Two</div>';
    const out = nodeToWordHtml(holder);
    expect(out).toContain('mso-tab-count:1');
    expect(out).toContain('mso-spacerun:yes');
  });

  test('a copied tab survives a round trip back into the editor', () => {
    const holder = document.createElement('div');
    holder.innerHTML = '<div>\tIndented</div>';
    const copied = nodeToWordHtml(holder);
    const clean = sanitizePastedHtml(copied);
    const back = document.createElement('div');
    back.innerHTML = clean;
    expect(domToPlainText(back)).toBe('\tIndented');
  });

  test('keeps edited submitted parts addressable for the proofreader handoff', () => {
    const ref = React.createRef();
    render(<WordLikeEditor ref={ref} parts={[{ id: 'part-a', index: 1, author_label: 'Worker 1', transcript: 'Original' }]} />);
    expect(ref.current.getParts()).toEqual([expect.objectContaining({ id: 'part-a', transcript: 'Original' })]);
  });

  test('inserts a combined AI transcript into the shared editor without part labels', () => {
    const ref = React.createRef();
    const onChange = jest.fn();
    render(<WordLikeEditor ref={ref} parts={[{ id: 'part-a', index: 1, author_label: 'Worker 1', transcript: 'Original' }]} onChange={onChange} />);
    act(() => ref.current.replaceContent('\tReviewed.  Transcript.'));
    expect(ref.current.getParts()).toEqual([]);
    expect(onChange).toHaveBeenLastCalledWith('\tReviewed.  Transcript.', expect.stringContaining('Reviewed.'));
  });
});

test('Word export preserves paragraph indent, alignment, inline emphasis, double spaces, and real tab runs', () => {
  function TextRun(options) { this.options = options; }
  function Paragraph(options) { this.options = options; }
  function Tab() { this.kind = 'tab'; }
  const alignment = { LEFT: 'left', CENTER: 'center', RIGHT: 'right', JUSTIFIED: 'justified' };
  const paragraphs = htmlToDocxParagraphs('<p style="text-indent:0.5in;text-align:justify"><strong>Start.</strong>  <em>Next</em>\tIndented</p>', TextRun, Paragraph, Tab, alignment);
  const paragraph = paragraphs[0].options;
  expect(paragraph.alignment).toBe('justified');
  expect(paragraph.indent.firstLine).toBe(720);
  expect(paragraph.children.some((run) => run.options.bold)).toBe(true);
  expect(paragraph.children.some((run) => run.options.italics)).toBe(true);
  expect(paragraph.children.some((run) => run.options.text === '  ')).toBe(true);
  expect(paragraph.children.some((run) => run.options.children?.[0] instanceof Tab)).toBe(true);
});

test('the shared final transcript editor is editable and keeps Copy, Word download, and Save controls', () => {
  render(<FinalTranscriptView job={{ id: 'job-1', transcript: 'Transcript text.', transcript_html: '<div>Transcript text.</div>' }} editable onSave={jest.fn()} />);
  expect(screen.getByRole('textbox', { name: 'Transcript editor' }).getAttribute('contenteditable')).toBe('true');
  expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Download Word (.docx)' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
});

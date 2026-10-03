import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import WordLikeEditor, { sanitizePastedHtml, domToPlainText, plainTextToHtml } from './WordLikeEditor';
import FinalTranscriptView from './FinalTranscriptView';
import { encodeWhitespaceForWord, htmlToDocxParagraphs, nodeToWordHtml, normalizeParagraphSpacing, wordHtml } from '../utils/transcriptExport';

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

  test('imports and pastes keep only one empty paragraph between blocks', () => {
    const source = '<p><strong>First.</strong>  <span>\tIndented</span></p><p><br></p><p>&nbsp;</p><p><br></p><p>Second.</p>';
    const normalized = normalizeParagraphSpacing(source);
    expect((normalized.match(/<p/g) || [])).toHaveLength(3);
    const clean = sanitizePastedHtml(source);
    expect((clean.match(/<p/g) || [])).toHaveLength(3);
    expect(clean).toContain('<strong>First.</strong>');
    expect(clean).toContain('  ');
    expect(clean).toContain('\tIndented');
  });

  test('plain-text imports limit runs of blank lines to one blank paragraph', () => {
    const holder = document.createElement('div');
    holder.innerHTML = plainTextToHtml('first\n\n\n\nsecond');
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

  test('Word copy collapses extra blank paragraphs without changing tabs or double spaces', () => {
    const holder = document.createElement('div');
    holder.innerHTML = '<p><strong>First.</strong>  \tSecond.</p><p><br></p><p><br></p><p>Third.</p>';
    const copied = nodeToWordHtml(holder);
    expect((copied.match(/<p/g) || [])).toHaveLength(3);
    expect(copied).toContain('<strong>First.</strong>');
    expect(copied).toContain('mso-tab-count:1');
    expect(copied).toContain('mso-spacerun:yes');
  });

  test('Word copy explicitly sets zero paragraph spacing and single line spacing', () => {
    const holder = document.createElement('div');
    holder.innerHTML = '<p>First.</p><div>Second.</div>';
    const copied = nodeToWordHtml(holder);
    expect(copied).toMatch(/margin:\s*0pt 0pt 0pt 0pt/i);
    expect(copied).toMatch(/line-height:\s*100%/i);
    expect(copied).toContain('mso-para-margin-before:0pt');
    expect(copied).toContain('mso-para-margin-after:0pt');
    expect(copied).toContain('mso-line-height-alt:100%');
    const selectedText = document.createElement('div');
    selectedText.innerHTML = '<strong>Only a selected phrase</strong>';
    expect(nodeToWordHtml(selectedText)).toMatch(/^<p style=/);
    expect(wordHtml('One.  Two')).toContain('mso-line-height-alt:100%');
  });

  test('keeps edited submitted parts addressable for the proofreader handoff', () => {
    const ref = React.createRef();
    render(<WordLikeEditor ref={ref} parts={[{ id: 'part-a', index: 1, author_label: 'Worker 1', transcript: 'Original' }]} />);
    expect(ref.current.getParts()).toEqual([expect.objectContaining({ id: 'part-a', transcript: 'Original' })]);
  });

  test('normalizes excess empty paragraphs in combined parts before proofreader handoff', () => {
    const ref = React.createRef();
    render(<WordLikeEditor ref={ref} parts={[{ id: 'part-a', index: 1, author_label: 'Worker 1', transcript: 'First.\n\nSecond.', transcript_html: '<p>First.</p><p><br></p><p><br></p><p><br></p><p>Second.</p>' }]} />);
    const part = ref.current.getParts()[0];
    expect(part.transcript).toBe('First.\n\nSecond.');
    expect((part.transcript_html.match(/<p/g) || [])).toHaveLength(3);
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
  const paragraphs = htmlToDocxParagraphs('<p style="text-indent:0.5in;text-align:justify"><strong>Start.</strong>  <em>Next</em>\tIndented</p><p><br></p><p>&nbsp;</p><p><br></p><p>Second.</p>', TextRun, Paragraph, Tab, alignment);
  expect(paragraphs).toHaveLength(3);
  const paragraph = paragraphs[0].options;
  expect(paragraph.alignment).toBe('justified');
  expect(paragraph.spacing).toEqual({ before: 0, after: 0, line: 240, lineRule: 'auto' });
  expect(paragraph.indent.firstLine).toBe(720);
  expect(paragraph.children.some((run) => run.options.bold)).toBe(true);
  expect(paragraph.children.some((run) => run.options.italics)).toBe(true);
  expect(paragraph.children.some((run) => run.options.text === '  ')).toBe(true);
  expect(paragraph.children.some((run) => run.options.children?.[0] instanceof Tab)).toBe(true);
});

test('Word export carries custom paragraph settings into the Word document', () => {
  function TextRun(options) { this.options = options; }
  function Paragraph(options) { this.options = options; }
  function Tab() { this.kind = 'tab'; }
  const alignment = { LEFT: 'left', CENTER: 'center', RIGHT: 'right', JUSTIFIED: 'justified' };
  const paragraphs = htmlToDocxParagraphs('<p style="margin-top:3pt;margin-bottom:6pt;margin-left:0.25in;margin-right:0.5in;text-indent:-0.25in;line-height:1.5">Indented</p>', TextRun, Paragraph, Tab, alignment);
  expect(paragraphs[0].options.spacing).toEqual({ before: 60, after: 120, line: 360, lineRule: 'auto' });
  expect(paragraphs[0].options.indent).toEqual({ left: 360, right: 720, hanging: 360 });
});

test('paragraph settings match the 0 pt single-spaced Normal paragraph defaults', () => {
  render(<WordLikeEditor initialText="First.\nSecond." />);
  fireEvent.click(screen.getByRole('button', { name: 'Paragraph settings' }));
  expect(screen.getByRole('dialog', { name: 'Paragraph settings' })).toBeInTheDocument();
  expect(screen.getByLabelText('Paragraph alignment')).toHaveValue('left');
  expect(screen.getByLabelText('Left indent (inches)')).toHaveValue(0);
  expect(screen.getByLabelText('Right indent (inches)')).toHaveValue(0);
  expect(screen.getByLabelText('Special indent')).toHaveValue('none');
  expect(screen.getByLabelText('Space before (pt)')).toHaveValue(0);
  expect(screen.getByLabelText('Space after (pt)')).toHaveValue(0);
  expect(screen.getByLabelText('Line spacing')).toHaveValue('single');
  fireEvent.click(screen.getByRole('button', { name: 'Apply settings' }));
  const editor = screen.getByRole('textbox', { name: 'Transcript editor' });
  expect(editor.firstElementChild.style.marginTop).toBe('0pt');
  expect(editor.firstElementChild.style.marginBottom).toBe('0pt');
  expect(editor.firstElementChild.style.lineHeight).toBe('1');
  expect(editor.firstElementChild.style.textAlign).toBe('left');
  expect(editor.firstElementChild.style.textIndent).toBe('0in');
});

test('the shared final transcript editor is editable and keeps Copy, Word download, and Save controls', () => {
  render(<FinalTranscriptView job={{ id: 'job-1', transcript: 'Transcript text.', transcript_html: '<div>Transcript text.</div>' }} editable onSave={jest.fn()} />);
  expect(screen.getByRole('textbox', { name: 'Transcript editor' }).getAttribute('contenteditable')).toBe('true');
  expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Download Word (.docx)' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
});

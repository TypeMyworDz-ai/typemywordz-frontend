import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AIOutputWindow from './AIOutputWindow';
import { copyRich, downloadDocx } from '../utils/transcriptExport';

jest.mock('../utils/transcriptExport', () => ({
  copyRich: jest.fn(() => Promise.resolve()),
  downloadDocx: jest.fn(() => Promise.resolve()),
  nodeToWordHtml: jest.fn(() => '<p>answer</p>'),
  safeFileName: jest.fn((value) => value),
}));

jest.mock('./WordLikeEditor', () => ({
  __esModule: true,
  default: ({ initialText }) => <div data-testid="document-page">{initialText}</div>,
  domToPlainText: () => 'answer',
  plainTextToHtml: (text) => `<div>${text}</div>`,
  sanitizePastedHtml: (html) => html,
}));

test('shows the document-style answer with Copy and Word download actions', () => {
  render(<AIOutputWindow title="AI answer" description="Read or save this response." text="A clear answer." fileName="response" />);

  expect(screen.getByRole('heading', { name: 'AI answer' })).toBeInTheDocument();
  expect(screen.getByText('A clear answer.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Download Word (.docx)' })).toBeInTheDocument();
});

test('copies and downloads the document through shared export utilities', async () => {
  render(<AIOutputWindow text="A clear answer." fileName="response" />);

  fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
  await waitFor(() => expect(copyRich).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: 'Download Word (.docx)' }));
  await waitFor(() => expect(downloadDocx).toHaveBeenCalled());
  expect(downloadDocx.mock.calls[0][0]).toBe('A clear answer.');
  expect(downloadDocx.mock.calls[0][2]).toContain('A clear answer.');
});

test('supports a single custom action without extra export buttons', () => {
  render(<AIOutputWindow text="Reviewed transcript" showCopyDownload={false} actionContent={<button type="button">Insert to the Editor for Proofreader</button>} />);
  expect(screen.getByRole('button', { name: 'Insert to the Editor for Proofreader' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Copy' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Download Word (.docx)' })).not.toBeInTheDocument();
});

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nextProvider } from 'react-i18next';
import {
  SummaryDialog,
  type SummaryDialogProps
} from '../../../src/renderer/src/components/workflow/SummaryDialog';
import { createI18n } from '../../../src/renderer/src/i18n';
import { renderWithI18n } from '../renderWithI18n';

const TEXT = 'Great clip about the sea.';

function props(overrides: Partial<SummaryDialogProps> = {}): SummaryDialogProps {
  return {
    open: true,
    onOpenChange: vi.fn(),
    summary: { projectId: 'project-1', inputPath: '/videos/clip.mp4', revision: 3, text: TEXT },
    currentRevision: 3,
    busy: false,
    onSummarizeAgain: vi.fn(),
    ...overrides
  };
}

function stubClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, 'clipboard');
  Reflect.deleteProperty(document, 'execCommand');
  vi.restoreAllMocks();
});

describe('SummaryDialog', () => {
  it('shows the result as editable text with its character count', () => {
    renderWithI18n(<SummaryDialog {...props()} />);

    expect(screen.getByRole('textbox', { name: 'Summary text' })).toHaveValue(TEXT);
    expect(screen.getByText(`${TEXT.length} characters`)).toBeInTheDocument();
  });

  it('keeps edits local and updates the count while typing', () => {
    const summary = { projectId: 'project-1', inputPath: '/videos/clip.mp4', revision: 3, text: TEXT };
    renderWithI18n(<SummaryDialog {...props({ summary })} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Summary text' }), { target: { value: 'Short' } });

    expect(screen.getByRole('textbox', { name: 'Summary text' })).toHaveValue('Short');
    expect(screen.getByText('5 characters')).toBeInTheDocument();
    expect(summary.text).toBe(TEXT);
  });

  it('copies the edited text through the Clipboard API and shows Copied', async () => {
    const writeText = vi.fn(async (_text: string) => undefined);
    stubClipboard(writeText);
    renderWithI18n(<SummaryDialog {...props()} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Summary text' }), { target: { value: 'Edited post' } });
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(writeText).toHaveBeenCalledWith('Edited post');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeEnabled();
  });

  it('falls back to a hidden textarea and execCommand when the Clipboard API refuses', async () => {
    stubClipboard(() => Promise.reject(new Error('denied')));
    const execCommand = vi.fn((_command: string) => true);
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });
    renderWithI18n(<SummaryDialog {...props()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(await screen.findByRole('button', { name: 'Copied' })).toBeEnabled();
    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('says so when copying fails in both ways', async () => {
    stubClipboard(() => Promise.reject(new Error('denied')));
    Object.defineProperty(document, 'execCommand', { value: vi.fn(() => false), configurable: true });
    renderWithI18n(<SummaryDialog {...props()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(await screen.findByText('Copying failed. Select the text and copy it by hand.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });

  it('disables Copy when the text is empty', () => {
    renderWithI18n(<SummaryDialog {...props()} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Summary text' }), { target: { value: '   ' } });

    expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled();
  });

  it('notes when captions changed after the summary was made', () => {
    renderWithI18n(<SummaryDialog {...props({ currentRevision: 4 })} />);

    expect(screen.getByText('Captions changed after this summary')).toBeInTheDocument();
  });

  it('does not show the note while the captions are unchanged', () => {
    renderWithI18n(<SummaryDialog {...props({ currentRevision: 3 })} />);

    expect(screen.queryByText('Captions changed after this summary')).not.toBeInTheDocument();
  });

  it('runs the summary again, and disables that while a job runs', () => {
    const onSummarizeAgain = vi.fn();
    const { unmount } = renderWithI18n(<SummaryDialog {...props({ onSummarizeAgain })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Summarize again' }));
    expect(onSummarizeAgain).toHaveBeenCalledTimes(1);
    unmount();

    renderWithI18n(<SummaryDialog {...props({ onSummarizeAgain, busy: true })} />);
    expect(screen.getByRole('button', { name: 'Summarize again' })).toBeDisabled();
  });

  it('replaces the text when a new summary arrives, dropping the old local edits', () => {
    const first = { projectId: 'project-1', inputPath: '/videos/clip.mp4', revision: 3, text: TEXT };
    const { rerender } = renderWithI18n(<SummaryDialog {...props({ summary: first })} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Summary text' }), { target: { value: 'My edit' } });

    rerender(
      <I18nextProvider i18n={createI18n('en')}>
        <SummaryDialog {...props({ summary: { projectId: 'project-1', inputPath: '/videos/clip.mp4', revision: 3, text: 'Second run' } })} />
      </I18nextProvider>
    );

    expect(screen.getByRole('textbox', { name: 'Summary text' })).toHaveValue('Second run');
  });

  it('closes through the Close button', async () => {
    const onOpenChange = vi.fn();
    renderWithI18n(<SummaryDialog {...props({ onOpenChange })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});

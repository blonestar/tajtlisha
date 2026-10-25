import { act, fireEvent, screen, within, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CaptionTable, type CaptionTableProps } from '../../../src/renderer/src/components/captions/CaptionTable';
import type { CaptionRow } from '../../../src/shared/types/project';
import { createI18n } from '../../../src/renderer/src/i18n';
import { I18nextProvider } from 'react-i18next';
import { renderWithI18n } from '../renderWithI18n';

const captions: CaptionRow[] = [
  { id: 'c1', startMs: 1000, endMs: 2500, original: 'Hello there', translation: 'Zdravo' },
  { id: 'c2', startMs: 2500, endMs: 4000, original: 'General Kenobi', translation: '' },
  { id: 'c3', startMs: 4000, endMs: 5000, original: 'Last one', translation: 'Poslednji' }
];

function props(overrides: Partial<CaptionTableProps> = {}): CaptionTableProps {
  return {
    captions,
    issues: {},
    staleIds: new Set(),
    activeCaptionId: null,
    selectedCaptionId: null,
    maxCharsPerLine: 42,
    trimStartMs: 1000,
    showTranslation: true,
    originalLabel: 'Original (en)',
    translationLabel: 'Translation (sr-Latn)',
    onSelect: vi.fn(),
    onSeek: vi.fn(),
    onUpdate: vi.fn(),
    onInsertAfter: vi.fn(),
    onSplit: vi.fn(),
    onMerge: vi.fn(),
    onDelete: vi.fn(),
    onNudge: vi.fn(),
    ...overrides
  };
}

function rowOf(id: string): HTMLElement {
  const row = document.querySelector<HTMLElement>(`tr[data-row-id="${id}"]`);
  if (!row) throw new Error(`no row ${id}`);
  return row;
}

function timeInput(id: string, label: 'Start' | 'End'): HTMLInputElement {
  return within(rowOf(id)).getByRole('textbox', { name: label }) as HTMLInputElement;
}

afterEach(cleanup);

describe('CaptionTable', () => {
  it('renders one row per caption with original and translation text', () => {
    renderWithI18n(<CaptionTable {...props()} />);

    expect(document.querySelectorAll('tbody tr')).toHaveLength(3);
    expect(screen.getAllByRole('textbox', { name: 'Original (en)' })).toHaveLength(3);
    expect(within(rowOf('c1')).getByDisplayValue('Hello there')).toBeTruthy();
    expect(within(rowOf('c1')).getByDisplayValue('Zdravo')).toBeTruthy();
    expect(within(rowOf('c2')).getByText('2')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /Original \(en\)/ })).toBeTruthy();
  });

  it('hides the translation column when showTranslation is false', () => {
    renderWithI18n(<CaptionTable {...props({ showTranslation: false })} />);

    expect(screen.queryByRole('textbox', { name: 'Translation (sr-Latn)' })).toBeNull();
    expect(screen.queryByDisplayValue('Zdravo')).toBeNull();
  });

  it('shows the empty state when there are no captions', () => {
    renderWithI18n(<CaptionTable {...props({ captions: [] })} />);

    expect(screen.getByText('No captions yet. Transcribe the clip or add a caption manually.')).toBeTruthy();
    expect(document.querySelector('table')).toBeNull();
  });

  it('shows timecodes relative to the trim start and commits source-absolute ms', () => {
    const onUpdate = vi.fn();
    renderWithI18n(<CaptionTable {...props({ onUpdate })} />);

    // c2 starts at 2500 source ms; with trim start 1000 it reads 1.500 on the timeline.
    const start = timeInput('c2', 'Start');
    expect(start.value).toBe('0:01.500');

    fireEvent.focus(start);
    fireEvent.change(start, { target: { value: '0:02.250' } });
    fireEvent.blur(start);

    expect(onUpdate).toHaveBeenCalledWith('c2', { startMs: 3250 });
  });

  it('commits a timecode on Enter', () => {
    const onUpdate = vi.fn();
    renderWithI18n(<CaptionTable {...props({ onUpdate })} />);

    const end = timeInput('c1', 'End');
    end.focus();
    fireEvent.change(end, { target: { value: '0:03' } });
    fireEvent.keyDown(end, { key: 'Enter' });

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith('c1', { endMs: 4000 });
  });

  it('reverts a timecode on Escape without committing', () => {
    const onUpdate = vi.fn();
    renderWithI18n(<CaptionTable {...props({ onUpdate })} />);

    const end = timeInput('c1', 'End');
    end.focus();
    fireEvent.change(end, { target: { value: '0:09.000' } });
    fireEvent.keyDown(end, { key: 'Escape' });

    expect(onUpdate).not.toHaveBeenCalled();
    expect(end.value).toBe('0:01.500');
  });

  it('reverts an invalid timecode on blur without committing', () => {
    const onUpdate = vi.fn();
    renderWithI18n(<CaptionTable {...props({ onUpdate })} />);

    const start = timeInput('c1', 'Start');
    start.focus();
    fireEvent.change(start, { target: { value: 'soon' } });
    fireEvent.blur(start);

    expect(onUpdate).not.toHaveBeenCalled();
    expect(start.value).toBe('0:00.000');
  });

  it('does not commit when a timecode is only focused and left unchanged', () => {
    const onUpdate = vi.fn();
    renderWithI18n(<CaptionTable {...props({ onUpdate })} />);

    const start = timeInput('c1', 'Start');
    start.focus();
    start.blur();

    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('calls onUpdate when the original or translation text changes', () => {
    const onUpdate = vi.fn();
    renderWithI18n(<CaptionTable {...props({ onUpdate })} />);

    fireEvent.change(within(rowOf('c2')).getByDisplayValue('General Kenobi'), {
      target: { value: 'General Kenobi!' }
    });
    fireEvent.change(within(rowOf('c2')).getByRole('textbox', { name: 'Translation (sr-Latn)' }), {
      target: { value: 'Generale Kenobi' }
    });

    expect(onUpdate).toHaveBeenCalledWith('c2', { original: 'General Kenobi!' });
    expect(onUpdate).toHaveBeenCalledWith('c2', { translation: 'Generale Kenobi' });
  });

  it('renders blocking issues as danger badges and the rest as warnings', () => {
    renderWithI18n(
      <CaptionTable
        {...props({
          issues: {
            c1: [{ code: 'overlaps_previous', overlapMs: 120 }],
            c2: [{ code: 'too_short' }]
          }
        })}
      />
    );

    const overlap = screen.getByText('Overlaps previous by 120 ms');
    expect(overlap.className).toContain('badge-danger');
    const short = screen.getByText('Caption is very short');
    expect(short.className).toContain('badge-warning');
  });

  it('shows the needs-translation badge for stale rows', () => {
    renderWithI18n(<CaptionTable {...props({ staleIds: new Set(['c3']) })} />);

    expect(within(rowOf('c3')).getByText('Needs translation')).toBeTruthy();
    expect(within(rowOf('c1')).queryByText('Needs translation')).toBeNull();
  });

  it('marks the playing row and keeps the selected row separate', () => {
    renderWithI18n(<CaptionTable {...props({ activeCaptionId: 'c2', selectedCaptionId: 'c3' })} />);

    expect(rowOf('c2').classList.contains('is-active')).toBe(true);
    expect(rowOf('c2').getAttribute('aria-current')).toBe('true');
    expect(rowOf('c3').classList.contains('is-selected')).toBe(true);
    expect(rowOf('c3').classList.contains('is-active')).toBe(false);
  });

  it('selects and seeks when a row is clicked, but not when a row action button is clicked', () => {
    const onSelect = vi.fn();
    const onSeek = vi.fn();
    renderWithI18n(<CaptionTable {...props({ onSelect, onSeek })} />);

    fireEvent.click(within(rowOf('c2')).getByText('2'));
    expect(onSelect).toHaveBeenCalledWith('c2');
    expect(onSeek).toHaveBeenCalledWith(2500);

    onSeek.mockClear();
    const deleteButton = within(rowOf('c3')).getAllByRole('button').at(-1);
    const icon = deleteButton?.querySelector('svg');
    if (!icon) throw new Error('no button icon');
    fireEvent.click(icon);
    expect(onSeek).not.toHaveBeenCalled();
  });

  it('seeks to the caption start when one of its fields gets focus from outside the row', () => {
    const onSelect = vi.fn();
    const onSeek = vi.fn();
    renderWithI18n(<CaptionTable {...props({ onSelect, onSeek, activeCaptionId: 'c1' })} />);

    fireEvent.focus(within(rowOf('c3')).getByDisplayValue('Last one'));
    expect(onSelect).toHaveBeenCalledWith('c3');
    expect(onSeek).toHaveBeenCalledWith(4000);

    onSeek.mockClear();
    fireEvent.focus(timeInput('c2', 'Start'));
    expect(onSeek).toHaveBeenCalledWith(2500);
  });

  it('keeps the playhead when focus moves inside a row or into the playing caption', () => {
    const onSelect = vi.fn();
    const onSeek = vi.fn();
    renderWithI18n(<CaptionTable {...props({ onSelect, onSeek, activeCaptionId: 'c1' })} />);

    fireEvent.focus(within(rowOf('c1')).getByDisplayValue('Hello there'));
    expect(onSelect).toHaveBeenCalledWith('c1');
    expect(onSeek).not.toHaveBeenCalled();

    const row = rowOf('c3');
    fireEvent.focus(within(row).getByDisplayValue('Poslednji'), {
      relatedTarget: within(row).getByDisplayValue('Last one')
    });
    expect(onSelect).toHaveBeenCalledWith('c3');
    expect(onSeek).not.toHaveBeenCalled();
  });

  it('calls row action callbacks with the caption id', () => {
    const handlers = {
      onInsertAfter: vi.fn(),
      onSplit: vi.fn(),
      onMerge: vi.fn(),
      onDelete: vi.fn()
    };
    renderWithI18n(<CaptionTable {...props(handlers)} />);

    fireEvent.click(within(rowOf('c1')).getByRole('button', { name: 'Insert caption after' }));
    fireEvent.click(within(rowOf('c1')).getByRole('button', { name: 'Split at playhead' }));
    fireEvent.click(within(rowOf('c1')).getByRole('button', { name: 'Merge with next caption' }));
    fireEvent.click(within(rowOf('c1')).getByRole('button', { name: 'Delete caption' }));

    expect(handlers.onInsertAfter).toHaveBeenCalledWith('c1');
    expect(handlers.onSplit).toHaveBeenCalledWith('c1');
    expect(handlers.onMerge).toHaveBeenCalledWith('c1');
    expect(handlers.onDelete).toHaveBeenCalledWith('c1');
  });

  it('disables merge on the last row and explains why', () => {
    renderWithI18n(<CaptionTable {...props()} />);

    const lastMerge = within(rowOf('c3')).getByRole('button', { name: 'Merge with next caption' });
    expect(lastMerge).toBeDisabled();
    expect(lastMerge.getAttribute('title')).toBe('No next caption to merge with');
    expect(within(rowOf('c2')).getByRole('button', { name: 'Merge with next caption' })).toBeEnabled();
  });

  it('nudges start and end by 100 ms', () => {
    const onNudge = vi.fn();
    renderWithI18n(<CaptionTable {...props({ onNudge })} />);

    fireEvent.click(within(rowOf('c1')).getByRole('button', { name: 'Start 100 ms later' }));
    fireEvent.click(within(rowOf('c1')).getByRole('button', { name: 'End 100 ms earlier' }));

    expect(onNudge).toHaveBeenCalledWith('c1', 100, 'start');
    expect(onNudge).toHaveBeenCalledWith('c1', -100, 'end');
  });

  it('moves the selection with Alt+ArrowDown and keeps the same column focused', () => {
    const onSelect = vi.fn();
    renderWithI18n(<CaptionTable {...props({ onSelect })} />);

    const originalInRow1 = within(rowOf('c1')).getByDisplayValue('Hello there');
    originalInRow1.focus();
    fireEvent.keyDown(originalInRow1, { key: 'ArrowDown', altKey: true });

    expect(onSelect).toHaveBeenCalledWith('c2');
    expect(document.activeElement).toBe(within(rowOf('c2')).getByDisplayValue('General Kenobi'));
  });

  it('moves the selection with Alt+ArrowUp in the translation column', () => {
    const onSelect = vi.fn();
    renderWithI18n(<CaptionTable {...props({ onSelect })} />);

    const translationInRow2 = within(rowOf('c2')).getByRole('textbox', { name: 'Translation (sr-Latn)' });
    translationInRow2.focus();
    fireEvent.keyDown(translationInRow2, { key: 'ArrowUp', altKey: true });

    expect(onSelect).toHaveBeenCalledWith('c1');
    expect(document.activeElement).toBe(within(rowOf('c1')).getByRole('textbox', { name: 'Translation (sr-Latn)' }));
  });

  it('does not move past the first or last row with Alt+Arrow', () => {
    const onSelect = vi.fn();
    renderWithI18n(<CaptionTable {...props({ onSelect })} />);

    const lastOriginal = within(rowOf('c3')).getByDisplayValue('Last one');
    fireEvent.keyDown(lastOriginal, { key: 'ArrowDown', altKey: true });

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('warns for each line longer than maxCharsPerLine', () => {
    const longLine = 'this line is definitely longer than ten';
    renderWithI18n(
      <CaptionTable
        {...props({
          maxCharsPerLine: 10,
          captions: [{ id: 'c1', startMs: 1000, endMs: 2000, original: `short\n${longLine}`, translation: '' }]
        })}
      />
    );

    expect(screen.getByText(`Line 2: ${longLine.length}/10 characters`)).toBeTruthy();
    expect(screen.queryByText(/Line 1:/)).toBeNull();
  });

  it('keeps an empty translation counted as pending in the header', () => {
    renderWithI18n(<CaptionTable {...props()} />);

    expect(screen.getByText('1 to translate')).toBeTruthy();
  });

  it('auto-scrolls the playing row unless a field in the table has focus', () => {
    // jsdom does not implement scrollIntoView, so stub it for this test only.
    const original = Element.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    try {
      const i18n = createI18n('en');
      const view = (value: CaptionTableProps) => (
        <I18nextProvider i18n={i18n}>
          <CaptionTable {...value} />
        </I18nextProvider>
      );

      const { rerender } = renderWithI18n(<CaptionTable {...props({ activeCaptionId: 'c1' })} />);
      expect(scrollIntoView).toHaveBeenCalledTimes(1);

      scrollIntoView.mockClear();
      within(rowOf('c3')).getByDisplayValue('Last one').focus();
      act(() => {
        rerender(view(props({ activeCaptionId: 'c3' })));
      });
      expect(scrollIntoView).not.toHaveBeenCalled();
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });
});

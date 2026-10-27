import { fireEvent, screen, within, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ExportDialog,
  type ExportDialogProps
} from '../../../src/renderer/src/components/workflow/ExportDialog';
import type { ExportOutputs } from '../../../src/shared/types/jobs';
import { renderWithI18n } from '../renderWithI18n';

const allOutputs: ExportOutputs = { originalSrt: true, translationSrt: true, video: 'original' };

function props(overrides: Partial<ExportDialogProps> = {}): ExportDialogProps {
  return {
    open: true,
    onOpenChange: vi.fn(),
    outputFolder: '/home/user/Videos',
    onChooseFolder: vi.fn(),
    baseName: 'clip',
    onBaseNameChange: vi.fn(),
    outputs: allOutputs,
    onOutputsChange: vi.fn(),
    includeLogo: true,
    onIncludeLogoChange: vi.fn(),
    sourceLanguage: 'en',
    targetLanguage: 'sr-Latn',
    blockingIssueCount: 0,
    missingTranslationCount: 0,
    busy: false,
    result: null,
    errorMessage: null,
    onExport: vi.fn(),
    onShowInFolder: vi.fn(),
    ...overrides
  };
}

function exportButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Export' });
}

afterEach(cleanup);

describe('ExportDialog', () => {
  it('lists the file names that will be created', () => {
    renderWithI18n(<ExportDialog {...props()} />);

    expect(screen.getByText('clip.en.srt')).toBeTruthy();
    expect(screen.getByText('clip.sr-Latn.srt')).toBeTruthy();
    expect(screen.getByText('clip.subtitled.mp4')).toBeTruthy();
    expect(exportButton()).toBeEnabled();
  });

  it('drops the names of outputs that are not selected', () => {
    renderWithI18n(
      <ExportDialog {...props({ outputs: { originalSrt: false, translationSrt: true, video: 'none' } })} />
    );

    expect(screen.queryByText('clip.en.srt')).toBeNull();
    expect(screen.getByText('clip.sr-Latn.srt')).toBeTruthy();
    expect(screen.queryByText('clip.subtitled.mp4')).toBeNull();
  });

  it('explains that nothing is selected and disables Export', () => {
    renderWithI18n(
      <ExportDialog {...props({ outputs: { originalSrt: false, translationSrt: false, video: 'none' } })} />
    );

    expect(screen.getByText('Select at least one output')).toBeTruthy();
    expect(exportButton()).toBeDisabled();
  });

  it('asks for a folder when none is chosen', () => {
    renderWithI18n(<ExportDialog {...props({ outputFolder: null })} />);

    expect(screen.getByText('No folder chosen')).toBeTruthy();
    expect(screen.getByText('Choose an output folder')).toBeTruthy();
    expect(exportButton()).toBeDisabled();
  });

  it('blocks export while caption issues are blocking', () => {
    renderWithI18n(<ExportDialog {...props({ blockingIssueCount: 2 })} />);

    expect(screen.getByText('Fix blocking caption issues: 2')).toBeTruthy();
    expect(exportButton()).toBeDisabled();
  });

  it('blocks translation outputs while rows are missing a translation', () => {
    renderWithI18n(<ExportDialog {...props({ missingTranslationCount: 3 })} />);

    expect(screen.getByText('Translate the remaining rows: 3')).toBeTruthy();
    expect(exportButton()).toBeDisabled();
  });

  it('allows original-only export even when translations are missing', () => {
    renderWithI18n(
      <ExportDialog
        {...props({
          missingTranslationCount: 3,
          outputs: { originalSrt: true, translationSrt: false, video: 'none' }
        })}
      />
    );

    expect(screen.queryByText('Translate the remaining rows: 3')).toBeNull();
    expect(exportButton()).toBeEnabled();
  });

  it('blocks video export burning the translation while translations are missing', () => {
    renderWithI18n(
      <ExportDialog
        {...props({
          missingTranslationCount: 1,
          outputs: { originalSrt: false, translationSrt: false, video: 'translation' }
        })}
      />
    );

    expect(screen.getByText('Translate the remaining rows: 1')).toBeTruthy();
    expect(exportButton()).toBeDisabled();
  });

  it('rejects a file name that contains path separators', () => {
    renderWithI18n(<ExportDialog {...props({ baseName: 'folder/clip' })} />);

    expect(screen.getByText('Enter a file name without slashes')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'File name' })).toHaveAttribute('aria-invalid', 'true');
    expect(exportButton()).toBeDisabled();
  });

  it('reports base name edits', () => {
    const onBaseNameChange = vi.fn();
    renderWithI18n(<ExportDialog {...props({ onBaseNameChange })} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'File name' }), { target: { value: 'my-clip' } });
    expect(onBaseNameChange).toHaveBeenCalledWith('my-clip');
  });

  it('calls onExport when everything is valid', () => {
    const onExport = vi.fn();
    renderWithI18n(<ExportDialog {...props({ onExport })} />);

    fireEvent.click(exportButton());
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it('reports output toggles and the video choice', () => {
    const onOutputsChange = vi.fn();
    renderWithI18n(<ExportDialog {...props({ onOutputsChange })} />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Original subtitles (.srt)' }));
    expect(onOutputsChange).toHaveBeenLastCalledWith({ ...allOutputs, originalSrt: false });

    fireEvent.click(screen.getByRole('button', { name: 'Burn translation' }));
    expect(onOutputsChange).toHaveBeenLastCalledWith({ ...allOutputs, video: 'translation' });
  });

  it('marks the selected video choice as pressed', () => {
    renderWithI18n(<ExportDialog {...props({ outputs: { ...allOutputs, video: 'none' } })} />);

    expect(screen.getByRole('button', { name: 'No video' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Burn original' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChooseFolder from the folder row', () => {
    const onChooseFolder = vi.fn();
    renderWithI18n(<ExportDialog {...props({ onChooseFolder })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }));
    expect(onChooseFolder).toHaveBeenCalledTimes(1);
  });

  it('shows progress and disables Export while busy', () => {
    renderWithI18n(<ExportDialog {...props({ busy: true, progress: 0.5 })} />);

    const progress = screen.getByRole('progressbar', { name: 'Exporting…' });
    expect(progress.getAttribute('aria-valuenow')).toBe('50');
    expect(screen.getByRole('button', { name: 'Exporting…' })).toBeDisabled();
  });

  it('lists created files with Show in folder and a Close button after success', () => {
    const onShowInFolder = vi.fn();
    renderWithI18n(
      <ExportDialog
        {...props({
          result: {
            files: [
              { kind: 'original_srt', path: '/home/user/Videos/clip.en.srt' },
              { kind: 'video', path: '/home/user/Videos/clip.subtitled.mp4' }
            ]
          },
          onShowInFolder
        })}
      />
    );

    const created = screen.getByRole('region', { name: 'Created files' });
    const rows = within(created).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('clip.en.srt')).toBeTruthy();
    expect(within(rows[0]).getByText('Original subtitles')).toBeTruthy();

    fireEvent.click(within(rows[1]).getByRole('button', { name: 'Show in folder' }));
    expect(onShowInFolder).toHaveBeenCalledWith('/home/user/Videos/clip.subtitled.mp4');

    expect(screen.getByRole('button', { name: 'Close' })).toBeEnabled();
  });

  it('shows the error message when export fails', () => {
    renderWithI18n(<ExportDialog {...props({ errorMessage: 'Export failed: disk full.' })} />);

    expect(screen.getByRole('alert').textContent).toBe('Export failed: disk full.');
  });
});

describe('ExportDialog logo choice', () => {
  it('shows the per-export logo choice as a checkbox', () => {
    renderWithI18n(<ExportDialog {...props({ includeLogo: false })} />);

    expect(screen.getByLabelText('Add logo')).not.toBeChecked();
  });

  it('reports a change of the logo choice without touching the outputs', () => {
    const onIncludeLogoChange = vi.fn();
    const onOutputsChange = vi.fn();
    renderWithI18n(<ExportDialog {...props({ includeLogo: false, onIncludeLogoChange, onOutputsChange })} />);

    fireEvent.click(screen.getByLabelText('Add logo'));

    expect(onIncludeLogoChange).toHaveBeenCalledWith(true);
    expect(onOutputsChange).not.toHaveBeenCalled();
  });

  it('is disabled when no video is exported, because there is nothing to draw the logo on', () => {
    renderWithI18n(<ExportDialog {...props({ outputs: { originalSrt: true, translationSrt: false, video: 'none' } })} />);

    expect(screen.getByLabelText('Add logo')).toBeDisabled();
  });
});


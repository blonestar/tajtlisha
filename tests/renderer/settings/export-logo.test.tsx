import '@testing-library/jest-dom/vitest';
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from '../../../src/renderer/src/pages/SettingsPage';
import type { AppSettings } from '../../../src/shared/types/settings';
import { mockSettings } from './mockSettings';
import { renderWithI18n } from '../renderWithI18n';
import { removeFakeApi } from './fixtures';

afterEach(() => {
  removeFakeApi();
});

function openExport(settings: AppSettings, onSettingsChange = vi.fn()) {
  renderWithI18n(<SettingsPage settings={settings} onLanguageChange={vi.fn()} onSettingsChange={onSettingsChange} />);
  fireEvent.click(screen.getByRole('button', { name: 'Export' }));
  return onSettingsChange;
}

describe('export settings: logo', () => {
  it('shows the logo controls with the stored values', () => {
    openExport(mockSettings);

    expect(screen.getByLabelText('Logo on video')).toBeChecked();
    expect(screen.getByRole('button', { name: 'T + tajtliša' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Top left' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('7%')).toBeInTheDocument();
    expect(screen.getByText('90%')).toBeInTheDocument();
  });

  it('turns the logo on and off with the switch', () => {
    const onSettingsChange = openExport({ ...mockSettings, watermark: { ...mockSettings.watermark, enabled: true } });

    fireEvent.click(screen.getByLabelText('Logo on video'));

    expect(onSettingsChange).toHaveBeenCalledWith({ watermark: { ...mockSettings.watermark, enabled: false } });
  });

  it('switches between the badge and the badge with the wordmark, keeping the other fields', () => {
    const onSettingsChange = openExport(mockSettings);

    fireEvent.click(screen.getByRole('button', { name: 'T' }));

    expect(onSettingsChange).toHaveBeenCalledWith({ watermark: { ...mockSettings.watermark, variant: 'icon' } });
  });

  it('chooses one of the four corners', () => {
    const onSettingsChange = openExport(mockSettings);

    fireEvent.click(screen.getByRole('button', { name: 'Bottom right' }));

    expect(onSettingsChange).toHaveBeenCalledWith({ watermark: { ...mockSettings.watermark, position: 'bottom_right' } });
  });

  it('changes the size and the opacity from the range inputs', () => {
    const onSettingsChange = openExport(mockSettings);

    fireEvent.change(screen.getByLabelText('Logo size'), { target: { value: '10' } });
    expect(onSettingsChange).toHaveBeenLastCalledWith({ watermark: { ...mockSettings.watermark, sizePercent: 10 } });

    fireEvent.change(screen.getByLabelText('Opacity'), { target: { value: '0.5' } });
    expect(onSettingsChange).toHaveBeenLastCalledWith({ watermark: { ...mockSettings.watermark, opacity: 0.5 } });
  });

  it('disables the detail controls while the logo is off', () => {
    openExport({ ...mockSettings, watermark: { ...mockSettings.watermark, enabled: false } });

    expect(screen.getByRole('button', { name: 'T' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Top left' })).toBeDisabled();
    expect(screen.getByLabelText('Logo size')).toBeDisabled();
    expect(screen.getByLabelText('Opacity')).toBeDisabled();
  });

  it('keeps the detail controls enabled while the logo is on', () => {
    openExport(mockSettings);

    expect(screen.getByRole('button', { name: 'T' })).toBeEnabled();
    expect(screen.getByLabelText('Logo size')).toBeEnabled();
  });
});

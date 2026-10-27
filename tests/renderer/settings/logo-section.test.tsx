import '@testing-library/jest-dom/vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nextProvider } from 'react-i18next';
import { SettingsPage } from '../../../src/renderer/src/pages/SettingsPage';
import { createI18n } from '../../../src/renderer/src/i18n';
import type { AppSettings } from '../../../src/shared/types/settings';
import type { WatermarkSettings } from '../../../src/shared/types/watermark';
import { DEFAULT_WATERMARK } from '../../../src/shared/watermark-geometry';
import { mockSettings } from './mockSettings';
import { renderWithI18n } from '../renderWithI18n';
import { removeFakeApi } from './fixtures';

afterEach(() => {
  removeFakeApi();
});

function withLogo(watermark: Partial<WatermarkSettings>): AppSettings {
  return { ...mockSettings, watermark: { ...DEFAULT_WATERMARK, ...watermark } };
}

function openLogo(settings: AppSettings, onSettingsChange = vi.fn()) {
  renderWithI18n(<SettingsPage settings={settings} onLanguageChange={vi.fn()} onSettingsChange={onSettingsChange} />);
  fireEvent.click(screen.getByRole('button', { name: 'Logo' }));
  return onSettingsChange;
}

describe('settings: Logo tab', () => {
  it('has its own Logo tab after Export, and the export section no longer has logo controls', () => {
    renderWithI18n(<SettingsPage settings={mockSettings} onLanguageChange={vi.fn()} onSettingsChange={vi.fn()} />);
    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    const labels = within(nav).getAllByRole('button').map((button) => button.textContent);
    expect(labels.indexOf('Logo')).toBe(labels.indexOf('Export') + 1);

    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(screen.getByText('Default output folder')).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Logo on video' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Logo size')).not.toBeInTheDocument();
  });

  it('shows every logo control with the stored values', () => {
    openLogo(mockSettings);

    expect(screen.getByRole('heading', { level: 2, name: 'Logo' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Logo on video' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Badge + text' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Badge letters')).toHaveValue('T');
    expect(screen.getByLabelText('Text')).toHaveValue('tajtliša');
    expect(screen.getByRole('button', { name: 'Behind all' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Background colour')).toHaveValue('#1d2025');
    expect(screen.getByLabelText('Badge colour')).toHaveValue('#f2a93b');
    expect(screen.getByLabelText('Text colour')).toHaveValue('#f2f2f2');
    expect(screen.getByLabelText('Corner roundness')).toHaveValue('19');
    expect(screen.getByRole('radio', { name: 'Top left' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Size')).toHaveValue('7');
    expect(screen.getByLabelText('Margin')).toHaveValue('3');
    expect(screen.getByLabelText('Opacity')).toHaveValue('0.9');
    expect(screen.getByText('90%')).toBeInTheDocument();
  });

  it('puts a live preview of the logo on the page', () => {
    const { container } = renderWithI18n(
      <SettingsPage settings={mockSettings} onLanguageChange={vi.fn()} onSettingsChange={vi.fn()} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Logo' }));

    const preview = container.querySelector('.logo-preview');
    expect(preview?.querySelector('.watermark-overlay')).not.toBeNull();
    expect(preview?.querySelectorAll('text')).toHaveLength(2);
    expect(preview?.querySelectorAll('text')[1]).toHaveTextContent('tajtliša');
  });

  it('turns the logo on and off with the switch', () => {
    const settings = withLogo({ enabled: true });
    const onSettingsChange = openLogo(settings);

    fireEvent.click(screen.getByRole('switch', { name: 'Logo on video' }));

    expect(onSettingsChange).toHaveBeenCalledWith({ watermark: { ...settings.watermark, enabled: false } });
  });

  it('chooses what the logo shows, keeping the other fields', () => {
    const onSettingsChange = openLogo(mockSettings);

    fireEvent.click(screen.getByRole('button', { name: 'Badge only' }));

    expect(onSettingsChange).toHaveBeenCalledWith({ watermark: { ...DEFAULT_WATERMARK, content: 'mark' } });
  });

  it('hides the text field when only the badge shows, and the badge field when only the text shows', () => {
    const { unmount } = renderWithI18n(
      <SettingsPage settings={withLogo({ content: 'mark' })} onLanguageChange={vi.fn()} onSettingsChange={vi.fn()} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Logo' }));
    expect(screen.getByLabelText('Badge letters')).toBeInTheDocument();
    expect(screen.queryByLabelText('Text')).not.toBeInTheDocument();
    unmount();

    renderWithI18n(<SettingsPage settings={withLogo({ content: 'text' })} onLanguageChange={vi.fn()} onSettingsChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Logo' }));
    expect(screen.queryByLabelText('Badge letters')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Text')).toBeInTheDocument();
  });

  it('sends the typed badge letters and text as they are typed, cleaned', () => {
    const onSettingsChange = openLogo(mockSettings);

    fireEvent.change(screen.getByLabelText('Badge letters'), { target: { value: 'MKX' } });
    expect(onSettingsChange).toHaveBeenLastCalledWith({ watermark: { ...DEFAULT_WATERMARK, markText: 'MKX' } });

    fireEvent.change(screen.getByLabelText('Text'), { target: { value: '  Moj kanal  ' } });
    expect(onSettingsChange).toHaveBeenLastCalledWith({ watermark: { ...DEFAULT_WATERMARK, text: 'Moj kanal' } });
  });

  it('keeps a space typed between words, because the draft is not replaced by the cleaned value', () => {
    openLogo(mockSettings);
    const input = screen.getByLabelText('Text') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'Moj ' } });
    expect(input).toHaveValue('Moj ');

    fireEvent.change(input, { target: { value: 'Moj k' } });
    expect(input).toHaveValue('Moj k');
  });

  it('limits the badge letters to 3 characters and the text to 30, counting code points', () => {
    const onSettingsChange = openLogo(mockSettings);
    const badge = screen.getByLabelText('Badge letters') as HTMLInputElement;
    const text = screen.getByLabelText('Text') as HTMLInputElement;

    // No maxLength: it counts UTF-16 units, while the limit counts characters.
    expect(badge).not.toHaveAttribute('maxlength');
    fireEvent.change(badge, { target: { value: 'ŠĐŽ' } });
    expect(badge).toHaveValue('ŠĐŽ');
    fireEvent.change(badge, { target: { value: 'ŠĐŽX' } });
    expect(badge).toHaveValue('ŠĐŽ');
    expect(onSettingsChange).toHaveBeenLastCalledWith({ watermark: { ...DEFAULT_WATERMARK, markText: 'ŠĐŽ' } });

    fireEvent.change(text, { target: { value: 'a'.repeat(31) } });
    expect(text).toHaveValue('a'.repeat(30));
  });

  it('drops characters the logo cannot draw and shows the cleaned text when leaving the field', () => {
    const onSettingsChange = openLogo(mockSettings);
    const text = screen.getByLabelText('Text') as HTMLInputElement;

    fireEvent.change(text, { target: { value: '{Moj} \\N kanal \u{1F600} ' } });
    expect(onSettingsChange).toHaveBeenLastCalledWith({ watermark: { ...DEFAULT_WATERMARK, text: 'Moj N kanal' } });

    fireEvent.blur(text);
    expect(text).toHaveValue('Moj N kanal');
  });

  it('follows a text change that comes from outside this field', () => {
    const settings = withLogo({ text: 'Prvi' });
    const { rerender } = renderWithI18n(
      <SettingsPage settings={settings} onLanguageChange={vi.fn()} onSettingsChange={vi.fn()} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Logo' }));
    expect(screen.getByLabelText('Text')).toHaveValue('Prvi');

    rerender(
      <I18nextProvider i18n={createI18n('en')}>
        <SettingsPage settings={withLogo({ text: 'Drugi' })} onLanguageChange={vi.fn()} onSettingsChange={vi.fn()} />
      </I18nextProvider>
    );

    expect(screen.getByLabelText('Text')).toHaveValue('Drugi');
  });

  it('changes the colours from the colour inputs', () => {
    const onSettingsChange = openLogo(mockSettings);

    fireEvent.change(screen.getByLabelText('Background colour'), { target: { value: '#112233' } });
    expect(onSettingsChange).toHaveBeenLastCalledWith({ watermark: { ...DEFAULT_WATERMARK, backgroundColor: '#112233' } });

    fireEvent.change(screen.getByLabelText('Badge colour'), { target: { value: '#aabbcc' } });
    expect(onSettingsChange).toHaveBeenLastCalledWith({ watermark: { ...DEFAULT_WATERMARK, markColor: '#aabbcc' } });

    fireEvent.change(screen.getByLabelText('Text colour'), { target: { value: '#00ff00' } });
    expect(onSettingsChange).toHaveBeenLastCalledWith({ watermark: { ...DEFAULT_WATERMARK, textColor: '#00ff00' } });
  });

  it('changes the background, the corner roundness, the size, the margin and the opacity', () => {
    const onSettingsChange = openLogo(mockSettings);

    fireEvent.click(screen.getByRole('button', { name: 'Behind badge' }));
    expect(onSettingsChange).toHaveBeenLastCalledWith({ watermark: { ...DEFAULT_WATERMARK, background: 'mark' } });

    fireEvent.change(screen.getByLabelText('Corner roundness'), { target: { value: '40' } });
    expect(onSettingsChange).toHaveBeenLastCalledWith({ watermark: { ...DEFAULT_WATERMARK, cornerRadiusPercent: 40 } });

    fireEvent.change(screen.getByLabelText('Size'), { target: { value: '10' } });
    expect(onSettingsChange).toHaveBeenLastCalledWith({ watermark: { ...DEFAULT_WATERMARK, sizePercent: 10 } });

    fireEvent.change(screen.getByLabelText('Margin'), { target: { value: '5' } });
    expect(onSettingsChange).toHaveBeenLastCalledWith({ watermark: { ...DEFAULT_WATERMARK, marginPercent: 5 } });

    fireEvent.change(screen.getByLabelText('Opacity'), { target: { value: '0.5' } });
    expect(onSettingsChange).toHaveBeenLastCalledWith({ watermark: { ...DEFAULT_WATERMARK, opacity: 0.5 } });
  });

  it('chooses one of the six positions and moves with the arrow keys', () => {
    const onSettingsChange = openLogo(mockSettings);

    fireEvent.click(screen.getByRole('radio', { name: 'Bottom center' }));
    expect(onSettingsChange).toHaveBeenLastCalledWith({ watermark: { ...DEFAULT_WATERMARK, position: 'bottom_center' } });

    fireEvent.keyDown(screen.getByRole('radio', { name: 'Top left' }), { key: 'ArrowRight' });
    expect(onSettingsChange).toHaveBeenLastCalledWith({ watermark: { ...DEFAULT_WATERMARK, position: 'top_center' } });

    fireEvent.keyDown(screen.getByRole('radio', { name: 'Top left' }), { key: 'ArrowDown' });
    expect(onSettingsChange).toHaveBeenLastCalledWith({ watermark: { ...DEFAULT_WATERMARK, position: 'bottom_left' } });
  });

  it('disables every other control while the logo is off', () => {
    openLogo(withLogo({ enabled: false }));

    expect(screen.getByRole('switch', { name: 'Logo on video' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Badge + text' })).toBeDisabled();
    expect(screen.getByLabelText('Badge letters')).toBeDisabled();
    expect(screen.getByLabelText('Text')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Behind all' })).toBeDisabled();
    expect(screen.getByLabelText('Background colour')).toBeDisabled();
    expect(screen.getByLabelText('Corner roundness')).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Top left' })).toBeDisabled();
    expect(screen.getByLabelText('Size')).toBeDisabled();
    expect(screen.getByLabelText('Margin')).toBeDisabled();
    expect(screen.getByLabelText('Opacity')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reset to defaults' })).toBeDisabled();
  });

  it('keeps the controls enabled while the logo is on', () => {
    openLogo(mockSettings);

    expect(screen.getByRole('button', { name: 'Badge + text' })).toBeEnabled();
    expect(screen.getByLabelText('Size')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reset to defaults' })).toBeEnabled();
  });

  it('resets every logo setting to the defaults with the reset button', () => {
    const onSettingsChange = openLogo(withLogo({ enabled: true, text: 'Moj kanal', position: 'bottom_right', sizePercent: 12 }));

    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));

    expect(onSettingsChange).toHaveBeenCalledWith({ watermark: { ...DEFAULT_WATERMARK } });
  });

  it('clears a typed draft on reset even when its cleaned value already equals the default', () => {
    openLogo(mockSettings);
    const text = screen.getByLabelText('Text') as HTMLInputElement;

    fireEvent.change(text, { target: { value: ' tajtliša ' } });
    expect(text).toHaveValue(' tajtliša ');
    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));

    expect(screen.getByLabelText('Text')).toHaveValue('tajtliša');
  });
});

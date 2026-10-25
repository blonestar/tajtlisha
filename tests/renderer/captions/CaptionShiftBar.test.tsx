import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CaptionShiftBar, parseShiftSeconds } from '../../../src/renderer/src/components/captions/CaptionShiftBar';
import { renderWithI18n } from '../renderWithI18n';

afterEach(cleanup);

describe('parseShiftSeconds', () => {
  it('accepts dot and comma decimals and rejects zero, negatives and junk', () => {
    expect(parseShiftSeconds('1.5')).toBe(1500);
    expect(parseShiftSeconds(' 0,25 ')).toBe(250);
    expect(parseShiftSeconds('.5')).toBe(500);
    expect(parseShiftSeconds('2')).toBe(2000);
    expect(parseShiftSeconds('0')).toBeNull();
    expect(parseShiftSeconds('-1')).toBeNull();
    expect(parseShiftSeconds('abc')).toBeNull();
    expect(parseShiftSeconds('')).toBeNull();
    expect(parseShiftSeconds('9999')).toBeNull();
  });
});

describe('CaptionShiftBar', () => {
  it('shifts earlier and later by the typed amount, 0.5 s by default', () => {
    const onShift = vi.fn();
    renderWithI18n(<CaptionShiftBar onShift={onShift} />);

    fireEvent.click(screen.getByRole('button', { name: /Later/ }));
    expect(onShift).toHaveBeenLastCalledWith(500);

    fireEvent.change(screen.getByRole('textbox', { name: 'Shift amount in seconds' }), { target: { value: '1,5' } });
    fireEvent.click(screen.getByRole('button', { name: /Earlier/ }));
    expect(onShift).toHaveBeenLastCalledWith(-1500);
  });

  it('disables both buttons for an invalid amount', () => {
    const onShift = vi.fn();
    renderWithI18n(<CaptionShiftBar onShift={onShift} />);

    const input = screen.getByRole('textbox', { name: 'Shift amount in seconds' });
    fireEvent.change(input, { target: { value: '0' } });

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: /Earlier/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Later/ })).toBeDisabled();
  });
});

import { LOCAL_CLI_PROVIDER_IDS, type AiProviderId } from '../../shared/types/ai';
import { AppError } from '../../shared/errors';
import {
  WATERMARK_BACKGROUNDS,
  WATERMARK_CONTENTS,
  WATERMARK_POSITIONS,
  type WatermarkSettings
} from '../../shared/types/watermark';
import { isWatermarkColor, normalizeWatermark } from '../../shared/watermark-geometry';

/**
 * Boundary checks for renderer payloads. Messages name the field only, never
 * the value, so secrets sent by mistake are not echoed back.
 */
export function invalidInput(field: string, expectation: string): AppError {
  return new AppError('UNKNOWN', `${field} must be ${expectation}.`);
}

export function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidInput(field, 'an object');
  }
  return value as Record<string, unknown>;
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw invalidInput(field, 'a non-empty string');
  }
  return value;
}

/** Empty is allowed (for example a caption with no text). */
export function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw invalidInput(field, 'a string');
  }
  return value;
}

export function requireFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw invalidInput(field, 'a finite number');
  }
  return value;
}

export function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw invalidInput(field, 'an array');
  }
  return value;
}

export function requireJobId(value: unknown): string {
  return requireString(value, 'jobId');
}

export function requireOneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw invalidInput(field, `one of ${allowed.join(', ')}`);
  }
  return value as T;
}

export function requireProviderId(value: unknown): AiProviderId {
  const providerIds: readonly AiProviderId[] = ['openai', 'openrouter', ...LOCAL_CLI_PROVIDER_IDS];
  return requireOneOf<AiProviderId>(value, providerIds, 'providerId');
}

export function requireTimeRange(value: unknown, field: string): { startMs: number; endMs: number } {
  const range = requireRecord(value, field);
  const startMs = requireFiniteNumber(range.startMs, `${field}.startMs`);
  const endMs = requireFiniteNumber(range.endMs, `${field}.endMs`);
  if (startMs < 0 || endMs <= startMs) {
    throw invalidInput(field, 'a range with 0 <= startMs < endMs');
  }
  return { startMs, endMs };
}

export function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw invalidInput(field, 'a boolean');
  }
  return value;
}

/**
 * Wrong types, unknown enum values and colours that are not #rrggbb are
 * rejected. Accepted text is cleaned and numbers clamped by the shared
 * normalizeWatermark, the same as the settings store.
 */
export function requireWatermark(value: unknown, field: string): WatermarkSettings {
  const input = requireRecord(value, field);
  requireBoolean(input.enabled, `${field}.enabled`);
  requireOneOf(input.content, WATERMARK_CONTENTS, `${field}.content`);
  requireText(input.markText, `${field}.markText`);
  requireText(input.text, `${field}.text`);
  requireOneOf(input.background, WATERMARK_BACKGROUNDS, `${field}.background`);
  requireColor(input.backgroundColor, `${field}.backgroundColor`);
  requireColor(input.markColor, `${field}.markColor`);
  requireColor(input.textColor, `${field}.textColor`);
  requireFiniteNumber(input.cornerRadiusPercent, `${field}.cornerRadiusPercent`);
  requireOneOf(input.position, WATERMARK_POSITIONS, `${field}.position`);
  requireFiniteNumber(input.sizePercent, `${field}.sizePercent`);
  requireFiniteNumber(input.marginPercent, `${field}.marginPercent`);
  requireFiniteNumber(input.opacity, `${field}.opacity`);
  return normalizeWatermark(input);
}

function requireColor(value: unknown, field: string): string {
  if (typeof value !== 'string' || !isWatermarkColor(value)) {
    throw invalidInput(field, 'a #rrggbb colour');
  }
  return value;
}

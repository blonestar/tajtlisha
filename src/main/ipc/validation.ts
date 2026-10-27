import type { AiProviderId } from '../../shared/types/ai';
import { AppError } from '../../shared/errors';
import { WATERMARK_POSITIONS, WATERMARK_VARIANTS, type WatermarkSettings } from '../../shared/types/watermark';
import { clampWatermark } from '../../shared/watermark-geometry';

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
  return requireOneOf<AiProviderId>(value, ['openai', 'openrouter'], 'providerId');
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

/** Wrong types are rejected; numbers are clamped to the shared ranges, the same as the settings store. */
export function requireWatermark(value: unknown, field: string): WatermarkSettings {
  const input = requireRecord(value, field);
  return clampWatermark({
    enabled: requireBoolean(input.enabled, `${field}.enabled`),
    variant: requireOneOf(input.variant, WATERMARK_VARIANTS, `${field}.variant`),
    position: requireOneOf(input.position, WATERMARK_POSITIONS, `${field}.position`),
    sizePercent: requireFiniteNumber(input.sizePercent, `${field}.sizePercent`),
    marginPercent: requireFiniteNumber(input.marginPercent, `${field}.marginPercent`),
    opacity: requireFiniteNumber(input.opacity, `${field}.opacity`)
  });
}

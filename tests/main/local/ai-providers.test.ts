/* @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { DEFAULT_DISABLED_PROVIDER_IDS, isProviderEnabled } from '../../../src/shared/ai-providers';
import type { AiConnectorSettings } from '../../../src/shared/types/settings';

function connectorWith(enabledProviders: AiConnectorSettings['enabledProviders']): Pick<AiConnectorSettings, 'enabledProviders'> {
  return { enabledProviders };
}

describe('isProviderEnabled', () => {
  it('turns Claude Code off by default and every other connector on', () => {
    expect(DEFAULT_DISABLED_PROVIDER_IDS).toEqual(['claude_code_cli']);
    const defaults = connectorWith({});

    expect(isProviderEnabled(defaults, 'claude_code_cli')).toBe(false);
    expect(isProviderEnabled(defaults, 'openai')).toBe(true);
    expect(isProviderEnabled(defaults, 'openrouter')).toBe(true);
    expect(isProviderEnabled(defaults, 'codex_cli')).toBe(true);
  });

  it('uses the explicit choice over the default, in both directions', () => {
    expect(isProviderEnabled(connectorWith({ claude_code_cli: true }), 'claude_code_cli')).toBe(true);
    expect(isProviderEnabled(connectorWith({ openai: false }), 'openai')).toBe(false);
  });

  it('ignores a non-boolean entry and falls back to the default', () => {
    const junk = { claude_code_cli: 'yes', openai: 0 } as unknown as AiConnectorSettings['enabledProviders'];

    expect(isProviderEnabled(connectorWith(junk), 'claude_code_cli')).toBe(false);
    expect(isProviderEnabled(connectorWith(junk), 'openai')).toBe(true);
  });
});

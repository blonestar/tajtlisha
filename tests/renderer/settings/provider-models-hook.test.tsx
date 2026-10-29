import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AiProviderId, ProviderModelDescriptor } from '../../../src/shared/types/ai';
import { useProviderModels } from '../../../src/renderer/src/components/settings/hooks';

function model(id: string): ProviderModelDescriptor {
  return { id, label: id, capability: 'translation' };
}

describe('useProviderModels', () => {
  it('never returns the previous provider models while the next provider is loading', async () => {
    let resolveClaude: (models: ProviderModelDescriptor[]) => void = () => undefined;
    const onListModels = vi.fn((providerId: AiProviderId) =>
      providerId === 'openai'
        ? Promise.resolve([model('gpt-4.1-mini')])
        : new Promise<ProviderModelDescriptor[]>((resolve) => {
            resolveClaude = resolve;
          })
    );

    const { result, rerender } = renderHook(
      ({ providerId }: { providerId: AiProviderId }) => useProviderModels(providerId, 'translation', true, onListModels),
      { initialProps: { providerId: 'openai' as AiProviderId } }
    );
    await waitFor(() => expect(result.current.models.map((m) => m.id)).toEqual(['gpt-4.1-mini']));

    rerender({ providerId: 'claude_code_cli' });
    expect(result.current).toEqual({ models: [], state: 'loading' });

    await act(async () => resolveClaude([model('sonnet')]));
    expect(result.current).toEqual({ models: [model('sonnet')], state: 'ready' });
  });

  it('is idle without a connected provider', () => {
    const { result } = renderHook(() => useProviderModels('openai', 'translation', false, vi.fn()));

    expect(result.current).toEqual({ models: [], state: 'idle' });
  });
});

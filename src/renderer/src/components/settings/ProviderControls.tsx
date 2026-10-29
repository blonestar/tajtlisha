import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  REASONING_EFFORTS,
  type AiProviderCapabilities,
  type AiProviderId,
  type ProviderModelDescriptor,
  type ProviderStatus,
  type ReasoningEffort
} from '../../../../shared/types/ai';
import type { ModelsState } from './hooks';

/**
 * Provider choice for one AI task. Offers the connected providers that can do
 * the task. A chosen provider that is not usable now stays selectable, marked
 * as not connected, so the saved choice is never shown as something else.
 */
type ProviderSelectProps = {
  id: string;
  /** '' = nothing chosen. */
  value: AiProviderId | '';
  providers: ProviderStatus[];
  capability: keyof AiProviderCapabilities;
  /** Label of a blank choice the user can pick (the summary's "Same as translation"). Without it, blank only shows when nothing is chosen. */
  blankLabel?: string;
  onChange: (providerId: AiProviderId | '') => void;
};

export function ProviderSelect({ id, value, providers, capability, blankLabel, onChange }: ProviderSelectProps): ReactElement {
  const { t } = useTranslation();
  const options = providers.filter((provider) => (provider.connected && provider.capabilities[capability]) || provider.id === value);
  const hasStatusForValue = options.some((provider) => provider.id === value);

  return (
    <select id={id} className="select" value={value} onChange={(event) => onChange(event.currentTarget.value as AiProviderId | '')}>
      {blankLabel || !value ? <option value="">{blankLabel ?? t('settings.ai.noProviderChosen')}</option> : null}
      {value && !hasStatusForValue ? <option value={value}>{t('settings.ai.providerNotConnected', { provider: value })}</option> : null}
      {options.map((provider) => (
        <option key={provider.id} value={provider.id}>
          {provider.connected ? provider.displayName : t('settings.ai.providerNotConnected', { provider: provider.displayName })}
        </option>
      ))}
    </select>
  );
}

type ModelPickerProps = {
  id: string;
  /** Stored model id. '' = provider default. */
  value: string;
  models: ProviderModelDescriptor[];
  state: ModelsState;
  /** Shows the timing badge of the chosen model. Only transcription models have timing. */
  showTiming?: boolean;
  onChange: (modelId: string) => void;
};

/**
 * Model of the chosen provider. "Provider default" is stored as ''. A saved
 * model stays selectable when the provider no longer lists it.
 */
export function ModelPicker({ id, value, models, state, showTiming = false, onChange }: ModelPickerProps): ReactElement {
  const { t } = useTranslation();
  const selected = models.find((model) => model.id === value);

  return (
    <>
      <div className="settings-inline">
        <select id={id} className="select" value={value} onChange={(event) => onChange(event.currentTarget.value)}>
          <option value="">{t('settings.ai.modelDefault')}</option>
          {modelOptions(models, value).map((model) => (
            <option key={model.id} value={model.id}>
              {model.label}
            </option>
          ))}
        </select>
        {showTiming ? <TimingBadge model={selected} /> : null}
      </div>
      <ModelsStatus state={state} />
    </>
  );
}

type EffortChoice = 'default' | ReasoningEffort;

type EffortSelectProps = {
  id: string;
  value: EffortChoice;
  onChange: (effort: EffortChoice) => void;
};

/** Thinking effort. 'default' sends no reasoning parameter, so non-reasoning models keep working. */
export function EffortSelect({ id, value, onChange }: EffortSelectProps): ReactElement {
  const { t } = useTranslation();

  return (
    <select id={id} className="select" value={value} onChange={(event) => onChange(event.currentTarget.value as EffortChoice)}>
      <option value="default">{t('settings.summary.effortDefault')}</option>
      {REASONING_EFFORTS.map((effort) => (
        <option key={effort} value={effort}>
          {t(`settings.summary.effortLevels.${effort}`)}
        </option>
      ))}
    </select>
  );
}

function ModelsStatus({ state }: { state: ModelsState }): ReactElement | null {
  const { t } = useTranslation();

  if (state === 'loading') {
    return <p className="settings-row-hint">{t('settings.ai.modelsLoading')}</p>;
  }

  if (state === 'error') {
    return <p className="message message-error">{t('settings.ai.modelsError')}</p>;
  }

  return null;
}

function TimingBadge({ model }: { model?: ProviderModelDescriptor }): ReactElement | null {
  const { t } = useTranslation();

  switch (model?.timestamps) {
    case 'word':
      return <span className="badge badge-success">{t('settings.ai.timing.word')}</span>;
    case 'none':
      return <span className="badge badge-warning">{t('settings.ai.timing.none')}</span>;
    case 'segment':
      return <span className="badge badge-muted">{t('settings.ai.timing.segment')}</span>;
    default:
      return null;
  }
}

/** Keeps a saved model selectable even when the provider no longer lists it. */
function modelOptions(models: ProviderModelDescriptor[], selectedModelId: string): ProviderModelDescriptor[] {
  if (!selectedModelId || models.some((model) => model.id === selectedModelId)) {
    return models;
  }

  return [{ id: selectedModelId, label: selectedModelId, capability: 'translation' }, ...models];
}

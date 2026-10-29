import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_SUMMARY_PROMPT, MAX_SUMMARY_PROMPT_CHARS } from '../../../../shared/summary';
import type {
  AiProviderCapabilities,
  AiProviderId,
  ProviderModelDescriptor,
  ProviderStatus
} from '../../../../shared/types/ai';
import type { AppSettings, SummarySettings as SummarySettingsValue } from '../../../../shared/types/settings';
import { providerRolesOf } from '../../utils/providerRoles';
import { useCommitOnUnmount } from './hooks';
import { EffortSelect, ProviderSelect } from './ProviderControls';
import { SettingsRow, SettingsSwitch } from './SettingsPrimitives';

type SummarySettingsProps = {
  settings: AppSettings;
  providers?: ProviderStatus[];
  onSettingsChange?: (patch: Partial<AppSettings>) => void;
  onListModels?: (providerId: AiProviderId, capability: keyof AiProviderCapabilities) => Promise<ProviderModelDescriptor[]>;
};

/**
 * Stored as '' for "Same as translation". Settings patches cannot carry undefined,
 * and main normalizes '' to unset, the same as an unregistered provider.
 */
const SAME_AS_TRANSLATION = '' as unknown as AiProviderId;

/** A blank stored prompt means the default, the same way main and the request builder treat it. */
function shownPrompt(stored: string): string {
  return stored.trim() === '' ? DEFAULT_SUMMARY_PROMPT : stored;
}

/**
 * The Summary settings tab. The switch only shows or hides the Summarize button
 * in the editor; the prompt, provider, model and effort stay editable either way.
 */
export function SummarySettings({ settings, providers = [], onSettingsChange, onListModels }: SummarySettingsProps): ReactElement {
  const { t } = useTranslation();
  const summary = settings.summary;
  const roles = providerRolesOf(settings, providers);
  const summaryProvider = providers.find((provider) => provider.id === roles.summaryId);
  // "Same as translation" names the provider it resolves to, so the select shows what is used.
  const textProviderName = providers.find((provider) => provider.id === roles.textId)?.displayName ?? t('settings.ai.noProviderChosen');
  // Only a registered provider is shown as chosen; an unregistered stored id falls back to "Same as translation".
  const chosenSummaryProvider = providers.some((provider) => provider.id === summary.providerId) ? summary.providerId : undefined;

  function updateSummary(patch: Partial<SummarySettingsValue>): void {
    onSettingsChange?.({ summary: { ...summary, ...patch } });
  }

  return (
    <>
      <SettingsRow label={t('settings.summary.enable')} htmlFor="settings-summary-enabled" hint={t('settings.summary.enableHint')}>
        <SettingsSwitch
          id="settings-summary-enabled"
          checked={summary.enabled}
          onChange={(enabled) => updateSummary({ enabled })}
        />
      </SettingsRow>

      <h3 className="settings-subheading">{t('settings.ai.providerAndModel')}</h3>
      <SettingsRow
        label={t('settings.summary.provider')}
        htmlFor="settings-summary-provider"
        hint={t('settings.summary.providerHint', {
          provider: summaryProvider?.displayName ?? t('settings.ai.noProviderChosen')
        })}
      >
        <ProviderSelect
          id="settings-summary-provider"
          value={chosenSummaryProvider ?? ''}
          providers={providers}
          capability="summary"
          blankLabel={t('settings.summary.sameAsTranslation', { provider: textProviderName })}
          onChange={(providerId) => updateSummary({ providerId: providerId === '' ? SAME_AS_TRANSLATION : providerId })}
        />
      </SettingsRow>

      <SummaryModelRow
        key={summaryProvider?.id ?? 'none'}
        provider={summaryProvider}
        settings={settings}
        onSettingsChange={onSettingsChange}
        onListModels={onListModels}
      />

      <SettingsRow label={t('settings.summary.effort')} htmlFor="settings-summary-effort" hint={t('settings.summary.effortHint')}>
        <EffortSelect
          id="settings-summary-effort"
          value={summary.reasoningEffort}
          onChange={(reasoningEffort) => updateSummary({ reasoningEffort })}
        />
      </SettingsRow>

      <SummaryPromptRow systemPrompt={summary.systemPrompt} onCommit={(systemPrompt) => updateSummary({ systemPrompt })} />
    </>
  );
}

type SummaryModelRowProps = {
  provider?: ProviderStatus;
  settings: AppSettings;
  onSettingsChange?: (patch: Partial<AppSettings>) => void;
  onListModels?: SummarySettingsProps['onListModels'];
};

/**
 * Summary model of the active provider. Free text with suggestions, because model
 * lists change often. Blank means "same as the text model" and is stored as ''.
 */
function SummaryModelRow({ provider, settings, onSettingsChange, onListModels }: SummaryModelRowProps): ReactElement {
  const { t } = useTranslation();
  const providerId = provider?.id;
  const usable = Boolean(provider?.connected && provider.capabilities.summary);
  const storedModel = (providerId && settings.summary.modelByProvider[providerId]) || '';
  const [draft, setDraft] = useState(storedModel);
  const [models, setModels] = useState<ProviderModelDescriptor[]>([]);

  useEffect(() => {
    setDraft(storedModel);
  }, [storedModel]);

  // Suggestions only: when the list fails, the free-text field still works.
  useEffect(() => {
    if (!usable || !providerId || !onListModels) {
      setModels([]);
      return undefined;
    }

    let active = true;
    onListModels(providerId, 'summary').then(
      (next) => {
        if (active) setModels(next);
      },
      () => {
        if (active) setModels([]);
      }
    );
    return () => {
      active = false;
    };
  }, [usable, providerId, onListModels]);

  const committed = useRef(storedModel);
  useEffect(() => {
    committed.current = storedModel;
  }, [storedModel]);

  function save(value: string): void {
    const next = value.trim();
    if (!providerId || next === committed.current) return;

    committed.current = next;
    const summary = settings.summary;
    onSettingsChange?.({ summary: { ...summary, modelByProvider: { ...summary.modelByProvider, [providerId]: next } } });
  }

  // Esc closes Settings without a blur; save what was typed.
  useCommitOnUnmount(draft, save);

  function commit(): void {
    setDraft(draft.trim());
    save(draft);
  }

  const hint = !provider?.connected
    ? t('settings.summary.modelUnavailable')
    : !provider.capabilities.summary
      ? t('settings.summary.modelUnsupported', { provider: provider.displayName })
      : `${t('settings.summary.modelProvider', { provider: provider.displayName })} ${t('settings.ai.summaryModelHint')}`;

  return (
    <SettingsRow label={t('settings.ai.summaryModel')} htmlFor="settings-summary-model" hint={hint}>
      <input
        id="settings-summary-model"
        className="input input-mono"
        type="text"
        list="settings-summary-models"
        autoComplete="off"
        spellCheck={false}
        disabled={!usable}
        placeholder={t('settings.ai.summaryModelPlaceholder')}
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
        }}
      />
      <datalist id="settings-summary-models">
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.label}
          </option>
        ))}
      </datalist>
    </SettingsRow>
  );
}

type SummaryPromptRowProps = {
  systemPrompt: string;
  onCommit: (systemPrompt: string) => void;
};

/**
 * The prompt is edited as a local draft and committed on blur, so typing does not
 * write settings on every keystroke. Blank is stored as '' and shown as the default.
 */
function SummaryPromptRow({ systemPrompt, onCommit }: SummaryPromptRowProps): ReactElement {
  const { t } = useTranslation();
  const stored = shownPrompt(systemPrompt);
  const [draft, setDraft] = useState(stored);

  useEffect(() => {
    setDraft(stored);
  }, [stored]);

  const isDefault = stored === DEFAULT_SUMMARY_PROMPT;

  // Esc closes Settings without a blur, so a draft that was never committed is committed on unmount.
  // `committed` holds the last saved value as shown (blank = default), so a blur that already
  // saved it, or a blank draft that now shows the default, never causes a second write.
  const committed = useRef(stored);
  useEffect(() => {
    committed.current = stored;
  }, [stored]);
  useCommitOnUnmount(draft, (pending) => {
    if (shownPrompt(pending) !== committed.current) onCommit(pending.trim() === '' ? '' : pending);
  });

  function commitDraft(): void {
    const next = draft.trim() === '' ? '' : draft;
    setDraft(shownPrompt(next));
    if (shownPrompt(next) === committed.current) return;

    committed.current = shownPrompt(next);
    onCommit(next);
  }

  function resetPrompt(): void {
    committed.current = DEFAULT_SUMMARY_PROMPT;
    setDraft(DEFAULT_SUMMARY_PROMPT);
    onCommit(DEFAULT_SUMMARY_PROMPT);
  }

  return (
    <SettingsRow label={t('settings.summary.prompt')} htmlFor="settings-summary-prompt" hint={t('settings.summary.promptHint')}>
      <textarea
        id="settings-summary-prompt"
        className="textarea settings-summary-prompt"
        rows={6}
        maxLength={MAX_SUMMARY_PROMPT_CHARS}
        spellCheck={false}
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commitDraft}
      />
      <div className="settings-inline settings-prompt-footer">
        <span className="muted">
          {t('settings.summary.promptCounter', { count: draft.length, max: MAX_SUMMARY_PROMPT_CHARS })}
        </span>
        <button type="button" className="btn btn-ghost" disabled={isDefault} onClick={resetPrompt}>
          {t('settings.summary.resetPrompt')}
        </button>
      </div>
    </SettingsRow>
  );
}

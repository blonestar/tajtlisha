import type { ReactElement } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_SUMMARY_PROMPT, MAX_SUMMARY_PROMPT_CHARS } from '../../../../shared/summary';
import { REASONING_EFFORTS } from '../../../../shared/types/ai';
import type { AppSettings, SummarySettings as SummarySettingsValue } from '../../../../shared/types/settings';
import { SettingsRow, SettingsSwitch } from './SettingsPrimitives';

type SummarySettingsProps = {
  settings: AppSettings;
  onSettingsChange?: (patch: Partial<AppSettings>) => void;
};

type EffortChoice = SummarySettingsValue['reasoningEffort'];

/** A blank stored prompt means the default, the same way main and the request builder treat it. */
function shownPrompt(stored: string): string {
  return stored.trim() === '' ? DEFAULT_SUMMARY_PROMPT : stored;
}

/**
 * Settings for the optional transcript summary. Everything below the switch is
 * hidden while the feature is off, so the Editor's Summarize action has one switch to follow.
 */
export function SummarySettings({ settings, onSettingsChange }: SummarySettingsProps): ReactElement {
  const { t } = useTranslation();
  const summary = settings.summary;

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

      {summary.enabled ? (
        <>
          <SummaryPromptRow systemPrompt={summary.systemPrompt} onCommit={(systemPrompt) => updateSummary({ systemPrompt })} />

          <SettingsRow label={t('settings.summary.effort')} htmlFor="settings-summary-effort" hint={t('settings.summary.effortHint')}>
            <select
              id="settings-summary-effort"
              className="select"
              value={summary.reasoningEffort}
              onChange={(event) => updateSummary({ reasoningEffort: event.currentTarget.value as EffortChoice })}
            >
              <option value="default">{t('settings.summary.effortDefault')}</option>
              {REASONING_EFFORTS.map((effort) => (
                <option key={effort} value={effort}>
                  {t(`settings.summary.effortLevels.${effort}`)}
                </option>
              ))}
            </select>
          </SettingsRow>
        </>
      ) : null}
    </>
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
  // `committed` stops a second write after a blur already saved it (for example when the switch turns the feature off).
  const committed = useRef(stored);
  const latest = useRef({ draft, onCommit });
  useLayoutEffect(() => {
    latest.current = { draft, onCommit };
  });
  useEffect(
    () => () => {
      const { draft: pending, onCommit: commit } = latest.current;
      if (pending !== committed.current) commit(pending.trim() === '' ? '' : pending);
    },
    []
  );

  useEffect(() => {
    committed.current = stored;
  }, [stored]);

  function commitDraft(): void {
    if (draft === stored || draft === committed.current) return;

    const next = draft.trim() === '' ? '' : draft;
    committed.current = draft;
    onCommit(next);
    setDraft(shownPrompt(next));
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

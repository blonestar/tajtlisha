import type { ReactElement, ReactNode } from 'react';

type SettingsRowProps = {
  label: string;
  /** Id of the control this row labels. Use with `labelId` for groups instead. */
  htmlFor?: string;
  labelId?: string;
  hint?: ReactNode;
  children: ReactNode;
};

/** One setting: title and hint on the left, control(s) on the right. */
export function SettingsRow({ label, htmlFor, labelId, hint, children }: SettingsRowProps): ReactElement {
  return (
    <div className="settings-row">
      <div className="settings-row-label">
        {htmlFor ? (
          <label className="settings-row-title" htmlFor={htmlFor} id={labelId}>
            {label}
          </label>
        ) : (
          <span className="settings-row-title" id={labelId}>
            {label}
          </span>
        )}
        {hint ? <p className="settings-row-hint">{hint}</p> : null}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}

type SegmentedOption<T extends string | number> = {
  value: T;
  label: string;
};

type SegmentedControlProps<T extends string | number> = {
  labelledBy: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
};

/** Mutually exclusive choice with two to four options, labelled by a row title. */
export function SegmentedControl<T extends string | number>({
  labelledBy,
  value,
  options,
  onChange,
  disabled = false
}: SegmentedControlProps<T>): ReactElement {
  return (
    <div className="segmented settings-segmented" role="group" aria-labelledby={labelledBy}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={option.value === value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

type SettingsSwitchProps = {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export function SettingsSwitch({ id, checked, onChange }: SettingsSwitchProps): ReactElement {
  return (
    <input
      id={id}
      type="checkbox"
      role="switch"
      className="settings-switch"
      checked={checked}
      onChange={(event) => onChange(event.currentTarget.checked)}
    />
  );
}

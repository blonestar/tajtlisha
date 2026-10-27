import type { ComponentPropsWithoutRef, ReactElement } from 'react';
import { useLayoutEffect, useRef } from 'react';

type AutoGrowTextareaProps = Omit<ComponentPropsWithoutRef<'textarea'>, 'value' | 'onChange'> & {
  value: string;
  onValueChange(value: string): void;
};

/** Textarea that grows with its content; explicit '\n' line breaks are kept. */
export function AutoGrowTextarea({
  value,
  onValueChange,
  className,
  ...rest
}: AutoGrowTextareaProps): ReactElement {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    // scrollHeight excludes the border; without it the box is 2px short and shows a scrollbar.
    element.style.height = 'auto';
    const border = element.offsetHeight - element.clientHeight;
    element.style.height = `${element.scrollHeight + border}px`;
  }, [value]);

  return (
    <textarea
      {...rest}
      ref={ref}
      rows={1}
      className={className ? `textarea ${className}` : 'textarea'}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    />
  );
}

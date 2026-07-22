import React, { cloneElement, isValidElement } from 'react';
import clsx from 'clsx';

interface Props {
  label: string;
  controlId: string;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactElement<{
    'aria-describedby'?: string;
    'aria-invalid'?: React.AriaAttributes['aria-invalid'];
  }>;
}

export function Field({ label, controlId, hint, error, className, children }: Props) {
  const hintId = hint ? `${controlId}-hint` : null;
  const errorId = error ? `${controlId}-error` : null;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
      })
    : children;

  return (
    <div className={clsx('ds-field', error && 'ds-field--invalid', className)}>
      <label htmlFor={controlId}>{label}</label>
      {control}
      {hint ? <p id={hintId ?? undefined} className="ds-field__hint">{hint}</p> : null}
      {error ? <p id={errorId ?? undefined} className="ds-field__error" role="alert">{error}</p> : null}
    </div>
  );
}

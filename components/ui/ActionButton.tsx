import React, { forwardRef } from 'react';
import clsx from 'clsx';

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger';
type Size = 'small' | 'medium';

export interface ActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  pending?: boolean;
}

export const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(function ActionButton({
  variant = 'secondary',
  size = 'medium',
  pending = false,
  className,
  disabled,
  children,
  ...props
}, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={clsx('ds-button', `ds-button--${variant}`, `ds-button--${size}`, className)}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      {...props}
    >
      {children}
    </button>
  );
});

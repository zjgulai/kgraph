'use client';

import React, { useEffect, useRef } from 'react';
import clsx from 'clsx';

interface Props {
  open: boolean;
  titleId: string;
  descriptionId?: string;
  onClose: () => void;
  className?: string;
  backdropClassName?: string;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  children: React.ReactNode;
}

export function Dialog({ open, titleId, descriptionId, onClose, className, backdropClassName, initialFocusRef, returnFocusRef, onKeyDown: onDialogKeyDown, children }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      const fallback = dialogRef.current?.querySelector<HTMLElement>('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])');
      (initialFocusRef?.current ?? fallback)?.focus();
    });
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = priorOverflow;
      const returnTarget = returnFocusRef?.current ?? previousFocusRef.current;
      returnTarget?.focus({ preventScroll: true });
      window.setTimeout(() => returnTarget?.focus({ preventScroll: true }), 0);
    };
  }, [initialFocusRef, open, returnFocusRef]);

  if (!open) return null;

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    onDialogKeyDown?.(event);
    if (event.key !== 'Tab') return;
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])') ?? [])];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className={clsx('ds-overlay', backdropClassName)} onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div ref={dialogRef} className={clsx('ds-dialog', className)} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} onKeyDown={onKeyDown}>
        {children}
      </div>
    </div>
  );
}

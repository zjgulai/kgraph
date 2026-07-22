'use client';

import React from 'react';
import clsx from 'clsx';
import { Dialog } from './Dialog';

export function Drawer({ side = 'right', className, ...props }: React.ComponentProps<typeof Dialog> & { side?: 'left' | 'right' }) {
  return <Dialog {...props} className={clsx('ds-drawer', `ds-drawer--${side}`, className)} />;
}

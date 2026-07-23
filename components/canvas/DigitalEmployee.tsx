'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { UserRound } from 'lucide-react';
import type { FactoryEmployeeRole } from '@/lib/canvas/factory-presentation';

interface DigitalEmployeeProps {
  employee: FactoryEmployeeRole | null;
  statusLabel: string;
  portraitSrc?: string;
  compact?: boolean;
}

export function DigitalEmployee({
  employee,
  statusLabel,
  portraitSrc,
  compact = false,
}: DigitalEmployeeProps) {
  const [portraitFailed, setPortraitFailed] = useState(false);
  const resolvedPortraitSrc = portraitSrc
    ?? (employee?.portraitKey.startsWith('asset:')
      ? `/api/assets/portraits/${employee.portraitKey.slice('asset:'.length)}`
      : employee ? `/digital-employees/${employee.portraitKey}.webp` : undefined);
  const showPortrait = Boolean(employee && resolvedPortraitSrc && !portraitFailed);

  useEffect(() => setPortraitFailed(false), [resolvedPortraitSrc]);

  return (
    <figure
      className={`digital-employee${compact ? ' digital-employee--compact' : ''}`}
      data-portrait-key={employee?.portraitKey ?? 'unassigned'}
    >
      <span className="digital-employee__portrait">
        {showPortrait ? (
          <Image
            src={resolvedPortraitSrc!}
            alt={`${employee!.displayName}，${employee!.roleTitle}合成角色形象`}
            fill
            sizes={compact ? '64px' : '160px'}
            loading="lazy"
            onError={() => setPortraitFailed(true)}
          />
        ) : (
          <span className="digital-employee__fallback" aria-label="合成数字员工形象待接入">
            <UserRound aria-hidden="true" />
            <small>{employee?.displayName.slice(0, 1) ?? '待'}</small>
          </span>
        )}
      </span>

      <figcaption>
        <span className="digital-employee__status">
          <i aria-hidden="true" />
          {statusLabel}
        </span>
        <strong>{employee?.displayName ?? '待分配'}</strong>
        <small>{employee?.roleTitle ?? '岗位待配置'}</small>
        <p>{employee?.responsibility ?? '等待明确职责、输入和交付边界'}</p>
      </figcaption>
    </figure>
  );
}

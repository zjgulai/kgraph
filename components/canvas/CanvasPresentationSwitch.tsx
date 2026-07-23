'use client';

import { Building2, Map as MapIcon } from 'lucide-react';

export type CanvasPresentationMode = 'map' | 'factory';

interface CanvasPresentationSwitchProps {
  mode: CanvasPresentationMode;
  onChange: (mode: CanvasPresentationMode) => void;
}

const options = [
  { id: 'map', label: '地图', icon: MapIcon },
  { id: 'factory', label: '工厂', icon: Building2 },
] as const;

export function CanvasPresentationSwitch({ mode, onChange }: CanvasPresentationSwitchProps) {
  return (
    <div className="canvas-presentation-switch" role="group" aria-label="画布表现">
      {options.map(option => {
        const Icon = option.icon;
        return (
          <button
            type="button"
            key={option.id}
            className={mode === option.id ? 'is-active' : ''}
            aria-pressed={mode === option.id}
            onClick={() => onChange(option.id)}
          >
            <Icon aria-hidden="true" />
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

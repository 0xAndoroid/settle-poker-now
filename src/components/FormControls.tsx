import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  disabledSuffix?: string;
}

interface PlayerSelectFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<SelectOption>;
  placeholder: string;
  disabled?: boolean;
  wrapperClassName?: string;
  selectClassName?: string;
}

export function PlayerSelectField({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  wrapperClassName = 'block space-y-1.5',
  selectClassName = 'field font-sans font-semibold text-[13px] pr-8 disabled:opacity-50',
}: PlayerSelectFieldProps) {
  return (
    <label htmlFor={id} className={wrapperClassName}>
      <span className="ticker-label">{label}</span>
      <select
        id={id}
        name={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className={cn(selectClassName, 'select-field')}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
            {option.disabled ? (option.disabledSuffix ?? '') : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FormError({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn('text-loss text-[12px] font-semibold flex items-center gap-2', className)}
      role="alert"
    >
      <span className="pill pill-loss">err</span>
      {children}
    </p>
  );
}

export function EmptyPanelMessage({ children }: { children: ReactNode }) {
  return <div className="px-5 py-8 text-center text-[13px] text-fg-dim">{children}</div>;
}

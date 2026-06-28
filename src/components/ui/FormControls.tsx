import React from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface BaseFieldProps {
  label: string;
  name?: string;
  description?: string;
  error?: string;
  className?: string;
}

export interface SelectFieldProps extends BaseFieldProps, React.SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[];
}

export const SelectField: React.FC<SelectFieldProps> = ({
  label,
  options,
  description,
  error,
  className = '',
  ...props
}) => {
  return (
    <div className={`space-y-1 ${className}`}>
      <label className="text-[10px] uppercase tracking-wider font-semibold text-heritage-ink/60">
        {label}
      </label>
      {description && <p className="text-xs text-heritage-ink/40">{description}</p>}
      <select
        className={`w-full p-2 bg-white border ${error ? 'border-red-500' : 'border-gray-200'} focus:border-heritage-gold rounded-xl text-xs outline-none transition cursor-pointer`}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
};

export interface InputFieldProps extends BaseFieldProps, React.InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: React.ReactNode;
}

export const InputField: React.FC<InputFieldProps> = ({
  label,
  description,
  error,
  className = '',
  leftIcon,
  ...props
}) => {
  return (
    <div className={`space-y-1 ${className}`}>
      <label className="text-[10px] uppercase tracking-wider font-semibold text-heritage-ink/60">
        {label}
      </label>
      {description && <p className="text-xs text-heritage-ink/40">{description}</p>}
      <div className="relative">
        {leftIcon && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-heritage-ink/40">
            {leftIcon}
          </div>
        )}
        <input
          className={`w-full ${leftIcon ? 'pl-10' : 'pl-4'} pr-4 py-2 bg-white border ${error ? 'border-red-500' : 'border-gray-200'} focus:border-heritage-gold rounded-xl text-xs outline-none transition`}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
};

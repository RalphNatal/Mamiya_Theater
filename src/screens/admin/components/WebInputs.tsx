import React from 'react';
export const webInputStyle = {
  border: 'none', outline: 'none', background: 'transparent',
  fontSize: 14, width: '100%', fontFamily: 'inherit', color: '#0f0e2a', padding: 0,
} as any;

export const WebDateInput = ({ value, onChange, min }: {
  value: string; onChange: (v: string) => void; min?: string;
}) => React.createElement('input', {
  type: 'date',
  value,
  min,
  onChange: (e: any) => onChange(e.target.value),
  style: webInputStyle,
});

export const WebTimeInput = ({ value, onChange }: {
  value: string; onChange: (v: string) => void;
}) => React.createElement('input', {
  type: 'time',
  value,
  onChange: (e: any) => onChange(e.target.value),
  style: webInputStyle,
});

export const WebSelect = ({ value, onChange, options, placeholder, disabled }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
}) => React.createElement(
  'select',
  { value, onChange: (e: any) => onChange(e.target.value), style: webInputStyle, disabled },
  [
    React.createElement('option', { value: '', key: '__placeholder', disabled: true }, placeholder ?? 'Select…'),
    ...options.map(o => React.createElement('option', { value: o.value, key: o.value }, o.label)),
  ]
);

"use client";

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FISCAL_LIMITS, fiscalPasteError } from '@/lib/productFormRules';

export function ProductFiscalField({ field, label, value, onChange, placeholder, help, error }: {
  field: string; label: string; value: string; onChange: (value: string) => void;
  placeholder?: string; help?: string; error?: string;
}) {
  const [attemptError, setAttemptError] = useState('');
  const max = field === 'ncm' ? 8 : field === 'cest' ? 7 : field === 'unit' || field === 'tributaryUnit' ? 6 : FISCAL_LIMITS[field];
  const isDigits = field === 'ncm' || field === 'cest';
  const isUnit = field === 'unit' || field === 'tributaryUnit';
  return <div className="grid gap-1.5" data-product-field={field}>
    <Label htmlFor={`fiscal-${field}`}>{label}</Label>
    <Input id={`fiscal-${field}`} value={value} placeholder={placeholder} maxLength={max} inputMode={isDigits ? 'numeric' : undefined}
      aria-invalid={Boolean(error || attemptError)} className="h-11 rounded-2xl border-slate-200 bg-slate-50/60"
      onPaste={(event) => {
        const input = event.currentTarget;
        const message = fiscalPasteError(field, value, input.selectionStart ?? 0, input.selectionEnd ?? 0, event.clipboardData.getData('text'));
        if (message) { event.preventDefault(); setAttemptError(message); }
      }}
      onChange={(event) => {
        const next = event.target.value;
        if ((isDigits && !/^\d*$/.test(next)) || (isUnit && !/^[A-Za-z]*$/.test(next))) {
          setAttemptError(isDigits ? `${label} aceita apenas dígitos.` : `${label} aceita apenas letras.`);
          return;
        }
        setAttemptError('');
        onChange(isUnit ? next.toUpperCase() : next);
      }} />
    {max != null && <p className="text-xs text-slate-500">{isDigits ? `${value.length}/${max} dígitos${field === 'ncm' ? ' quando preenchido' : ' quando preenchido'}` : isUnit ? `${value.length}/6 letras (mínimo 2)` : `${value.length}/${max} caracteres`}</p>}
    {help && <p className="text-xs text-slate-500">{help}</p>}
    {(error || attemptError) && <p className="text-xs text-rose-600" role="alert">{error || attemptError}</p>}
  </div>;
}

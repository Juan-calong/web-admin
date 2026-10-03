"use client";

import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { checkListChange, parseProductList, PRODUCT_FORM_LIMITS, PRODUCT_LIST_LABELS, type ProductListField } from '@/lib/productFormRules';

export function ProductListTextarea({ field, value, onChange, placeholder, error, className }: {
  field: ProductListField;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  className?: string;
}) {
  const [attemptError, setAttemptError] = useState('');
  const items = parseProductList(value, field);
  const largest = Math.max(0, ...items.map((item) => item.length));
  const countMax = PRODUCT_FORM_LIMITS[`${field}Items`];
  const itemMax = PRODUCT_FORM_LIMITS[field];
  return <div className="space-y-2" data-product-field={field}>
    <div className="flex items-center justify-between gap-2">
      <Label htmlFor={`product-${field}`}>{PRODUCT_LIST_LABELS[field]} (1 por linha)</Label>
      <span className="text-xs text-slate-500">{items.length}/{countMax} itens</span>
    </div>
    <Textarea id={`product-${field}`} value={value} placeholder={placeholder} className={className}
      aria-invalid={Boolean(error || attemptError)}
      onChange={(event) => {
        const result = checkListChange(event.target.value, field);
        if (!result.ok) { setAttemptError(result.message); return; }
        setAttemptError('');
        onChange(event.target.value);
      }} />
    <div className="text-xs text-slate-500">Maior item: {largest}/{itemMax} caracteres{field === 'highlights' ? '' : ' • quebras de linha ou ; separam itens'}</div>
    {(error || attemptError) && <p className="text-xs text-rose-600" role="alert">{error || attemptError}</p>}
  </div>;
}

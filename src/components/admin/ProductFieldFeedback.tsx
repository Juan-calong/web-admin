import type { ReactNode } from 'react';

export function ProductFieldFeedback({ count, max, hint, error }: { count?: number; max?: number; hint?: ReactNode; error?: string }) {
  return <>
    {(max != null || hint) && <p className="text-xs leading-5 text-slate-500">{max != null ? `${count ?? 0}/${max} caracteres` : hint}</p>}
    {error && <p className="text-xs text-rose-600" role="alert">{error}</p>}
  </>;
}

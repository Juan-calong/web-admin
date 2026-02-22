"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, Eye, EyeOff, XCircle } from "lucide-react";

type Props = {
  active: boolean;
  onActiveChange: (v: boolean) => void;

  availableToCustomer: boolean;
  onAvailableToCustomerChange: (v: boolean) => void;

  className?: string;
};

function pill(on: boolean) {
  return on
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : "bg-zinc-50 text-zinc-700 border-zinc-200";
}

export function ProductStatusPanel({
  active,
  onActiveChange,
  availableToCustomer,
  onAvailableToCustomerChange,
  className,
}: Props) {
  return (
    <div className={cn("space-y-4", className)}>
      {/* Ativo */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-semibold">
            {active ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <XCircle className="h-4 w-4 text-zinc-400" />
            )}
            <span className="truncate">Produto</span>
          </div>
          <div className="text-xs text-black/50">
            {active ? "Aparece como ativo no catálogo." : "Fica inativo no catálogo."}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onActiveChange(!active)}
          className={cn(
            "shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition",
            "hover:bg-black/[0.03] active:scale-[0.98]",
            pill(active)
          )}
        >
          {active ? "ATIVO" : "INATIVO"}
        </button>
      </div>

      <Separator />

      {/* Visibilidade */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-semibold">
            {availableToCustomer ? (
              <Eye className="h-4 w-4 text-emerald-600" />
            ) : (
              <EyeOff className="h-4 w-4 text-zinc-400" />
            )}
            <span className="truncate">Cliente final</span>
          </div>

          <div className="text-xs text-black/50">
            {availableToCustomer ? "Clientes conseguem ver este produto." : "Apenas Salão/Vendedor vê."}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onAvailableToCustomerChange(!availableToCustomer)}
          className={cn(
            "shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition",
            "hover:bg-black/[0.03] active:scale-[0.98]",
            pill(availableToCustomer)
          )}
        >
          {availableToCustomer ? "CLIENTE VÊ" : "SALÃO/VENDEDOR"}
        </button>
      </div>

      {/* Hint opcional */}
      <div className="text-xs text-black/50">
        <Badge className={cn("rounded-full border", pill(availableToCustomer))}>
          {availableToCustomer ? "ALL" : "STAFF_ONLY"}
        </Badge>
      </div>
    </div>
  );
}
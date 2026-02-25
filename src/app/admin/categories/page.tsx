"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, X } from "lucide-react";

import { api } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { apiErrorMessage } from "@/lib/apiError";
import { cn } from "@/lib/utils";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Category = {
  id: string;
  name: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
};

function stableKey(prefix: string, ...parts: (string | number | boolean | null | undefined)[]) {
  return `${prefix}:${parts.map((p) => String(p ?? "")).join(":")}`;
}

export default function AdminCategoriesPage() {
  const qc = useQueryClient();

  const [filter, setFilter] = useState<"all" | "true" | "false">("all");
  const [newName, setNewName] = useState("");

  // ✅ busca local (UX)
  const [q, setQ] = useState("");

  // ✅ key correta (inclui filtro)
  const categoriesKey = useMemo(() => ["categories", { filter }] as const, [filter]);

  const categoriesQ = useQuery({
  queryKey: categoriesKey,
  queryFn: async () => {
    const params = filter === "all" ? undefined : { active: filter };
    const res = await api.get(endpoints.categories.list, { params });
    return (res.data?.items ?? []) as Category[];
  },
  placeholderData: (prev) => prev, // ✅ mantém a lista enquanto refetch acontece
  refetchOnWindowFocus: false,
  retry: false,
});

  useEffect(() => {
    if (categoriesQ.isError) {
      toast.error(apiErrorMessage(categoriesQ.error, "Erro ao carregar categorias."));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoriesQ.isError, categoriesQ.error]);

  const createM = useMutation({
    mutationFn: async () => {
      const name = newName.trim();
      if (!name) throw new Error("Nome obrigatório");

      await api.post(
        endpoints.categories.create,
        { name },
        { headers: { "Idempotency-Key": stableKey("cat-create", name.toLowerCase()) } }
      );
    },
    onSuccess: async () => {
      toast.success("Categoria criada.");
      setNewName("");
      await qc.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Erro ao criar categoria.")),
  });

  const [pendingId, setPendingId] = useState<string | null>(null);

  const patchM = useMutation({
  mutationFn: async (vars: {
    id: string;
    patch: { name?: string; active?: boolean };
    opId: string;
  }) => {
    const res = await api.patch(endpoints.categories.update(vars.id), vars.patch, {
      headers: {
        "Idempotency-Key": stableKey("cat-patch", vars.id, vars.opId),
      },
    });

    return res.data as Category;
  },

  onMutate: async (vars) => {
    setPendingId(vars.id);

    await qc.cancelQueries({ queryKey: categoriesKey });

    const prev = qc.getQueryData<Category[]>(categoriesKey);

    qc.setQueryData<Category[]>(categoriesKey, (old) => {
      const list = old ?? [];
      return list.map((c) => {
        if (c.id !== vars.id) return c;
        return { ...c, ...vars.patch, updatedAt: new Date().toISOString() };
      });
    });

    return { prev };
  },

  onError: (e, _vars, ctx) => {
    if (ctx?.prev) qc.setQueryData(categoriesKey, ctx.prev);
    toast.error(apiErrorMessage(e, "Erro ao atualizar categoria."));
  },

  onSettled: async () => {
    setPendingId(null);
    setTimeout(() => {
      qc.invalidateQueries({ queryKey: ["categories"] });
    }, 800);
  },
});

  const items = useMemo(() => categoriesQ.data ?? [], [categoriesQ.data]);

  // ✅ filtro de busca local (por nome e id)
  const itemsFiltered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return items;
    return items.filter((c) => `${c.name} ${c.id}`.toLowerCase().includes(qq));
  }, [items, q]);

  const itemsSorted = useMemo(() => {
  const list = [...itemsFiltered];

  // Ativas primeiro; dentro de cada grupo, por nome
  list.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
  });

  return list;
}, [itemsFiltered]);

  return (
    <div className="min-h-[calc(100vh-64px)] bg-slate-50">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-8 space-y-5">
        {/* Cabeçalho */}
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Categorias</h1>
          <p className="text-sm text-slate-600">Crie e organize categorias</p>
        </div>

        {/* Gerenciar */}
        <Card className="rounded-2xl border border-slate-200/70 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold text-slate-900">Gerenciar categorias</CardTitle>
            <CardDescription className="text-sm text-slate-500">Filtrar + pesquisa + criação rápida</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(0,1.5fr)]">
              {/* Filtro */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-800">Filtrar</Label>
                <select
                  className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as "all" | "true" | "false")}
                >
                  <option value="all">Todos</option>
                  <option value="true">Ativos</option>
                  <option value="false">Inativos</option>
                </select>
              </div>

              {/* Busca */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-800">Buscar</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/50" />
                  <Input
                    className="h-10 rounded-xl pl-9 pr-9 border-slate-300 bg-white text-sm shadow-sm focus-visible:ring-emerald-500"
                    placeholder="Digite o nome ou id…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                  {q.trim() ? (
                    <button
                      type="button"
                      onClick={() => setQ("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 hover:bg-black/5"
                      aria-label="Limpar busca"
                    >
                      <X className="h-4 w-4 text-black/60" />
                    </button>
                  ) : null}
                </div>
                <div className="text-xs text-slate-500">
                  Mostrando {itemsFiltered.length} de {items.length}
                </div>
              </div>

              {/* Nova categoria */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-800">Nova categoria</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    className="h-10 w-full rounded-xl border-slate-300 bg-white text-sm shadow-sm focus-visible:ring-emerald-500"
                    placeholder="Ex.: Cabelo"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    disabled={createM.isPending}
                  />

                  <Button
                    className={cn(
                      "h-10 w-full rounded-xl sm:w-auto",
                      "bg-emerald-500 text-white hover:bg-emerald-600",
                      "shadow-sm"
                    )}
                    onClick={() => createM.mutate()}
                    disabled={createM.isPending}
                  >
                    {createM.isPending ? "Criando…" : "Criar"}
                  </Button>
                </div>

                {createM.isError ? (
                  <div className="text-sm text-red-600">{apiErrorMessage(createM.error, "Erro ao criar categoria.")}</div>
                ) : null}
              </div>
            </div>

            <Separator className="bg-slate-200/80" />

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                className="h-10 w-full rounded-xl border-slate-300 bg-white text-sm text-slate-900 shadow-sm hover:bg-slate-50 sm:w-auto"
                onClick={() => categoriesQ.refetch()}
                disabled={categoriesQ.isFetching}
              >
                {categoriesQ.isFetching ? "Atualizando…" : "Atualizar"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Lista */}
        <Card className="rounded-2xl border border-slate-200/70 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold text-slate-900">Lista de categorias</CardTitle>
            <CardDescription className="text-sm text-slate-500">{itemsFiltered.length} categoria(s)</CardDescription>
          </CardHeader>

          <CardContent>
            {categoriesQ.isLoading ? (
              <div className="text-sm text-slate-600">Carregando…</div>
            ) : categoriesQ.isError ? (
              <div className="text-sm text-red-600">{apiErrorMessage(categoriesQ.error, "Erro ao carregar categorias.")}</div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden lg:block overflow-x-auto rounded-2xl border border-slate-200/80 bg-white">
                  <Table className="min-w-[720px]">
                    <TableHeader>
                      <TableRow className="border-b border-slate-200/80">
                        <TableHead className="text-slate-500">Nome</TableHead>
                        <TableHead className="text-slate-500">Status</TableHead>
                        <TableHead className="text-right text-slate-500">Ações</TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {itemsFiltered.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="py-6 text-center text-sm text-slate-500">
                            Nenhuma categoria encontrada.
                          </TableCell>
                        </TableRow>
                      ) : (
                        itemsSorted.map((c) => (
                          <CategoryRowTable
  key={c.id}
  c={c}
  busy={pendingId === c.id}
  onRename={(name) =>
    patchM.mutate({ id: c.id, patch: { name }, opId: crypto.randomUUID() })
  }
  onToggle={() =>
    patchM.mutate({ id: c.id, patch: { active: !c.active }, opId: crypto.randomUUID() })
  }
/>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile cards */}
                <div className="space-y-3 lg:hidden">
                  {itemsFiltered.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
                      Nenhuma categoria encontrada.
                    </div>
                  ) : (
                    itemsSorted.map((c) => (
                      <CategoryCard
  key={c.id}
  c={c}
  busy={pendingId === c.id}
  onRename={(name) =>
    patchM.mutate({ id: c.id, patch: { name }, opId: crypto.randomUUID() })
  }
  onToggle={() =>
    patchM.mutate({ id: c.id, patch: { active: !c.active }, opId: crypto.randomUUID() })
  }
/>
                    ))
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CategoryRowTable({
  c,
  busy,
  onRename,
  onToggle,
}: {
  c: Category;
  busy: boolean;
  onRename: (name: string) => void;
  onToggle: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(c.name);

  useEffect(() => {
    setName(c.name);
  }, [c.name]);

  return (
    <TableRow className="border-b border-slate-100 hover:bg-slate-50/60">
      <TableCell className="align-top">
        <div className="font-semibold text-slate-900">{c.name}</div>
        <div className="mt-1 text-xs font-mono text-slate-400 break-all">{c.id}</div>

        {editing ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Input
              className="h-9 w-full rounded-xl border-slate-300 bg-white text-sm shadow-sm focus-visible:ring-emerald-500 sm:w-auto"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
            <Button
              className="h-9 rounded-xl bg-emerald-500 text-white hover:bg-emerald-600"
              onClick={() => {
                const v = name.trim();
                if (!v) return;
                onRename(v);
                setEditing(false);
              }}
              disabled={busy}
            >
              Salvar
            </Button>
            <Button
              variant="outline"
              className="h-9 rounded-xl border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
              onClick={() => {
                setName(c.name);
                setEditing(false);
              }}
              disabled={busy}
            >
              Cancelar
            </Button>
          </div>
        ) : null}
      </TableCell>

      <TableCell className="align-middle">
        <Badge
          variant="outline"
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium",
            c.active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"
          )}
        >
          {c.active ? "ATIVA" : "INATIVA"}
        </Badge>
      </TableCell>

      <TableCell className="align-middle text-right">
        <div className="flex justify-end gap-2">
          {!editing ? (
            <Button
              variant="outline"
              className="rounded-xl border-slate-300 bg-white px-4 text-sm text-slate-900 hover:bg-slate-50"
              onClick={() => {
                setName(c.name);
                setEditing(true);
              }}
              disabled={busy}
            >
              Renomear
            </Button>
          ) : null}
          <Button
            variant="outline"
            className="rounded-xl border-slate-300 bg-white px-4 text-sm text-slate-900 hover:bg-slate-50"
            onClick={onToggle}
            disabled={busy}
          >
            {busy ? "Salvando…" : c.active ? "Desativar" : "Ativar"}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function CategoryCard({
  c,
  busy,
  onRename,
  onToggle,
}: {
  c: Category;
  busy: boolean;
  onRename: (name: string) => void;
  onToggle: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(c.name);

  useEffect(() => {
    setName(c.name);
  }, [c.name]);

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="break-words font-semibold text-slate-900">{c.name}</div>
          <div className="mt-1 break-all text-xs font-mono text-slate-400">{c.id}</div>
        </div>

        <Badge
          variant="outline"
          className={cn(
            "shrink-0 rounded-full px-3 py-1 text-xs font-medium",
            c.active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"
          )}
        >
          {c.active ? "ATIVA" : "INATIVA"}
        </Badge>
      </div>

      {editing ? (
        <div className="space-y-2">
          <Input
            className="w-full rounded-xl border-slate-300 bg-white text-sm shadow-sm focus-visible:ring-emerald-500"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
          />
          <div className="grid grid-cols-2 gap-2">
            <Button
              className="rounded-xl bg-emerald-500 text-white hover:bg-emerald-600"
              onClick={() => {
                const v = name.trim();
                if (!v) return;
                onRename(v);
                setEditing(false);
              }}
              disabled={busy}
            >
              Salvar
            </Button>

            <Button
              variant="outline"
              className="rounded-xl border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
              onClick={() => {
                setName(c.name);
                setEditing(false);
              }}
              disabled={busy}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="rounded-xl border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
            onClick={() => {
              setName(c.name);
              setEditing(true);
            }}
            disabled={busy}
          >
            Renomear
          </Button>
          <Button
            variant="outline"
            className="rounded-xl border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
            onClick={onToggle}
            disabled={busy}
          >
            {busy ? "Salvando…" : c.active ? "Desativar" : "Ativar"}
          </Button>
        </div>
      )}
    </div>
  );
}
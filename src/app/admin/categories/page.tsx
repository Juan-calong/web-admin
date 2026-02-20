"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { apiErrorMessage } from "@/lib/apiError";
import { cn } from "@/lib/utils";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

  const categoriesQ = useQuery({
    queryKey: ["categories", { filter }],
    queryFn: async () => {
      const params = filter === "all" ? undefined : { active: filter };
      const res = await api.get(endpoints.categories.list, { params });
      return (res.data?.items ?? []) as Category[];
    },
    refetchOnWindowFocus: false,
    retry: false,
  });

  useEffect(() => {
    if (categoriesQ.isError) toast.error(apiErrorMessage(categoriesQ.error, "Erro ao carregar categorias."));
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
      await categoriesQ.refetch();
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Erro ao criar categoria.")),
  });

  const patchM = useMutation({
    mutationFn: async (vars: { id: string; patch: { name?: string; active?: boolean } }) => {
      await api.patch(endpoints.categories.update(vars.id), vars.patch, {
        headers: { "Idempotency-Key": stableKey("cat-patch", vars.id, JSON.stringify(vars.patch)) },
      });
    },
    onSuccess: async () => {
      toast.success("Categoria atualizada.");
      await qc.invalidateQueries({ queryKey: ["categories"] });
      await categoriesQ.refetch();
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Erro ao atualizar categoria.")),
  });

  const items = useMemo(() => categoriesQ.data ?? [], [categoriesQ.data]);

  return (
    <div className="space-y-4 px-3 lg:px-6">
      <div className="space-y-1">
        <div className="text-xl lg:text-2xl font-black">Categorias</div>
        <div className="text-sm text-black/60">Crie e organize categorias</div>
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Gerenciar</CardTitle>
          <CardDescription>Filtro + criação rápida</CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* IMPORTANTE: só vira “3 colunas” no LG (porque com sidebar o conteúdo fica estreito) */}
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="grid gap-2">
              <Label>Filtro</Label>
              <select
                className="h-10 w-full rounded-xl border bg-white px-3 text-sm"
                value={filter}
                onChange={(e) => setFilter(e.target.value as "all" | "true" | "false")}
              >
                <option value="all">Todos</option>
                <option value="true">Ativos</option>
                <option value="false">Inativos</option>
              </select>
            </div>

            <div className="grid gap-2 lg:col-span-2">
              <Label>Nova categoria</Label>

              {/* no “conteúdo estreito” sempre empilha; só vira linha no LG */}
              <div className="flex flex-col gap-2 lg:flex-row">
                <Input
                  className="w-full rounded-xl"
                  placeholder="Ex.: Cabelo"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  disabled={createM.isPending}
                />

                <Button
                  className="w-full rounded-xl lg:w-auto"
                  onClick={() => createM.mutate()}
                  disabled={createM.isPending}
                >
                  {createM.isPending ? "Criando…" : "Criar"}
                </Button>
              </div>

              {createM.isError ? (
                <div className="text-sm text-red-600">
                  {apiErrorMessage(createM.error, "Erro ao criar categoria.")}
                </div>
              ) : null}
            </div>
          </div>

          <Separator />

          <div className="flex flex-col gap-2 lg:flex-row lg:justify-end">
            <Button
              variant="outline"
              className="w-full rounded-xl lg:w-auto"
              onClick={() => categoriesQ.refetch()}
              disabled={categoriesQ.isFetching}
            >
              {categoriesQ.isFetching ? "Atualizando…" : "Atualizar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Lista</CardTitle>
          <CardDescription>{items.length} categoria(s)</CardDescription>
        </CardHeader>

        <CardContent>
          {categoriesQ.isLoading ? (
            <div className="text-sm">Carregando…</div>
          ) : categoriesQ.isError ? (
            <div className="text-sm text-red-600">
              {apiErrorMessage(categoriesQ.error, "Erro ao carregar categorias.")}
            </div>
          ) : (
            <>
              {/* ===== TABELA: só no LG+ (com sidebar, o “md/sm” ainda fica estreito e corta) ===== */}
              <div className="hidden lg:block rounded-2xl border overflow-x-auto">
                <Table className="min-w-[720px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-sm text-black/60">
                          Nenhuma categoria.
                        </TableCell>
                      </TableRow>
                    ) : (
                      items.map((c) => (
                        <CategoryRowTable
                          key={c.id}
                          c={c}
                          busy={patchM.isPending}
                          onRename={(name) => patchM.mutate({ id: c.id, patch: { name } })}
                          onToggle={() => patchM.mutate({ id: c.id, patch: { active: !c.active } })}
                        />
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* ===== COMPACTO: cards (default) ===== */}
              <div className="lg:hidden space-y-3">
                {items.length === 0 ? (
                  <div className="rounded-2xl border p-4 text-sm text-black/60">Nenhuma categoria.</div>
                ) : (
                  items.map((c) => (
                    <CategoryCard
                      key={c.id}
                      c={c}
                      busy={patchM.isPending}
                      onRename={(name) => patchM.mutate({ id: c.id, patch: { name } })}
                      onToggle={() => patchM.mutate({ id: c.id, patch: { active: !c.active } })}
                    />
                  ))
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
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

  return (
    <TableRow className="hover:bg-black/[0.02]">
      <TableCell className="align-top">
        <div className="font-semibold">{c.name}</div>
        <div className="text-xs text-black/50 font-mono break-all">{c.id}</div>

        {editing ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <Input className="h-9 w-full sm:w-auto rounded-xl" value={name} onChange={(e) => setName(e.target.value)} />
            <Button
              className="h-9 rounded-xl"
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
              className="h-9 rounded-xl"
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

      <TableCell>
        <Badge
          variant={c.active ? "default" : "secondary"}
          className={cn("rounded-full", c.active ? "" : "text-black/70")}
        >
          {c.active ? "ATIVA" : "INATIVA"}
        </Badge>
      </TableCell>

      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          {!editing ? (
            <Button variant="outline" className="rounded-xl whitespace-nowrap" onClick={() => {
                setName(c.name);
                setEditing(true);
              }} disabled={busy}>
                Renomear
            </Button>
          ) : null}
          <Button variant="outline" className="rounded-xl whitespace-nowrap" onClick={onToggle} disabled={busy}>
            {c.active ? "Desativar" : "Ativar"}
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

  return (
    <div className="rounded-2xl border bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold break-words">{c.name}</div>
          <div className="text-xs text-black/50 font-mono break-all mt-1">{c.id}</div>
        </div>

        <Badge
          variant={c.active ? "default" : "secondary"}
          className={cn("rounded-full shrink-0", c.active ? "" : "text-black/70")}
        >
          {c.active ? "ATIVA" : "INATIVA"}
        </Badge>
      </div>

      {editing ? (
        <div className="space-y-2">
          <Input className="w-full rounded-xl" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
          <div className="grid grid-cols-2 gap-2">
            <Button
              className="rounded-xl"
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
              className="rounded-xl"
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
          <Button variant="outline" className="rounded-xl" onClick={() => {
                setName(c.name);
                setEditing(true);
              }} disabled={busy}>
                Renomear
          </Button>
          <Button variant="outline" className="rounded-xl" onClick={onToggle} disabled={busy}>
            {c.active ? "Desativar" : "Ativar"}
          </Button>
        </div>
      )}
    </div>
  );
}

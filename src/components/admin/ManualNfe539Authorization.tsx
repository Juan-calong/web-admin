"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createManualNfe539Authorization,
  hasManualNfe539Session,
  readDraftNfeXml,
  verifiedManualNfe539Input,
  type DraftNfeXml,
  type ManualNfe539ConsumptionResult,
  type ManualNfe539Result,
} from "@/lib/manualNfe539Authorization";
import type { FiscalBinding } from "@/lib/supervisedFiscal";

export function ManualNfe539Authorization({ binding, disabled }: { binding: FiscalBinding; disabled: boolean }) {
  const { orderId, automationId, documentId } = binding;
  const { authorize, consume } = useMemo(
    () => createManualNfe539Authorization({ orderId, automationId, documentId }),
    [orderId, automationId, documentId],
  );
  const fieldId = useId();
  const fileRead = useRef(0);
  const submitting = useRef(false);
  const [reviewId, setReviewId] = useState("");
  const [expectedHash, setExpectedHash] = useState("");
  const [xml, setXml] = useState<DraftNfeXml | null>(null);
  const [fileError, setFileError] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ManualNfe539Result | null>(null);
  const verified = verifiedManualNfe539Input(reviewId, xml, expectedHash);
  const locked = disabled || busy || Boolean(result && (!("error" in result) || result.uncertain));

  async function selectXml(file: File | undefined) {
    const read = ++fileRead.current;
    setXml(null);
    setFileError(false);
    setConfirmed(false);
    if (!file) return;
    try {
      const draft = await readDraftNfeXml(file);
      if (read === fileRead.current) setXml(draft);
    } catch {
      if (read === fileRead.current) setFileError(true);
    }
  }

  async function confirmAuthorization() {
    if (locked || submitting.current || !verified || !confirmed) return;
    submitting.current = true;
    setBusy(true);
    try {
      setResult(await authorize({ reviewId, xml, expectedHash, confirmed }));
      setConfirmed(false);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  if (!hasManualNfe539Session()) return null;

  return (
    <section className="space-y-4 rounded-xl border p-4" aria-labelledby={`${fieldId}-title`}>
      <h3 id={`${fieldId}-title`} className="font-semibold">Autorizar recuperação manual da rejeição 539</h3>
      <p className="break-words text-sm text-zinc-600">Pedido {orderId} · Automação {automationId}</p>
      <fieldset className="space-y-3" disabled={locked}>
        <label className="block space-y-1 text-sm">
          <span>ID da revisão 539</span>
          <Input value={reviewId} maxLength={36} autoComplete="off" onChange={event => {
            setReviewId(event.target.value);
            setConfirmed(false);
          }} />
        </label>
        <label className="block space-y-1 text-sm">
          <span>SHA-256 esperado do XML revisado</span>
          <Input value={expectedHash} maxLength={64} autoComplete="off" spellCheck={false} onChange={event => {
            setExpectedHash(event.target.value);
            setConfirmed(false);
          }} />
        </label>
        <label className="block space-y-1 text-sm">
          <span>Arquivo XML da NF-e corrigida</span>
          <Input type="file" accept=".xml,application/xml,text/xml" onChange={event => {
            void selectXml(event.target.files?.[0]);
          }} />
        </label>
        {fileError && <p role="alert" className="text-sm text-red-800">Selecione um XML em UTF-8 com até 96 KiB.</p>}
        {xml && <p className="break-all text-sm">SHA-256 calculado <code>{xml.sha256}</code></p>}
        {xml && expectedHash && xml.sha256 !== expectedHash.trim().toLowerCase() &&
          <p role="alert" className="text-sm text-red-800">O SHA-256 do arquivo diverge do valor informado.</p>}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" disabled={!verified} checked={confirmed}
            onChange={event => setConfirmed(event.target.checked)} />
          <span>Conferi o pedido, a automação, a revisão e o SHA-256. Confirmo somente o registro da autorização.</span>
        </label>
        <Button type="button" disabled={locked || !verified || !confirmed} onClick={() => void confirmAuthorization()}>
          {busy ? "Aguardando resposta…" : "Registrar autorização"}
        </Button>
      </fieldset>
      {result && ("error" in result
        ? <p role="alert" className="text-sm text-red-800">{result.http !== null && `HTTP ${result.http} · `}{result.error}</p>
        : <dl role="status" className="grid grid-cols-[auto_1fr] gap-x-3 text-sm">
            <dt>HTTP</dt><dd>{result.http}</dd>
            <dt>Autorização</dt><dd className="break-all">{result.authorizationId}</dd>
            <dt>Validade (UTC)</dt><dd>{new Date(result.expiresAt).toISOString()}</dd>
            <dt>Transporte autorizado</dt><dd>{result.transportAuthorized ? "Sim" : "Não"}</dd>
          </dl>)}
      {result && !("error" in result) &&
        <ManualNfe539Consumption expiresAt={result.expiresAt} consume={consume} disabled={disabled} />}
    </section>
  );
}

function ManualNfe539Consumption({ expiresAt, consume, disabled }: {
  expiresAt: string;
  consume: (confirmed: boolean) => Promise<ManualNfe539ConsumptionResult>;
  disabled: boolean;
}) {
  const deadline = Date.parse(expiresAt);
  const [expired, setExpired] = useState(() => Date.now() >= deadline);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ManualNfe539ConsumptionResult | null>(null);
  const submitted = useRef(false);

  useEffect(() => {
    const delay = Math.max(0, deadline - Date.now());
    const timer = window.setTimeout(() => setExpired(true), delay);
    return () => window.clearTimeout(timer);
  }, [deadline]);

  async function confirmConsumption() {
    if (disabled || !confirmed || expired || submitted.current) return;
    if (Date.now() >= deadline) {
      setExpired(true);
      return;
    }
    submitted.current = true;
    setBusy(true);
    try {
      setResult(await consume(confirmed));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 border-t pt-4">
      <h4 className="font-semibold">Consumir autorização manual</h4>
      <fieldset className="space-y-3" disabled={disabled || expired || busy || result !== null}>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={confirmed}
            onChange={event => setConfirmed(event.target.checked)} />
          <span>Confirmo o consumo de uso único desta autorização. A transmissão no Bling é uma etapa separada.</span>
        </label>
        <Button type="button" disabled={disabled || !confirmed || expired || busy || result !== null}
          onClick={() => void confirmConsumption()}>
          {busy ? "Registrando consumo…" : "Consumir autorização"}
        </Button>
      </fieldset>
      {expired && !result && <p role="alert" className="text-sm text-red-800">A autorização expirou.</p>}
      {result && ("error" in result
        ? <p role="alert" className="text-sm text-red-800">{result.http !== null && `HTTP ${result.http} · `}{result.error}</p>
        : <dl role="status" className="grid grid-cols-[auto_1fr] gap-x-3 text-sm">
            <dt>ID do consumo</dt><dd className="break-all">{result.consumptionId}</dd>
            <dt>Status</dt><dd className="break-all">{result.status}</dd>
            <dt>Transporte autorizado</dt><dd>{result.transportAuthorized ? "Sim" : "Não"}</dd>
          </dl>)}
    </div>
  );
}

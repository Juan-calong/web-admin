import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { AxiosError } from "axios";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ManualNfe539Authorization } from "../components/admin/ManualNfe539Authorization";
import { api } from "./api";
import { authStore } from "./auth";
import { createManualNfe539Authorization, readDraftNfeXml } from "./manualNfe539Authorization";

const binding = { orderId: "order", automationId: "automation", documentId: "document" };
const reviewId = "745a803f-a889-497d-a84e-5d216d047058";
const authorizationId = "0927206a-c0c9-4a65-b8e7-507af02a6e74";
const expiresAt = "2030-01-15T12:05:00.000Z";
const source = Buffer.from("\uFEFF<nfe>\r\n Ação fictícia\r\n</nfe>");
const storage = new Map();
globalThis.window = {};
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: key => storage.delete(key),
};

async function scenario(run, failure) {
  const previous = api.defaults.adapter;
  const calls = [];
  authStore.setMe({ id: "synthetic", role: "ADMIN", scopes: ["admin:orders:manage"] });
  authStore.setAccessToken("test-access-token");
  api.defaults.adapter = async config => {
    calls.push(config);
    assert.equal(config.method, "post");
    assert.equal(config.url, "/admin/orders/order/fiscal/automations/automation/manual-nfe-539/authorize");
    assert.equal(config.skipAuthRetry, true);
    assert.equal(config.headers.Authorization, "Bearer test-access-token");
    assert.deepEqual(JSON.parse(config.data), { reviewId, draftXml: source.toString("utf8") });
    const response = {
      status: 200, statusText: "OK", headers: {}, config,
      data: { authorizationId, expiresAt, transportAuthorized: false, ignored: "sensitive fixture" },
    };
    if (failure === "timeout") throw new AxiosError("sensitive fixture", "ECONNABORTED", config);
    if (failure === 401) throw new AxiosError("sensitive fixture", "ERR_BAD_REQUEST", config, null, {
      ...response, status: 401, data: { message: "jwt expirado: sensitive fixture" },
    });
    if (failure === "invalid-success") return { ...response, data: { transportAuthorized: true } };
    return response;
  };
  try {
    const xml = await readDraftNfeXml(new Blob([source]));
    const input = { reviewId, xml, expectedHash: createHash("sha256").update(source).digest("hex"), confirmed: true };
    await run(createManualNfe539Authorization(binding), input, calls);
  } finally {
    api.defaults.adapter = previous;
    authStore.clearAll();
    storage.clear();
  }
}

test("blocks missing session, non-ADMIN and insufficient scope before transport", async () => scenario(async (authorize, input, calls) => {
  authStore.clearAccessToken();
  const render = () => renderToStaticMarkup(React.createElement(ManualNfe539Authorization, { binding, disabled: false }));
  assert.equal(render(), "");
  assert.match((await authorize(input)).error, /Sessão ADMIN/);
  authStore.setAccessToken("test-access-token");
  for (const me of [{ role: "SELLER" }, { role: "ADMIN", scopes: ["admin:orders:read"] }]) {
    authStore.setMe(me);
    assert.equal(render(), "");
    assert.match((await authorize(input)).error, /Sessão ADMIN/);
  }
  assert.equal(calls.length, 0);
}));

test("blocks absent XML, divergent SHA-256 and absent manual confirmation", async () => scenario(async (authorize, input, calls) => {
  for (const invalid of [{ xml: null }, { expectedHash: "0".repeat(64) }, { confirmed: false }]) {
    assert.ok((await authorize({ ...input, ...invalid })).error);
  }
  assert.equal(calls.length, 0);
}));

test("renders explicit confirmation with the correct binding and a disabled initial button", async () => scenario(async (_authorize, _input, calls) => {
  const html = renderToStaticMarkup(React.createElement(ManualNfe539Authorization, { binding, disabled: false }));
  assert.match(html, /Pedido .*order.*Automação .*automation/);
  assert.match(html, /SHA-256 esperado/);
  assert.match(html, /<button[^>]+disabled=""[^>]*>Registrar autorização<\/button>/);
  assert.equal(calls.length, 0);
}));

test("manual confirmation produces one POST even with a concurrent click and returns only allowed fields", async () => scenario(async (authorize, input, calls) => {
  const [result, duplicate] = await Promise.all([authorize(input), authorize(input)]);
  assert.deepEqual(result, { http: 200, authorizationId, expiresAt, transportAuthorized: false });
  assert.ok(duplicate.error);
  assert.equal(calls.length, 1);
}));

for (const failure of ["timeout", "invalid-success"]) {
  test(`uncertain result (${failure}) prevents automatic retry and repeat after reload`, async () => scenario(async (authorize, input, calls) => {
    const result = await authorize(input);
    assert.equal(result.uncertain, true);
    assert.doesNotMatch(result.error, /sensitive fixture/);
    assert.equal((await createManualNfe539Authorization(binding)(input)).uncertain, true);
    assert.equal(calls.length, 1);
  }, failure));
}

test("HTTP 401 never triggers Axios authentication refresh or replay", async () => scenario(async (authorize, input, calls) => {
  assert.equal((await authorize(input)).http, 401);
  assert.equal(calls.length, 1);
}, 401));

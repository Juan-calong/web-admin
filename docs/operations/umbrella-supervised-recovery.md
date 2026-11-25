# Umbrella supervised recovery — Admin

Depends on Backend PR https://github.com/Juan-calong/ecommerce-api/pull/43. Publish Backend before this Admin, only after separate authorization. PR #9 NFE_SEND recovery is preserved. PR #10 is not incorporated: it overlaps the product page and needs separate reconciliation if both are later merged.

The existing product screen shows the scoped supervised section only for the identified, unlinked Umbrella product. Ordinary synchronization remains separate and compatible. The interface adds no login, token storage, Worker, global flag or fiscal endpoint.

## Explicit actions

1. Review the saved server snapshot and authenticated company identity.
2. Select `TECHNICAL_NON_SEND` or `RISK_RESIDUAL_ACCEPTANCE` explicitly. Enter references/SHA-256 and the actual support date or technical artifacts, then confirm human review. Support-reported absence of registration is not proof of NOT_SENT.
3. Register a single-use, five-minute authorization. This does not execute synchronization.
4. Only with separate operational authorization, explicitly confirm the execution. Association is preferred; an allowed creation uses one new durable identity. No sale or NF-e is created by this screen.

No implicit acceptance, render-time request, retry/replay after 401/timeout or double-click dispatch. Refresh the real state after success. A result that is uncertain must not be retried blindly. An old exceptional approval never grants permission for a later ordinary update.

Special requests use `{legacyRevision:0, regularization:{...}}` at the existing ADMIN sync route. The old backend rejects the sentinel before any sync; the new backend requires a valid scoped action. Company IDs are strings, including alphanumeric IDs. Missing identity blocks. Credentials and evidence contents are not displayed or stored in browser persistence.

## Validation and limits

32 targeted cases passed: client/confirmation/authentication/error/timeout/duplicate handling (14), isolated rendering (1), product recovery regressions (14), existing NFE_SEND recovery (3). TypeScript, lint of new modules and diff-check passed. Run with `node --import ./scripts/test-admin-loader.mjs <test-file>`; run TypeScript with `npx tsc --noEmit --incremental false`.

The existing product page retains four pre-existing `react-hooks/set-state-in-effect` errors and two image warnings, equal to main baseline. Do not claim global lint passed. No real authenticated browser test or real enterprise identity verification was performed for this patch. Tests simulate transport and do not grant residual-risk acceptance.

Runtime configuration, credentials, production data and provider operations are outside this PR. Keep Draft until review. No operational recovery is permitted solely because this interface is deployed. Roll back Admin first if necessary; preserve ledger/history and evaluate any consumed or uncertain operation before reverting Backend.

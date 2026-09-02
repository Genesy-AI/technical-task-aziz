# TinyEnginy — Codebase Analysis & Roadmap

Owner: Aziz · Status: proposal · Scope: `backend/` + `frontend/` at commit `c30d29f`

## Where we are

Three slices shipped on `takehome/recorded` (~840 added lines, 21 files):

1. `8add439` — email verification bounded: activity `startToCloseTimeout` 30s + retry (3 attempts, exponential) in `workflows.ts`, per-lead isolation in `services/verifyLeadEmails.ts`, honest partial/total failure feedback.
2. `e0a88af` — `phoneNumber`, `yearsAtCompany`, `linkedinUrl` across schema, CSV import, table, and a scalable message-field list (`frontend/src/utils/messageFields.ts`).
3. `c30d29f` — alpha-2 country validation shared by the CSV preview and the `/leads/bulk` boundary.

**Remaining work and confirmed debt.** The phone-enrichment Temporal workflow (P0-1) is the outstanding feature. The items after it are debt confirmed by reading the current tree, each with its own evidence — mostly pre-existing, though P0-3 concerns code `8add439` touched and P1-2 counts duplication the slices above added to.

---

## P0 — do first

### P0-1 · Phone enrichment workflow (the missing feature)

**Evidence.** `activities/utils.ts` contains only `verifyEmail`; `workflows.ts` exports only `verifyEmailWorkflow`. No provider client, no `/leads/enrich-phones` route, no phone-status column in `LeadsList.tsx`. `phoneNumber` exists on the model but is CSV-only.

**Impact.** The core product promise. Without it, `phoneNumber` is manual data entry.

**Direction.**

- *Provider adapters.* One module per provider behind a single interface (`lookup(lead) → { phone: string | null }`), normalizing the three incompatible contracts: Orion (`x-auth-me` header, `{fullName, companyWebsite}` → `{phone}`), Astra (`apiKey` header, `{email}` → `{phoneNmbr}`), Nimbus (`?api=` query, `{email, jobTitle}`). Docs list Nimbus as `{number, countryCode}`; treat the response as `number | phoneNmbr` and coerce numbers to strings — adapters are the only place that knows a provider's shape.
- *One activity per provider,* not one activity looping over three. Separate activities give per-provider timeouts, retry budgets, and history visibility. `startToCloseTimeout: '10 seconds'` (Orion is the slow one) with `retry: { maximumAttempts: 3, backoffCoefficient: 2 }`, matching the pattern `workflows.ts` already uses. Note `startToCloseTimeout` bounds one attempt; add `scheduleToCloseTimeout` if we want a hard ceiling across retries ([activity options](https://github.com/temporalio/sdk-typescript/blob/main/packages/common/src/activity-options.ts)).
- *Sequential with early exit:* Orion → Astra → Nimbus, returning on the first non-null phone. Trade-off: worst-case latency is the sum of all three, but it respects the stated data-quality ordering and minimises provider spend. Parallel-then-pick-best would be faster and roughly 3× the cost.
- *Stable identity.* `workflowId: enrich-phone-${leadId}` plus `workflowIdConflictPolicy: 'USE_EXISTING'` so a double-click attaches to the running execution instead of starting a second one, and `workflowIdReusePolicy: 'ALLOW_DUPLICATE'` so a later re-enrich is still allowed ([workflow options](https://github.com/temporalio/sdk-typescript/blob/main/packages/common/src/workflow-options.ts)). The current email route uses `verify-email-${lead.id}-${Date.now()}` — deliberately non-idempotent, and the mistake not to repeat.
- *Persistence & status.* Add `phoneEnrichmentStatus` (`queued | orion | astra | nimbus | found | no_data | failed`) and `phoneEnrichedAt`; the workflow writes status transitions through a persistence activity so state survives a worker restart. Return `{ queued, errors }` immediately from `POST /leads/enrich-phones` — never `workflow.execute` on the request path.
- *Frontend.* `Find Phone` in the Enrich menu; the phone cell renders the phone or its live status; poll `leads.getMany` every ~2s only while at least one lead is in an active state, then stop.
- *Rate limits (not yet enforced by providers).* Two different knobs, worth keeping straight. `maxConcurrentActivityTaskExecutions` (default 100) caps how many activities a worker runs *at once* — concurrency, not a rate; it bounds our own resource use but says nothing about requests per second. The dispatch-rate cap is `maxTaskQueueActivitiesPerSecond`, which limits how fast the task queue hands out activities and is enforced server-side (it applies on activity poll, and workers on the same queue setting different values will thrash — last poller wins), with `maxActivitiesPerSecond` as the per-worker equivalent. Since a single value applies per queue, giving each provider its own task queue is what buys isolation: a per-provider RPS cap, and a throttled provider that can't starve the other two ([worker options](https://github.com/temporalio/sdk-typescript/blob/main/packages/worker/src/worker-options.ts)).
- *Tests.* Unit-test each adapter's normalization (Nimbus's documented/live mismatch especially) and the fallback chain with stubbed activities: found-on-first (no further calls), found-on-third, all-null → `no_data`.

**Effort.** 1.5–2 days. **Done when:** enriching a lead in the UI walks the chain, stops early, shows live status, survives a worker restart and a double-click, and adapter + chain tests pass.

### P0-2 · `prisma/dev.db` is committed and there is no seed

**Evidence.** `git ls-files` lists `backend/prisma/dev.db`. Applying the pending migration during a smoke test dirtied it and it had to be restored by hand. No `prisma.seed` config in `backend/package.json`; `prisma/` holds only `dev.db`, `migrations/`, `schema.prisma`.

**Impact.** Binary merge conflicts, one developer's data leaking into another's branch, diffs that silently carry lead records, and no dataset for onboarding.

**Direction.** Gitignore `dev.db*`, add `prisma/seed.ts` wired via the `prisma.seed` key in `package.json`, and add a `db:seed` script. Seeding is then an explicit setup step run after migrations — `pnpm migrate:dev` to bring the schema up, then `pnpm db:seed` to populate it ([db seed](https://github.com/prisma/skills/blob/main/prisma-cli/references/db-seed.md)); `prisma migrate reset` is the one command that re-seeds on its own. Document that pair in the README alongside `migrate dev` (local, drift-aware) vs `migrate deploy` (non-interactive, no shadow DB — what I used during the smoke test). Trade-off: removing the tracked DB makes those two commands a required setup step instead of cloning a ready database.
**Effort.** 2–3h. **Done when:** a clean clone reaches a populated database with two commands and `git status` stays clean while the app runs.

### P0-3 · Email verification still blocks the HTTP request

**Evidence.** `backend/src/index.ts:297` awaits `client.workflow.execute(...)` for every lead inside the request handler, capped at `workflowExecutionTimeout: '2 minutes'`.

**Impact.** `8add439` removed the infinite hang, but a slow provider can still hold a connection for two minutes with no incremental feedback — it won't survive larger batches.

**Direction.** Converge on the P0-1 shape: start workflows, return `{ queued }`, persist status, let the UI poll. Trade-off: more moving parts than an awaited call, but it's the same machinery P0-1 needs, so build it once.
**Effort.** ~0.5 day after P0-1. **Done when:** the route returns in <200ms and per-lead outcomes arrive via polled status.

---

## P1 — next

| # | Item | Evidence | Impact & direction | Effort |
|---|---|---|---|---|
| P1-1 | **Routes and validation** | 9 route handlers in one 330-line `index.ts`; no validation library; each handler re-implements `if (!Array.isArray(leadIds))` and `Number(id)` coercion, so a non-numeric id becomes a 500 instead of a 400 | Untestable and inconsistent. Split into `routes/leads.ts` + service modules and validate request bodies with one schema library (Zod) at the boundary. Trade-off: a dependency and a mechanical refactor; it pays for itself with P1-3 | 1 day |
| P1-2 | **Duplicated contract** | `backend/src/utils/leadFields.ts` and `frontend/src/utils/csvParser.ts` both implement `parseYearsAtCompany`/`parseLinkedinUrl`/country validation; `frontend/src/api/types/leads/*` (9 files) restate the Prisma model by hand | Rules drift silently — a fix in one place doesn't reach the other. Extract a shared validation package, or generate types from the backend. Trade-off: workspace tooling for a 2-app repo; the cheaper first step is a single shared module | 1 day |
| P1-3 | **No endpoint tests** | 5 test files, all unit-level (`utils/`, `services/`); zero coverage of any Express route or Prisma interaction | Every boundary bug — validation, status codes, partial failure — is found by hand. Add Supertest coverage per route against a temporary SQLite file, seeded from P0-2 | 0.5–1 day |
| P1-4 | **Config and secrets** | `backend/.env.sample` is stale MySQL/Prisma boilerplate (`DATABASE_URL="mysql://…"`) for a SQLite project; `localhost:7233` hardcoded in `worker.ts:6` and `index.ts:290`; `frontend/.env` is committed (harmless `VITE_API_URL` today, a bad habit) | Provider credentials arrive with P0-1, so fix this first. Central typed config module, accurate `.env.example`, untrack `frontend/.env`, no secret ever in the repo | 2–3h |
| P1-5 | **Lint is non-functional** | `pnpm lint` in `frontend/` exits with "ESLint couldn't find an eslint.config.(js\|mjs\|cjs) file" — ESLint 9 with a legacy `.eslintrc.cjs`. Backend has no ESLint at all | Nothing is linted; style regressions land unnoticed. Migrate to flat config and add a backend config. Trade-off: the first run will surface a backlog of warnings — fix or ratchet | 2–3h |

## P2 — later

- **Observability.** Only 6 `console.*` calls across `backend/src`; no request logging, no correlation ids, no error tracking. With Temporal workflows spanning minutes, failures are invisible outside the Temporal UI. Add structured request logging with a request id propagated into workflow ids, then error tracking. ~0.5 day. *Done when* a failed enrichment can be traced from toast to workflow history.
- **Provider mocks & CI.** `verifyEmail` is a hardcoded stub with a `setTimeout(20000)`; there is no CI pipeline. Once P1-3 lands, run both suites plus lint and build on every push. ~0.5 day.

## Assumptions

- One environment (local dev). No staging/production, so nothing here covers deploys or migration rollout beyond `migrate deploy`.
- Provider credentials from the README stay short-lived challenge values, never committed.
- Team of 1–2 on this repo; effort estimates are single-developer days.

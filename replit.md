# ViewState App

A Kuwait-first, GCC-ready bilingual (Arabic/English) real estate mobile app for brokers and real estate professionals. The implemented Release 1.0.x foundation is local-first and keeps people, property inventory, capture, enrichment, private source relationships, attachments, and controlled sharing on the device.

**Current status:** Release 1.0.x implementation is in pre-release verification. Core local property and people workflows are built; requirements, matching, import inbox, global search, backup/restore, network, land, tasks, and follow-ups remain separately staged future work.

---

## Run & Operate

- `pnpm --filter @workspace/mobile run dev` — run the Expo mobile app (via workflow)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

---

## Stack

- **Mobile:** React Native + Expo SDK 54, Expo Router, SQLite/AsyncStorage local persistence
- **Backend:** Express 5 + TypeScript (`artifacts/api-server`)
- **Database:** PostgreSQL + Drizzle ORM (`lib/db`) — future server-side persistence architecture; mobile runtime persistence remains local SQLite/AsyncStorage
- **Validation:** Zod v4 + drizzle-zod
- **API codegen:** Orval (from OpenAPI spec in `lib/api-spec/`)
- **Localization:** Arabic (RTL, primary) + English (LTR, secondary)
- **Workspace:** pnpm monorepo, Node.js 24, TypeScript 5.9

---

## Governance

All governance lives in `artifacts/mobile/.ai/`. Read `artifacts/mobile/.ai/README.md` before starting any AI session.

| File | Purpose |
|------|---------|
| `README.md` | Master index — the 18 mandatory governance rules |
| `PROJECT_BIBLE.md` | Vision, V001 scope, personas |
| `ARCHITECTURE.md` | Architecture, module map, layer order |
| `UX_RULES.md` | Visual baseline, RTL rules, navigation |
| `DATABASE_RULES.md` | Schema philosophy and planned tables |
| `CHANGE_POLICY.md` | Stage protocol, completion protocol |
| `AI_WORKFLOW.md` | Session protocol, prompt execution rules |
| `TESTING.md` | 4-layer testing requirement |
| `GRILL_ME.md` | Adversarial review protocol |
| `DECISIONS.md` | All architectural decisions (DEC-001 to DEC-009) |
| `CURRENT_STATE.md` | Live layer status tracker |
| `skills/` | Task-specific AI skill files per module |

---

## Where Things Live

- `artifacts/mobile/` — Expo mobile app
- `artifacts/api-server/` — Express API server
- `lib/api-spec/openapi.yaml` — OpenAPI contract (source of truth)
- `lib/db/src/schema/` — planned Drizzle schema for future server-side persistence (not the current mobile runtime schema authority)
- `lib/api-client-react/src/generated/` — generated React Query hooks
- `artifacts/mobile/.ai/` — Governance Package
- `artifacts/mobile/docs/` — Module, UX, and database documentation

---

## Current Release Scope

**Implemented now:** Kuwait property capture and enrichment, people, private property sources, local attachments, controlled sharing, Arabic/English, and resilient local persistence.

**Separately staged future work:** Requirements, matching, import inbox, global search, backup/restore, network, land, tasks, follow-ups, deals, commission, reports, marketplace features, and advanced assistant capabilities.

## User Preferences

- Governance-first: all AI sessions must start by reading `artifacts/mobile/.ai/README.md`
- Founder-to-CTO governance remains authoritative for scope and stage approval
- Every technical implementation prompt must be written in English and follow the Rule 18 structured command format
- No feature built without explicit Founder `IMPLEMENT: [layer]` command
- Future modules remain unimplemented until separately authorized and staged

# ViewState App

A lean bilingual (Arabic/English) real estate mobile beta for Egyptian brokers. Lets real estate professionals manage contacts, property inventory, and buyer requirements — with automatic matching when a fit exists.

**Current status:** 🔴 PRE-IMPLEMENTATION — Governance Package complete. No product features built yet.

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

- **Mobile:** React Native + Expo (SDK 53+), Expo Router, TanStack React Query, AsyncStorage
- **Backend:** Express 5 + TypeScript (`artifacts/api-server`)
- **Database:** PostgreSQL + Drizzle ORM (`lib/db`)
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
- `lib/db/src/schema/` — Drizzle schema (source of truth for DB)
- `lib/api-client-react/src/generated/` — generated React Query hooks
- `artifacts/mobile/.ai/` — Governance Package
- `artifacts/mobile/docs/` — Module, UX, and database documentation

---

## V001 Product Scope

**In scope:** Contacts, Properties, Matching, Import/Export, Global Search, User Profile, Arabic/English  
**Not V001:** Tasks, Deals, Commission, Reports, Network Marketplace, advanced AI chat, voice assistant

## User Preferences

- Governance-first: all AI sessions must start by reading `artifacts/mobile/.ai/README.md`
- Every implementation prompt must follow the Rule 18 structured command format
- No feature built without explicit Founder `IMPLEMENT: [layer]` command
- PRE-IMPLEMENTATION state is the default — not the exception

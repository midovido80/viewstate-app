# ViewState — Database Documentation

**Status:** PRE-IMPLEMENTATION  
**Last updated:** 2026-08-13

---

This directory contains database documentation for ViewState: schema diagrams, migration history, and query patterns.

---

## Database Doc Index

| Doc | Status |
|-----|--------|
| [Schema Diagram](./schema-diagram.md) | 🔒 To be written with first migration |
| [Migration History](./migrations.md) | 🔒 To be populated as migrations run |
| [Query Cookbook](./query-cookbook.md) | 🔒 To be written with first module |
| [Index Strategy](./index-strategy.md) | 🔒 To be written with first migration |

---

## Planned Tables

```
users
  └── has many properties (broker_id → users.id)
  └── has many contacts (broker_id → users.id)

properties
  └── belongs to users (broker_id)
  └── has many property_media (property_id → properties.id)
  └── has many matches (property_id → matches.property_id)

contacts
  └── belongs to users/broker (broker_id)
  └── has many buyer_requirements (contact_id → buyer_requirements.id)

buyer_requirements
  └── belongs to contacts (contact_id)
  └── has many matches (requirement_id → matches.requirement_id)

matches
  └── belongs to properties (property_id)
  └── belongs to buyer_requirements (requirement_id)

property_media
  └── belongs to properties (property_id)
```

---

## Entity Relationship (Planned)

```
users (brokers)
  │
  ├── properties ──────────── property_media
  │       │
  │       └── matches ──────── buyer_requirements
  │                                    │
  └── contacts ────────────────────────┘
```

---

## Environment Setup (future)

```bash
# Development DB
DATABASE_URL=postgresql://user:pass@localhost:5432/viewstate_dev

# The DB is provisioned by Replit — see replit.md for connection details
# Never commit DATABASE_URL — it is in environment secrets

# Push schema to dev DB
pnpm --filter @workspace/db run push

# Generate migration files
pnpm --filter @workspace/db run generate
```

---

## Data Retention Policy

| Data type | Retention |
|-----------|-----------|
| Active user data | Indefinitely |
| Soft-deleted properties | 2 years |
| Soft-deleted contacts | 2 years |
| Closed/rejected matches | 1 year |
| WhatsApp import raw files | Deleted immediately after parsing |
| OTP codes (auth) | Deleted after verification or 5 minutes |

---

## Backup Policy

- Development DB: no backup required
- Production DB: daily automated backup via Replit/hosting provider
- Backup retention: 30 days
- Recovery test: Founder tests restore quarterly

# Multi-recipient invitations implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Select multiple colleagues from device contacts or saved people, batch in-app invitations, and prepare individual user-confirmed WhatsApp invitations.

**Architecture:** A pure recipient model normalizes/deduplicates selectable phone rows. An account-scoped invitation session persists batch intent and per-recipient capabilities before requests. A single idempotent SQL RPC wraps the existing private phone invitation procedure. The modal owns selection/review while device contact access stays behind a tested adapter.

**Tech Stack:** Existing Expo 54, React Native/Web, expo-contacts, TypeScript, PostgreSQL/PGlite, node:test.

**Spec:** docs/superpowers/specs/2026-11-24-multi-recipient-invitations-design.md

## Global constraints

- No hosted deployment, phone update, APK installation, new native dependency, global account directory or automatic WhatsApp sending.
- Arabic RTL with standard spelling; phone text LTR. Only selected phone numbers reach the server; no address-book upload.
- At most 50 unique recipients per batch; preserve existing 10 direct invitation attempts per owner per 24 hours.
- Preserve account isolation and invitation privacy. Local storage failures block sending before unrecorded network effects.

## Review focus

- Multiple numbers for one name must remain explicit choices; duplicates across sources send once.
- Selection survives search/source changes, but old account work cannot affect the next account.
- Lost RPC responses retry the same persisted operation; rate-limited recipients are never labelled delivered.
- Denied/limited contact access and browser unavailability remain usable through saved people/manual number fallback.
- WhatsApp cancellation, missing handler and changed circle never report delivery or reuse another recipient's link.

## Task 1: Recipient model and device adapter

Files: create services/circleInviteRecipients.ts, services/circleInviteContacts.ts and tests/circleInviteBatch.test.ts under artifacts/mobile.

- [x] Write failing tests for saved people + all contact numbers, localized digits, deduplication, search, invalid numbers, limited/denied/unavailable access.
- [x] Run targeted node:test from artifacts/mobile and observe failures.
- [x] Implement `InviteRecipient { key, name, phone, rawPhone, source }`, `inviteRecipientsFromPeople`, `inviteRecipientsFromContacts`, `filterInviteRecipients`; native adapter reads names/phones only on request.
- [x] Re-run focused tests.

## Task 2: Durable invitation session and private batch RPC

Files: create services/circleInviteBatch.ts, new migration `circle_batch_invitations`, tests/circle-postgres/invitationBatch.test.ts; extend mobile batch tests.

- [x] Write failing tests for persisted operation replay, only selected phone transport, independent stable WhatsApp capabilities, uncertain network/write failures, account invalidation.
- [x] Implement `createCircleInviteBatch({ storage, request, randomId, randomToken, assertActive })` exposing `sendApp(circleId, phones)` and `prepareWhatsApp(circleId, phone)`.
- [x] Persist intent before RPC with readback; canonicalize phone sets so reordered retries reuse the operation. Store results and links account-locally; assert account active before and after every asynchronous boundary.
- [x] Generate a new migration through the installed CLI. Implement `vs_circle_invite_batch(p_circle uuid,p_operation uuid,p_phones text[]) -> jsonb {results:[{phone,status}]}` with owner check, 50-item bound, deduplication, per-operation idempotency, original quota/privacy and denied anonymous/direct table access.
- [x] Run focused mobile and actual PGlite regressions.

## Task 3: Multi-select modal and verification

Files: modify CircleInviteComposer.tsx; add focused CircleInviteRecipientsPicker.tsx / hook as useful; tests/circleInviteComposer.test.ts; mobile package test list; trust-circle acceptance docs.

- [x] Write interaction tests using native-module boundaries or browser fixture for multiple saved/device selections, remove/review, state preservation, busy double-tap, app results and explicit per-recipient WhatsApp opening.
- [x] Implement searchable virtualized phone rows, source switch, selection count, review, manual fallback, independent recipient actions and honest status/error messages.
- [x] Include new mobile tests in npm test. Run formatter, mobile suite, complete TypeScript, property-domain tests and PostgreSQL harness. No lint command exists in mobile package.
- [x] Fresh independent branch review, fix evidenced blockers with regressions, record results.
- [ ] Commit and open/merge PR after required CI into designated branch, return local checkout there; final preview only from designated branch. Do not deploy backend or mobile update.

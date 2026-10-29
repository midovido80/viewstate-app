---
name: Property fact convergence
description: Authority and cleanup rules for equivalent facts stored in canonical property fields and legacy capture metadata.
---

Equivalent property facts must have one authority. Canonical `typeDetails` and top-level property facts win; mapped legacy capture metadata is read compatibility only. Once an edit carries a canonical snapshot, an absent or blank mapped key means intentional deletion and must not be refilled from legacy data. Successful writes remove only proven-equivalent legacy values and preserve semantically distinct template fields.

**Why:** The legacy capture model can contain the same visible fact in two places. Treating both as editable authorities caused duplicate rows, conflicting values, and cleared fields reappearing after save or reopen.

**How to apply:** Map only fields with identical semantics. Hydrate canonical form values from projection, write edits canonically, remove their mapped legacy equivalents, and keep unrelated template metadata unchanged. Test both non-empty updates and explicit clearing.
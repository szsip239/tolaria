---
type: ADR
id: "0160"
title: "Internal collection presentation providers"
status: active
date: 2026-07-16
---

## Context

ADR-0144 separates a collection's selected notes from its presentation, but only the list presentation is executable. Review, board, calendar, and graph surfaces need to replace the note-list/editor workspace while reusing saved View filters, vault identity, and Tolaria's existing note persistence.

Hard-coding each surface in `App.tsx` would couple product-specific parsing and actions to navigation. Loading arbitrary renderer code from saved YAML would create a plugin and security boundary before Tolaria has a stable public extension contract.

## Decision

**Tolaria supports internal, compile-time collection presentation providers selected by saved View YAML.**

A custom presentation uses this portable shape:

```yaml
presentation:
  type: custom
  provider: stable-provider-id
  options: {}
```

The Rust View model preserves the presentation type and flattened provider configuration when reading and writing YAML. The renderer converts the selected View into a `CollectionDefinition`, applies the View's existing filters, and resolves `provider` against a bundled registry.

`CollectionPresentationHost` gives the provider only:

1. The normalized collection and its resolved entries.
2. Loading and active-vault context.
3. Narrow note read, note write, vault refresh, and note navigation callbacks.

The navigation callback resolves only indexed vault notes, exits the custom
presentation into Tolaria's normal entity/editor workspace, and may carry a
stable text anchor. Anchored navigation is fulfilled by the rich editor after
the target note finishes mounting; providers do not receive direct editor or
DOM access.

Saved YAML does not load modules, scripts, URLs, or commands. An unknown provider id renders through the existing list/editor fallback. Provider-specific domain parsing stays outside the generic collection model.

## Options considered

- **Internal provider registry with narrow callbacks** (chosen): proves a second presentation seam while keeping execution and filesystem authority controlled by Tolaria.
- **One hard-coded branch per presentation in `App.tsx`**: simple initially, but duplicates filtering and makes application orchestration own domain-specific UI.
- **Public plugin API now**: more extensible, but requires lifecycle, capability, versioning, localization, security, and packaging contracts that have not been proven by multiple internal providers.
- **Sandboxed HTML stored in the vault**: portable, but Tolaria's HTML sandbox intentionally cannot access parent UI, Tauri IPC, note writes, or local commands.

## Consequences

- Existing lists, Inbox, Changes, Pulse, folders, and Neighborhood keep their current behavior.
- New bundled presentations reuse the same saved View filters and note write path instead of creating another data store.
- A presentation can open a source, topic, or digest through Tolaria's normal navigation path without controlling tabs or editor internals directly.
- Provider registrations are code-reviewed application code; saved vault content selects only an installed id and declarative options.
- Domain-specific providers may remain private while the host seam can be proposed upstream independently.
- A public community plugin API is still deferred until provider lifecycle and capability needs are demonstrated by more than one internal presentation.

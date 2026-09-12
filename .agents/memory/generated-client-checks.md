---
name: Generated client checks
description: Workspace-specific TypeScript requirement for the generated browser API client.
---

The generated browser client uses `Headers.entries()`, so its composite TypeScript project must include both `dom` and `dom.iterable` libraries.

**Why:** The generated client can be valid at runtime and still fail the workspace's composite typecheck if iterable DOM types are omitted.

**How to apply:** Preserve `dom.iterable` in the API client library compiler options when regenerating the OpenAPI client.
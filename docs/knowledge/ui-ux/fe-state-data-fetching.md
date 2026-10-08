---
name: fe-state-data-fetching
description: Frontend state - separating client state from server state, keeping state minimal and close to use, and fetching data with loading, error and staleness handled
domain: web-development
tags: state,server-state,data-fetching,fetch-api,caching,loading-states,react-query
apply_when: "state is duplicated or out of sync; fetch calls scattered in components; deciding where state should live; adding a data-fetching library; handling loading and error states"
sources: "React docs - Thinking in React (read); TanStack Query docs - Overview, server state (read); MDN - Fetching data from the server (read)"
last_reviewed: 2026-09-25
confidence: medium
source: /run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/web-development/items/fe-state-data-fetching.md
copied: 2026-10-09
---

# Frontend state and data fetching

## Two kinds of state

- **Client state**: owned by the browser UI (form draft, open menu, selected tab).
- **Server state**: persisted remotely, fetched asynchronously, and changeable by other users without your knowledge, so a local copy can become stale (TanStack Query's docs).

Treat them differently. Traditional state-management libraries suit client state; server
state adds problems they were not designed for: caching, deduplicating identical requests,
refetching in the background, detecting staleness, pagination and memory. Libraries in this
space (TanStack Query is the documented example; other frameworks have equivalents) handle
those and cut boilerplate.

## Keep client state minimal and local

From React's guidance, applicable in any component framework:

1. Store only what changes over time. Exclude data passed in as props, data that never changes, and anything computable from other state (derive `itemCount` from `items.length`, do not store both).
2. Put each piece of state in the closest common parent of the components that use it; lift it higher only when needed.
3. Data flows down through props, events flow up through callbacks.
4. Reach for global stores last; most state should not be global.

## Fetching data

MDN's baseline with the Fetch API:

- `fetch` returns a promise that resolves when the server responds, even for HTTP error statuses. Check `response.ok` and throw for 4xx and 5xx; network failures reject.
- Parse with `response.json()`, `.text()` or `.blob()` according to the payload.
- Handle errors in one place (`catch`) and show them to the user.
- Requests from other origins are subject to CORS; the API must allow them (`websec-cors`).

Model every request with three UI states: loading, error, and success, plus empty. Cancel or
ignore results of outdated requests (a fast-changing search box) so old responses do not overwrite new ones.

Prefer fetching on the server or at the route level when the framework supports it, so data
arrives with the HTML and avoids request waterfalls (`apptype-web-frontend`). Repeated
identical fetches inside effects, without caching, are the usual source of slow, flickering UIs.

## Use when

- Any interactive frontend; especially where several components read the same remote data.

## Do not use when

- Do not add a server-state library to a page with one fetch and no reuse; plain `fetch` is enough.
- Do not put server data in a global client store and hand-write cache logic when a library already models it.
- Do not use these React-specific steps as prescriptions for non-component code.

## Trade-offs

- Caching libraries speed up UIs and hide when data is stale; configure staleness per data type.
- Lifting state up simplifies sync and can cause re-render cost; measure before optimising.

## Common mistakes

- Duplicated state (stored copy and derived value drift apart).
- Ignoring `response.ok`, so a 500 page parses as data.
- No loading or error state.
- Trusting client data on the server (`appsec-input-validation-injection`).

## Related

- Notes: `fe-framework-choice`, `fe-html-progressive-enhancement`, `dist-api-design`,
  `data-caching`, `dist-idempotency-retries`, `apptype-web-frontend`
- Skills: `react-best-practices`, `nextjs-app-router-patterns`

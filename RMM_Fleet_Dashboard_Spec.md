# Project Spec: Endpoint Fleet Dashboard (TanStack Query Practice Build)

## Purpose

Build a small RMM-style ("remote monitoring and management") console to get hands-on with TanStack Query v5. This is interview prep for a Senior Frontend Engineer role at NinjaOne, whose product is an RMM platform, so the domain is deliberate. The goal is not a polished product. The goal is to touch every major TanStack Query pattern in a realistic setting so I can speak to it fluently and draw comparisons to how I would have done the same thing with RxJS in Angular.

Target: shippable in about one day, deployed to Vercel.

## How to work with me on this

Build it milestone by milestone, not all at once. After each milestone, stop and let me run it, read the code, and ask questions before you move on. I learn by building something, hitting a real bug, and getting the bug explained, so do not pre-solve every edge case silently. Where a milestone has a known tension (flagged below under Learning checkpoints), build the naive version first so I can see the failure, then we fix it together.

I am a senior frontend engineer, deep in Angular and TypeScript, with recent substantial React. You do not need to explain React basics. Do explain TanStack Query design decisions and tradeoffs as you make them.

Writing style for any prose you generate (README, comments): plain and direct, no em dashes, no bold lead-in labels, no filler.

## Stack (pinned)

- Next.js 16, App Router
- TypeScript
- TanStack Query v5 (`@tanstack/react-query`, `@tanstack/react-query-devtools`)
- Tailwind CSS for styling
- Plain HTML table for the grid (TanStack Table is a stretch goal, not day one)
- Deploy to Vercel

Next.js 16 notes: Turbopack is the default bundler, so no bundler config is needed. Node 20+ is required. Route handler and page `params` are async (a Promise), so await them.

The reason for Next over a plain Vite SPA is the in-repo backend. Route Handlers let me write a fake API in the same project, which is what unlocks real mutations without standing up a separate server. Read-only public APIs cannot give me the optimistic-update story, and that story is the most important part of the interview.

## What we are building

A single dashboard with:

1. A device list: a paginated, filterable, sortable table of ~200 endpoints showing hostname, OS, status (online / offline / rebooting), CPU %, memory %, disk %, and last check-in time.
2. A live alert feed that polls on an interval and shows recent alerts across the fleet.
3. A device detail panel: click a row to open a detail view that lazily fetches that device's alert history.
4. Actions: acknowledge/mute an alert (optimistic), and reboot a device (optimistic status change that resolves after a delay).

## Fake backend

Seed an in-memory dataset of ~200 devices once, at module load, using a seeded generator so the data is stable across a dev session. On each list read, drift the metric values slightly (CPU/memory/disk jitter, occasional status flips) so that polling visibly moves. Add a small artificial latency (150 to 400 ms) to every endpoint so loading states and `placeholderData` behavior are actually observable.

Endpoints (all under `app/api/`):

- `GET /api/devices` with query params `page`, `pageSize`, `search`, `status`, `sortBy`, `sortDir`. Returns `{ devices, total, page, pageSize }`. Honor the `AbortSignal` from the request so cancelled queries actually stop.
- `GET /api/devices/[id]` returns one device.
- `GET /api/devices/[id]/alerts` returns that device's alert history (this is the dependent query target).
- `GET /api/alerts` returns the global recent alert feed for the polling widget.
- `POST /api/alerts/[id]/acknowledge` toggles an alert's acknowledged flag. Support a `?fail=1` param (and/or a small random failure rate) so rollback can be demonstrated on demand.
- `POST /api/devices/[id]/reboot` sets status to `rebooting`, then flips it back to `online` after a few seconds.

Persistence caveat to bake in honestly: module-level state persists within a warm dev server and a warm serverless instance, but is not durable across serverless cold starts on Vercel. That is fine for a demo. Note it in the README. The upgrade path is a real store, and I have Neon Postgres set up from other work, so wiring this to Neon is a stretch goal, not a requirement.

## TanStack Query patterns to implement

Each of these must appear somewhere in the build. This list is the interview checklist, so keep them recognizable in the code.

- List query with `queryKey` carrying all filter/sort/pagination inputs, so changing a filter is just a new key.
- `placeholderData: keepPreviousData` on the list so the table holds the previous page while the next one loads instead of flashing empty.
- Deliberate `staleTime` and `gcTime` choices per query, with a one-line comment on why each value.
- `refetchInterval` polling on the alert feed, plus `refetchIntervalInBackground: false` so it pauses when the tab is hidden.
- Dependent query: the device's alert history runs only when a device is selected, gated with `enabled`.
- Prefetch on row hover using `queryClient.prefetchQuery` so opening detail feels instant.
- Mutation with optimistic update: `onMutate` cancels in-flight queries for the key, snapshots the current cache, and writes the optimistic value; `onError` restores the snapshot; `onSettled` invalidates.
- Contrast `invalidateQueries` on a key prefix against a surgical `setQueryData`, and comment on when each is the right tool.
- Query cancellation: pass the `signal` from the query function context into `fetch`.
- A `select` transform somewhere to derive display data without re-running the query.
- Error and retry handling: a real error state in the UI, and a considered `retry` setting.
- Devtools mounted and visible in dev, since I will screen-share it in the interview.

## Milestone plan (one-day shape)

Build in this order. Pause after each.

1. Scaffold. Next 16 app, Tailwind, TanStack Query provider set up correctly for the App Router (a client `providers.tsx` that creates the `QueryClient` in state so it is not shared across requests), Devtools mounted. Confirm a trivial query renders.
2. Fake backend. Seeded device generator, the `GET /api/devices` list endpoint with pagination/filter/sort/search and artificial latency, honoring `AbortSignal`.
3. Device list query. Table wired to the list endpoint, filters and sort and page all living in the `queryKey`, `placeholderData: keepPreviousData` for smooth paging. Set `staleTime`/`gcTime` and comment the reasoning.
4. Alert feed. Global feed widget with `refetchInterval` polling and background pausing.
5. Detail panel with dependent query. Selecting a row opens detail; the alert-history query is `enabled` only when a device is selected. Add hover prefetch.
6. Mutations. Acknowledge/mute an alert optimistically with snapshot and rollback, then the device reboot mutation. Wire the `?fail=1` path so I can watch a rollback fire.
7. Polish and deploy. Error states, empty states, loading skeletons, README, push to Vercel.

## Learning checkpoints (build naive first, then fix)

These are the moments worth slowing down on. Do not quietly engineer around them on the first pass.

- Polling versus optimistic update collision. The alert feed polls on an interval, and acknowledging an alert is an optimistic write to related cache. Build the optimistic acknowledge with polling active on an overlapping key, observe the interval refetch clobbering the optimistic value mid-flight, then reconcile it (cancel queries in `onMutate`, and think about whether the feed and the mutation should even share a key). This is the single most instructive bug in the project and the one that makes the cache model click.
- Filters in the query key versus filtering client-side. Show why putting filter state in the key is the idiomatic move and what breaks if you filter the already-cached page instead.
- `invalidateQueries` versus `setQueryData` after a mutation. Do the same mutation both ways and feel the difference in network cost and flicker.

## Suggested repo structure

```
app/
  layout.tsx
  page.tsx                      // dashboard
  providers.tsx                 // 'use client', QueryClient + Devtools
  api/
    devices/route.ts
    devices/[id]/route.ts
    devices/[id]/alerts/route.ts
    alerts/route.ts
    alerts/[id]/acknowledge/route.ts
    devices/[id]/reboot/route.ts
lib/
  seed.ts                       // seeded device + alert generator, in-memory store, drift logic
  types.ts                      // Device, Alert, list response types
  api-client.ts                 // typed fetch wrappers that forward AbortSignal
features/
  devices/
    use-devices.ts              // list query hook
    use-device.ts                // detail query hook
    use-device-alerts.ts        // dependent query hook
    use-reboot-device.ts        // mutation hook
    DeviceTable.tsx
    DeviceDetailPanel.tsx
  alerts/
    use-alert-feed.ts           // polling query hook
    use-acknowledge-alert.ts    // optimistic mutation hook
    AlertFeed.tsx
```

Keep query hooks in their feature folder, one hook per query/mutation, so the patterns are easy to point at during the interview.

## README requirements

The README is what I skim right before the interview, so it carries the framing, not just setup steps. Include:

- One paragraph on the project and the persistence caveat.
- A short list mapping each feature to the TanStack Query pattern it demonstrates and the file it lives in.
- This Angular comparison table, since the interview will ask me to compare:

| TanStack Query | Angular / RxJS equivalent I have shipped |
|---|---|
| `queryKey` as cache identity | Hand-rolled service cache, a `Map<string, Observable>` I wrote per project |
| Automatic request dedup | `shareReplay(1)` on a shared stream |
| `staleTime` / `gcTime` | No built-in analog; manual invalidation or refetch on every subscribe |
| Query cancellation via `AbortSignal` | `switchMap` cancelling the inner subscription |
| `useInfiniteQuery` | `scan` + `exhaustMap` accumulating pages |
| `placeholderData: keepPreviousData` | Holding the last emission while the next request is in flight |
| `enabled` gating | `filter(Boolean)` ahead of a `switchMap` |
| `select` | `map` on the stream |
| `invalidateQueries` | A refresh `Subject` piped through `switchMap` |
| `refetchInterval` | `timer(0, ms).pipe(switchMap(...))` |
| Optimistic update + rollback | Manual: patch local state, keep the old value in a closure, restore in `catchError` |

- One honest paragraph on the tradeoff: TanStack Query is a cache with a request layer on top, so it gives you server state for free. RxJS is a stream primitive with no opinion about caching, so in Angular I rebuilt the caching half by hand each time, but RxJS still wins for genuinely event-driven work like websockets and coordinated user input. Worth noting that TanStack Query ships an Angular adapter now and Angular's own `resource()` API is moving toward the same model.

## Stretch goals (only if time remains)

- Swap the in-memory store for Neon Postgres so mutations persist.
- Replace the plain table with TanStack Table for column sorting and virtualization.
- Add `useInfiniteQuery` to the alert feed to exercise the pagination-accumulation pattern directly.
- URL-sync the filters with `nuqs` or search params so state survives refresh.

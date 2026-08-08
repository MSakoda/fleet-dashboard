# Endpoint Fleet Dashboard

An RMM-style device fleet console built to get hands-on with TanStack Query v5. It is not a product. It is an interview-prep build for a Senior Frontend Engineer role at NinjaOne, an RMM company, so the domain was chosen on purpose. The goal was to touch every major TanStack Query pattern in a realistic setting.

The backend is fake. A Next.js Route Handler seeds about 200 devices and a rolling alert feed in memory at module load, then drifts the data slightly on every read so the table and feed visibly move over time. That in-memory state survives a warm dev server or a warm Vercel serverless instance, but is not durable across a serverless cold start. On Vercel specifically, expect the fleet to reset whenever the function has been idle long enough to spin down. The upgrade path is a real store (Neon Postgres is set up from other work), but wiring it up was a stretch goal, not a requirement here.

## Stack

Next.js 16, App Router, Turbopack by default. TypeScript. TanStack Query v5 (`@tanstack/react-query`, `@tanstack/react-query-devtools`). Tailwind CSS. A plain HTML table, no TanStack Table.

## Running it

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The TanStack Query Devtools panel is mounted in dev (bottom of the screen) and shows every query's cache state live.

## Patterns and where they live

| Pattern | File |
|---|---|
| `QueryClient` created in `useState`, not module scope, so it isn't shared across requests on the server | `app/providers.tsx` |
| List query with every filter/sort/pagination input in the `queryKey` | `features/devices/use-devices.ts` |
| `placeholderData: keepPreviousData` so paging holds the old page instead of flashing empty | `features/devices/use-devices.ts` |
| Deliberate `staleTime`/`gcTime` per query, each with a comment on why | `features/devices/use-devices.ts`, `features/alerts/use-alert-feed.ts`, `features/devices/use-device.ts`, `features/devices/use-device-alerts.ts` |
| `refetchInterval` polling plus `refetchIntervalInBackground: false` | `features/alerts/use-alert-feed.ts` |
| Dependent query gated with `enabled`, idle until a device is selected | `features/devices/use-device-alerts.ts` |
| Prefetch on row hover with `queryClient.prefetchQuery`, debounced against a dwell timer so a fast cursor pass doesn't fire a prefetch per row | `features/devices/DeviceTable.tsx` |
| Optimistic mutation: `onMutate` cancels in-flight queries, snapshots, writes the optimistic value; `onError` restores the snapshot; `onSettled` invalidates | `features/alerts/use-acknowledge-alert.ts`, `features/devices/use-reboot-device.ts` |
| Surgical `setQueryData` on a single cache entry vs. `setQueriesData` patching every cached list page that contains the same device, vs. broad prefix `invalidateQueries` for eventual reconciliation | `features/alerts/use-acknowledge-alert.ts` (single entry), `features/devices/use-reboot-device.ts` (multiple entries) |
| Query cancellation: the query function's `AbortSignal` forwarded into `fetch`, and the server actually stopping work on abort, not just the client ignoring the response | `lib/delay.ts`, every `app/api/**/route.ts`, `lib/api-client.ts` |
| `select` deriving a value from cached data without a second fetch or an unrelated re-render | `features/alerts/use-unacknowledged-count.ts` |
| Considered `retry` settings: lower for a query a poll cycle will retry anyway, `false` for a mutation with toggle semantics where a blind retry could double-flip the value | `features/alerts/use-alert-feed.ts`, `features/alerts/use-acknowledge-alert.ts` |
| Real error states with a retry action, not just a console error | `features/devices/DeviceTable.tsx`, `features/alerts/AlertFeed.tsx`, `features/devices/DeviceDetailPanel.tsx` |
| Devtools mounted | `app/providers.tsx` |

## Angular comparison

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

TanStack Query is a cache with a request layer on top, so it gives you server state for free. RxJS is a stream primitive with no opinion about caching, so in Angular I rebuilt the caching half by hand each time. RxJS still wins for genuinely event-driven work like websockets and coordinated user input, where there's no request/response to cache in the first place. Worth noting TanStack Query ships an Angular adapter now, and Angular's own `resource()` API is moving toward the same request-plus-cache model.

## What's not built

TanStack Table, `useInfiniteQuery` on the alert feed, URL-synced filters, and the Neon Postgres store were stretch goals and stayed out of scope. See `RMM_Fleet_Dashboard_Spec.md` for the full plan.

# Endpoint Fleet Dashboard

[![CI](https://github.com/MSakoda/fleet-dashboard/actions/workflows/ci.yml/badge.svg)](https://github.com/MSakoda/fleet-dashboard/actions/workflows/ci.yml)

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

## Testing

```bash
npm test          # one run, for CI
npm run test:watch
npm run test:e2e      # Playwright, see below
npm run typecheck
npm run lint
```

CI (`.github/workflows/ci.yml`) runs typecheck, lint and Vitest in one job and Playwright in another, on every push.

Vitest, jsdom, React Testing Library, `user-event`, and MSW. Tests query by role, accessible name and visible text, never by test ID or class name, so they break when behavior breaks rather than when markup is reshuffled.

### How the network is faked

MSW intercepts `fetch` at the network layer, so the tests run the real `lib/api-client.ts`, the real hooks and the real components. Nothing mocks a hook. The handlers in `test/msw/handlers.ts` call the actual Route Handlers in `app/api/**` rather than re-implementing them, so filtering, sorting, pagination, 404s and `?fail=1` can't drift from the app. `test/setup.ts` makes that deterministic: artificial latency is removed (the acknowledge endpoint alone waits 2.5 to 4s), random metric drift, status flips and new alerts are switched off, and the seeded fleet is reset before every test so a reboot or acknowledge in one test can't leak into the next. `renderWithClient` gives each test a fresh `QueryClient` with `retry: false`, so no cache is shared.

When a test needs to stand inside a timing window, it holds a response open with a promise gate instead of sleeping, or advances time with `vi.useFakeTimers()`.

### What's tested

| Behavior | File |
|---|---|
| Status filter replaces the rows; header click sorts and toggles direction; numeric columns sort by value; a filter change resets to page 1 | `features/devices/DeviceTable.test.tsx` |
| `keepPreviousData`: the old page stays visible, with a "refreshing..." hint, until the next page's response arrives | `features/devices/DeviceTable.test.tsx` |
| Optimistic acknowledge updates the UI and cache before the server responds; a 500 rolls the cache back and shows an error | `features/alerts/AlertFeed.test.tsx` |
| `refetchInterval` polling: no request before the interval, one per interval after, and new data shows up | `features/alerts/AlertFeed.polling.test.tsx` |
| A poll in flight when you click acknowledge can't overwrite the pending mutation. Removing the `cancelQueries` call makes this test fail | `features/alerts/AlertFeed.polling.test.tsx` |
| The `enabled`-gated alert history query makes zero requests until a device is selected, then one request for that device only. Hovering a row prefetches the device detail, not its alert history | `features/devices/DeviceDetailPanel.test.tsx` |
| The MSW handlers themselves behave like the routes (pagination, 404, reboot, acknowledge toggle and `?fail=1`) | `test/msw/handlers.test.ts` |

### What isn't tested

- **The reboot mutation.** It patches every cached list page that contains the device with `setQueriesData`, and the 6s resolve-to-online path. The reboot endpoint is covered at the handler level but there is no component test of the cache patching.
- **Search input.** Status filtering is covered, typing into the search box is not.
- **Hover-prefetch dwell timing.** The test confirms a hover prefetches the detail query and not alert history. It does not check that a fast cursor pass over several rows fires nothing.
- **Error states and Retry buttons** on the table and detail panel. The alert feed's rollback error is covered, the others are not.
- **Cancellation on the server.** The 499 branch in each Route Handler and the `AbortSignal` plumbing in `lib/delay.ts` are not exercised, because the tests remove the delay they depend on. The client-side half is indirectly covered by the poll-versus-mutation test.
- **`staleTime`, `gcTime` and the alert feed's `retry: 1`.** The values are not asserted, since a test would just restate the constants.
- **The real Next.js runtime, in the unit tests.** Route Handlers are called directly with a `NextRequest`, so routing, middleware, the server/client boundary and the `Providers` component are only exercised by the three Playwright flows. Async Server Components can't be unit tested with Vitest at all; Next's own guidance is to use E2E for those.
- **Visual output.** Styling, layout, dark mode and the Devtools panel.
- **Real latency and drift.** Both are switched off on purpose. The app's live-moving data is a property of the fake backend, not behavior worth pinning.

### End-to-end (Playwright)

`npm run test:e2e` builds the app, starts it on port 3100 (so it won't collide with `next dev` on 3000), and drives it in Chromium. One-time setup: `npx playwright install chromium`. Three flows, in `e2e/dashboard.spec.ts`:

- Page the table, then filter from page 2 and confirm it returns to page 1 showing only matching rows.
- Search for a device that has alerts, open it, and watch its alert history load.
- Turn on "simulate failures", acknowledge an alert, see the optimistic update, then the rollback and error once the 500 lands.

`e2e/accessibility.spec.ts` runs axe (`@axe-core/playwright`, every rule) over the dashboard and fails on any violation, so an accessibility regression turns CI red. It covers the loaded page, the page with a device panel open, and the page after a failed acknowledge with its error showing, in light mode, dark mode and a mobile viewport. Failures list each rule, the element and what to change. It starts from zero violations, so it is a gate, not a baseline.

Not covered by that gate: an acknowledged alert (shown at reduced opacity, which can lower contrast), the device table's error and empty states, and anything axe can't judge automatically, like whether focus order and screen reader announcements actually make sense.

These run against the real fake backend with its real latency and drift, so they assert shape (every row is offline, the count goes down by one and comes back) and never exact counts. Run `npm run test:e2e` separately from `npm test`; Vitest excludes `e2e/`.

### Why this line

The tests target the behavior TanStack Query is responsible for: what is cached, when a request is made, what the UI shows while one is pending, and what happens when it fails. Those are the places a regression is quiet, because the page still renders. Pure markup, constants and fake-backend internals are left alone, since asserting them mostly restates the code. Browser-level concerns go to the small Playwright layer instead of being forced into jsdom.

## Accessibility and performance, before and after

| Metric | Before | After |
|---|---|---|
| Lighthouse accessibility | 94 | **100** |
| axe violations, page loaded (desktop) | 3 rules / 9 nodes | **0** |
| axe violations, device panel open | 4 rules / 16 nodes | **0** |
| axe violations, mobile viewport | 4 rules / 10 nodes | **0** |
| Lighthouse performance | 92 (runs: 92, 93, 77) | 93 (runs: 93, 93, 77) |
| LCP | 2.4 s | 2.4 s |
| INP (lab estimate) | 40 ms | 40 ms |
| CLS | 0.137 (runs: 0.137 to 0.482) | 0.129 (runs: 0.129 to 0.451) |

Accessibility is the change. Performance is **not** improved: the differences above are within run-to-run noise, and the work here did not target it. The layout shift in the alert sidebar that makes CLS jump on some runs (and drops the performance score to 77 on those) is untouched, as is the 2.4 s LCP.

Method: Lighthouse 13.5.0, mobile, three runs, median reported. axe-core through `@axe-core/playwright` with every rule, on a production build. INP is a scripted lab measurement (Pixel 7 emulation, 4x CPU slowdown), not a Lighthouse value. "Before" is commit `61d89a3`; "after" is the working tree with the accessibility fixes (full method and caveats in `docs/accessibility-performance-baseline.md`). All local, single machine.

What changed: row selection and column sorting use real buttons with `aria-sort`; filters have visible labels; the device panel is a dialog that takes focus and returns it to the row; new alerts are announced in a polite live region; the page has a `<main>` landmark; empty-state text is no longer inside a `<ul>`; secondary and error text was darkened to meet 4.5:1. axe still lists one "needs review" item, the ▲/▼ sort glyph (a non-text character it can't judge, and it is `aria-hidden`).

## What's not built

TanStack Table, `useInfiniteQuery` on the alert feed, URL-synced filters, and the Neon Postgres store were stretch goals and stayed out of scope. See `RMM_Fleet_Dashboard_Spec.md` for the full plan.

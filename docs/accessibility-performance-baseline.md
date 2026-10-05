# Accessibility and performance baseline

Measured 2026-10-04 on commit `61d89a3` (production build, `next start`, port 3100), before any changes. Re-run the same way after changes and compare against this file.

## Numbers

| Metric | Baseline | Notes |
|---|---|---|
| Lighthouse accessibility | **94** | Identical in all 3 runs |
| Lighthouse performance | **92** (median of 92, 93, 77) | Run 3 dropped to 77 because of one large layout shift |
| LCP | **2.4 s** | Same in all 3 runs. Lighthouse flags it as needing work on mobile |
| INP | **40 ms** (lab, see below) | Good. Lighthouse itself does not report INP |
| CLS | **0.137** median (range 0.137 to 0.482) | Needs improvement. Varies run to run |
| axe violations | **3 rules / 9 nodes** on the loaded page | See breakdown below |

Other Lighthouse values, for context: FCP 0.8 s, Speed Index 0.8 s, TBT 80 to 90 ms.

## How it was measured

- **Lighthouse 13.5.0**, CLI, mobile form factor (Moto G Power emulation, simulated throttling), performance and accessibility categories only. Three runs against the same server, local machine, headless Chrome.
- **INP is a lab approximation, not a Lighthouse number.** Lighthouse's navigation mode has no INP. It was measured with Playwright: Pixel 7 emulation, 4x CPU slowdown, and a `PerformanceObserver` on event timing. Nine interactions (two sorts, a status filter, Next, typing in search, opening and closing a device, one acknowledge). INP is the worst of them, since fewer than 50 interactions were recorded. Field INP from real users would differ.
- **axe** is the axe-core engine run through `@axe-core/playwright` (the same engine as the axe DevTools extension), not the browser extension itself. All rules, default tags. The extension's UI-only "intelligent guided tests" were not run.
- The tooling was installed with `--no-save`, so `package.json` is unchanged.
- Local numbers vary with machine load. Treat differences under a few points as noise. CLS in particular depends on how quickly the fake API answers.

## axe violations

| State | Rules | Nodes |
|---|---|---|
| Desktop, page loaded | 3 | 9 |
| Desktop, device panel open | 4 | 16 |
| Mobile (Pixel 7), page loaded | 4 | 10 |

Violations, by rule:

| Rule | Impact | Where |
|---|---|---|
| `color-contrast` | serious | 4 nodes loaded, 6 with panel open on desktop. Lighthouse counts 15. Mostly `text-zinc-500` helper text (alert timestamps, the "simulate failures" label, disabled pagination button) |
| `landmark-one-main` | moderate | The page has no `<main>`. |
| `region` | moderate | Content (title, table, alert feed) sits outside any landmark. Follows from the missing `<main>` |
| `list` | serious | Device panel open only. The "No alert history" paragraph is a direct child of the `<ul>` |
| `scrollable-region-focusable` | serious | Mobile only. One scrollable region is not keyboard reachable. Either the alert list (`max-h` with `overflow-y-auto`) or the table's `overflow-x-auto` wrapper, and the node was not recorded, so confirm which before fixing |

The headline count is the loaded-page desktop figure, **3 rules / 9 nodes**. The worst case measured was 4 rules / 16 nodes.

## Where the performance cost is

- **CLS** comes from the alert feed `<aside>` in `app/page.tsx` shifting as its content loads ("loading alerts..." replaced by 20 alerts). The shift scored 0.137 in two runs and 0.482 in the third, when it moved twice.
- **LCP** is 2.4 s, but the LCP element is the page `<h1>` ("Endpoint Fleet Dashboard"), not table data. The observed breakdown is tiny (time to first byte 8 ms, element render delay 74 ms), so the 2.4 s is mostly Lighthouse's simulated mobile throttling applied to what the page loads before first paint, not slow server work. The measured contributors:
  - One render-blocking stylesheet (5.9 KB), estimated 110 ms savings.
  - About 120 KB of JavaScript in two chunks (48 KB and 70 KB), with roughly 51 KB of it unused on first load. The larger chunk accounts for about 0.28 s of boot-up time.
  - Total transfer is 241 KB across 13 requests, which Lighthouse scores as fine.
  - Not yet tested: whether any one of these is the main cause, so don't assume a fix will bring LCP under 2.5 s without re-measuring.
- **INP and TBT** are fine. Nothing there needs attention.

## After the accessibility work

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

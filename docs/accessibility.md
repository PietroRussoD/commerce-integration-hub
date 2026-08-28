# Accessibility

## Target and Status

The Operator Console targets WCAG 2.2 Level AA. This is an engineering target,
not a formal conformance claim. Conformance requires evaluating every complete
page, responsive variation, interaction state, and relevant user journey with
both automated tools and informed manual testing.

The current scope covers the React application under `apps/operator-console`.
Backend APIs and generated OpenAPI documents are outside the WCAG scope.

## Automated Coverage

`pnpm check` runs Axe against these rendered application surfaces with API data
mocked where required:

- application shell and navigation;
- populated order list;
- populated order details;
- canonical-order simulator.

The shared helper in `src/test/accessibility.ts` reports each violation with its
impact, rule, affected selector, and failure summary. The tests cover semantic
structure, accessible names, form associations, ARIA use, and other rules that
Axe can evaluate in jsdom.

Color contrast is disabled in the jsdom audit because jsdom has no layout or
rendering engine. Contrast must be checked in a browser for every brand and
interactive state. Storybook provides interactive Axe checks for shared
components through its accessibility addon, but those checks do not replace a
full-page audit.

The local `pnpm test:e2e` Playwright suite verifies the order list-to-detail
flow, simulator success and validation states, focus recovery, keyboard skip
navigation, and global overflow at a 320 px viewport in Chromium. The suite
uses deterministic API fixtures and is not currently executed by GitHub
Actions, so it does not verify the live backend or act as a CI gate.

## Current Evidence

- The document language follows the selected English or Italian locale.
- Interactive controls expose accessible names and visible keyboard focus.
- A localized keyboard skip link bypasses repeated header and navigation
  controls and moves focus to the main content.
- Client-side route changes move focus to the newly rendered main content.
- Pending, success, and error feedback use appropriate live semantics.
- Structured API validation errors are displayed next to their controls,
  programmatically associated, and focus the first invalid field.
- Tables retain their semantic structure and confine horizontal scrolling to
  their own container on narrow screens.
- Desktop and 320 px mobile layouts were checked for both brands and both
  locales without global overflow or clipped interactive controls.
- The language preference remains optional when browser storage is unavailable.

## Manual Audit Checklist

Complete this checklist before making a WCAG 2.2 AA conformance claim:

- [ ] Navigate every workflow using only the keyboard and verify a logical focus
  order.
- [ ] Confirm that sticky navigation never obscures the focused element.
- [ ] Test browser zoom at 200% and 400%, including tables and long Italian
  labels.
- [ ] Verify text and non-text contrast for both brands, including hover, focus,
  disabled, success, and error states.
- [ ] Exercise the application with VoiceOver and one Windows screen reader.
- [ ] Confirm that loading, success, validation, and API error messages are
  announced once and at the correct time.
- [ ] Verify form errors provide programmatic field associations and useful
  recovery instructions.
- [ ] Check forced-colors or equivalent high-contrast mode.
- [ ] Review target sizes and spacing for all interactive controls at mobile
  widths.
- [ ] Audit empty, loading, error, replay, conflict, and validation states in
  addition to successful loaded pages.

Record the browser, assistive technology, version, date, tested route, and result
for every completed manual check. Any unresolved failure must remain documented
as a known limitation.

## Public Wording

Until the checklist is complete, describe the console as follows:

> The Operator Console targets WCAG 2.2 Level AA. Automated checks support
> development but do not constitute a formal conformance claim.

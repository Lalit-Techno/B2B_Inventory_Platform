---
name: "LedgerStack"
description: "Crisp, high-clarity design system for multi-tenant B2B inventory, billing, and superadmin operations."
---

## Overview

LedgerStack is built for operations managers, finance controllers, and platform superadmins who spend hours scanning tenant ledgers, GSTIN records, and stock movements. The interface prioritizes calm precision over visual noise: cool mineral neutrals frame dense tabular data, while deep petrol-teal anchors primary actions and active navigation states.

The design style is **Corporate / Modern Minimalism**—restrained tonal layering, crisp 1px structural borders, tabular numerals for every financial and inventory figure, and generous breathing room around primary workflows so complex multi-tenant administration feels effortless and trustworthy.

## Colors

The palette pairs a deep **Petrol Teal** primary with cool mineral neutrals and warm amber/terracotta secondary accents. Status colors (`success`, `warning`) are reserved strictly for tenant lifecycle states, payment statuses, and alert banners—never decorative.

- **Primary (`#003A3E` / `#0F5257`):** Anchors primary CTAs, active sidebar indicators, and key focus states.
- **Surfaces (`#F8FAF9` → `#FFFFFF` → `#F2F4F4`):** Light-mode tonal elevation keeps tables and forms crisp without heavy drop shadows.
- **Status Roles:** Semantic `success` and `warning` tokens pair with high-contrast containers for `Active`, `Trial`, `Grace`, and `Suspended` tenant badges.

```yaml
colors:
  success: "#14532D"
  on-success: "#FFFFFF"
  success-container: "#DCFCE7"
  on-success-container: "#14532D"
  warning: "#78350F"
  on-warning: "#FFFFFF"
  warning-container: "#FEF3C7"
  on-warning-container: "#78350F"
  light:
    primary: "#003A3E"
    on-primary: "#FFFFFF"
    primary-container: "#0F5257"
    on-primary-container: "#89C4C9"
    secondary: "#4D6264"
    on-secondary: "#FFFFFF"
    secondary-container: "#D0E7E9"
    on-secondary-container: "#1F3436"
    tertiary: "#50290C"
    on-tertiary: "#FFFFFF"
    tertiary-container: "#6B3F20"
    on-tertiary-container: "#EAAC85"
    error: "#BA1A1A"
    on-error: "#FFFFFF"
    error-container: "#FFDAD6"
    on-error-container: "#93000A"
    background: "#F8FAF9"
    on-background: "#191C1C"
    surface: "#F8FAF9"
    surface-dim: "#D9DADA"
    surface-bright: "#F8FAF9"
    surface-container-lowest: "#FFFFFF"
    surface-container-low: "#F2F4F4"
    surface-container: "#EDEEEE"
    surface-container-high: "#E7E8E8"
    surface-container-highest: "#E1E3E3"
    on-surface: "#191C1C"
    surface-variant: "#DBE4E5"
    on-surface-variant: "#404849"
    outline: "#707979"
    outline-variant: "#BFC8C9"
    inverse-surface: "#2E3131"
    inverse-on-surface: "#EFF1F1"
    inverse-primary: "#96D0D6"
    shadow: "#000000"
    scrim: "#000000"
  dark:
    primary: "#96D0D6"
    on-primary: "#00363A"
    primary-container: "#0F5257"
    on-primary-container: "#89C4C9"
    secondary: "#B4CBCD"
    on-secondary: "#1F3436"
    secondary-container: "#384D4F"
    on-secondary-container: "#A6BDBF"
    tertiary: "#F8B991"
    on-tertiary: "#4D2609"
    tertiary-container: "#6B3F20"
    on-tertiary-container: "#EAAC85"
    error: "#FFB4AB"
    on-error: "#690005"
    error-container: "#93000A"
    on-error-container: "#FFDAD6"
    background: "#111414"
    on-background: "#E1E3E3"
    surface: "#111414"
    surface-dim: "#111414"
    surface-bright: "#373A3A"
    surface-container-lowest: "#0C0F0F"
    surface-container-low: "#191C1C"
    surface-container: "#1D2020"
    surface-container-high: "#282A2B"
    surface-container-highest: "#323535"
    on-surface: "#E1E3E3"
    surface-variant: "#404849"
    on-surface-variant: "#BFC8C9"
    outline: "#899293"
    outline-variant: "#404849"
    inverse-surface: "#E1E3E3"
    inverse-on-surface: "#2E3131"
    inverse-primary: "#2B676C"
    shadow: "#000000"
    scrim: "#000000"
```

## Typography

A three-role technical font stack balances authority with tabular legibility: **Jost** gives page titles and KPI figures geometric clarity, **Radio Canada Big** handles dense form labels, tables, and body copy at high x-height, and **Red Hat Mono** renders GSTINs, PANs, tenant slugs, and ledger IDs cleanly.

```yaml
typography:
  display-lg:
    fontFamily: "Jost"
    fontSize: 36px
    fontWeight: 600
    lineHeight: 44px
    letterSpacing: -0.5px
  display-lg-mobile:
    fontFamily: "Jost"
    fontSize: 28px
    fontWeight: 600
    lineHeight: 34px
    letterSpacing: -0.25px
  headline-lg:
    fontFamily: "Jost"
    fontSize: 28px
    fontWeight: 600
    lineHeight: 34px
    letterSpacing: -0.25px
  headline-md:
    fontFamily: "Jost"
    fontSize: 22px
    fontWeight: 600
    lineHeight: 28px
    letterSpacing: -0.15px
  headline-sm:
    fontFamily: "Jost"
    fontSize: 18px
    fontWeight: 600
    lineHeight: 24px
    letterSpacing: 0px
  title-md:
    fontFamily: "Radio Canada Big"
    fontSize: 16px
    fontWeight: 600
    lineHeight: 22px
    letterSpacing: 0px
  body-lg:
    fontFamily: "Radio Canada Big"
    fontSize: 15px
    fontWeight: 400
    lineHeight: 22px
    letterSpacing: 0px
  body-md:
    fontFamily: "Radio Canada Big"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
    letterSpacing: 0px
  body-sm:
    fontFamily: "Radio Canada Big"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
    letterSpacing: 0.1px
  label-lg:
    fontFamily: "Radio Canada Big"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
    letterSpacing: 0.1px
  label-md:
    fontFamily: "Radio Canada Big"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 16px
    letterSpacing: 0.2px
  label-sm:
    fontFamily: "Radio Canada Big"
    fontSize: 11px
    fontWeight: 500
    lineHeight: 14px
    letterSpacing: 0.25px
  mono-md:
    fontFamily: "Red Hat Mono"
    fontSize: 13px
    fontWeight: 500
    lineHeight: 18px
    letterSpacing: 0px
  mono-sm:
    fontFamily: "Red Hat Mono"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
    letterSpacing: 0px
```

## Layout & Spacing

Desktop screens use a persistent 240px left sidebar paired with a fluid main workspace (max content width 1320px, 24px–32px page margins) on a strict 4px/8px grid. Auth screens use a centered 440px–480px card over a quiet `surface` canvas with no app chrome. Below `lg` (1024px), multi-column KPI and detail grids collapse cleanly to single-column stacks and the sidebar moves behind a header menu trigger.

```yaml
spacing:
  gutter-xs: 4px
  gutter-sm: 8px
  gutter-md: 16px
  gutter-lg: 24px
  gutter-xl: 32px
  section: 40px
  page-margin: 28px
```

## Elevation & Depth

LedgerStack uses **Low-Contrast Outlines & Tonal Layers** rather than heavy shadows. Primary cards and data tables sit on `surface-container-lowest` (`#FFFFFF`) against a `surface` (`#F8FAF9`) canvas, separated by crisp 1px `outline-variant` (`#BFC8C9` at low opacity or `#E1E3E3` dividers). Modals, wizards, and dropdowns use subtle ambient elevation (`shadow-sm` / `shadow-md`) with clear surface contrast.

## Shapes

Corners are disciplined and architectural—never pill-shaped for cards or inputs, reserving `full` strictly for status badges, avatars, and toggle switches.

```yaml
rounded:
  sm: 4px
  DEFAULT: 6px
  md: 8px
  lg: 12px
  xl: 16px
  full: 9999px
```

## Motion & Micro-interaction

Transitions are crisp, mechanical, and restrained. Button states and row hovers respond within 100ms; drawers, wizards, and tab switches settle within 200ms without bounce. All motion respects `prefers-reduced-motion` and animates only `transform`, `opacity`, and color.

```yaml
motion:
  state-change:
    duration: 100ms
    delay: 0ms
    timingFunction: ease-out
  surface-enter:
    duration: 200ms
    delay: 0ms
    timingFunction: cubic-bezier(0.2, 0, 0, 1)
  surface-exit:
    duration: 150ms
    delay: 0ms
    timingFunction: cubic-bezier(0.3, 0, 1, 1)
```

## Voice & Content Strategy

- **Tone:** Direct, operational, and calm. No marketing fluff, no exclamation marks, no buzzwords.
- **Capitalisation:** Sentence case for headings, form labels, table headers, and button labels (`Onboard organization`, `Copy admin link`, `Suspend tenant`).
- **Terminology:** Use `Organization` (not Company/Workspace) in Superadmin views, `GSTIN` and `PAN` in uppercase, and `INR (₹)` with Indian numbering (`₹1,24,500`) and `DD MMM YYYY` dates (`26 Nov 2026`).
- **Action labels:** Verb + object (`Sign in to workspace`, `Derive state & PAN`, `Export CSV`).
- **Numbers:** Always `tabular-nums` for MRR, tenant counts, dates, GSTINs, and percentages.

## Components

Component implementations live as individual HTML sticker sheet files in
`components/`. Each file contains the canonical, styled HTML components with
`<!-- COMPONENT: name -->` comment markers. Read each file before use.

- **Badge** → `@components/badge.html` — `badge-numeric`, `badge-dot`
- **Button** → `@components/button.html` — `button-primary`, `button-icon`, `button-with-icon`
- **Card** → `@components/card.html` — `card-elevated`, `card-action`, `card-interactive`, `card-interactive-2`
- **Input Field** → `@components/input-field.html` — `input-field-text`, `input-field-icon`
- **Table** → `@components/table.html` — `table-standard`, `table-interactive`, `table-selectable`

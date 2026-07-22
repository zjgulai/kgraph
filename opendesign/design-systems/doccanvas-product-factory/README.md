---
title: DocCanvas Product Factory Design System
status: approved
updated: 2026-07-22
---

# DocCanvas Product Factory Design System

This system turns DocCanvas into a warm, industrial product-factory cross-section for AI product owners and founders. It combines a stable editorial reading surface with restrained 2.5D architecture, deterministic production pipelines, and synthetic digital employee roles.

## Source material

- `DESIGN.md` — DocCanvas 全产品 UI、交互、状态、响应式与 Agent 实施契约。
- `docs/engineering/governed-workbench-ui-inventory.md` — 当前工作台页面、对象、动作、权限与 D0 浏览器基线。
- `docs/superpowers/specs/2026-07-15-doccanvas-living-product-factory-design.md` — approved product and visual specification.
- `app/globals.css` — existing canvas surface and responsive behavior.
- `components/canvas/ArchitectureNodes.tsx` — existing building and room rendering.
- `components/canvas/MobileArchitectureView.tsx` — existing mobile architecture surface.
- `components/canvas/CanvasViewer.tsx` — existing canvas interaction and export ownership.
- Browser audit of `/`, `/canvas/vibe-track`, `/canvas/v2-pro`, and `/canvas/playbook-v2` at desktop and 390×844 mobile sizes.

`DESIGN.md` owns the current product-workbench direction; this package owns the factory presentation tokens and composition rules. The codebase and approved specifications remain implementation sources of truth. Historical screenshots are supporting evidence only.

## Index

- `tokens/colors_and_type.css` — canonical color, typography, spacing, depth, motion, and pipeline tokens.
- `brand/voice-and-tone.md` — language and status-copy rules.
- `brand/style-notes.md` — visual foundations and component composition rules.
- `SKILL.md` — portable usage contract.

## Integration

`app/globals.css` imports the canonical token file and aliases legacy `--canvas-*`, `--track-*`, and `--status-*` variables during migration. New product-factory components consume `--factory-*` semantic variables directly.

No runtime font or UI dependency is required. Digital employee and environment assets are governed separately by the factory presentation registry and its asset contract.

## Design System v2 runtime layer

`components/ui/` owns the internal interaction primitives introduced in D2:

- `ActionButton`, `Field`, `StatusBadge`, `AsyncState`
- `Dialog`, `Drawer`, `Menu`, `Tabs`

`components/ui/primitives.css` consumes the semantic token file above. Overlay focus, keyboard navigation, reduced-motion and state semantics belong to this shared layer, not to individual workspaces. The gated `/e2e-fixtures/design-system` route and `tests/e2e/design-system-v2.spec.ts` provide the browser and visual regression contract.

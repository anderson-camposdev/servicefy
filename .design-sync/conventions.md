# Servicefy Design System — Conventions

## Setup

Components are available as `window.Servicefy.*`. No provider wrapper is required — components are self-contained and use CSS custom properties for theming.

```jsx
import { ServiceCard } from 'servicefy'
```

## Styling idiom

This DS uses **Tailwind CSS v4 utility classes** (compiled, not CDN). Always use the
provided `styles.css` / `_ds_bundle.css` closure — do not import Tailwind separately.

Brand color tokens (set per tenant at runtime):

| CSS variable        | Purpose                        |
|---------------------|--------------------------------|
| `var(--color-primary)`  | Primary brand color          |
| `var(--color-background)` | Page background color      |
| `var(--sem-p1)` … `var(--sem-p5)` | Priority colors (red→green) |
| `var(--sem-new-bg)` / `var(--sem-new-fg)` | Status badge tokens |

Pass accent colors directly to components as props — do not hardcode hex values.

## Components

### ServiceCard

The primary catalog card. Renders in 3 visual themes:

```jsx
// Minimalist (default) — clean border card
<ServiceCard
  title="Suporte de TI"
  description="Abra chamados para problemas técnicos."
  iconName="Monitor"
  onClick={() => {}}
  fallbackAccentColor="var(--color-primary)"
/>

// Modern 3D — glassmorphism gradient card
<ServiceCard title="Solicitar Serviço" iconName="ShoppingCart"
  defaultTheme="modern_3d" onClick={() => {}}
  fallbackAccentColor="var(--color-primary)" />

// Image fullcard — image fills card, dark pill label
<ServiceCard title="Notebook" defaultTheme="image_fullcard"
  iconName="https://example.com/icon.png"
  uiConfig={{ iconType: 'image' }} onClick={() => {}} />
```

`uiConfig` prop controls icon size (`icon_size: 'small'|'medium'|'large'|'xlarge'`),
label colors, and icon background. `iconName` accepts a lucide icon name, an emoji,
or an image URL (http/https/data:).

### IncidentCatalogSelector / RequestCatalogSelector

Cascade selection components (category → symptom / category → item). Fully controlled
via props: `catalog`, `selection`, `onSelectItem`, `onSelectSubitem`, `primaryColor`.
These components need real data arrays to render meaningfully — use mock data in designs.

## Where CSS lives

- `styles.css` — master sheet, @imports `_ds_bundle.css`
- `_ds_bundle.css` — compiled Tailwind utilities (149 KB) + custom properties
- All designs must link `styles.css` to render correctly

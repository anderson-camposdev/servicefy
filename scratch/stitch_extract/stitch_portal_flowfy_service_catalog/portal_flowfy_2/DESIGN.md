---
name: Portal Flowfy
colors:
  surface: '#fdf7ff'
  surface-dim: '#ded8e0'
  surface-bright: '#fdf7ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f8f2fa'
  surface-container: '#f2ecf4'
  surface-container-high: '#ece6ee'
  surface-container-highest: '#e6e0e9'
  on-surface: '#1d1b20'
  on-surface-variant: '#494551'
  inverse-surface: '#322f35'
  inverse-on-surface: '#f5eff7'
  outline: '#7a7582'
  outline-variant: '#cbc4d2'
  surface-tint: '#6750a4'
  primary: '#4f378a'
  on-primary: '#ffffff'
  primary-container: '#6750a4'
  on-primary-container: '#e0d2ff'
  inverse-primary: '#cfbcff'
  secondary: '#63597c'
  on-secondary: '#ffffff'
  secondary-container: '#e1d4fd'
  on-secondary-container: '#645a7d'
  tertiary: '#765b00'
  on-tertiary: '#ffffff'
  tertiary-container: '#c9a74d'
  on-tertiary-container: '#503d00'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e9ddff'
  primary-fixed-dim: '#cfbcff'
  on-primary-fixed: '#22005d'
  on-primary-fixed-variant: '#4f378a'
  secondary-fixed: '#e9ddff'
  secondary-fixed-dim: '#cdc0e9'
  on-secondary-fixed: '#1f1635'
  on-secondary-fixed-variant: '#4b4263'
  tertiary-fixed: '#ffdf93'
  tertiary-fixed-dim: '#e7c365'
  on-tertiary-fixed: '#241a00'
  on-tertiary-fixed-variant: '#594400'
  background: '#fdf7ff'
  on-background: '#1d1b20'
  surface-variant: '#e6e0e9'
typography:
  display-lg:
    fontFamily: Hanken Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  title-lg:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '500'
    lineHeight: 28px
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '500'
    lineHeight: 14px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  container-padding: 32px
  gutter: 24px
  sidebar-width: 280px
  drawer-width: 480px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 24px
---

## Brand & Style
The design system is engineered for efficiency and clarity within high-stakes B2B environments. It bridges the gap between healthcare reliability and high-tech precision. The personality is "Quietly Powerful"—a system that recedes to prioritize user data while maintaining a distinct, high-end feel.

The aesthetic follows a **Modern Corporate** approach with a **Modular Grid** layout. It emphasizes an "infinite canvas" feel through the use of thin, low-contrast borders and generous negative space. The visual language conveys a sense of organized complexity, making extensive service catalogs feel manageable and structured.

## Colors
The design system utilizes two distinct color strategies to serve different organizational identities:

1. **Beta Hospital (Light):** Focuses on "Sterile Trust." It uses a clean white base with Emerald and Soft Blue accents. These colors are selected to evoke calm, hygiene, and professional reliability. Secondary accents are used for SLA "Healthy" states.
2. **Alpha Tech (Dark):** Focuses on "High-Tech Precision." It uses a Graphite/Deep Grey base to reduce eye strain in technical environments. Neon Blue highlights act as focal points for interactions and "Active" service states, creating a sharp, sophisticated contrast.

Both themes utilize a "Neutral" palette of grays for borders and secondary text to maintain the modular grid structure.

## Typography
The system uses **Hanken Grotesk** as its primary typeface. Its sharp, contemporary geometry provides the "Precision" required for tech and the "Clarity" required for healthcare. 

For technical data, SLA metrics, and VIP indicators, **JetBrains Mono** is used. This monospaced font introduces a "Developer/Technical" secondary layer, making status codes and numerical data instantly distinguishable from editorial labels.

**Scaling:**
- Use `display-lg` only for dashboard headers on Desktop.
- Headlines should shift down one tier on mobile (e.g., `headline-lg` becomes `headline-md`).
- Line height is intentionally generous (150% for body) to support readability in dense service catalogs.

## Layout & Spacing
This design system operates on a **Fixed Sidebar + Fluid Canvas** model. 

- **Sidebar:** A persistent 280px navigation area on the left.
- **Main Canvas:** A fluid area that uses a 12-column grid for service cards.
- **Drawer:** A right-aligned 480px panel that slides over the content for "Deep Dive" forms and service details, ensuring the user never loses their scroll position on the main catalog.

We use a **4px baseline grid**. Standard component spacing (padding) should be 16px or 24px to ensure "generous rhythm." Avoid tight clusters; let the white space (or dark space) act as a separator rather than heavy lines.

## Elevation & Depth
Depth is created through **Tonal Layering** rather than traditional heavy shadows.

- **Level 0 (Background):** Base color of the theme.
- **Level 1 (Cards/Sidebar):** A slightly raised surface. In Light Mode, this uses a subtle 1px border (`#E2E8F0`). In Dark Mode, a subtle inner glow or 1px border (`#2D2F33`).
- **Level 2 (Active/Hover):** A soft, diffused shadow. Light Mode: `0px 4px 20px rgba(0,0,0,0.05)`. Dark Mode: `0px 4px 20px rgba(0,0,0,0.4)`.
- **Level 3 (Drawer/Modals):** High elevation with a backdrop blur (12px) to focus the user on the form while keeping the catalog context visible.

## Shapes
The system uses a "Medium-Soft" geometry. 

- **Containers & Cards:** 12px radius to feel modern and approachable.
- **Interactive Elements (Buttons/Inputs):** 8px radius for a more precise, functional appearance.
- **Badges (SLA/VIP):** 4px radius or "Squircle" to differentiate them from clickable buttons.

All shape edges should be perfectly anti-aliased. Avoid "Pill" shapes for anything other than status indicators to maintain the professional B2B aesthetic.

## Components

### Service Cards
Cards are the primary unit of the catalog. They must include:
- **Title & Icon:** Top-left aligned.
- **SLA Badge:** Top-right aligned, using `label-sm` in a colored box (Emerald for 99.9%, Amber for 95%).
- **VIP Indicator:** A small "Diamond" icon or `VIP` text using the primary accent color.
- **Footer:** Simple "Request" or "View" text-link style button to keep the card clean.

### Sidebar & Category Tree
- **Navigation:** Use clear, high-contrast icons.
- **Category Tree:** Indented levels with 1px vertical guide wires to show hierarchy. Use a chevron-down for expanded states.

### Right-Side Drawer Panel
- Enters from the right. 
- Features a sticky header with a "Close" button and a sticky footer with primary actions (Submit/Cancel). 
- The body area uses `stack-lg` spacing between form fields.

### Inputs & Fields
- **Default State:** Transparent background with a 1px border.
- **Focus State:** Border changes to `primary_color_hex` with a 2px outer "halo" (low opacity primary color).
- **Labels:** Always positioned above the input using `label-md`.
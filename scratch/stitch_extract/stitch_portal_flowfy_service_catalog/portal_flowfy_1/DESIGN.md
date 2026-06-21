---
name: Portal Flowfy
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#434655'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#737686'
  outline-variant: '#c3c6d7'
  surface-tint: '#0053db'
  primary: '#004ac6'
  on-primary: '#ffffff'
  primary-container: '#2563eb'
  on-primary-container: '#eeefff'
  inverse-primary: '#b4c5ff'
  secondary: '#505f76'
  on-secondary: '#ffffff'
  secondary-container: '#d0e1fb'
  on-secondary-container: '#54647a'
  tertiary: '#943700'
  on-tertiary: '#ffffff'
  tertiary-container: '#bc4800'
  on-tertiary-container: '#ffede6'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#d3e4fe'
  secondary-fixed-dim: '#b7c8e1'
  on-secondary-fixed: '#0b1c30'
  on-secondary-fixed-variant: '#38485d'
  tertiary-fixed: '#ffdbcd'
  tertiary-fixed-dim: '#ffb596'
  on-tertiary-fixed: '#360f00'
  on-tertiary-fixed-variant: '#7d2d00'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
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
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  title-md:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
  3xl: 64px
  gutter: 24px
  margin-desktop: 40px
  margin-mobile: 16px
---

## Brand & Style
The design system is engineered for high-performance ITSM environments where clarity and efficiency are paramount. The brand personality is **Professional, Systematic, and Adaptive**, reflecting the reliability required for enterprise service management while maintaining the agility of a modern SaaS product.

The visual style follows a **Corporate / Modern** movement with a focus on modularity. It prioritizes information density without sacrificing legibility. The interface utilizes subtle tonal layering and purposeful white space to guide users through complex workflows. By employing a "thematic-first" architecture, the system remains neutral enough to accommodate diverse corporate identities—from healthcare to high-tech—without losing its structural integrity.

## Colors
The palette is built on a "Primary + Neutral" foundation. All primary accents are tokenized as dynamic variables to allow for instant re-theming.

- **Primary:** The core action color. Default is a trustworthy ITSM Blue, swappable for Teal (Hospital) or Neon Blue (Tech).
- **Surface & Background:** Defined by the color mode (Light/Dark). Surfaces use subtle shifts in lightness to create hierarchy rather than heavy borders.
- **Semantic Colors:** Success (Green), Warning (Amber), and Error (Red) remain consistent across themes to ensure safety and system status are always recognizable.

For dark mode implementations, primary colors should be shifted to a higher luminance (e.g., 400-500 range) to ensure WCAG AA compliance against dark backgrounds.

## Typography
This design system utilizes **Hanken Grotesk** for all roles. Its sharp, contemporary geometry provides the precision required for data-heavy ITSM portals while remaining approachable.

Scale is managed through a modular typographic hierarchy. Headlines use tighter letter spacing and heavier weights to establish strong anchors for page content. Body text is optimized for long-form reading in tickets and knowledge-base articles with a generous 1.5x line height. Labels utilize all-caps or medium weights to differentiate metadata from primary content.

## Layout & Spacing
The layout follows a **Fluid Grid** model with a 12-column structure for desktop. A modular scale based on 4px increments (4, 8, 16, 24, 32, 48, 64) ensures consistent vertical and horizontal rhythm.

- **Desktop (1440px+):** 12 columns, 24px gutters, 40px side margins.
- **Tablet (768px - 1439px):** 8 columns, 16px gutters, 24px side margins.
- **Mobile (Under 768px):** 4 columns, 16px gutters, 16px side margins.

Containers should use `md` (16px) or `lg` (24px) padding internally to maintain a spacious, professional feel. Layout components like sidebars should be collapsible to maximize the workspace for ticket management and dashboard views.

## Elevation & Depth
Depth is conveyed through **Tonal Layers** and extremely soft **Ambient Shadows**. 

In Light Mode, the background uses a subtle off-white/gray, while primary cards use pure white to "pop" forward. Shadows are low-opacity (5-10%) with a large blur radius to avoid a "heavy" look. 

In Dark Mode, elevation is represented by increased lightness of the surface color. A "Level 1" card is slightly lighter than the "Level 0" background. Shadows are largely replaced by subtle 1px inner borders or "ghost outlines" in a low-opacity version of the primary color to define boundaries.

## Shapes
The shape language is consistently **Rounded**, utilizing a base radius of 8px (0.5rem) for standard components like buttons and input fields. Larger containers and cards use 16px (1rem) to create a soft, modern container feel.

This roundedness mitigates the "industrial" coldness often found in enterprise software, making the portal feel inviting to end-users while retaining its professional alignment.

## Components
- **Buttons:** Primary buttons use a solid fill of the dynamic primary color with white or high-contrast text. Secondary buttons use a subtle tonal shift or a 1px outline. 
- **Input Fields:** 8px corner radius. In focus states, the border shifts to the primary color with a soft 2px glow (spread shadow) of the same color at 20% opacity.
- **Cards:** Used for service catalog items and ticket summaries. Cards should have a 16px radius, a subtle border, and a soft shadow on hover to indicate interactivity.
- **Chips/Badges:** Pill-shaped (fully rounded) used for status indicators (e.g., "Pending," "Resolved"). Use low-saturation background tints of semantic colors.
- **Lists:** High-density rows with 8px vertical spacing. Use subtle dividers (1px) in a neutral tint.
- **Service Tiles:** Large, icon-centric cards used in the main portal landing page to categorize services (e.g., "Request Hardware," "Report Outage"). These should feature the primary accent color prominently in the iconography.
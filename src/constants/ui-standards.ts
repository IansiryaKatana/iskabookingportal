/**
 * UI/UX Standards for Urban Hub Booking Portal
 * 
 * This file defines consistent styling, typography, and component patterns
 * to ensure UI/UX consistency across the application.
 * 
 * DO NOT override these standards without updating this file first.
 */

// Typography Standards
export const TYPOGRAPHY = {
  // Font families
  display: "font-display", // For headings and titles
  body: "font-sans", // For body text
  
  // Font sizes
  xs: "text-xs",
  sm: "text-sm",
  base: "text-base",
  lg: "text-lg",
  xl: "text-xl",
  "2xl": "text-2xl",
  
  // Font weights
  normal: "font-normal",
  medium: "font-medium",
  semibold: "font-semibold",
  bold: "font-bold",
  black: "font-black",
  
  // Text transforms
  uppercase: "uppercase",
  lowercase: "lowercase",
  capitalize: "capitalize",
  
  // Letter spacing
  tracking: {
    tight: "tracking-tight",
    normal: "tracking-normal",
    wide: "tracking-wide",
    wider: "tracking-wider",
    widest: "tracking-[0.3em]",
  },
  
  // Standard text styles
  heading: {
    h1: "text-2xl font-display font-black uppercase tracking-wide",
    h2: "text-xl font-display font-bold uppercase tracking-wide",
    h3: "text-lg font-display font-semibold uppercase tracking-wide",
    cardTitle: "text-lg font-display uppercase tracking-wide",
    sectionTitle: "text-xs uppercase tracking-[0.3em] text-muted-foreground",
  },
} as const;

// Button Standards
export const BUTTONS = {
  // Base styles (always include)
  base: "rounded-md uppercase tracking-wide",
  
  // Sizes
  sizes: {
    sm: "text-xs h-7 px-2 gap-2",
    md: "text-sm h-9 px-4 gap-2",
    lg: "text-base h-11 px-6 gap-2",
  },
  
  // Mobile-specific
  mobile: {
    base: "rounded-md uppercase tracking-wide gap-2 flex-shrink-0",
    sm: "text-xs h-7 px-2",
    iconOnly: "h-7 w-7 p-0", // For icon-only buttons on mobile
  },
  
  // Icon sizes
  icon: {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  },
} as const;

// Card Standards
export const CARDS = {
  base: "rounded-3xl border border-border/60 shadow-xl",
  content: "rounded-2xl border border-border/60",
  nested: "rounded-xl border border-border/60 bg-muted/40",
} as const;

// Spacing Standards
export const SPACING = {
  section: "space-y-6",
  card: "space-y-4",
  form: "space-y-4",
  list: "space-y-3",
} as const;

// Mobile Action Button Container
export const MOBILE_ACTIONS = {
  container: "flex items-center gap-2 flex-shrink-0",
  button: `${BUTTONS.mobile.base} ${BUTTONS.mobile.sm}`,
  iconButton: `${BUTTONS.mobile.base} ${BUTTONS.mobile.iconOnly}`,
} as const;

// Dialog Standards
export const DIALOGS = {
  content: "rounded-3xl",
  title: TYPOGRAPHY.heading.h2,
} as const;

// Form Standards
export const FORMS = {
  field: "space-y-2",
  label: "text-sm font-medium",
  input: "rounded-md",
  textarea: "rounded-md min-h-[80px]",
} as const;


# Mobile-First Responsive Design Checklist

## ⚠️ CRITICAL REQUIREMENT

**Mobile-first responsive design is PARAMOUNT for ACARS Hub React.**

This checklist must be reviewed for every component, page, and feature added to the application.

## Mobile-First Approach

✅ **Base styles target mobile devices first** (320px and up)
✅ **Use `min-width` media queries** for progressively larger screens
✅ **Never assume desktop-first** - build mobile, enhance for desktop

## Required Testing Widths

Test ALL features at these viewport widths:

- [ ] **320px** - Small phones (iPhone SE, older Androids)
- [ ] **375px** - Standard phones (iPhone 12/13/14, most modern phones)
- [ ] **768px** - Tablets (iPad, Android tablets)
- [ ] **1024px** - Small desktops / landscape tablets
- [ ] **1280px** - Standard desktops
- [ ] **1920px** - Large desktops / monitors

## Layout Requirements

### ✅ Horizontal Scrolling

- [ ] **No horizontal scroll** at any viewport width
- [ ] All content fits within viewport width
- [ ] Images scale to container width (`max-width: 100%`)
- [ ] Tables adapt (stack, scroll, or truncate)
- [ ] Long URLs or text wrap or truncate
- [ ] Pre-formatted code blocks scroll vertically or wrap

### ✅ Navigation

- [ ] Mobile menu works (hamburger/details menu)
- [ ] Navigation items accessible on small screens
- [ ] Touch-friendly menu items (44x44px minimum)
- [ ] Menu doesn't overflow viewport
- [ ] Active states visible on mobile
- [ ] Theme switcher accessible on mobile

### ✅ Touch Targets

> **WCAG requirement: Minimum 44x44px for interactive elements**

- [ ] Buttons are at least 44px tall
- [ ] Links have sufficient padding/height
- [ ] Form inputs are at least 44px tall
- [ ] Checkboxes/radios have large touch areas
- [ ] Icon buttons are at least 44x44px
- [ ] Adequate spacing between clickable elements (8px minimum)

### ✅ Typography

- [ ] Font sizes readable on mobile (minimum 16px for body text)
- [ ] Line height appropriate for mobile (1.5 minimum)
- [ ] Headings scale appropriately
- [ ] No text truncation unless intentional
- [ ] Text contrast meets WCAG AA (4.5:1 for normal text)

### ✅ Forms

- [ ] Form inputs full-width or appropriate width on mobile
- [ ] Labels visible and associated with inputs
- [ ] Validation messages visible on mobile
- [ ] Submit buttons easy to tap (44px height minimum)
- [ ] Mobile keyboard types triggered correctly (email, tel, number, etc.)
- [ ] Form doesn't break layout on small screens
- [ ] Error states clearly visible

### ✅ Modals and Dialogs

- [ ] Modals fit mobile viewport (don't overflow)
- [ ] Close button easy to tap (44x44px)
- [ ] Modal content scrollable if needed
- [ ] Modal doesn't break on small screens
- [ ] Backdrop tap-to-close works on mobile
- [ ] Keyboard dismissal works (Escape key)

### ✅ Tables and Data Displays

- [ ] Tables adapt to small screens (stack, scroll, or responsive)
- [ ] Horizontal scroll tables have clear indicators
- [ ] Critical data visible without scrolling
- [ ] Column headers remain visible (sticky headers if scrolling)
- [ ] Touch-friendly row/cell interactions

### ✅ Images and Media

- [ ] Images responsive (`max-width: 100%`, `height: auto`)
- [ ] No fixed pixel widths on images
- [ ] Proper aspect ratios maintained
- [ ] Lazy loading for performance
- [ ] Optimized for mobile bandwidth

### ✅ Spacing and Layout

- [ ] Adequate padding/margin on mobile (16px minimum for page edges)
- [ ] Whitespace appropriate for small screens
- [ ] Content not cramped
- [ ] Stacking order logical on mobile (most important content first)
- [ ] Flexbox/Grid layouts adapt to mobile

## SCSS Implementation

### ✅ Mobile-First Media Queries

```scss
// ✅ CORRECT - Mobile first
.component {
  // Base styles for mobile (320px+)
  padding: 1rem;
  font-size: 1rem;

  // Enhance for larger screens
  @include media-md {
    padding: 2rem;
    font-size: 1.125rem;
  }

  @include media-lg {
    padding: 3rem;
    font-size: 1.25rem;
  }
}

// ❌ WRONG - Desktop first
.component {
  padding: 3rem;
  font-size: 1.25rem;

  @media (max-width: 1024px) {
    padding: 2rem;
  }

  @media (max-width: 768px) {
    padding: 1rem;
    font-size: 1rem;
  }
}
```

### ✅ Available Breakpoint Mixins

```scss
@include media-sm {
} // min-width: 640px
@include media-md {
} // min-width: 768px
@include media-lg {
} // min-width: 1024px
@include media-xl {
} // min-width: 1280px
@include media-2xl {
} // min-width: 1536px
```

### ✅ Common Responsive Patterns

```scss
// Stack on mobile, side-by-side on desktop
.layout {
  display: flex;
  flex-direction: column;
  gap: 1rem;

  @include media-md {
    flex-direction: row;
  }
}

// Full width on mobile, constrained on desktop
.container {
  width: 100%;
  padding: 0 1rem;

  @include media-lg {
    max-width: 1400px;
    margin: 0 auto;
  }
}

// Hide on mobile, show on desktop
.desktop-only {
  display: none;

  @include media-md {
    display: block;
  }
}

// Show on mobile, hide on desktop
.mobile-only {
  display: block;

  @include media-md {
    display: none;
  }
}
```

## Performance Considerations

### ✅ Mobile Network Optimization

- [ ] CSS bundle size optimized (< 50kb gzipped)
- [ ] JS bundle size optimized (< 200kb gzipped)
- [ ] Images optimized and compressed
- [ ] Fonts subset for used characters
- [ ] Critical CSS inlined (if applicable)
- [ ] Lazy load below-the-fold content

### ✅ Mobile Rendering

- [ ] No layout shifts (CLS < 0.1)
- [ ] Fast initial render (FCP < 1.8s)
- [ ] Smooth animations (use `transform` and `opacity`)
- [ ] Respect `prefers-reduced-motion`
- [ ] Avoid expensive operations on mobile

## Testing Process

### Manual Testing

1. **Open DevTools** (F12 or Cmd+Option+I)
2. **Toggle Device Toolbar** (Ctrl+Shift+M or Cmd+Shift+M)
3. **Select Device Preset** or set custom width
4. **Test Each Viewport Width** from checklist above
5. **Verify No Horizontal Scroll** at each width
6. **Test Touch Interactions** (hover states may not work)
7. **Check Navigation** (hamburger menu, links, buttons)
8. **Test Forms** (inputs, validation, submission)
9. **Test Modals** (open, close, scroll, fit viewport)
10. **Verify Theme Switching** works on mobile

### Real Device Testing

- [ ] Test on actual iOS device (iPhone)
- [ ] Test on actual Android device
- [ ] Test on tablet (iPad or Android tablet)
- [ ] Test in different browsers (Safari, Chrome, Firefox)
- [ ] Test in landscape and portrait orientations

### Automated Testing (Future)

- [ ] Visual regression tests at multiple breakpoints
- [ ] Playwright tests with mobile viewports
- [ ] Accessibility tests (axe-core)
- [ ] Performance tests (Lighthouse mobile)

## Common Mobile Issues to Avoid

### ❌ DON'T

- Use fixed pixel widths (e.g., `width: 600px`)
- Assume mouse hover states (use `:active` for touch)
- Use `max-width` media queries (desktop-first)
- Set viewport-disabling meta tags
- Use tiny touch targets (< 44px)
- Ignore mobile navigation patterns
- Create horizontal scrolling layouts
- Use desktop-only UI patterns

### ✅ DO

- Use relative units (%, rem, em, vw, vh)
- Design for touch interactions first
- Use `min-width` media queries (mobile-first)
- Set proper viewport meta tag: `<meta name="viewport" content="width=device-width, initial-scale=1">`
- Use 44x44px minimum touch targets
- Implement mobile-friendly navigation (hamburger, bottom nav, etc.)
- Test on real devices regularly
- Use mobile-appropriate UI patterns (swipe, tap, long-press)

## Mobile-Specific Features

### ✅ Progressive Enhancement

- [ ] Core functionality works without JavaScript
- [ ] Enhanced with JavaScript for better UX
- [ ] Graceful degradation for older browsers

### ✅ Mobile-Friendly Interactions

- [ ] Swipe gestures (if applicable)
- [ ] Pull-to-refresh (if applicable)
- [ ] Long-press menus (if applicable)
- [ ] Touch feedback (active states)
- [ ] Haptic feedback (if applicable)

### ✅ Mobile Context

- [ ] Consider user on-the-go (larger text, simpler interactions)
- [ ] One-handed usage where possible
- [ ] Bottom navigation for thumb reach (if applicable)
- [ ] Minimize typing required
- [ ] Auto-capitalize, auto-correct appropriately

## Phase 3+ Requirements

Every new component, page, or feature MUST:

1. **Start with mobile design** - Sketch mobile layout first
2. **Build mobile styles first** - Base SCSS for mobile
3. **Test at 320px** - Ensure it works on smallest phones
4. **Add breakpoints progressively** - Enhance for larger screens
5. **Verify no horizontal scroll** - At all tested widths
6. **Check touch targets** - All interactive elements ≥ 44x44px
7. **Test on real device** - At least one iOS or Android device
8. **Document responsive behavior** - In component comments

## Sign-Off Checklist

Before marking any component or page as "complete":

- [ ] All Required Testing Widths verified
- [ ] No horizontal scrolling at any width
- [ ] All touch targets ≥ 44x44px
- [ ] Mobile navigation works perfectly
- [ ] Forms are mobile-friendly
- [ ] Modals fit mobile viewports
- [ ] Theme switching works on mobile
- [ ] Tested on at least one real mobile device
- [ ] Performance acceptable on mobile network
- [ ] Accessibility verified (keyboard, screen reader, contrast)
- [ ] SCSS uses mobile-first approach (`min-width` queries)
- [ ] Reviewed by at least one other person on mobile device

---

## Resources

- **Breakpoints**: See `src/styles/_variables.scss`
- **Mixins**: See `src/styles/_mixins.scss` - `@include media-*`
- **Example Components**: See `src/components/Navigation.tsx` and corresponding SCSS
- **WCAG Touch Target Size**: <https://www.w3.org/WAI/WCAG21/Understanding/target-size.html>
- **Mobile-First Design**: <https://web.dev/mobile-first/>

---

**Remember: Mobile-first is not optional. It's PARAMOUNT.** 📱

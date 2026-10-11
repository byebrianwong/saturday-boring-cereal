// Small things most story files need.

/**
 * Wraps a story in a div with inline styles. Use it to give a component the
 * room or width it has on the real page. Several cards have badges that hang
 * outside their own box, for example, and get clipped without top padding.
 */
export function frame(style: string) {
  return (Story: () => unknown) => `<div style="${style}">${Story()}</div>`;
}

/**
 * Story settings for a phone-width view: Storybook opens it at 375px, and
 * Chromatic takes its snapshot at 375px instead of the default desktop width.
 * Use it on components whose CSS has a phone breakpoint.
 */
export const phone = {
  globals: { viewport: { value: 'phone', isRotated: false } },
  parameters: { chromatic: { modes: { phone: { viewport: 'phone' } } } },
};

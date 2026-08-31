export type ClassValue = string | number | false | null | undefined | ClassValue[];

/**
 * Tiny classnames helper. Flattens arrays, drops falsy values, joins with spaces.
 *
 * No tailwind-merge: primitives own their base classes and expose a `className` prop
 * for additive tweaks, not for overriding the same Tailwind property. Keep overrides
 * additive (spacing, layout) rather than conflicting (two `bg-*`).
 */
export function cx(...values: ClassValue[]): string {
  const out: string[] = [];
  for (const value of values) {
    if (!value) continue;
    if (Array.isArray(value)) {
      const nested = cx(...value);
      if (nested) out.push(nested);
    } else {
      out.push(String(value));
    }
  }
  return out.join(" ");
}

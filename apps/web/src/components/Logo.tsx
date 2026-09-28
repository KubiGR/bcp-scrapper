/**
 * The site's mark: rising bars in a HUD hexagon, the tallest tipped in plasma. The same drawing
 * is the favicon (public/favicon.svg). Decorative: the site name always sits next to it.
 */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg
      data-logo
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden
      focusable="false"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M16 2.5 27.7 9.25v13.5L16 29.5 4.3 22.75V9.25Z"
        fill="var(--mantine-color-dark-8)"
        stroke="var(--mantine-color-neon-5)"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path
        d="M9 18h3.6v5H9zM14.2 14h3.6v9h-3.6zM19.4 12.5H23V23h-3.6z"
        fill="var(--mantine-color-neon-5)"
      />
      <path d="M19.4 9H23v3.5h-3.6z" fill="var(--mantine-color-plasma-5)" />
    </svg>
  );
}

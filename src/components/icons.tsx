import type { ReactNode, SVGProps } from 'react'

/* ------------------------------------------------------------------ */
/* Inline SVG icon set in the Lucide style: 24px viewBox, stroke 1.75, */
/* round caps/joins, `currentColor`. Decorative by default (aria-hidden)*/
/* — give an icon-only button its own `aria-label`.                    */
/* ------------------------------------------------------------------ */

const paths = {
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
    </>
  ),
  dumbbell: (
    <>
      <path d="M6.5 6.5v11" />
      <path d="M17.5 6.5v11" />
      <path d="M3.5 9v6" />
      <path d="M20.5 9v6" />
      <path d="M6.5 12h11" />
      <path d="M3.5 9h3M3.5 15h3M17.5 9h3M17.5 15h3" />
    </>
  ),
  run: (
    <>
      <circle cx="14.5" cy="4.5" r="1.75" />
      <path d="m7 21 3.5-5 3 2.5V22" />
      <path d="M6 11.5 9 8.5l4 .5 2.5 3.5 3 1" />
      <path d="m13 9-2.5 7" />
    </>
  ),
  bike: (
    <>
      <circle cx="5.5" cy="16.5" r="3.5" />
      <circle cx="18.5" cy="16.5" r="3.5" />
      <path d="M5.5 16.5 9 9h6l3.5 7.5" />
      <path d="m9 9 3.5 7.5H5.5" />
      <path d="M14 5.5h2.5L15 9" />
    </>
  ),
  swim: (
    <>
      <circle cx="17" cy="6.5" r="1.75" />
      <path d="m5 12 4.5-3.5 3 2.5L9 14" />
      <path d="M2 17c1.5 0 1.5 1 3 1s1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1" />
    </>
  ),
  rope: (
    <>
      <path d="M5 3v5" />
      <path d="M19 3v5" />
      <path d="M5 8c0 9 3 13 7 13s7-4 7-13" />
    </>
  ),
  stretch: (
    <>
      <circle cx="12" cy="4.5" r="1.75" />
      <path d="M4 9.5 12 8l8 1.5" />
      <path d="M12 8v6" />
      <path d="m8 21 4-7 4 7" />
    </>
  ),
  utensils: (
    <>
      <path d="M5 3v7a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3" />
      <path d="M7 3v18" />
      <path d="M17 21V3c-2.2 1.2-3.5 3.6-3.5 6.5V14H17" />
    </>
  ),
  apple: (
    <>
      <path d="M12 7.5c-1.5-1-5.5-1.5-6.8 2.2-1.2 3.6.9 9.8 3.8 10.8 1.2.4 2-.4 3-.4s1.8.8 3 .4c2.9-1 5-7.2 3.8-10.8C17.5 6 13.5 6.5 12 7.5Z" />
      <path d="M12 7.5c0-2 .8-3.5 2.5-4.5" />
    </>
  ),
  droplet: <path d="M12 2.8s-6.5 7-6.5 11.7a6.5 6.5 0 0 0 13 0C18.5 9.8 12 2.8 12 2.8Z" />,
  moon: <path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.8 6.8 0 0 0 10.7 10.7Z" />,
  chart: (
    <>
      <path d="M3 3v17a1 1 0 0 0 1 1h17" />
      <path d="m7 15 4-4 3 3 6-6" />
    </>
  ),
  flame: (
    <path d="M12 21.5a6.5 6.5 0 0 0 6.5-6.5c0-3.8-2.6-5.7-3.8-9.5-.8 1.6-1.6 2.6-2.7 3.1C11.5 6.2 10 4 8.5 2.5 8.3 6.6 5.5 9 5.5 15a6.5 6.5 0 0 0 6.5 6.5Z" />
  ),
  trophy: (
    <>
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4.5v1.5A3.5 3.5 0 0 0 8 11" />
      <path d="M17 6h2.5v1.5A3.5 3.5 0 0 1 16 11" />
      <path d="M12 14v3.5" />
      <path d="M8.5 21h7l-.8-3.5H9.3L8.5 21Z" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.25" />
    </>
  ),
  brain: (
    <>
      <path d="M12 5.5A3 3 0 0 0 6.5 4a3 3 0 0 0-2.3 4.3A3.5 3.5 0 0 0 4.5 14a3.5 3.5 0 0 0 3.5 5A2.8 2.8 0 0 0 12 20V5.5Z" />
      <path d="M12 5.5A3 3 0 0 1 17.5 4a3 3 0 0 1 2.3 4.3 3.5 3.5 0 0 1-.3 5.7 3.5 3.5 0 0 1-3.5 5A2.8 2.8 0 0 1 12 20" />
      <path d="M8.5 10.5c1 0 2-.6 2.2-1.6M15.5 10.5c-1 0-2-.6-2.2-1.6M8 15c1.2 0 2.4-.5 3-1.5M16 15c-1.2 0-2.4-.5-3-1.5" />
    </>
  ),
  book: (
    <>
      <path d="M4 19.5V5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2Z" />
      <path d="M4 19.5A2 2 0 0 0 6 21.5h13V18" />
      <path d="M9 7.5h6" />
    </>
  ),
  wallet: (
    <>
      <path d="M19 7V5.5A1.5 1.5 0 0 0 17.5 4H5a2 2 0 0 0 0 4h14a1 1 0 0 1 1 1v3.5" />
      <path d="M3 6v12a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3.5" />
      <path d="M21 12.5h-4a1.75 1.75 0 0 0 0 3.5h4v-3.5Z" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
      <path d="M8 3v4M16 3v4M3.5 10h17" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01" />
    </>
  ),
  settings: (
    <>
      <path d="M10.3 3.3a1.75 1.75 0 0 1 3.4 0l.2.9a1.75 1.75 0 0 0 2.5 1.1l.8-.5a1.75 1.75 0 0 1 2.4 2.4l-.5.8a1.75 1.75 0 0 0 1.1 2.5l.9.2a1.75 1.75 0 0 1 0 3.4l-.9.2a1.75 1.75 0 0 0-1.1 2.5l.5.8a1.75 1.75 0 0 1-2.4 2.4l-.8-.5a1.75 1.75 0 0 0-2.5 1.1l-.2.9a1.75 1.75 0 0 1-3.4 0l-.2-.9a1.75 1.75 0 0 0-2.5-1.1l-.8.5a1.75 1.75 0 0 1-2.4-2.4l.5-.8a1.75 1.75 0 0 0-1.1-2.5l-.9-.2a1.75 1.75 0 0 1 0-3.4l.9-.2a1.75 1.75 0 0 0 1.1-2.5l-.5-.8a1.75 1.75 0 0 1 2.4-2.4l.8.5a1.75 1.75 0 0 0 2.5-1.1l.2-.9Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  'chevron-left': <path d="m15 18-6-6 6-6" />,
  'chevron-right': <path d="m9 18 6-6-6-6" />,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  play: <path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5Z" />,
  pause: (
    <>
      <rect x="6" y="4.5" width="4" height="15" rx="1" />
      <rect x="14" y="4.5" width="4" height="15" rx="1" />
    </>
  ),
  timer: (
    <>
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 9.5v4l2.5 2M10 2.5h4M19 6l1.5-1.5" />
    </>
  ),
  heart: (
    <path d="M12 20.5s-8.5-4.9-8.5-11A4.7 4.7 0 0 1 12 6.6a4.7 4.7 0 0 1 8.5 2.9c0 6.1-8.5 11-8.5 11Z" />
  ),
  sparkles: (
    <>
      <path d="M10 3.5 11.6 8a2 2 0 0 0 1.3 1.3l4.6 1.6-4.6 1.6a2 2 0 0 0-1.3 1.3L10 18.5l-1.6-4.6a2 2 0 0 0-1.3-1.3L2.5 11l4.6-1.6A2 2 0 0 0 8.4 8L10 3.5Z" />
      <path d="M19 3v4M17 5h4M18.5 16.5v3M17 18h3" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
    </>
  ),
  star: (
    <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3l-5.5 2.9 1-6.2L3 9.6l6.2-.9L12 3Z" />
  ),
  trash: (
    <>
      <path d="M4 6.5h16M9.5 6.5V4.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2" />
      <path d="M6 6.5 7 20a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 17 20l1-13.5" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  edit: (
    <>
      <path d="M12 20.5h8.5" />
      <path d="M16.6 3.6a2.1 2.1 0 0 1 3 3L8 18.2l-4 1 1-4L16.6 3.6Z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20.5 20.5-4.5-4.5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.5h.01" />
    </>
  ),
  'arrow-up': <path d="M12 19.5v-15M5.5 11 12 4.5l6.5 6.5" />,
  'arrow-down': <path d="M12 4.5v15M5.5 13l6.5 6.5 6.5-6.5" />,
  scale: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path d="M8.5 9.5a5 5 0 0 1 7 0L13 12" />
    </>
  ),
  activity: <path d="M3 12h4l2.5-6.5 5 13L17 12h4" />,
  wind: (
    <>
      <path d="M3 8.5h10.5a2.5 2.5 0 1 0-2.5-2.5" />
      <path d="M3 12.5h15a2.5 2.5 0 1 1-2.5 2.5" />
      <path d="M3 16.5h7" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  history: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5" />
      <path d="M3.5 3.5v5h5" />
      <path d="M12 8v4.5l3 2" />
    </>
  ),
  list: <path d="M8.5 6h12M8.5 12h12M8.5 18h12M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof paths


export function Icon({
  name,
  size = 20,
  strokeWidth = 1.75,
  className = '',
  title,
  ...rest
}: {
  name: IconName
  size?: number
  strokeWidth?: number
  className?: string
  /** Accessible name — only for standalone meaningful icons; otherwise the icon is hidden from AT. */
  title?: string
} & Omit<SVGProps<SVGSVGElement>, 'name' | 'children'>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
      {...rest}
    >
      {title && <title>{title}</title>}
      {paths[name]}
    </svg>
  )
}

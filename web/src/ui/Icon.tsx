const PATHS = {
  plus: 'M12 5v14M5 12h14',
  check: 'm5 12 5 5 9-10',
  x: 'M6 6l12 12M18 6 6 18',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  chevronRight: 'm9 6 6 6-6 6',
  chevronLeft: 'm15 6-6 6 6 6',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  sites: 'M3 5h18v14H3zM3 9h18',
  shield: 'M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6z',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  survey: 'M5 4h14v16H5zM9 9h6M9 13h6M9 17h3',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  key: 'M14 10a4 4 0 1 0-3 3.8L11 15h2v2h2v2h3v-3z',
  chart: 'M4 20V4M4 20h16M8 16v-5M13 16V8M18 16v-8',
  card: 'M3 6h18v12H3zM3 10h18M7 15h3',
  users: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3 3-5 6-5s6 2 6 5M16 5a3 3 0 0 1 0 6M18 15c2 .6 3 2.2 3 5',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6',
  logout: 'M10 4H4v16h6M15 8l4 4-4 4M19 12H9',
  banner: 'M3 14h18v5H3zM6 9h12',
  inbox: 'M4 13l2-8h12l2 8v6H4zM4 13h5l1 2h4l1-2h5',
  box: 'M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8',
  menu: 'M4 7h16M4 12h16M4 17h16',
  alert: 'M12 4 3 20h18zM12 10v4M12 17v.5',
  refresh: 'M20 11a8 8 0 1 0-2 6M20 5v6h-6',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  desktop: 'M3 5h18v11H3zM9 20h6M12 16v4',
  mobile: 'M8 3h8v18H8zM11 18h2',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  pause: 'M8 5v14M16 5v14',
} as const;

export type IconName = keyof typeof PATHS;

interface Props {
  name: IconName;
  size?: number;
}

/** Decorative stroke icon (always aria-hidden; give the control its own accessible name). */
export function Icon({ name, size = 18 }: Props) {
  return (
    <svg
      class="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

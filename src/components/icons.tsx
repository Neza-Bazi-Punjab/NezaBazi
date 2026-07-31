/* Shared inline SVG icon set. Each icon inherits size via className (h-/w-)
   and colour via currentColor, using the stroke defaults from base(). */
type IconProps = React.SVGProps<SVGSVGElement>;

function base(props: IconProps): IconProps {
  return {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    ...props,
  };
}

export function TrophyIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
      <path d="M8 5H5a1 1 0 0 0-1 1c0 2.2 1.6 3.6 4 3.9M16 5h3a1 1 0 0 1 1 1c0 2.2-1.6 3.6-4 3.9" />
      <path d="M12 13v3m-3.5 4h7m-5.5-4h4l1 4h-6l1-4Z" />
      <circle cx="12" cy="8" r="1.4" />
    </svg>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 9.5h16M8 3v4m8-4v4" />
      <path d="M8 13h2m-2 3.5h2m3-3.5h2m-2 3.5h2" />
    </svg>
  );
}

export function MapPinIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 21s-6.5-5.5-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.5 12 21 12 21Z" />
      <circle cx="12" cy="10.5" r="2.3" />
    </svg>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="7.5" r="2.5" />
      <path d="M7.5 19v-1a4.5 4.5 0 0 1 9 0v1" />
      <circle cx="5.5" cy="9" r="2" />
      <path d="M2 18.5v-.8A3.5 3.5 0 0 1 6.6 14" />
      <circle cx="18.5" cy="9" r="2" />
      <path d="M22 18.5v-.8a3.5 3.5 0 0 0-4.6-3.7" />
    </svg>
  );
}

export function ArenaLightIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3v3M5.6 5.6l2.1 2.1M18.4 5.6l-2.1 2.1" />
      <rect x="8.5" y="8.5" width="7" height="4.5" rx="1" />
      <path d="M9.5 10h1.2m1.6 0h1.2m1.6 0h1.2M9.5 11.8h1.2m1.6 0h1.2m1.6 0h1.2" />
      <path d="M12 13v8m-3 0 3-3 3 3" />
    </svg>
  );
}

export function SeatIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 12V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5" />
      <path d="M6 12a2 2 0 1 0-2 3.4V19h16v-3.6A2 2 0 1 0 18 12v2H6v-2Z" />
    </svg>
  );
}

export function LedScreenIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="5" width="17" height="11" rx="1.5" />
      <path d="M9.8 8.5l4 2.5-4 2.5v-5Z" />
      <path d="M12 16v3m-4 2h8m-8-2h8" />
    </svg>
  );
}

export function HorseIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 20c.3-3.5 1.5-6 4-7.5 2-1.2 4.5-1.5 6.5-1L17 9l1-3 2.5 2c.5.4.6 1 .3 1.6L19 13c-.4.8-1.3 1.2-2.1 1l-1.4-.3c.3 2.4 1 4.3 2.5 6.3" />
      <path d="M8 20c0-1.8.4-3.2 1.5-4.4M18 6l-1.5-2" />
    </svg>
  );
}

export function PhoneIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 4h4l1.5 4.5-2.2 1.6a12.5 12.5 0 0 0 5.6 5.6l1.6-2.2L20 15v4a1.5 1.5 0 0 1-1.6 1.5C10.6 20 4 13.4 3.5 5.6A1.5 1.5 0 0 1 5 4Z" />
    </svg>
  );
}

export function DocumentIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v4h4" />
      <path d="M8.5 12.5h7m-7 3.5h7m-7-7h3" />
    </svg>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 12h16m-6-6 6 6-6 6" />
    </svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function MailIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="m4.5 7 7.5 6 7.5-6" />
    </svg>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M10.2 9.2l4.6 2.8-4.6 2.8V9.2Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function InstagramIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4" y="4" width="16" height="16" rx="4.5" />
      <circle cx="12" cy="12" r="3.5" />
      <circle cx="16.8" cy="7.2" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function YoutubeIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="6.5" width="18" height="11" rx="3" />
      <path d="M10.5 9.8l4 2.2-4 2.2V9.8Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function EyeOffIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 3l18 18" />
      <path d="M10.6 6.1A9.9 9.9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17.4 17.4 0 0 1-3.4 4.1" />
      <path d="M6.6 8.2A17.3 17.3 0 0 0 2.5 12S6 18.5 12 18.5a9.7 9.7 0 0 0 3.7-.7" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

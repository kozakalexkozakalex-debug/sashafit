// Єдиний набір лінійних іконок для нижнього/бокового меню — на відміну від
// емодзі, вони малюються через currentColor і тому коректно підхоплюють
// колір активної вкладки (акцентний помаранчевий), а не лишаються
// різнобарвними системними пікселями.

export type NavIconName =
  | "home"
  | "clients"
  | "library"
  | "analytics"
  | "payments"
  | "more"
  | "profile";

const PATHS: Record<NavIconName, React.ReactNode> = {
  home: (
    <path d="M4 10.5 12 4l8 6.5M6 9.5V19a1 1 0 0 0 1 1h3v-5a2 2 0 0 1 2-2v0a2 2 0 0 1 2 2v5h3a1 1 0 0 0 1-1V9.5" />
  ),
  clients: (
    <>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19.5c.6-3 2.9-5 5.5-5s4.9 2 5.5 5" />
      <circle cx="16.5" cy="9" r="2.3" />
      <path d="M15 14.8c2.1.3 3.8 2 4.3 4.2" />
    </>
  ),
  library: (
    <>
      <rect x="4" y="5" width="7" height="7" rx="1.3" />
      <rect x="13" y="5" width="7" height="7" rx="1.3" />
      <rect x="4" y="14" width="7" height="5" rx="1.3" />
      <rect x="13" y="14" width="7" height="5" rx="1.3" />
    </>
  ),
  analytics: (
    <>
      <path d="M4 20V10.5M11 20V4M18 20v-7" />
      <path d="M3 20h18" />
    </>
  ),
  payments: (
    <>
      <rect x="3.5" y="6" width="17" height="12" rx="1.8" />
      <path d="M3.5 10h17" />
      <path d="M7 14.3h3.5" />
    </>
  ),
  more: (
    <>
      <circle cx="6" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="18" cy="12" r="1.4" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8.3" r="3.3" />
      <path d="M5 19.5c.9-3.6 3.6-5.8 7-5.8s6.1 2.2 7 5.8" />
    </>
  ),
};

export default function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

const PATHS = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  inventory: (
    <>
      <path d="M9 3h6l1 4H8l1-4Z" />
      <path d="M8 7l-3 12.2a1.5 1.5 0 0 0 1.5 1.8h11a1.5 1.5 0 0 0 1.5-1.8L16 7" />
      <path d="M9 13h6" />
    </>
  ),
  categories: (
    <>
      <path d="M11 3H5a1 1 0 0 0-1 1v6l9.6 9.6a1.5 1.5 0 0 0 2.1 0l5-5a1.5 1.5 0 0 0 0-2.1L11 3Z" />
      <circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  requests: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 3v-.5A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5V3" />
      <path d="m9 13 2 2 4-4" />
    </>
  ),
  equipment: (
    <>
      <path d="M10 2v7.5L5.5 18a2 2 0 0 0 1.8 3h9.4a2 2 0 0 0 1.8-3L14 9.5V2" />
      <path d="M9 2h6" />
      <path d="M8.5 15h7" />
    </>
  ),
  members: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.5a3.2 3.2 0 0 1 0 6.4" />
      <path d="M18 14.2a6.5 6.5 0 0 1 3.5 5.8" />
    </>
  ),
  incubator: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="1.5" />
      <path d="M4 9h16" />
      <circle cx="8" cy="6" r="0.9" fill="currentColor" stroke="none" />
      <path d="M8 13v5M12 13v5M16 13v5" />
    </>
  ),
  fridge: (
    <>
      <rect x="5" y="2" width="14" height="20" rx="1.5" />
      <path d="M5 10h14" />
      <path d="M8 5v3M8 13v4" />
    </>
  ),
  dewar: (
    <>
      <path d="M9 2h6v3.2a3 3 0 0 0 1.4 2.5A5 5 0 0 1 19 12v6a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-6a5 5 0 0 1 2.6-4.3A3 3 0 0 0 9 5.2V2Z" />
      <path d="M9 2h6" />
      <path d="M6.5 15h11" />
    </>
  ),
  freezer: (
    <>
      <path d="M12 2v20M12 2 9 4.5M12 2l3 2.5M12 22l-3-2.5M12 22l3-2.5" />
      <path d="M3.5 7 20.5 17M3.5 7l1-3.4M3.5 7 6.9 6M20.5 17l-1 3.4M20.5 17 17.1 18" />
      <path d="M20.5 7 3.5 17M20.5 7l-3.4-1M20.5 7l-1 3.4M3.5 17l3.4 1M3.5 17l1-3.4" />
    </>
  ),
  box: (
    <>
      <path d="M3 8.5 12 4l9 4.5-9 4.5-9-4.5Z" />
      <path d="M3 8.5V16l9 4.5 9-4.5V8.5" />
      <path d="M12 13v7.5" />
    </>
  ),
  warning: (
    <>
      <path d="M10.3 3.5a2 2 0 0 1 3.4 0l8 14A2 2 0 0 1 20 20.5H4a2 2 0 0 1-1.7-3L10.3 3.5Z" />
      <path d="M12 9.5v4" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  flask: (
    <>
      <path d="M9 2h6" />
      <path d="M10 2v7.5L4.8 18a2 2 0 0 0 1.7 3h11a2 2 0 0 0 1.7-3L14 9.5V2" />
      <path d="M7.5 14.5h9" />
    </>
  ),
};

function Icon({ name, className = "", ...rest }) {
  const path = PATHS[name];
  if (!path) return null;
  return (
    <svg
      className={`icon ${className}`.trim()}
      viewBox="0 0 24 24"
      aria-hidden="true"
      {...rest}
    >
      {path}
    </svg>
  );
}

export default Icon;

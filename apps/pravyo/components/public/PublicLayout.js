export function PublicPageShell({ children, className = "" }) {
  return (
    <main
      className={`min-h-screen overflow-x-hidden pb-32 md:pb-0 ${className}`.trim()}
    >
      {children}
    </main>
  );
}


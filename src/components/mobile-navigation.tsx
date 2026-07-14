"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

const panelId = "mobile-navigation-panel";
const subscribeToHydration = () => () => undefined;

export function MobileNavigation({ children }: { children: React.ReactNode }) {
  const enhanced = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const pathname = usePathname();
  const [menu, setMenu] = useState({ open: false, pathname });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const open = menu.open && menu.pathname === pathname;

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMenu({ open: false, pathname });
      triggerRef.current?.focus();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, pathname]);

  if (!enhanced) {
    return (
      <details className="mobile-nav mobile-nav-fallback">
        <summary className="mobile-nav-trigger">
          <span className="mobile-nav-icon" aria-hidden="true" />
          <span className="visually-hidden">Menu</span>
        </summary>
        <nav className="mobile-nav-panel" aria-label="Mobile navigation">
          {children}
        </nav>
      </details>
    );
  }

  return (
    <div className="mobile-nav">
      <button
        ref={triggerRef}
        className="mobile-nav-trigger"
        type="button"
        aria-controls={panelId}
        aria-expanded={open}
        aria-label={open ? "Close navigation" : "Open navigation"}
        onClick={() => setMenu({ open: !open, pathname })}
      >
        <span className="mobile-nav-icon" aria-hidden="true" />
        <span className="visually-hidden">{open ? "Close" : "Menu"}</span>
      </button>
      <nav
        className="mobile-nav-panel"
        id={panelId}
        aria-label="Mobile navigation"
        hidden={!open}
        onClickCapture={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest("a[href]")
          ) {
            setMenu({ open: false, pathname });
          }
        }}
      >
        {children}
      </nav>
    </div>
  );
}

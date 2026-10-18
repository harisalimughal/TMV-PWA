/**
 * Application shell (TMV Aurora): a midnight sidebar with grouped destinations, a
 * frosted command header (search, London clock, theme, alerts, account) and one
 * content column aligned to the same left edge on every page.
 *
 * The sidebar's collapsed/expanded state is the user's preference -- persisted, and
 * never changed automatically by navigation (the audit found the driver report
 * collapsing it, removing labels exactly when the page got more complex).
 */
import React, { useEffect, useRef, useState } from "react";
import { DateTime } from "luxon";
import { ChevronLeft, ChevronRight, Command, LogOut, Menu as MenuIcon, Monitor, Moon, RefreshCw, Search, Settings, Sun, Trash2, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAdminProfile } from "../../../api/admin";
import { CommandPalette } from "./components/CommandPalette";
import { ShortcutsModal } from "./components/ShortcutsModal";
import { AlertsBell } from "./components/AlertsBell";
import { NAV, NAV_GROUPS, navOwner, type RouteId } from "./navigation";
import { Menu } from "../../../ui/Menu";
import { cx } from "../../../ui/cx";
import { useActivityUnread } from "./hooks/useActivity";
import { focusRing } from "./components/ds";
import { isMacPlatform } from "./utils/platform";
import { useAdminTheme, type AdminThemePreference } from "./hooks/useAdminTheme";
import { useDialogFocus } from "../../../ui/useDialogFocus";

interface Props {
  activeSection: RouteId | string;
  onSelectSection: (id: string, params?: Record<string, string | undefined>) => void;
  onLogout?: () => void;
  children: React.ReactNode;
}

const SIDEBAR_KEY = "tmv:admin-sidebar-collapsed";

/** Stored preference wins; with none, narrow tablets start collapsed so content keeps its width. */
function readCollapsed(): boolean {
  try {
    const stored = localStorage.getItem(SIDEBAR_KEY);
    if (stored !== null) return stored === "1";
  } catch { /* storage unavailable: fall through to the width default */ }
  return typeof window !== "undefined" && window.innerWidth >= 768 && window.innerWidth < 900;
}

const THEME_OPTIONS: Array<{ value: AdminThemePreference; label: string; short: string; icon: typeof Sun }> = [
  { value: "light", label: "Aurora Light", short: "Light", icon: Sun },
  { value: "dark", label: "Midnight Aurora", short: "Dark", icon: Moon },
  { value: "system", label: "Match system", short: "System", icon: Monitor }
];

/**
 * Three-way appearance control with radio semantics and arrow-key navigation.
 * "icons" sits in the header from 640px up; "labelled" is the same control in the
 * mobile navigation drawer, so phones can choose a theme too.
 */
export function ThemeSwitch({ variant = "icons" }: { variant?: "icons" | "labelled" }) {
  const { preference, setPreference } = useAdminTheme();
  const index = Math.max(0, THEME_OPTIONS.findIndex(option => option.value === preference));
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const labelled = variant === "labelled";
  return (
    <div role="radiogroup" aria-label="Appearance"
      className={labelled ? "tmv-side-card grid grid-cols-3 gap-1 rounded-2xl p-1" : "hidden items-center gap-0.5 rounded-xl border border-admin-line bg-admin-surface p-0.5 sm:flex"}
      onKeyDown={event => {
        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
        event.preventDefault();
        const next = (index + (event.key === "ArrowRight" ? 1 : -1) + THEME_OPTIONS.length) % THEME_OPTIONS.length;
        setPreference(THEME_OPTIONS[next].value);
        refs.current[next]?.focus();
      }}>
      {THEME_OPTIONS.map((option, optionIndex) => {
        const Icon = option.icon;
        const selected = option.value === preference;
        return (
          <button key={option.value} ref={element => { refs.current[optionIndex] = element; }} type="button" role="radio" aria-checked={selected}
            aria-label={labelled ? undefined : option.label} title={option.label} tabIndex={selected ? 0 : -1}
            onClick={() => setPreference(option.value)}
            className={cx("transition", focusRing, labelled
              ? cx("flex h-11 items-center justify-center gap-1.5 rounded-xl text-[13px] font-semibold", selected ? "tmv-theme-option-on" : "tmv-side-muted")
              : cx("grid h-8 w-8 place-items-center rounded-lg", selected ? "bg-surface text-admin-brand shadow-[var(--admin-shadow-sm)]" : "text-admin-ink-2 hover:text-admin-ink"))}>
            <Icon className="h-4 w-4" aria-hidden />
            {labelled && option.short}
          </button>
        );
      })}
    </div>
  );
}

/** London date and time, refreshed every 30 seconds. */
function LondonClock() {
  const [now, setNow] = useState(() => DateTime.now().setZone("Europe/London"));
  useEffect(() => {
    const timer = window.setInterval(() => setNow(DateTime.now().setZone("Europe/London")), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="hidden items-center gap-2 rounded-xl border border-admin-line bg-surface/70 px-3 py-1.5 text-[13px] leading-4 lg:flex" aria-label={`London time ${now.toFormat("cccc d LLLL, HH:mm")}`}>
      <span className="font-semibold tabular-nums text-admin-ink">{now.toFormat("HH:mm")}</span>
      <span aria-hidden className="h-3.5 w-px bg-admin-line" />
      <span className="text-admin-ink-2">{now.toFormat("ccc d LLL")} · London</span>
    </div>
  );
}

export function Layout({ activeSection, onSelectSection, onLogout, children }: Props) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const activityUnread = useActivityUnread();
  const [refreshing, setRefreshing] = useState(false);
  const queryClient = useQueryClient();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const shortcut = isMacPlatform() ? "⌘K" : "Ctrl K";
  useAdminTheme();

  const { data: adminProfile } = useQuery({ queryKey: ["admin_profile"], queryFn: fetchAdminProfile, staleTime: Infinity });
  const initial = (adminProfile?.email || "A").trim().charAt(0).toUpperCase();

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)");
    const handler = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const toggleCollapsed = () => setCollapsed(previous => {
    const next = !previous;
    try { localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0"); } catch { /* storage unavailable: preference lasts this session */ }
    return next;
  });

  // Navigating closes the mobile drawer (it covers the page) but never touches the
  // desktop collapse preference.
  useEffect(() => { setMobileNavOpen(false); }, [activeSection]);

  // On phones the sidebar is a modal drawer: focus moves in and is trapped, Escape
  // closes it, the page behind does not scroll, and focus returns to the menu button.
  const drawerOpen = mobileNavOpen && isMobile;
  useDialogFocus(drawerOpen, sidebarRef as React.RefObject<HTMLDivElement>, () => setMobileNavOpen(false));
  useEffect(() => { if (!isMobile) setMobileNavOpen(false); }, [isMobile]);

  const refreshAll = async () => {
    setRefreshing(true);
    try { await queryClient.refetchQueries({ type: "active" }); } finally { setRefreshing(false); }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(previous => !previous);
        return;
      }
      if (target && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (paletteOpen || shortcutsOpen || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      switch (event.key.toLowerCase()) {
        case "?": event.preventDefault(); setShortcutsOpen(true); break;
        case "/": event.preventDefault(); setPaletteOpen(true); break;
        case "r": event.preventDefault(); void refreshAll(); break;
        case "o": onSelectSection("overview"); break;
        case "b": onSelectSection("bookings"); break;
        case "j": onSelectSection("jobs"); break;
        case "a": onSelectSection("activity"); break;
        case "d": onSelectSection("drivers"); break;
        default: break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSelectSection, paletteOpen, shortcutsOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pointer spotlight: write the cursor position onto the card under it (one rAF-throttled listener).
  useEffect(() => {
    let frame = 0;
    const move = (event: PointerEvent) => {
      if (frame || event.pointerType === "touch") return;
      const { clientX, clientY, target } = event;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const card = (target as HTMLElement | null)?.closest?.<HTMLElement>(".tmv-panel, .tmv-gloss");
        if (!card) return;
        const box = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${clientX - box.left}px`);
        card.style.setProperty("--my", `${clientY - box.top}px`);
      });
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => { window.removeEventListener("pointermove", move); cancelAnimationFrame(frame); };
  }, []);

  const owner = navOwner(activeSection as RouteId);
  const effectiveCollapsed = collapsed && !isMobile;

  return (
    <div className="relative flex min-h-screen bg-admin-bg font-sans text-admin-ink antialiased">
      <div aria-hidden className="tmv-ambient" />
      <div aria-hidden className="tmv-blob tmv-blob-a" />
      <div aria-hidden className="tmv-blob tmv-blob-b" />
      <a href="#admin-main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:shadow-md">Skip to content</a>
      {mobileNavOpen && <div aria-hidden className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden" onClick={() => setMobileNavOpen(false)} />}

      <aside
        ref={sidebarRef}
        aria-label="Main navigation"
        aria-hidden={isMobile && !mobileNavOpen ? true : undefined}
        role={drawerOpen ? "dialog" : undefined}
        aria-modal={drawerOpen ? true : undefined}
        tabIndex={drawerOpen ? -1 : undefined}
        style={drawerOpen ? { outline: "none" } : undefined}
        className={cx(
          "tmv-sidebar fixed inset-y-0 left-0 z-40 flex h-screen h-dvh w-[min(288px,86vw)] flex-col pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] duration-200 motion-reduce:transition-none md:sticky md:top-0 md:z-20 md:translate-x-0 md:pb-0 md:pt-0",
          effectiveCollapsed ? "md:w-[76px]" : "md:w-[248px]",
          // Closed on a phone: off screen and invisible, so Tab cannot reach its links.
          // Visibility animates only on close (it flips at the end); on open it must be
          // visible at once so focus can move into the drawer.
          mobileNavOpen ? "visible translate-x-0 transition-[width,transform]" : "invisible -translate-x-full transition-[width,transform,visibility] md:visible"
        )}
      >
        <div className={cx("flex h-[72px] shrink-0 items-center", effectiveCollapsed ? "justify-center px-2" : "justify-between px-5")}>
          {!effectiveCollapsed && (
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center tmv-logo-tile rounded-2xl bg-white">
                <img src="/tmv-logo.png" alt="" className="tmv-logo-mark h-7 w-7 object-contain" />
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-[16px] font-extrabold tracking-tight tmv-side-strong">The Man Van</span>
                <span className="block truncate tmv-side-muted text-[12px] font-medium uppercase tracking-[0.14em]">Operations</span>
              </span>
            </div>
          )}
          <button type="button" onClick={toggleCollapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed}
            className={cx("hidden h-9 w-9 shrink-0 place-items-center tmv-side-icon tmv-side-btn rounded-xl transition md:grid", focusRing)}>
            {collapsed ? <ChevronRight className="h-4 w-4" aria-hidden /> : <ChevronLeft className="h-4 w-4" aria-hidden />}
          </button>
          <button type="button" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation menu"
            className={cx("grid h-9 w-9 place-items-center tmv-side-icon tmv-side-btn rounded-xl md:hidden", focusRing)}>
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Sections">
          {NAV_GROUPS.map(group => {
            const entries = NAV.filter(entry => entry.group === group.id);
            if (!entries.length) return null;
            return (
              <div key={group.id} className="mt-4 first:mt-1">
                {effectiveCollapsed
                  ? <div aria-hidden className="tmv-side-divider mx-3 mb-1.5 h-px" />
                  : <p className="tmv-nav-label mb-1.5 px-3 text-[12px] font-semibold uppercase tracking-[0.12em]">{group.label}</p>}
                <div className="space-y-1">
                  {entries.map(entry => {
                    const Icon = entry.icon;
                    const active = owner === entry.id;
                    return (
                      <a key={entry.id} href={`?section=${entry.id}`}
                        onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey) return; event.preventDefault(); onSelectSection(entry.id); }}
                        aria-current={active ? "page" : undefined}
                        aria-label={effectiveCollapsed ? entry.label : undefined}
                        className={cx("tmv-nav-item group relative flex h-11 items-center rounded-2xl text-[14px] font-semibold transition", focusRing,
                          effectiveCollapsed ? "justify-center" : "gap-3 pl-2 pr-3")}>
                        <span className="tmv-nav-icon grid h-8 w-8 shrink-0 place-items-center rounded-xl transition"><Icon className="h-[18px] w-[18px]" aria-hidden /></span>
                        {!effectiveCollapsed && <span className="truncate">{entry.label}</span>}
                        {entry.id === "activity" && activityUnread > 0 && (
                          <span className={cx("grid h-5 min-w-5 place-items-center rounded-full bg-admin-brand px-1.5 text-[11px] font-bold text-white", effectiveCollapsed ? "absolute right-1 top-0.5" : "ml-auto")}>
                            <span aria-hidden>{activityUnread > 99 ? "99+" : activityUnread}</span><span className="sr-only">{activityUnread} unread driver updates</span>
                          </span>
                        )}
                        {effectiveCollapsed && (
                          <span aria-hidden className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap tmv-side-tooltip rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-white opacity-0 shadow-lg ring-1 ring-white/10 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">{entry.label}</span>
                        )}
                      </a>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="mx-3 mb-3 md:hidden">
          <p className="tmv-nav-label mb-1.5 px-1 text-[12px] font-semibold uppercase tracking-[0.12em]" aria-hidden>Appearance</p>
          <ThemeSwitch variant="labelled" />
        </div>

        {!effectiveCollapsed && (
          <div className="tmv-side-card mx-3 mb-4 hidden rounded-2xl px-3.5 py-3 md:block">
            <p className="tmv-side-muted text-[12px] leading-4">Press <kbd className="tmv-side-kbd rounded px-1 font-sans">?</kbd> for keyboard shortcuts</p>
          </div>
        )}
      </aside>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="tmv-header sticky top-0 z-20 flex h-[60px] items-center gap-1.5 px-3 pt-[env(safe-area-inset-top)] [box-sizing:content-box] sm:gap-2 md:h-[68px] md:px-6">
          <button ref={menuButtonRef} type="button" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation menu" aria-expanded={mobileNavOpen}
            className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-xl text-admin-ink-2 hover:bg-admin-surface md:hidden", focusRing)}>
            <MenuIcon className="h-5 w-5" aria-hidden />
          </button>
          <a href="?section=overview" aria-label="TMV Dashboard, Overview"
            onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey) return; event.preventDefault(); onSelectSection("overview"); }}
            className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white tmv-logo-tile md:hidden", focusRing)}>
            <img src="/tmv-logo.png" alt="" className="tmv-logo-mark h-6 w-6 object-contain" />
          </a>
          <button type="button" onClick={() => setPaletteOpen(true)} aria-label={`Search jobs or jump to a page (${shortcut})`} aria-haspopup="dialog"
            className={cx("group flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-2xl border border-admin-line bg-surface/80 px-3.5 text-left text-[14px] text-admin-ink-2 shadow-[var(--admin-shadow-sm)] transition hover:border-admin-brand/50 hover:shadow-[var(--admin-shadow)] sm:max-w-[420px]", focusRing)}>
            <Search className="h-4 w-4 shrink-0 text-admin-brand" aria-hidden />
            <span className="truncate max-[359px]:hidden"><span className="sm:hidden">Search</span><span className="hidden sm:inline">Search drivers, jobs, vans…</span></span>
            <kbd className="ml-auto hidden shrink-0 rounded-lg border border-admin-line bg-admin-surface px-1.5 py-0.5 font-sans text-[12px] font-semibold sm:inline">{shortcut}</kbd>
          </button>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <LondonClock />
            <button type="button" onClick={() => void refreshAll()} disabled={refreshing} aria-label="Refresh data on this page" title="Refresh data (R)"
              className={cx("grid h-10 w-10 place-items-center rounded-xl text-admin-ink-2 hover:bg-admin-surface hover:text-admin-ink", focusRing)}>
              <RefreshCw className={cx("h-4 w-4", refreshing && "animate-spin text-admin-brand")} aria-hidden />
            </button>
            <button type="button" onClick={() => setShortcutsOpen(true)} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)"
              className={cx("hidden h-10 w-10 place-items-center rounded-xl text-admin-ink-2 hover:bg-admin-surface hover:text-admin-ink md:grid", focusRing)}>
              <Command className="h-4 w-4" aria-hidden />
            </button>
            <ThemeSwitch />
            <AlertsBell onOpenAlerts={() => onSelectSection("alerts")} />
            <Menu
              align="end"
              header={<div><div className="text-[13px] font-semibold text-admin-ink">Administrator</div><div className="truncate text-[12px] text-admin-ink-2">{adminProfile?.email || "Signed in"}</div></div>}
              trigger={props => (
                <button {...props} type="button" aria-label="Account menu" className={cx("ml-1 grid h-10 w-10 place-items-center rounded-full bg-[image:var(--grad-brand)] text-[15px] font-bold text-white shadow-[0_8px_16px_-8px_rgba(95,70,232,0.8)] ring-2 ring-surface", focusRing)}>
                  {initial}
                </button>
              )}
              items={[
                { id: "settings", label: "Settings", icon: <Settings />, onSelect: () => onSelectSection("settings") },
                { id: "maintenance", label: "Data maintenance", icon: <Trash2 />, onSelect: () => onSelectSection("maintenance") },
                ...(onLogout ? [{ id: "logout", label: "Log out", icon: <LogOut />, onSelect: onLogout, separatorBefore: true }] : [])
              ]}
            />
          </div>
        </header>

        <main id="admin-main" tabIndex={-1} className="flex-1 px-3 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-4 outline-none sm:px-4 md:px-6 md:pt-5 lg:px-8 lg:pt-6">
          <div key={String(activeSection)} className="tmv-route w-full max-w-[1680px] space-y-4 md:space-y-6">{children}</div>
        </main>
      </div>

      <CommandPalette isOpen={paletteOpen} onClose={() => setPaletteOpen(false)} onSelectSection={onSelectSection} />
      <ShortcutsModal isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}

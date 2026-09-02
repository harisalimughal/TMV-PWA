/**
 * Ported from TMV-Chat-bot's dashboard/web/src/components/Layout.tsx -- same sidebar
 * nav, header, keyboard shortcuts, collapse behavior. Uses tmv-logo.png (the clean
 * square source) in place of the source's tmv-new-logo.png (letterboxed with black
 * bars -- looks wrong at this banner size), same choice already made for the login
 * screen. The hardcoded "Washington Carrato" / "WC" identity block is also dropped --
 * there's no per-user account model here (single shared admin password, see
 * auth/admin-session.ts), so it never meant anything real even in the source.
 */
import React, { useState, useEffect } from "react";
import {
  LayoutDashboard, Navigation, Truck, CheckSquare, LogIn, LogOut, AlertCircle, ShieldAlert,
  Users, Banknote, History, FileSpreadsheet, Settings, RefreshCw,
  ChevronLeft, ChevronRight, Search, Command, MessageSquare, Bell, Menu, X
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { triggerDatasetRefresh } from "./api";
import { CommandPalette } from "./components/CommandPalette";
import { ShortcutsModal } from "./components/ShortcutsModal";
import { formatLondonTimeOnly } from "./utils/date";
import { NotificationBell } from "../../../components/driver/NotificationBell";

interface Props {
  activeSection: string;
  onSelectSection: (id: string) => void;
  onLogout?: () => void;
  children: React.ReactNode;
}

interface NavSectionItem {
  id?: string;
  label: string;
  icon?: any;
  type?: "header";
  isLive?: boolean;
  desc?: string;
}

const NAV_CONFIG: NavSectionItem[] = [
  { type: "header", label: "Operations" },
  { id: "overview", label: "Overview", icon: LayoutDashboard, desc: "Executive KPI telemetry, revenue velocity and operational health" },
  { id: "livefleet", label: "Live Fleet", icon: Navigation, isLive: true, desc: "Real-time GPS vehicle positions and driver telemetry" },
  { id: "jobs", label: "Jobs", icon: Truck, desc: "Operational moves joined across Jobs, Drivers, Workflow and Evidence" },
  { id: "finished", label: "Finished Jobs", icon: CheckSquare, desc: "Completed moves audit with verified evidence and sign-off records" },
  { id: "notifications", label: "Notifications & Push", icon: Bell, desc: "Automated communication audit across Email, SMS and Web Push channels" },
  { type: "header", label: "Scenarios" },
  { id: "checkin", label: "Check In", icon: LogIn, desc: "Storage facility entry logs and client container check-ins" },
  { id: "checkout", label: "Check Out", icon: LogOut, desc: "Storage retrieval and client drop-off confirmation records" },
  { id: "parking", label: "Parking Liability", icon: AlertCircle, desc: "Driver parking risk waivers and client location sign-offs" },
  { id: "liability", label: "Liability Report", icon: ShieldAlert, desc: "Vehicle or item damage categories with evidence photographs" },
  { type: "header", label: "Management" },
  { id: "drivers", label: "Drivers", icon: Users, desc: "Driver scorecards, revenue handled and punctuality metrics" },
  { id: "pricing", label: "Pricing Settings", icon: Banknote, desc: "Configure crew rates, packing service pricing, and overtime rules" },
  { id: "activity", label: "Activity Log", icon: History, desc: "Chronological audit records directly from the activity log" },
  { id: "reports", label: "Reports", icon: FileSpreadsheet, desc: "Downloadable operational datasets and certified export files" },
  { id: "messaging", label: "Messaging Content", icon: MessageSquare, desc: "Manage automated customer and driver communication templates" },
  { id: "settings", label: "Settings", icon: Settings, desc: "Read-only system rules, rates, caching invariants and database mapping" }
];

export function Layout({ activeSection, onSelectSection, onLogout, children }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches
  );
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);
  const effectiveCollapsed = collapsed && !isMobile;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(formatLondonTimeOnly(new Date().toISOString()));
  const [londonClock, setLondonClock] = useState(formatLondonTimeOnly(new Date().toISOString()));
  const queryClient = useQueryClient();

  useEffect(() => {
    const timer = setInterval(() => setLondonClock(formatLondonTimeOnly(new Date().toISOString())), 10000);
    return () => clearInterval(timer);
  }, []);

  // Mobile nav drawer: Escape closes it, and the page behind it stops scrolling.
  // Neither was handled before, so the drawer trapped nothing and the content behind
  // it scrolled under the user's finger.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileNavOpen]);

  const refreshMutation = useMutation({
    mutationFn: triggerDatasetRefresh,
    onSuccess: () => {
      setLastSyncTime(formatLondonTimeOnly(new Date().toISOString()));
      queryClient.invalidateQueries();
    }
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Typing anywhere -- including a <select> or a contentEditable cell -- must never
      // trigger a navigation shortcut. The old guard only covered INPUT and TEXTAREA.
      if (
        target &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable)
      ) {
        return;
      }

      // Cmd/Ctrl+K opens the palette. Everything below is a BARE letter, so any other
      // modifier combination must fall through to the browser untouched.
      //
      // This was the bug: the modifier check only guarded the "k" branch, so Cmd+R fell
      // into the "r" branch, got preventDefault()ed, and hijacked the browser's own
      // reload. Refreshing the dashboard with Cmd+R silently did the wrong thing.
      if (e.metaKey || e.ctrlKey) {
        if (e.key.toLowerCase() === "k") {
          e.preventDefault();
          setPaletteOpen(prev => !prev);
        }
        return;
      }
      if (e.altKey) return;

      // Don't fire navigation shortcuts while a modal/palette owns the screen -- the
      // driver of that surface should get the keystroke, not the page behind it.
      if (paletteOpen || shortcutsOpen) return;

      switch (e.key.toLowerCase()) {
        case "?":
          e.preventDefault();
          setShortcutsOpen(prev => !prev);
          break;
        case "r":
          e.preventDefault();
          refreshMutation.mutate();
          break;
        case "o":
          onSelectSection("overview");
          break;
        case "j":
          onSelectSection("jobs");
          break;
        case "d":
          onSelectSection("drivers");
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSelectSection, refreshMutation, paletteOpen, shortcutsOpen]);

  const currentNav = NAV_CONFIG.find(n => n.id === activeSection) || NAV_CONFIG[1];

  return (
    <div className="flex min-h-screen bg-admin-bg text-admin-ink selection:bg-admin-brand-soft selection:text-admin-brand font-sans antialiased">
      {mobileNavOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={() => setMobileNavOpen(false)} />
      )}

      <aside
        aria-label="Main navigation"
        aria-hidden={isMobile && !mobileNavOpen}
        className={`bg-admin-bg text-admin-ink flex flex-col justify-between transition-all duration-300 z-40 fixed inset-y-0 left-0 h-screen md:sticky md:top-0 md:z-30 w-[260px] ${
          collapsed ? "md:w-16" : "md:w-[260px]"
        } ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
      >
        <div className="flex flex-col min-h-0">
          <div className="pt-6 pb-4 px-6 flex items-center justify-between bg-transparent">
            <div className={`flex items-center overflow-hidden ${collapsed ? "md:hidden" : ""}`}>
              <img src="/tmv-logo.png" alt="The Man Van" className="h-14 w-auto object-contain flex-shrink-0 rounded-card" />
            </div>
            {collapsed && (
              <img
                src="/tmv-logo.png"
                alt="TMV"
                className="hidden md:block w-8 h-8 rounded-card object-contain bg-admin-surface border border-admin-line p-0.5 mx-auto shadow-primary"
                title="The Man Van Operations"
              />
            )}
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="hidden md:block p-1 rounded hover:bg-admin-surface text-admin-muted hover:text-admin-ink transition"
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setMobileNavOpen(false)}
              className="md:hidden p-1 rounded hover:bg-admin-surface text-admin-muted hover:text-admin-ink transition"
              title="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="px-4 pb-4 space-y-1 overflow-y-auto flex-1">
            {NAV_CONFIG.map((item, idx) => {
              if (item.type === "header") {
                if (effectiveCollapsed) return <div key={idx} className="my-4 border-t border-admin-line" />;
                return (
                  <div key={idx} className="pt-6 pb-2 px-3 text-eyebrow text-fg-subtle">
                    {item.label}
                  </div>
                );
              }

              const Icon = item.icon!;
              const isActive = activeSection === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => { onSelectSection(item.id!); setMobileNavOpen(false); }}
                  className={`w-full h-11 flex items-center gap-3 px-4 rounded-card text-[14px] font-medium transition group relative ${
                    isActive ? "text-admin-ink font-semibold bg-white shadow-primary" : "text-admin-muted hover:bg-white/50 hover:text-admin-ink"
                  }`}
                  title={effectiveCollapsed ? item.label : undefined}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 transition-transform ${isActive ? "text-admin-brand scale-105" : "text-admin-muted group-hover:text-admin-ink-2"}`} />

                  {!effectiveCollapsed && <span className="truncate">{item.label}</span>}

                  {!effectiveCollapsed && item.isLive && (
                    <span className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded-pill bg-admin-status-green-bg text-admin-status-green text-[9px] font-mono font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-admin-status-green animate-ping" />
                      LIVE
                    </span>
                  )}

                  {effectiveCollapsed && item.isLive && (
                    <span className="w-2 h-2 rounded-full bg-admin-status-green absolute right-2 ring-2 ring-white" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-3 border-t border-admin-line bg-white flex items-center justify-between text-xs text-admin-ink-2">
          {!effectiveCollapsed ? (
            <>
              <div className="flex items-center gap-2 overflow-hidden">
                <img src="/tmv-logo.png" alt="" className="w-6 h-6 rounded-full object-cover border border-admin-line" />
                <div className="overflow-hidden">
                  <span className="font-medium text-admin-ink truncate block text-xs">Operations</span>
                  <span className="text-[10px] text-admin-muted block font-mono">London &bull; {londonClock}</span>
                </div>
              </div>
              {onLogout && (
                <button onClick={onLogout} className="text-xs text-admin-muted hover:text-admin-status-red font-medium transition" title="Sign out">
                  Log out
                </button>
              )}
            </>
          ) : (
            onLogout && (
              <button onClick={onLogout} className="w-full py-1 text-center text-admin-muted hover:text-admin-status-red" title="Log out">
                <LogOut className="w-4 h-4 mx-auto" />
              </button>
            )
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-[56px] bg-white border-b border-admin-line px-4 md:px-6 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="md:hidden w-11 h-11 -ml-1 shrink-0 rounded-full hover:bg-admin-surface flex items-center justify-center text-admin-muted hover:text-admin-ink transition"
              title="Open menu"
              aria-label="Open navigation menu"
              aria-expanded={mobileNavOpen}
            >
              <Menu className="w-5 h-5" />
            </button>
            {/* A button, not a readOnly input. As an input it was focusable but did
                nothing on Enter, so keyboard users could reach it and not open it. */}
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="relative hidden md:flex items-center w-[320px] h-10 pl-10 pr-4 bg-admin-surface rounded-full text-sm text-admin-muted hover:bg-admin-line/40 transition text-left"
            >
              <Search className="w-4 h-4 text-admin-muted absolute left-4 pointer-events-none" aria-hidden />
              Search anything
              <kbd className="ml-auto text-[11px] font-sans font-medium text-admin-muted bg-white border border-admin-line rounded px-1.5 py-0.5">
                ⌘K
              </kbd>
            </button>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPaletteOpen(true)}
                className="md:hidden w-9 h-9 rounded-full hover:bg-admin-surface flex items-center justify-center text-admin-muted hover:text-admin-ink transition"
                title="Search"
              >
                <Search className="w-4 h-4" />
              </button>

              <button
                onClick={() => refreshMutation.mutate()}
                disabled={refreshMutation.isPending}
                className="w-9 h-9 rounded-full hover:bg-admin-surface flex items-center justify-center text-admin-muted hover:text-admin-ink transition"
                title="Refresh (R)"
              >
                <RefreshCw className={`w-4 h-4 ${refreshMutation.isPending ? "animate-spin text-admin-brand" : "text-admin-muted"}`} />
              </button>

              <button
                onClick={() => setShortcutsOpen(true)}
                className="hidden md:flex w-9 h-9 rounded-full hover:bg-admin-surface items-center justify-center text-admin-muted hover:text-admin-ink transition"
                title="Keyboard shortcuts (?)"
              >
                <Command className="w-4 h-4" />
              </button>

              <NotificationBell />

              <img src="/tmv-logo.png" alt="" className="w-9 h-9 ml-2 rounded-full object-cover border-2 border-white shadow-primary" />
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto flex flex-col">
          <div className="bg-white border-b border-admin-line px-4 md:px-8 py-4 md:py-5 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="text-admin-brand shrink-0">
                <currentNav.icon className="w-5 h-5 md:w-6 md:h-6" />
              </div>
              <h1 className="text-[17px] md:text-title text-fg tracking-tight truncate">{currentNav.label}</h1>
            </div>
            <div className="flex items-center gap-3" />
          </div>

          <main className="flex-1 p-4 md:p-8">{children}</main>
        </div>
      </div>

      <CommandPalette isOpen={paletteOpen} onClose={() => setPaletteOpen(false)} onSelectSection={onSelectSection} onRefreshData={() => refreshMutation.mutate()} />
      <ShortcutsModal isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}

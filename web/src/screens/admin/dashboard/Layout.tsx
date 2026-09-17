/**
 * Ported from TMV-Chat-bot's dashboard/web/src/components/Layout.tsx -- same sidebar
 * nav, header, keyboard shortcuts, collapse behavior. Uses tmv-logo.png (the clean
 * square source) in place of the source's tmv-new-logo.png (letterboxed with black
 * bars -- looks wrong at this banner size), same choice already made for the login
 * screen. The hardcoded "Washington Carrato" / "WC" identity block is also dropped --
 * there's no per-user account model here (single shared admin password, see
 * auth/admin-session.ts), so it never meant anything real even in the source.
 */
import React, { useState, useEffect, useRef } from "react";
import {
  LayoutDashboard, Navigation, Truck, CheckSquare, LogIn, LogOut, AlertCircle, ShieldAlert,
  Users, Banknote, FileSpreadsheet, RefreshCw, Trash2,
  ChevronLeft, ChevronRight, ChevronDown, Search, Command, MessageSquare, Bell, Menu, X, Settings
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { triggerDatasetRefresh } from "./api";
import { fetchAdminProfile } from "../../../api/admin";
import { CommandPalette } from "./components/CommandPalette";
import { ShortcutsModal } from "./components/ShortcutsModal";
import { ApiSettingsPage } from "./pages/ApiSettingsPage";
import { NotificationBell } from "../../../components/driver/NotificationBell";

interface Props {
  activeSection: string;
  onSelectSection: (id: string) => void;
  onLogout?: () => void;
  children: React.ReactNode;
}

interface NavItem {
  id?: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  isLive?: boolean;
  desc?: string;
}

interface NavHeader {
  type: "header";
  label: string;
}

type NavSectionItem = NavItem | NavHeader;

const NAV_CONFIG: NavSectionItem[] = [
  { type: "header", label: "Operations" },
  { id: "overview", label: "Overview", icon: LayoutDashboard, desc: "Executive KPI telemetry, revenue velocity and operational health" },
  { id: "livefleet", label: "Live Fleet", icon: Navigation, isLive: true, desc: "Real-time GPS vehicle positions and driver telemetry" },
  { id: "alerts", label: "Alerts", icon: ShieldAlert, desc: "GPSLive's fleet alert feed, including congestion zone crossings" },
  { id: "jobs", label: "Jobs", icon: Truck, desc: "Operational moves joined across Jobs, Drivers, Workflow and Evidence" },
  { id: "finished", label: "Finished Jobs", icon: CheckSquare, desc: "Completed moves audit with verified evidence and sign-off records" },
  { id: "van", label: "Van", icon: Truck, desc: "Driver mileage, fuel and service records" },
  { id: "notifications", label: "Notifications & Push", icon: Bell, desc: "Automated communication audit across Email, SMS and Web Push channels" },
  { type: "header", label: "Scenarios" },
  { id: "checkin", label: "Check In", icon: LogIn, desc: "Storage facility entry logs and client container check-ins" },
  { id: "checkout", label: "Check Out", icon: LogOut, desc: "Storage retrieval and client drop-off confirmation records" },
  { id: "parking", label: "Parking Liability", icon: AlertCircle, desc: "Driver parking risk waivers and client location sign-offs" },
  { id: "liability", label: "Liability Report", icon: ShieldAlert, desc: "Vehicle or item damage categories with evidence photographs" },
  { type: "header", label: "Management" },
  { id: "drivers", label: "Drivers", icon: Users, desc: "Driver scorecards, revenue handled and punctuality metrics" },
  { id: "pricing", label: "Pricing Settings", icon: Banknote, desc: "Configure crew rates, packing service pricing, and overtime rules" },
  { id: "reports", label: "Reports", icon: FileSpreadsheet, desc: "Downloadable operational datasets and certified export files" },
  { id: "messaging", label: "Messaging Content", icon: MessageSquare, desc: "Manage automated customer and driver communication templates" }
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
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: adminProfile } = useQuery({
    queryKey: ["admin_profile"],
    queryFn: fetchAdminProfile,
    staleTime: Infinity
  });

  // Click-outside + Escape close the profile dropdown, same pattern the mobile nav
  // drawer already uses below.
  useEffect(() => {
    if (!profileOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setProfileOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [profileOpen]);

  // Mobile nav drawer: Escape closes it, and the page behind it stops scrolling.
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
      queryClient.invalidateQueries();
    }
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable)
      ) {
        return;
      }

      if (e.metaKey || e.ctrlKey) {
        if (e.key.toLowerCase() === "k") {
          e.preventDefault();
          setPaletteOpen(prev => !prev);
        }
        return;
      }
      if (e.altKey) return;

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

  const currentNav = NAV_CONFIG.find(n => (n as NavItem).id === activeSection) as NavItem || NAV_CONFIG[1] as NavItem;

  return (
    <div className="flex min-h-screen bg-admin-bg text-admin-ink selection:bg-admin-brand-soft selection:text-admin-brand font-sans antialiased">
      {mobileNavOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={() => setMobileNavOpen(false)} />
      )}

      <aside
        aria-label="Main navigation"
        aria-hidden={isMobile && !mobileNavOpen}
        className={`bg-admin-sidebar text-admin-sidebar-fg flex flex-col justify-between transition-all duration-300 z-40 fixed inset-y-0 left-0 h-screen md:sticky md:top-0 md:z-30 w-[260px] ${
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
              className="hidden md:block p-1 rounded hover:bg-white/10 text-admin-sidebar-muted hover:text-admin-sidebar-fg transition"
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setMobileNavOpen(false)}
              className="md:hidden p-1 rounded hover:bg-white/10 text-admin-sidebar-muted hover:text-admin-sidebar-fg transition"
              title="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="px-4 pb-4 space-y-1 overflow-y-auto flex-1 custom-scrollbar">
            {NAV_CONFIG.map((item, idx) => {
              if ((item as NavHeader).type === "header") {
                if (effectiveCollapsed) return <div key={idx} className="my-4 border-t border-white/10" />;
                return (
                  <div key={idx} className="pt-6 pb-2 px-3 text-eyebrow text-admin-sidebar-muted">
                    {item.label}
                  </div>
                );
              }

              const navItem = item as NavItem;
              const Icon = navItem.icon!;
              const isActive = activeSection === navItem.id;

              return (
                <button
                  key={navItem.id}
                  onClick={() => { onSelectSection(navItem.id!); setMobileNavOpen(false); }}
                  className={`w-full h-11 flex items-center gap-3 px-4 rounded-card text-[14px] font-medium transition group relative ${
                    isActive ? "text-admin-ink font-semibold bg-white shadow-primary" : "text-admin-sidebar-muted hover:bg-white/10 hover:text-admin-sidebar-fg"
                  }`}
                  title={effectiveCollapsed ? navItem.label : undefined}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 transition-transform ${isActive ? "text-admin-brand scale-105" : "text-admin-sidebar-muted group-hover:text-admin-sidebar-fg"}`} />

                  {!effectiveCollapsed && <span className="truncate">{navItem.label}</span>}

                  {!effectiveCollapsed && navItem.isLive && (
                    <span className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded-pill bg-admin-status-green-bg text-admin-status-green text-[9px] font-mono font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-admin-status-green animate-ping" />
                      LIVE
                    </span>
                  )}

                  {effectiveCollapsed && navItem.isLive && (
                    <span className="w-2 h-2 rounded-full bg-admin-status-green absolute right-2 ring-2 ring-admin-sidebar" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-[56px] bg-white border-b border-admin-line px-4 md:px-6 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="md:hidden w-10 h-10 -ml-1 shrink-0 rounded-full hover:bg-admin-surface flex items-center justify-center text-admin-muted hover:text-admin-ink transition"
              title="Open menu"
              aria-label="Open navigation menu"
              aria-expanded={mobileNavOpen}
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-admin-brand shrink-0">
              {currentNav.icon && <currentNav.icon className="w-5 h-5 md:w-6 md:h-6" />}
            </div>
            <h1 className="text-[17px] md:text-title text-fg tracking-tight truncate">{currentNav.label}</h1>
          </div>

          <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="relative hidden lg:flex items-center w-[220px] h-9 pl-9 pr-3 bg-admin-surface rounded-full text-[13px] text-admin-muted hover:bg-admin-line/40 transition text-left"
            >
              <Search className="w-4 h-4 text-admin-muted absolute left-3 pointer-events-none" aria-hidden />
              Search
              <kbd className="ml-auto text-[11px] font-sans font-medium text-admin-muted bg-white border border-admin-line rounded px-1.5 py-0.5">
                ⌘K
              </kbd>
            </button>
            <button
              onClick={() => setPaletteOpen(true)}
              className="lg:hidden w-9 h-9 rounded-full hover:bg-admin-surface flex items-center justify-center text-admin-muted hover:text-admin-ink transition"
              title="Search (⌘K)"
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

            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setProfileOpen(prev => !prev)}
                className="flex items-center gap-1 rounded-full hover:bg-admin-surface p-0.5 pr-1.5 transition"
                title="Account"
                aria-label="Account menu"
                aria-expanded={profileOpen}
              >
                <img src="/tmv-logo.png" alt="" className="w-9 h-9 rounded-full object-cover border-2 border-white shadow-primary" />
                <ChevronDown className={`w-3.5 h-3.5 text-admin-muted transition-transform ${profileOpen ? "rotate-180" : ""}`} />
              </button>

              {profileOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-admin-line rounded-card shadow-elevated overflow-hidden z-30">
                  <div className="px-4 py-3 border-b border-admin-line">
                    <div className="text-[13px] font-semibold text-admin-ink truncate">Administrator</div>
                    <div className="text-[12px] text-admin-muted truncate">{adminProfile?.email || "—"}</div>
                  </div>
                  <div className="p-1.5">
                    <button
                      onClick={() => { setProfileOpen(false); setSettingsOpen(true); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-card text-[13px] font-medium text-admin-ink-2 hover:bg-admin-surface transition text-left"
                    >
                      <Settings className="w-4 h-4 text-admin-muted" /> Settings
                    </button>
                    <button
                      onClick={() => { setProfileOpen(false); onSelectSection("maintenance"); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-card text-[13px] font-medium text-admin-status-red hover:bg-admin-status-red-bg transition text-left"
                    >
                      <Trash2 className="w-4 h-4" /> Data Maintenance
                    </button>
                    {onLogout && (
                      <button
                        onClick={() => { setProfileOpen(false); onLogout(); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-card text-[13px] font-medium text-admin-status-red hover:bg-admin-status-red-bg transition text-left"
                      >
                        <LogOut className="w-4 h-4" /> Log out
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto flex flex-col">
          <main className="flex-1 p-4 md:p-8">{children}</main>
        </div>
      </div>

      <CommandPalette isOpen={paletteOpen} onClose={() => setPaletteOpen(false)} onSelectSection={onSelectSection} onRefreshData={() => refreshMutation.mutate()} />
      <ShortcutsModal isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 md:pt-16 bg-admin-ink/30 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-[960px] bg-admin-bg border border-admin-line rounded-module shadow-elevated flex flex-col max-h-[calc(100vh-5rem)]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-admin-line bg-white shrink-0">
              <h2 className="text-heading text-fg">Settings</h2>
              <button
                onClick={() => setSettingsOpen(false)}
                aria-label="Close settings"
                className="p-1.5 rounded text-admin-muted hover:bg-admin-surface hover:text-admin-ink transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-6">
              <ApiSettingsPage />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

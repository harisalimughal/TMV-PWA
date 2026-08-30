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
  Users, Banknote, AlertTriangle, History, FileSpreadsheet, Settings, RefreshCw,
  ChevronLeft, ChevronRight, Search, Command, MessageSquare, Bell, Menu, X
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchExceptions, triggerDatasetRefresh } from "./api";
import { CommandPalette } from "./components/CommandPalette";
import { ShortcutsModal } from "./components/ShortcutsModal";
import { formatLondonTimeOnly } from "./utils/date";

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
  hasBadge?: boolean;
  isLive?: boolean;
  desc?: string;
}

const NAV_CONFIG: NavSectionItem[] = [
  { type: "header", label: "Operations" },
  { id: "overview", label: "Overview", icon: LayoutDashboard, desc: "Executive KPI telemetry, revenue velocity and operational health" },
  { id: "livefleet", label: "Live Fleet", icon: Navigation, isLive: true, desc: "Real-time GPS vehicle positions and driver telemetry" },
  { id: "jobs", label: "Jobs", icon: Truck, desc: "Operational moves joined across Jobs, Drivers, Workflow and Evidence" },
  { id: "finished", label: "Finished Jobs", icon: CheckSquare, desc: "Completed moves audit with verified evidence and sign-off records" },
  { id: "notifications", label: "Notifications", icon: Bell, desc: "Automated communication audit across Email and SMS channels" },
  { type: "header", label: "Scenarios" },
  { id: "checkin", label: "Check In", icon: LogIn, desc: "Storage facility entry logs and client container check-ins" },
  { id: "checkout", label: "Check Out", icon: LogOut, desc: "Storage retrieval and client drop-off confirmation records" },
  { id: "parking", label: "Parking Liability", icon: AlertCircle, desc: "Driver parking risk waivers and client location sign-offs" },
  { id: "liability", label: "Liability Report", icon: ShieldAlert, desc: "Vehicle or item damage categories with evidence photographs" },
  { type: "header", label: "Management" },
  { id: "drivers", label: "Drivers", icon: Users, desc: "Driver scorecards, revenue handled and punctuality metrics" },
  { id: "pricing", label: "Pricing Settings", icon: Banknote, desc: "Configure crew rates, packing service pricing, and overtime rules" },
  { id: "exceptions", label: "Exceptions", icon: AlertTriangle, hasBadge: true, desc: "Operational exceptions and quality control alerts" },
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

  const { data: exData } = useQuery({
    queryKey: ["exceptions_badge"],
    queryFn: () => fetchExceptions(undefined, undefined, undefined, true),
    refetchInterval: 30000
  });

  const refreshMutation = useMutation({
    mutationFn: triggerDatasetRefresh,
    onSuccess: () => {
      setLastSyncTime(formatLondonTimeOnly(new Date().toISOString()));
      queryClient.invalidateQueries();
    }
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen(prev => !prev);
      } else if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen(prev => !prev);
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        refreshMutation.mutate();
      } else if (e.key === "o" || e.key === "O") {
        onSelectSection("overview");
      } else if (e.key === "j" || e.key === "J") {
        onSelectSection("jobs");
      } else if (e.key === "d" || e.key === "D") {
        onSelectSection("drivers");
      } else if (e.key === "e" || e.key === "E") {
        onSelectSection("exceptions");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSelectSection, refreshMutation]);

  const rawBadgeCount = exData?.activeBadgeCount ?? exData?.total ?? 0;
  const exceptionsBadgeLabel = rawBadgeCount > 999 ? "999+" : rawBadgeCount > 99 ? "99+" : rawBadgeCount > 0 ? String(rawBadgeCount) : null;

  const currentNav = NAV_CONFIG.find(n => n.id === activeSection) || NAV_CONFIG[1];

  return (
    <div className="flex min-h-screen bg-admin-bg text-admin-ink selection:bg-admin-brand-soft selection:text-admin-brand font-sans antialiased">
      {mobileNavOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={() => setMobileNavOpen(false)} />
      )}

      <aside
        className={`bg-admin-bg text-admin-ink flex flex-col justify-between transition-all duration-300 z-40 fixed inset-y-0 left-0 h-screen md:sticky md:top-0 md:z-30 w-[260px] ${
          collapsed ? "md:w-16" : "md:w-[260px]"
        } ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
      >
        <div className="flex flex-col min-h-0">
          <div className="pt-6 pb-4 px-6 flex items-center justify-between bg-transparent">
            <div className={`flex items-center overflow-hidden ${collapsed ? "md:hidden" : ""}`}>
              <img src="/tmv-logo.png" alt="The Man Van" className="h-14 w-auto object-contain flex-shrink-0 rounded-lg" />
            </div>
            {collapsed && (
              <img
                src="/tmv-logo.png"
                alt="TMV"
                className="hidden md:block w-8 h-8 rounded-lg object-contain bg-admin-surface border border-admin-line p-0.5 mx-auto shadow-primary"
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
                  <div key={idx} className="pt-6 pb-2 px-3 text-[12px] font-semibold text-admin-muted uppercase tracking-[0.1em]">
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
                  className={`w-full h-11 flex items-center gap-3 px-4 rounded-xl text-[14px] font-medium transition group relative ${
                    isActive ? "text-admin-ink font-semibold bg-white shadow-primary" : "text-admin-muted hover:bg-white/50 hover:text-admin-ink"
                  }`}
                  title={effectiveCollapsed ? item.label : undefined}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 transition-transform ${isActive ? "text-admin-brand scale-105" : "text-admin-muted group-hover:text-admin-ink-2"}`} />

                  {!effectiveCollapsed && <span className="truncate">{item.label}</span>}

                  {!effectiveCollapsed && item.isLive && (
                    <span className="ml-auto flex items-center gap-1 px-1.5 py-0.2 rounded-pill bg-admin-status-green-bg text-admin-status-green text-[9px] font-mono font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-admin-status-green animate-ping" />
                      LIVE
                    </span>
                  )}

                  {!effectiveCollapsed && item.hasBadge && exceptionsBadgeLabel && (
                    <span className="ml-auto flex items-center justify-center px-1.5 min-w-[20px] h-5 rounded-full bg-admin-status-red text-white text-[11px] font-bold">
                      {exceptionsBadgeLabel}
                    </span>
                  )}

                  {effectiveCollapsed && item.isLive && (
                    <span className="w-2 h-2 rounded-full bg-admin-status-green absolute right-2 ring-2 ring-white" />
                  )}
                  {effectiveCollapsed && item.hasBadge && exceptionsBadgeLabel && (
                    <span className="w-2 h-2 rounded-full bg-admin-status-red absolute right-2 ring-2 ring-white" />
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
              className="md:hidden w-9 h-9 -ml-1 shrink-0 rounded-full hover:bg-admin-surface flex items-center justify-center text-admin-muted hover:text-admin-ink transition"
              title="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="relative hidden md:block w-[320px]">
              <Search className="w-4 h-4 text-admin-muted absolute left-4 top-3 pointer-events-none" />
              <input
                type="text"
                placeholder="Search anything"
                onClick={() => setPaletteOpen(true)}
                readOnly
                className="w-full h-10 pl-10 pr-4 bg-admin-surface border-transparent rounded-full text-sm text-admin-ink placeholder:text-admin-muted cursor-pointer transition"
              />
            </div>
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

              <button
                onClick={() => onSelectSection("exceptions")}
                className="relative w-9 h-9 rounded-full hover:bg-admin-surface flex items-center justify-center text-admin-muted hover:text-admin-ink transition"
              >
                <Bell className="w-4 h-4" />
                {rawBadgeCount > 0 && <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-admin-status-red rounded-full ring-2 ring-white" />}
              </button>

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
              <h1 className="text-[17px] md:text-[20px] font-bold text-admin-ink tracking-tight truncate">{currentNav.label}</h1>
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

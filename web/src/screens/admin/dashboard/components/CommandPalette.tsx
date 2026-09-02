/** Ported verbatim from TMV-Chat-bot's dashboard/web/src/components/CommandPalette.tsx. */
import React, { useState, useEffect } from "react";
import {
  Search, LayoutDashboard, Truck, CheckSquare, LogIn, LogOut, Users, Banknote,
  AlertTriangle, FileSpreadsheet, Settings, RefreshCw, Download, History, ShieldAlert, ArrowRight
} from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelectSection: (id: string) => void;
  onRefreshData?: () => void;
  onExportCsv?: () => void;
}

const PALETTE_ITEMS = [
  { id: "overview", label: "Overview", section: "overview", icon: LayoutDashboard, category: "Operations" },
  { id: "jobs", label: "Jobs", section: "jobs", icon: Truck, category: "Operations" },
  { id: "finished", label: "Finished Jobs", section: "finished", icon: CheckSquare, category: "Operations" },
  { id: "checkin", label: "Check In", section: "checkin", icon: LogIn, category: "Scenarios" },
  { id: "checkout", label: "Check Out", section: "checkout", icon: LogOut, category: "Scenarios" },
  { id: "parking", label: "Parking Liability", section: "parking", icon: AlertTriangle, category: "Scenarios" },
  { id: "liability", label: "Liability Report", section: "liability", icon: ShieldAlert, category: "Scenarios" },
  { id: "drivers", label: "Drivers", section: "drivers", icon: Users, category: "Management" },
  { id: "finance", label: "Finance", section: "finance", icon: Banknote, category: "Management" },
  { id: "activity", label: "Activity Log", section: "activity", icon: History, category: "Management" },
  { id: "reports", label: "Reports", section: "reports", icon: FileSpreadsheet, category: "Management" },
  { id: "settings", label: "Settings", section: "settings", icon: Settings, category: "Management" },
  { id: "act_refresh", label: "Sync Live Sheets Data", action: "refresh", icon: RefreshCw, category: "Actions" },
  { id: "act_export", label: "Export Jobs to CSV", action: "export", icon: Download, category: "Actions" }
];

export function CommandPalette({ isOpen, onClose, onSelectSection, onRefreshData, onExportCsv }: Props) {
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Escape" && isOpen) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredItems = PALETTE_ITEMS.filter(item =>
    item.label.toLowerCase().includes(search.toLowerCase()) || item.category.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (item: typeof PALETTE_ITEMS[0]) => {
    if (item.section) onSelectSection(item.section);
    else if (item.action === "refresh" && onRefreshData) onRefreshData();
    else if (item.action === "export" && onExportCsv) onExportCsv();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-admin-ink/30 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg bg-white border border-admin-line rounded shadow-elevated overflow-hidden flex flex-col text-admin-ink">
        <div className="flex items-center px-4 py-3 border-b border-admin-line bg-admin-surface/50">
          <Search className="w-4 h-4 text-admin-muted mr-3 flex-shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setSelectedIndex(0); }}
            placeholder="Search jobs, customers, postcodes... (Esc to close)"
            autoFocus
            className="w-full bg-transparent text-sm text-admin-ink placeholder:text-admin-muted focus:outline-none"
          />
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-admin-muted bg-white border border-admin-line rounded">
            ESC
          </kbd>
        </div>

        <div className="max-h-72 overflow-y-auto p-1.5 space-y-0.5">
          {filteredItems.length === 0 ? (
            <div className="py-8 text-center text-xs text-admin-muted">No matching destinations found.</div>
          ) : (
            filteredItems.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded text-xs font-medium transition text-left ${
                    isSelected ? "bg-admin-brand-soft text-admin-brand" : "text-admin-ink-2 hover:bg-admin-surface"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-3.5 h-3.5 ${isSelected ? "text-admin-brand" : "text-admin-muted"}`} />
                    <span>{item.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-admin-muted font-mono">{item.category}</span>
                    <ArrowRight className={`w-3 h-3 ${isSelected ? "opacity-100" : "opacity-0"}`} />
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  X,
  User,
  MapPin,
  Calendar,
  Users,
  PoundSterling,
  Check,
  Search,
  ChevronDown,
  Clock,
  AlertTriangle,
  ClipboardList
} from "lucide-react";
import { addJob, fetchDrivers } from "../api";
import { getAvatarColor } from "../utils/drivers";
import { Button, IconButton } from "../../../../ui";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function AddJobModal({ isOpen, onClose }: Props) {
  const queryClient = useQueryClient();
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [form, setForm] = useState({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    pickup: "",
    dropoff: "",
    crewSize: 2,
    price: "",
    paidOnline: false,
    start: "",
    finish: "",
    driverId: "" // "" means unassigned -- holds a real driver's initials
  });

  const [driverSearchOpen, setDriverSearchOpen] = useState(false);
  const [driverSearchQuery, setDriverSearchQuery] = useState("");
  // Real roster (initials/fullName/email/vanRegistration), not the old localStorage mock --
  // this modal's whole point is creating a job the real bot can assign to a real driver.
  const { data: driversData } = useQuery({ queryKey: ["drivers_summary"], queryFn: () => fetchDrivers() });
  const roster = (driversData?.drivers ?? []).filter(d => d.active && d.hasAccount);
  const driverDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (driverDropdownRef.current && !driverDropdownRef.current.contains(event.target as Node)) {
        setDriverSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!isOpen) return null;

  // Validation logic
  const isInvalid = (field: keyof typeof form, required = true) => {
    if (!attemptedSubmit || !required) return false;
    return String(form[field]).trim() === "";
  };

  const isFinishBeforeStart = () => {
    if (!form.start || !form.finish) return false;
    return new Date(form.finish) < new Date(form.start);
  };

  const isFormValid = () => {
    return form.customerName.trim() !== "" &&
           form.pickup.trim() !== "" &&
           form.dropoff.trim() !== "" &&
           form.crewSize > 0 &&
           form.price.trim() !== "" &&
           form.start.trim() !== "" &&
           form.finish.trim() !== "" &&
           !isFinishBeforeStart();
  };

  const handleSave = async () => {
    setAttemptedSubmit(true);
    setSaveError("");
    if (!isFormValid()) return;
    setIsSaving(true);
    try {
      await addJob({
        customerName: form.customerName,
        customerEmail: form.customerEmail || undefined,
        customerPhone: form.customerPhone || undefined,
        pickup: form.pickup,
        dropoff: form.dropoff,
        crewSize: form.crewSize,
        price: Number(form.price),
        paidOnline: form.paidOnline,
        driverInitials: form.driverId || undefined,
        start: form.start,
        finish: form.finish
      });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      onClose();
    } catch (err: any) {
      setSaveError(err?.message || "Failed to create job.");
    } finally {
      setIsSaving(false);
    }
  };

  const calculateDuration = () => {
    if (!form.start || !form.finish || isFinishBeforeStart()) return null;
    const diffMs = new Date(form.finish).getTime() - new Date(form.start).getTime();
    const hrs = Math.floor(diffMs / 3600000);
    const mins = Math.floor((diffMs % 3600000) / 60000);
    return `${hrs > 0 ? `${hrs}h ` : ""}${mins}m`;
  };

  const selectedDriver = roster.find(d => d.initials === form.driverId);
  const filteredRoster = roster.filter(d =>
    d.fullName.toLowerCase().includes(driverSearchQuery.toLowerCase()) ||
    d.initials.toLowerCase().includes(driverSearchQuery.toLowerCase()) ||
    (d.vanRegistration || "").toLowerCase().includes(driverSearchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-admin-ink/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-module shadow-2xl w-full max-w-[520px] flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* HEADER */}
        <div className="px-6 py-5 border-b border-admin-line flex items-center justify-between bg-white rounded-t-module z-10 sticky top-0">
          <h2 className="text-title text-fg">Add Job</h2>
          <IconButton aria-label="Close" icon={<X />} onClick={onClose} className="-mr-2" />
        </div>

        {/* BODY */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
          
          {/* 1. CUSTOMER DETAILS */}
          <section className="bg-[#F7F7F7] p-5 rounded-card">
            <h3 className="text-[12px] font-semibold uppercase text-admin-muted tracking-wider flex items-center gap-1.5 mb-4">
              <User className="w-3.5 h-3.5" /> Customer Details
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-admin-ink mb-1.5">
                  Customer name <span className="text-admin-status-red">*</span>
                </label>
                <input 
                  type="text" 
                  value={form.customerName}
                  onChange={e => setForm({...form, customerName: e.target.value})}
                  className={`w-full h-10 px-3 rounded-control border bg-white text-[14px] outline-none transition placeholder:text-admin-muted/50 ${
                    isInvalid("customerName") ? "border-admin-status-red ring-1 ring-admin-status-red" : "border-admin-line focus:border-admin-brand focus:ring-1 focus:ring-admin-brand"
                  }`} 
                  placeholder="e.g. John Smith" 
                />
                {isInvalid("customerName") && <p className="text-[11px] text-admin-status-red mt-1.5">Customer name is required</p>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[13px] font-medium text-admin-ink mb-1.5">Customer email</label>
                  <input 
                    type="email" 
                    value={form.customerEmail}
                    onChange={e => setForm({...form, customerEmail: e.target.value})}
                    className="w-full h-10 px-3 rounded-control border border-admin-line bg-white text-[14px] outline-none focus:border-admin-brand focus:ring-1 focus:ring-admin-brand transition placeholder:text-admin-muted/50" 
                    placeholder="john@example.com" 
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-admin-ink mb-1.5">Customer phone</label>
                  <input 
                    type="tel" 
                    value={form.customerPhone}
                    onChange={e => setForm({...form, customerPhone: e.target.value})}
                    className="w-full h-10 px-3 rounded-control border border-admin-line bg-white text-[14px] outline-none focus:border-admin-brand focus:ring-1 focus:ring-admin-brand transition placeholder:text-admin-muted/50" 
                    placeholder="07123 456789" 
                  />
                </div>
              </div>
            </div>
          </section>

          {/* 2. ROUTE */}
          <section className="bg-[#F7F7F7] p-5 rounded-card">
            <h3 className="text-[12px] font-semibold uppercase text-admin-muted tracking-wider flex items-center gap-1.5 mb-4">
              <MapPin className="w-3.5 h-3.5" /> Route
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-admin-ink mb-1.5">
                  Pickup address <span className="text-admin-status-red">*</span>
                </label>
                <input 
                  type="text" 
                  value={form.pickup}
                  onChange={e => setForm({...form, pickup: e.target.value})}
                  className={`w-full h-10 px-3 rounded-control border bg-white text-[14px] outline-none transition placeholder:text-admin-muted/50 ${
                    isInvalid("pickup") ? "border-admin-status-red ring-1 ring-admin-status-red" : "border-admin-line focus:border-admin-brand focus:ring-1 focus:ring-admin-brand"
                  }`} 
                  placeholder="e.g. 12 High Street, London, SW1A 1AA" 
                />
                {isInvalid("pickup") && <p className="text-[11px] text-admin-status-red mt-1.5">Pickup address is required</p>}
              </div>
              <div>
                <label className="block text-[13px] font-medium text-admin-ink mb-1.5">
                  Drop-off address <span className="text-admin-status-red">*</span>
                </label>
                <input 
                  type="text" 
                  value={form.dropoff}
                  onChange={e => setForm({...form, dropoff: e.target.value})}
                  className={`w-full h-10 px-3 rounded-control border bg-white text-[14px] outline-none transition placeholder:text-admin-muted/50 ${
                    isInvalid("dropoff") ? "border-admin-status-red ring-1 ring-admin-status-red" : "border-admin-line focus:border-admin-brand focus:ring-1 focus:ring-admin-brand"
                  }`} 
                  placeholder="e.g. 45 Park Road, Manchester, M1 2AB" 
                />
                {isInvalid("dropoff") && <p className="text-[11px] text-admin-status-red mt-1.5">Drop-off address is required</p>}
              </div>
            </div>
          </section>

          {/* 3. JOB DETAILS */}
          <section className="bg-[#F7F7F7] p-5 rounded-card">
            <h3 className="text-[12px] font-semibold uppercase text-admin-muted tracking-wider flex items-center gap-1.5 mb-4">
              <ClipboardList className="w-3.5 h-3.5" /> Job Details
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[13px] font-medium text-admin-ink mb-1.5">
                  Crew size <span className="text-admin-status-red">*</span>
                </label>
                <div className="flex items-center h-10 bg-white border border-admin-line rounded-control overflow-hidden">
                  <button 
                    onClick={() => setForm({...form, crewSize: Math.max(1, form.crewSize - 1)})}
                    className="w-10 h-full flex items-center justify-center text-admin-muted hover:bg-admin-surface hover:text-admin-ink transition border-r border-admin-line"
                  >
                    -
                  </button>
                  <div className="flex-1 text-center text-[14px] font-medium text-admin-ink">
                    {form.crewSize}
                  </div>
                  <button 
                    onClick={() => setForm({...form, crewSize: form.crewSize + 1})}
                    className="w-10 h-full flex items-center justify-center text-admin-muted hover:bg-admin-surface hover:text-admin-ink transition border-l border-admin-line"
                  >
                    +
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[13px] font-medium text-admin-ink mb-1.5">
                  Price <span className="text-admin-status-red">*</span>
                </label>
                <div className={`relative flex items-center h-10 bg-white border rounded-control overflow-hidden transition focus-within:border-admin-brand focus-within:ring-1 focus-within:ring-admin-brand ${isInvalid("price") ? "border-admin-status-red ring-1 ring-admin-status-red" : "border-admin-line"}`}>
                  <span className="absolute left-3 text-admin-muted">£</span>
                  <input 
                    type="number" 
                    value={form.price}
                    onChange={e => setForm({...form, price: e.target.value})}
                    className="w-full h-full pl-8 pr-3 text-right bg-transparent text-[14px] font-medium text-admin-ink outline-none placeholder:text-admin-muted/50 tabular-nums" 
                    placeholder="0.00" 
                  />
                </div>
                {isInvalid("price") && <p className="text-[11px] text-admin-status-red mt-1.5">Price is required</p>}
              </div>
            </div>
            <label className="flex items-center gap-2 mt-4 cursor-pointer">
              <input
                type="checkbox"
                checked={form.paidOnline}
                onChange={e => setForm({ ...form, paidOnline: e.target.checked })}
                className="w-4 h-4 text-admin-brand rounded border-admin-line focus:ring-admin-brand cursor-pointer"
              />
              <span className="text-[13px] font-medium text-admin-ink">Paid online</span>
            </label>
          </section>

          {/* 4. SCHEDULE */}
          <section className="bg-[#F7F7F7] p-5 rounded-card">
            <h3 className="text-[12px] font-semibold uppercase text-admin-muted tracking-wider flex items-center gap-1.5 mb-4">
              <Clock className="w-3.5 h-3.5" /> Schedule
            </h3>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[13px] font-medium text-admin-ink mb-1.5">
                    Start <span className="text-admin-status-red">*</span>
                  </label>
                  <input 
                    type="datetime-local" 
                    value={form.start}
                    onChange={e => setForm({...form, start: e.target.value})}
                    className={`w-full h-10 px-3 rounded-control border bg-white text-[14px] outline-none transition ${
                      isInvalid("start") ? "border-admin-status-red ring-1 ring-admin-status-red" : "border-admin-line focus:border-admin-brand focus:ring-1 focus:ring-admin-brand"
                    }`} 
                  />
                  {isInvalid("start") && <p className="text-[11px] text-admin-status-red mt-1.5">Required</p>}
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-admin-ink mb-1.5">
                    Finish <span className="text-admin-status-red">*</span>
                  </label>
                  <input 
                    type="datetime-local" 
                    value={form.finish}
                    onChange={e => setForm({...form, finish: e.target.value})}
                    className={`w-full h-10 px-3 rounded-control border bg-white text-[14px] outline-none transition ${
                      isInvalid("finish") || isFinishBeforeStart() ? "border-admin-status-red ring-1 ring-admin-status-red" : "border-admin-line focus:border-admin-brand focus:ring-1 focus:ring-admin-brand"
                    }`} 
                  />
                  {isInvalid("finish") && <p className="text-[11px] text-admin-status-red mt-1.5">Required</p>}
                </div>
              </div>
              
              {isFinishBeforeStart() ? (
                <p className="text-[12px] text-admin-status-red font-medium flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> Finish time cannot be before start time
                </p>
              ) : calculateDuration() ? (
                <p className="text-[12px] text-admin-muted font-medium">
                  Duration: {calculateDuration()}
                </p>
              ) : null}
            </div>
          </section>

          {/* 5. ASSIGNMENT */}
          <section className="bg-[#F7F7F7] p-5 rounded-card">
            <h3 className="text-[12px] font-semibold uppercase text-admin-muted tracking-wider flex items-center gap-1.5 mb-4">
              <User className="w-3.5 h-3.5" /> Assignment
            </h3>
            
            <div className="relative" ref={driverDropdownRef}>
              <label className="block text-[13px] font-medium text-admin-ink mb-1.5">
                Driver assignment
              </label>
              
              {/* Select Trigger */}
              <button 
                onClick={() => setDriverSearchOpen(!driverSearchOpen)}
                className="w-full min-h-[40px] p-1 pr-3 bg-white border border-admin-line rounded-control flex items-center justify-between outline-none focus:border-admin-brand focus:ring-1 focus:ring-admin-brand transition hover:bg-admin-surface/50"
              >
                {selectedDriver ? (
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-control flex items-center justify-center text-[11px] font-bold ${getAvatarColor(selectedDriver.initials)}`}>
                      {selectedDriver.initials}
                    </div>
                    <div className="text-left">
                      <div className="text-[13px] font-medium text-admin-ink leading-tight">{selectedDriver.fullName}</div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5 px-2">
                    <div className="w-6 h-6 rounded-full border border-dashed border-admin-muted/50 flex items-center justify-center text-admin-muted">
                      <User className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-[14px] text-admin-ink font-medium">Unassigned — open to any driver</span>
                  </div>
                )}
                <ChevronDown className="w-4 h-4 text-admin-muted" />
              </button>

              {/* Dropdown Menu */}
              {driverSearchOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-card border border-admin-line shadow-xl z-20 overflow-hidden flex flex-col max-h-[260px]">
                  <div className="p-2 border-b border-admin-line sticky top-0 bg-white">
                    <div className="relative">
                      <Search className="w-4 h-4 text-admin-muted absolute left-3 top-2.5" />
                      <input 
                        type="text" 
                        autoFocus
                        value={driverSearchQuery}
                        onChange={e => setDriverSearchQuery(e.target.value)}
                        placeholder="Search roster..."
                        className="w-full h-9 pl-9 pr-3 bg-admin-surface border-transparent rounded-control text-[13px] outline-none focus:bg-white focus:border-admin-brand focus:ring-1 focus:ring-admin-brand transition"
                      />
                    </div>
                  </div>
                  
                  <div className="overflow-y-auto custom-scrollbar p-1">
                    <button 
                      onClick={() => { setForm({...form, driverId: ""}); setDriverSearchOpen(false); }}
                      className={`w-full flex items-center gap-3 p-2 rounded-control hover:bg-admin-surface transition ${!form.driverId ? "bg-admin-surface" : ""}`}
                    >
                      <div className="w-8 h-8 rounded-full border border-dashed border-admin-muted/50 flex items-center justify-center text-admin-muted shrink-0">
                        <User className="w-4 h-4" />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="text-[13px] font-medium text-admin-ink">Unassigned</div>
                        <div className="text-[11px] text-admin-muted">Open to any driver</div>
                      </div>
                      {!form.driverId && <Check className="w-4 h-4 text-admin-ink shrink-0" />}
                    </button>

                    {filteredRoster.map(driver => (
                      <button
                        key={driver.initials}
                        onClick={() => { setForm({...form, driverId: driver.initials}); setDriverSearchOpen(false); }}
                        className={`w-full flex items-center gap-3 p-2 rounded-control hover:bg-admin-surface transition ${form.driverId === driver.initials ? "bg-admin-surface" : ""}`}
                      >
                        <div className={`w-8 h-8 rounded-control flex items-center justify-center text-[12px] font-bold shrink-0 ${getAvatarColor(driver.initials)}`}>
                          {driver.initials}
                        </div>
                        <div className="flex-1 text-left">
                          <div className="text-[13px] font-medium text-admin-ink">{driver.fullName}</div>
                          <div className="text-[11px] text-admin-muted flex items-center gap-1 mt-0.5">
                            {driver.vanRegistration && (
                              <>
                                <span className="bg-admin-line/50 px-1.5 py-[1px] rounded-control font-mono font-bold uppercase text-[10px] text-admin-ink">{driver.vanRegistration}</span>
                                <span>•</span>
                              </>
                            )}
                            <span>{driver.email}</span>
                          </div>
                        </div>
                        <div className="shrink-0 flex items-center gap-3">
                          {form.driverId === driver.initials && <Check className="w-4 h-4 text-admin-ink" />}
                        </div>
                      </button>
                    ))}
                    
                    {filteredRoster.length === 0 && (
                      <div className="p-4 text-center text-[13px] text-admin-muted">
                        No drivers found matching "{driverSearchQuery}"
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

          </section>

        </div>

        {/* FOOTER */}
        <div className="px-6 py-4 border-t border-admin-line bg-white shadow-[0_-4px_10px_rgba(0,0,0,0.02)] rounded-b-module z-10 sticky bottom-0">
          {saveError && (
            <p className="text-[12px] text-admin-status-red font-medium mb-3 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {saveError}
            </p>
          )}
          <div className="flex items-center justify-between">
            <span className="text-meta text-fg-subtle">* Required fields</span>
            <div className="flex items-center gap-3">
              <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                loading={isSaving}
                disabled={attemptedSubmit && !isFormValid()}
              >
                {isSaving ? "Creating…" : "Create job"}
              </Button>
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}

// Dummy AlertTriangle polyfill since it wasn't imported from lucide-react initially, although we added it to imports.

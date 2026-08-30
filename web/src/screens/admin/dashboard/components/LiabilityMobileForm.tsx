import React, { useState } from "react";
import { Search, ChevronDown, Check, Send, RotateCcw, ShieldAlert, FileText } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORY_GROUPS = {
  "General Notices": [
    "No protection provided",
    "Van Overloaded",
    "Disassembly and Reassembly May Affect Furniture Integrity",
    "Lift Got No Protection - Damage Responsibility Notice"
  ],
  "Furniture & Household": [
    "Fragile furniture",
    "Sofa",
    "Furniture with fragile parts",
    "Table glass",
    "Mirrors"
  ],
  "Electronics & Appliances": [
    "TV",
    "Computer monitors",
    "Fridges and Freezers",
    "Appliances",
    "Small electronics",
    "Computers and monitors",
    "Printers and copiers"
  ],
  "Decor & Fragile Items": [
    "Artwork",
    "Picture frames",
    "Lamps and light fixtures/lampshades",
    "Ceramics and pottery",
    "Glassware",
    "Decorations"
  ],
  "Structural": [
    "Walls",
    "Ceiling",
    "Floor"
  ],
  "Plants & Living Items": [
    "Plants, indoor plants and pots"
  ],
  "Specialty Items": [
    "Musical instruments"
  ],
  "Office-Specific": [
    "Office furniture",
    "Filing cabinets with contents",
    "Whiteboards or glass boards",
    "Sensitive documents or folders",
    "Office plants and pots",
    "Meeting room equipment",
    "Display materials"
  ]
};

export function LiabilityMobileForm({ isOpen, onClose }: Props) {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["General Notices"]));

  if (!isOpen) return null;

  const toggleItem = (item: string) => {
    const next = new Set(selectedItems);
    if (next.has(item)) next.delete(item);
    else next.add(item);
    setSelectedItems(next);
  };

  const toggleGroup = (group: string) => {
    const next = new Set(expandedGroups);
    if (next.has(group)) next.delete(group);
    else next.add(group);
    setExpandedGroups(next);
  };

  const resetForm = () => {
    setSelectedItems(new Set());
    setSearchQuery("");
  };

  const filteredGroups = Object.entries(CATEGORY_GROUPS).map(([group, items]) => {
    const filteredItems = items.filter(i => i.toLowerCase().includes(searchQuery.toLowerCase()));
    return { group, items: filteredItems };
  }).filter(g => g.items.length > 0 || g.group.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      {/* Phone Simulator Frame */}
      <div className="bg-[#F5F5F7] rounded-[40px] shadow-2xl w-full max-w-[390px] h-[844px] overflow-hidden flex flex-col relative border-[8px] border-black">
        
        {/* Fake iOS Status Bar */}
        <div className="h-12 w-full flex items-center justify-between px-6 shrink-0 relative z-20 bg-white">
          <div className="text-[14px] font-semibold tracking-tight text-black">9:41</div>
          <div className="absolute inset-x-0 top-0 h-7 flex justify-center">
             <div className="w-32 h-7 bg-black rounded-b-3xl"></div> {/* Dynamic Island Fake */}
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-3 rounded-[1px] bg-black"></div>
            <div className="w-3 h-3 rounded-full bg-black"></div>
            <div className="w-5 h-3 border border-black rounded-[3px] flex justify-end p-[1px]">
               <div className="w-3 h-full bg-black rounded-[1px]"></div>
            </div>
          </div>
        </div>

        {/* Header */}
        <div className="bg-white px-5 pb-4 pt-2 border-b border-admin-line shrink-0 z-10 flex items-center justify-between">
          <h1 className="text-[20px] font-bold text-admin-ink">Liability report</h1>
          <button onClick={onClose} className="text-[14px] font-medium text-admin-brand hover:underline">Close</button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto bg-[#F5F5F5] flex flex-col relative pb-32">
          
          {/* Summary / Header inside scroll */}
          <div className="p-5">
             <div className="bg-white rounded-2xl p-5 shadow-sm border border-admin-line mb-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-admin-status-red-bg text-admin-status-red flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                   <h2 className="text-[16px] font-bold text-admin-ink">Liability for Damage</h2>
                   <p className="text-[13px] text-admin-muted leading-tight mt-0.5">Please select all categories that apply to this notice.</p>
                </div>
             </div>

             {/* Search */}
             <div className="sticky top-0 z-20 pb-4 pt-2 bg-[#F5F5F5]">
                <div className="relative">
                  <Search className="w-4 h-4 text-admin-muted absolute left-3.5 top-3.5" />
                  <input 
                    type="text" 
                    placeholder="Search categories..." 
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full h-11 pl-10 pr-4 rounded-xl border border-admin-line bg-white shadow-sm text-[15px] outline-none focus:border-admin-brand transition"
                  />
                </div>
             </div>

             {/* Selected Chips */}
             {selectedItems.size > 0 && (
                <div className="mb-4">
                  <h3 className="text-[12px] font-semibold text-admin-muted uppercase tracking-wider mb-2">Selected ({selectedItems.size})</h3>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(selectedItems).map(item => (
                      <span key={item} onClick={() => toggleItem(item)} className="px-3 py-1.5 rounded-full bg-admin-brand-soft text-admin-brand text-[13px] font-medium border border-admin-brand/20 active:opacity-70 transition">
                        {item} &times;
                      </span>
                    ))}
                  </div>
                </div>
             )}

             {/* Accordion List */}
             <div className="space-y-3">
               {filteredGroups.map(({ group, items }) => {
                 const isExpanded = expandedGroups.has(group) || searchQuery !== "";
                 const selectedCount = items.filter(i => selectedItems.has(i)).length;

                 return (
                   <div key={group} className="bg-white rounded-2xl shadow-sm border border-admin-line overflow-hidden transition-all">
                     <button 
                       onClick={() => toggleGroup(group)}
                       className="w-full px-4 py-4 flex items-center justify-between text-left active:bg-admin-surface transition"
                     >
                       <div className="flex items-center gap-2">
                         <h4 className="text-[15px] font-semibold text-admin-ink">{group}</h4>
                         {selectedCount > 0 && (
                           <span className="w-5 h-5 rounded-full bg-admin-brand text-white flex items-center justify-center text-[10px] font-bold">
                             {selectedCount}
                           </span>
                         )}
                       </div>
                       <ChevronDown className={`w-5 h-5 text-admin-muted transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                     </button>
                     
                     {isExpanded && (
                       <div className="border-t border-admin-line px-2 pb-2 pt-1">
                         {items.map(item => {
                           const isSelected = selectedItems.has(item);
                           return (
                             <button
                               key={item}
                               onClick={() => toggleItem(item)}
                               className="w-full flex items-start gap-3 p-3 active:bg-admin-surface rounded-xl transition text-left"
                             >
                               <div className={`mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition ${
                                 isSelected ? "bg-admin-brand border-admin-brand text-white" : "border-admin-line-strong bg-white"
                               }`}>
                                 {isSelected && <Check className="w-3.5 h-3.5" />}
                               </div>
                               <span className={`text-[15px] leading-snug ${isSelected ? "text-admin-ink font-medium" : "text-admin-ink-2"}`}>
                                 {item}
                               </span>
                             </button>
                           );
                         })}
                       </div>
                     )}
                   </div>
                 );
               })}
             </div>
          </div>
        </div>

        {/* Footer Actions (Sticky to bottom of screen) */}
        <div className="absolute inset-x-0 bottom-0 bg-white border-t border-admin-line px-5 pt-4 pb-8 flex flex-col gap-3 shadow-[0_-10px_30px_rgba(0,0,0,0.05)] z-30">
          <button 
            disabled={selectedItems.size === 0}
            className="w-full h-14 rounded-2xl bg-[#2563EB] disabled:bg-admin-surface disabled:text-admin-muted disabled:border-admin-line disabled:border hover:bg-blue-700 text-white text-[16px] font-bold shadow-sm transition flex items-center justify-center gap-2"
          >
            <Send className="w-5 h-5" /> 
            {selectedItems.size > 0 ? `Send (${selectedItems.size} selected)` : "Send"}
          </button>
          
          <button onClick={resetForm} className="py-2 text-[13px] font-medium text-[#2563EB] flex items-center justify-center gap-1.5 active:opacity-70 transition mx-auto">
            <RotateCcw className="w-3.5 h-3.5" /> Reset preview
          </button>
        </div>
        
        {/* iOS Home Indicator */}
        <div className="absolute bottom-2 inset-x-0 flex justify-center z-40">
           <div className="w-32 h-1 rounded-full bg-black"></div>
        </div>

      </div>
    </div>
  );
}

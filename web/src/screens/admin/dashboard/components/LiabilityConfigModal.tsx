import React, { useState } from "react";
import { X, GripVertical, Trash2, Plus, Search, Filter, Download, Upload } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const INITIAL_CATEGORIES = {
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

export function LiabilityConfigModal({ isOpen, onClose }: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [categories, setCategories] = useState(INITIAL_CATEGORIES);

  if (!isOpen) return null;

  const handleAddItem = (group: keyof typeof INITIAL_CATEGORIES) => {
    setCategories({
      ...categories,
      [group]: [...categories[group], ""]
    });
  };

  const handleUpdateItem = (group: keyof typeof INITIAL_CATEGORIES, index: number, val: string) => {
    const newItems = [...categories[group]];
    newItems[index] = val;
    setCategories({ ...categories, [group]: newItems });
  };

  const handleDeleteItem = (group: keyof typeof INITIAL_CATEGORIES, index: number) => {
    const newItems = [...categories[group]];
    newItems.splice(index, 1);
    setCategories({ ...categories, [group]: newItems });
  };

  const filteredGroups = Object.entries(categories).map(([group, items]) => {
    const filteredItems = items.filter(i => i.toLowerCase().includes(searchQuery.toLowerCase()));
    return { group, items: filteredItems };
  }).filter(g => g.items.length > 0 || g.group.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[20px] shadow-2xl w-full max-w-[520px] flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-admin-line flex items-center justify-between shrink-0 bg-white">
          <h2 className="text-[16px] font-bold text-admin-ink">Manage Damage Categories</h2>
          <button onClick={onClose} className="p-2 -mr-2 text-admin-muted hover:text-admin-ink hover:bg-admin-surface rounded-full transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto custom-scrollbar flex-1 p-6 space-y-6 bg-[#FAFAFA]">
          
          {/* Top Selectors */}
          <div className="space-y-4">
            <div>
              <label className="block text-[12px] font-semibold text-admin-muted uppercase tracking-wider mb-1.5">Primary Form Type</label>
              <select className="w-full h-10 px-3 rounded-[8px] border border-admin-line bg-white text-[13px] text-admin-ink outline-none focus:border-admin-brand shadow-sm">
                <option>Damage Liability & Assembly Risk Notice</option>
                <option>Waiver of Liability: Furniture Handling & Protection Etc</option>
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-admin-muted uppercase tracking-wider mb-1.5">Fallback Form Type</label>
              <select className="w-full h-10 px-3 rounded-[8px] border border-admin-line bg-white text-[13px] text-admin-ink outline-none focus:border-admin-brand shadow-sm">
                <option>Waiver of Liability: Furniture Handling & Protection Etc</option>
                <option>Damage Liability & Assembly Risk Notice</option>
              </select>
            </div>
          </div>

          <div className="w-full h-px bg-admin-line" />

          {/* List Controls */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[14px] font-bold text-admin-ink">Category Items</h3>
              <div className="flex items-center gap-2">
                <button className="text-[12px] font-medium text-admin-brand hover:text-admin-brand-dark transition flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5" /> Sort
                </button>
                <span className="text-admin-line-strong">|</span>
                <button className="text-[12px] font-medium text-admin-brand hover:text-admin-brand-dark transition flex items-center gap-1">
                  <Download className="w-3.5 h-3.5" /> Export
                </button>
                <button className="text-[12px] font-medium text-admin-brand hover:text-admin-brand-dark transition flex items-center gap-1">
                  <Upload className="w-3.5 h-3.5" /> Import
                </button>
              </div>
            </div>

            <div className="relative mb-6">
              <Search className="w-4 h-4 text-admin-muted absolute left-3 top-2.5" />
              <input 
                type="text" 
                placeholder="Search items or groups..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-9 pr-3 rounded-full border border-admin-line bg-white shadow-sm text-[13px] outline-none focus:border-admin-brand transition"
              />
            </div>

            {/* Render Groups */}
            <div className="space-y-6">
              {filteredGroups.map(({ group, items }) => (
                <div key={group} className="space-y-2">
                  <h4 className="text-[12px] font-semibold text-admin-muted uppercase tracking-wider">{group}</h4>
                  <div className="space-y-2">
                    {items.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 group/row">
                        <div className="cursor-grab p-1.5 text-admin-line-strong hover:text-admin-muted transition">
                          <GripVertical className="w-4 h-4" />
                        </div>
                        <input
                          type="text"
                          value={item}
                          onChange={(e) => handleUpdateItem(group as keyof typeof INITIAL_CATEGORIES, idx, e.target.value)}
                          className="flex-1 h-10 px-3 rounded-[8px] border border-admin-line bg-white shadow-sm text-[13px] text-admin-ink outline-none focus:border-admin-brand transition"
                          placeholder="Category name"
                        />
                        <button 
                          onClick={() => handleDeleteItem(group as keyof typeof INITIAL_CATEGORIES, idx)}
                          className="p-2 text-admin-muted hover:text-admin-status-red hover:bg-admin-status-red-bg rounded-lg transition opacity-0 group-hover/row:opacity-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <button 
                      onClick={() => handleAddItem(group as keyof typeof INITIAL_CATEGORIES)}
                      className="ml-8 flex items-center gap-1.5 text-[12px] font-semibold text-admin-muted hover:text-admin-brand transition py-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add {group.toLowerCase()} item
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button className="w-full mt-6 py-3 border-2 border-dashed border-admin-line-strong rounded-xl text-[13px] font-semibold text-admin-muted hover:border-admin-brand hover:text-admin-brand transition flex items-center justify-center gap-2">
              <Plus className="w-4 h-4" /> Add New Group
            </button>

          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-admin-line bg-white flex items-center justify-end gap-3 shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-[8px] text-[13px] font-semibold text-admin-muted hover:bg-admin-surface hover:text-admin-ink transition">
            Cancel
          </button>
          <button onClick={onClose} className="px-5 py-2 rounded-[8px] bg-[#2563EB] hover:bg-blue-700 text-white text-[13px] font-semibold shadow-sm transition">
            Confirm Changes
          </button>
        </div>

      </div>
    </div>
  );
}

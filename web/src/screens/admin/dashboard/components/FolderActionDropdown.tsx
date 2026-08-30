import React, { useState, useRef, useEffect } from "react";
import { FolderOpen, FileText, Download, ChevronDown, ExternalLink } from "lucide-react";

interface Props {
  onPreview: () => void;
  onDownload: () => void;
  onOpenFolder?: () => void;
  hasFolderUrl?: boolean;
}

export function FolderActionDropdown({ onPreview, onDownload, onOpenFolder, hasFolderUrl }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
        className={`flex items-center gap-1.5 p-1.5 px-2 rounded-lg transition border border-transparent ${isOpen ? 'bg-admin-surface border-admin-line shadow-sm' : 'hover:bg-admin-surface hover:border-admin-line'}`}
        title="View job documents"
      >
        <FolderOpen className={`w-4 h-4 ${isOpen ? 'text-admin-brand fill-admin-brand/10' : 'text-admin-muted'}`} />
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180 text-admin-brand' : 'text-admin-muted/60'}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 rounded-xl bg-white border border-admin-line shadow-[0_8px_30px_rgb(0,0,0,0.12)] z-50 py-1 overflow-hidden animate-in fade-in slide-in-from-top-2">
          <button
            onClick={(e) => { e.stopPropagation(); setIsOpen(false); onPreview(); }}
            className="w-full text-left px-4 py-2.5 text-[13px] font-semibold text-admin-ink hover:bg-admin-surface transition flex items-center gap-2"
          >
            <FileText className="w-4 h-4 text-admin-muted" /> Preview PDF
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setIsOpen(false); onDownload(); }}
            className="w-full text-left px-4 py-2.5 text-[13px] font-semibold text-admin-ink hover:bg-admin-surface transition flex items-center gap-2"
          >
            <Download className="w-4 h-4 text-admin-muted" /> Download PDF
          </button>
          
          {hasFolderUrl && (
            <>
              <div className="h-px w-full bg-admin-line my-1" />
              <button
                onClick={(e) => { e.stopPropagation(); setIsOpen(false); onOpenFolder?.(); }}
                className="w-full text-left px-4 py-2.5 text-[13px] font-semibold text-admin-ink hover:bg-admin-surface transition flex items-center gap-2"
              >
                <ExternalLink className="w-4 h-4 text-admin-muted" /> Open Drive Folder
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

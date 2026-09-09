import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { Button, IconButton } from "../../../../ui";
import { DAMAGE_CATEGORIES } from "../../../../scenarioSpec";
import { fetchSettings, saveSetting } from "../api";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const SETTING_KEY = "LIABILITY_DAMAGE_CATEGORIES";

function parseCategories(value: string | undefined): string[] {
  if (value) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        const categories = normaliseCategories(parsed.map(item => String(item)));
        if (categories.length > 0) return categories;
      }
    } catch {
      const categories = normaliseCategories(value.split(/\r?\n/));
      if (categories.length > 0) return categories;
    }
  }
  return DAMAGE_CATEGORIES;
}

function normaliseCategories(items: string[]): string[] {
  const seen = new Set<string>();
  const categories: string[] = [];
  for (const item of items) {
    const category = item.trim();
    const key = category.toLowerCase();
    if (!category || seen.has(key)) continue;
    seen.add(key);
    categories.push(category);
  }
  return categories;
}

export function LiabilityConfigModal({ isOpen, onClose }: Props) {
  const [categories, setCategories] = useState<string[]>(DAMAGE_CATEGORIES);
  const [newCategory, setNewCategory] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchSettings()
      .then(({ settings }) => {
        if (cancelled) return;
        const setting = settings.find(item => item.key === SETTING_KEY);
        setCategories(parseCategories(setting?.value || setting?.fallback));
      })
      .catch(err => {
        if (!cancelled) setError(err?.message || "Couldn't load categories.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const cleanCategories = useMemo(() => normaliseCategories(categories), [categories]);
  const canSave = cleanCategories.length > 0;

  if (!isOpen) return null;

  function updateCategory(index: number, value: string) {
    setCategories(items => items.map((item, i) => (i === index ? value : item)));
  }

  function deleteCategory(index: number) {
    setCategories(items => items.filter((_, i) => i !== index));
  }

  function addCategory() {
    const category = newCategory.trim();
    if (!category) return;
    setCategories(items => normaliseCategories([...items, category]));
    setNewCategory("");
  }

  async function saveCategories() {
    if (!canSave) {
      setError("Add at least one category.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveSetting(SETTING_KEY, JSON.stringify(cleanCategories));
      onClose();
    } catch (err: any) {
      setError(err?.message || "Couldn't save categories.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-[560px] flex-col overflow-hidden rounded-module bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-admin-line bg-white px-6 py-4">
          <div>
            <h2 className="text-heading text-fg">Manage Damage Categories</h2>
            <p className="mt-1 text-helper text-fg-muted">Changes update the driver Liability Report picker.</p>
          </div>
          <IconButton aria-label="Close" icon={<X />} onClick={onClose} className="-mr-2" />
        </div>

        <div className="flex-1 overflow-y-auto bg-[#FAFAFA] p-6">
          {loading ? (
            <div className="flex min-h-40 items-center justify-center text-admin-muted">
              <Loader2 className="mr-2 size-5 animate-spin" aria-hidden />
              Loading categories...
            </div>
          ) : (
            <div className="space-y-4">
              {error && (
                <div className="rounded-card border border-admin-status-red/30 bg-admin-status-red-bg px-3 py-2 text-[13px] font-medium text-admin-status-red">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-2 border-b border-admin-line pb-4 sm:flex-row">
                <input
                  type="text"
                  value={newCategory}
                  onChange={event => setNewCategory(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === "Enter") addCategory();
                  }}
                  className="h-11 min-w-0 flex-1 rounded-control border border-admin-line bg-white px-3 text-[14px] text-admin-ink shadow-sm outline-none transition focus:border-admin-brand"
                  placeholder="New category"
                />
                <Button variant="secondary" onClick={addCategory} iconLeft={<Plus />} className="shrink-0">
                  Add category
                </Button>
              </div>

              <div className="space-y-2">
                {categories.map((category, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={category}
                      onChange={event => updateCategory(index, event.target.value)}
                      className="h-11 min-w-0 flex-1 rounded-control border border-admin-line bg-white px-3 text-[14px] text-admin-ink shadow-sm outline-none transition focus:border-admin-brand"
                      placeholder="Category name"
                    />
                    <button
                      type="button"
                      onClick={() => deleteCategory(index)}
                      className="grid size-11 shrink-0 place-items-center rounded-card text-admin-muted transition hover:bg-admin-status-red-bg hover:text-admin-status-red"
                      aria-label={`Delete ${category || "category"}`}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-line bg-surface px-6 py-4">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => void saveCategories()}
            loading={saving}
            blockedReason={!canSave ? "Add at least one category." : undefined}
          >
            Save changes
          </Button>
        </div>
      </div>
    </div>
  );
}

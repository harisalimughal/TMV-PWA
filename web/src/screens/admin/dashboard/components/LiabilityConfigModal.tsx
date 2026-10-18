import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button, Modal } from "../../../../ui";
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

  // The shared Modal portals to <body>, traps focus, closes on Escape and restores focus
  // (CLAUDE.md rule 2). It was a hand-rolled inline overlay with a fixed #FAFAFA body,
  // which also stayed bright white in Midnight.
  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Manage damage categories"
      size="lg"
      placement="center"
      dismissible={!saving}
      footer={
        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
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
      }
    >
      <p className="mb-4 text-helper text-fg-muted">Changes update the driver Liability Report picker.</p>
      {loading ? (
        <div role="status" className="flex min-h-40 items-center justify-center text-admin-muted">
          <Loader2 className="mr-2 size-5 animate-spin" aria-hidden />
          Loading categories...
        </div>
      ) : (
        <div className="space-y-4">
          {error && (
            <div role="alert" className="rounded-card border border-admin-status-red/30 bg-admin-status-red-bg px-3 py-2 text-[13px] font-medium text-admin-status-red">
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
              aria-label="New category"
              className="h-11 min-w-0 flex-1 rounded-control border border-admin-line bg-surface px-3 text-[14px] text-admin-ink shadow-sm outline-none transition focus:border-admin-brand"
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
                  aria-label={`Category ${index + 1}`}
                  className="h-11 min-w-0 flex-1 rounded-control border border-admin-line bg-surface px-3 text-[14px] text-admin-ink shadow-sm outline-none transition focus:border-admin-brand"
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
    </Modal>
  );
}

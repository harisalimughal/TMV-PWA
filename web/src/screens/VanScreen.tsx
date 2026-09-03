import React, { useMemo, useState } from "react";
import { Camera, CloudOff, Gauge, Truck } from "lucide-react";
import type { DriverProfile } from "../api/auth";
import { submitVanMileage } from "../api/van";
import { AppShell } from "../app/AppShell";
import { OfflineBanner } from "../app/OfflineBanner";
import { PhotoPicker } from "../components/PhotoPicker";
import { useToast } from "../components/ui/Toast";
import { useOnline } from "../lib/net";
import { Alert, BottomActionBar, Button, Field, Input, Section } from "../ui";

interface VanScreenProps {
  driver: DriverProfile;
}

export function VanScreen({ driver }: VanScreenProps) {
  const [mileage, setMileage] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPickerKey, setPhotoPickerKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const online = useOnline();

  const mileageValid = useMemo(() => {
    if (!mileage.trim()) return true;
    const value = Number(mileage);
    return Number.isFinite(value) && value >= 0 && value <= 2_000_000;
  }, [mileage]);

  const blockedReason = !online
    ? "Reconnect to upload the mileage photo."
    : !mileageValid
      ? "Enter a valid mileage number."
      : photos.length === 0
        ? "Take a photo of the van mileage."
        : undefined;

  async function handleSubmit() {
    if (blockedReason || submitting || !photos[0]) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitVanMileage(mileage, photos[0], setProgress);
      toast.success("Van mileage photo uploaded");
      setMileage("");
      setPhotos([]);
      setPhotoPickerKey(key => key + 1);
    } catch (err: any) {
      setError(err?.message || "Couldn't upload the van mileage photo. Try again.");
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  }

  const busyLabel = progress !== null ? `Uploading ${Math.round(progress * 100)}%` : "Uploading...";

  return (
    <AppShell
      banner={<OfflineBanner />}
      contentWidth="content"
      dock={
        <BottomActionBar note={blockedReason} noteTone="warning">
          <Button
            size="lg"
            fullWidth
            loading={submitting}
            blockedReason={blockedReason}
            onClick={() => void handleSubmit()}
            iconLeft={!online ? <CloudOff /> : <Camera />}
          >
            {submitting ? busyLabel : "Upload mileage photo"}
          </Button>
        </BottomActionBar>
      }
    >
      <div className="flex flex-col gap-7 px-4 py-5 scroll-pb-dock">
        <header className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-card bg-brand text-brand-fg">
            <Truck className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-title text-fg">Van</h1>
            <p className="mt-1 text-body text-fg-muted">
              Record the mileage photo for {driver.vanRegistration || "your van"}.
            </p>
          </div>
        </header>

        <Section title="Mileage">
          <Field label="Mileage reading" hint="Optional, but useful if the photo is blurry.">
            {p => (
              <Input
                {...p}
                type="number"
                inputMode="numeric"
                min="0"
                value={mileage}
                onChange={e => setMileage(e.target.value)}
                placeholder="e.g. 45231"
              />
            )}
          </Field>
        </Section>

        <Section title="Photo">
          <PhotoPicker
            key={photoPickerKey}
            label="Van mileage"
            hint="Take a clear photo of the dashboard mileage."
            min={1}
            max={1}
            onChange={setPhotos}
          />
        </Section>

        {error && <Alert tone="danger">{error}</Alert>}

        <div className="flex items-center gap-2 rounded-card border border-line bg-surface px-4 py-3 text-helper text-fg-muted">
          <Gauge className="size-4 shrink-0" aria-hidden />
          Upload one mileage photo whenever operations needs a van record.
        </div>
      </div>
    </AppShell>
  );
}

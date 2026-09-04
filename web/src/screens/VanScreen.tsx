import React, { useState } from "react";
import { Camera, CloudOff, Fuel, Gauge, Wrench } from "lucide-react";
import type { DriverProfile } from "../api/auth";
import { submitVanFuel, submitVanMileage, submitVanService } from "../api/van";
import { AppShell } from "../app/AppShell";
import { OfflineBanner } from "../app/OfflineBanner";
import { PhotoPicker } from "../components/PhotoPicker";
import { useToast } from "../components/ui/Toast";
import { useOnline } from "../lib/net";
import { Alert, Button, Field, Input, Select } from "../ui";

interface VanScreenProps {
  driver: DriverProfile;
}

const SERVICE_TYPES = ["Full", "Interim", "MOT"];

export function VanScreen({ driver }: VanScreenProps) {
  const online = useOnline();

  return (
    <AppShell banner={<OfflineBanner />} contentWidth="content">
      <div className="flex flex-col gap-7 px-4 pt-5 pb-8 scroll-pb-nav">
        <header className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-card bg-brand text-brand-fg">
            <Gauge className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-title text-fg">Van</h1>
            <p className="mt-1 text-body text-fg-muted">
              Submit records for {driver.vanRegistration || "your van"}.
            </p>
          </div>
        </header>

        <MileageCard online={online} />
        <FuelCard online={online} />
        <ServiceCard online={online} />
      </div>
    </AppShell>
  );
}

/** Shared frame for the three submission cards below: a Section with an icon/title,
 *  the type-specific fields (children), a required single photo, and its own submit
 *  button -- each is an independent one-shot submission, not steps in one form. */
function VanRecordCard({
  icon,
  title,
  hint,
  photoLabel,
  photoHint,
  online,
  fieldsValid,
  fieldsError,
  onSubmit,
  children
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  photoLabel: string;
  photoHint: string;
  online: boolean;
  fieldsValid: boolean;
  fieldsError?: string;
  onSubmit: (photo: File, onProgress: (fraction: number) => void) => Promise<void>;
  children: React.ReactNode;
}) {
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPickerKey, setPhotoPickerKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const blockedReason = !online
    ? "Reconnect to submit."
    : !fieldsValid
      ? fieldsError || "Fill in the required field(s)."
      : photos.length === 0
        ? `Take a photo for ${title.toLowerCase()}.`
        : undefined;

  async function handleSubmit() {
    if (blockedReason || submitting || !photos[0]) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(photos[0], setProgress);
      toast.success(`${title} submitted`);
      setPhotos([]);
      setPhotoPickerKey(key => key + 1);
    } catch (err: any) {
      setError(err?.message || `Couldn't submit ${title.toLowerCase()}. Try again.`);
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  }

  const busyLabel = progress !== null ? `Uploading ${Math.round(progress * 100)}%` : "Uploading...";

  return (
    <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4">
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-card bg-brand-subtle text-brand">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-card text-fg">{title}</h2>
          <p className="text-helper text-fg-muted">{hint}</p>
        </div>
      </div>

      {children}

      <PhotoPicker
        key={photoPickerKey}
        label={photoLabel}
        hint={photoHint}
        min={1}
        max={1}
        onChange={setPhotos}
      />

      {error && <Alert tone="danger">{error}</Alert>}

      <Button
        fullWidth
        loading={submitting}
        blockedReason={blockedReason}
        onClick={() => void handleSubmit()}
        iconLeft={!online ? <CloudOff /> : <Camera />}
      >
        {submitting ? busyLabel : `Submit ${title.toLowerCase()}`}
      </Button>
    </div>
  );
}

function MileageCard({ online }: { online: boolean }) {
  const [mileage, setMileage] = useState("");

  const mileageValid = (() => {
    if (!mileage.trim()) return false;
    const value = Number(mileage);
    return Number.isFinite(value) && value >= 0 && value <= 2_000_000;
  })();

  return (
    <VanRecordCard
      icon={<Gauge className="size-4" aria-hidden />}
      title="Mileage"
      hint="Record the current odometer reading."
      photoLabel="Odometer photo"
      photoHint="Take a clear photo of the dashboard mileage."
      online={online}
      fieldsValid={mileageValid}
      fieldsError={!mileage.trim() ? "Enter the mileage reading." : "Enter a valid mileage number."}
      onSubmit={(photo, onProgress) => submitVanMileage(mileage, photo, onProgress).then(() => setMileage(""))}
    >
      <Field label="Mileage reading" required>
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
    </VanRecordCard>
  );
}

function FuelCard({ online }: { online: boolean }) {
  const [fuelCost, setFuelCost] = useState("");

  const costValid = (() => {
    if (!fuelCost.trim()) return false;
    const value = Number(fuelCost);
    return Number.isFinite(value) && value > 0 && value <= 10_000;
  })();

  return (
    <VanRecordCard
      icon={<Fuel className="size-4" aria-hidden />}
      title="Fuel"
      hint="Record a fuel top-up."
      photoLabel="Fuel receipt photo"
      photoHint="Take a clear photo of the fuel receipt."
      online={online}
      fieldsValid={costValid}
      fieldsError={!fuelCost.trim() ? "Enter the fuel cost." : "Enter a valid cost."}
      onSubmit={(photo, onProgress) => submitVanFuel(fuelCost, photo, onProgress).then(() => setFuelCost(""))}
    >
      <Field label="Total cost (£)" required>
        {p => (
          <Input
            {...p}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={fuelCost}
            onChange={e => setFuelCost(e.target.value)}
            placeholder="e.g. 65.00"
          />
        )}
      </Field>
    </VanRecordCard>
  );
}

function ServiceCard({ online }: { online: boolean }) {
  const [serviceType, setServiceType] = useState("");
  const [serviceDate, setServiceDate] = useState("");

  const fieldsValid = Boolean(serviceType && serviceDate);

  return (
    <VanRecordCard
      icon={<Wrench className="size-4" aria-hidden />}
      title="Service"
      hint="Record a service, MOT or repair."
      photoLabel="Invoice/receipt photo"
      photoHint="Take a clear photo of the service invoice or receipt."
      online={online}
      fieldsValid={fieldsValid}
      fieldsError={!serviceType ? "Select the service type." : "Enter the service date."}
      onSubmit={(photo, onProgress) =>
        submitVanService(serviceType, serviceDate, photo, onProgress).then(() => {
          setServiceType("");
          setServiceDate("");
        })
      }
    >
      <Field label="Service type" required>
        {p => (
          <Select {...p} value={serviceType} onChange={e => setServiceType(e.target.value)} placeholder="Select type">
            {SERVICE_TYPES.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Service date" required>
        {p => (
          <Input
            {...p}
            type="date"
            value={serviceDate}
            onChange={e => setServiceDate(e.target.value)}
          />
        )}
      </Field>
    </VanRecordCard>
  );
}

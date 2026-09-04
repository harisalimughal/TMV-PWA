import React, { useState } from "react";
import { Calendar, Camera, CloudOff, FileText, Fuel, ShieldCheck, Truck, Wrench } from "lucide-react";
import type { DriverProfile } from "../api/auth";
import { submitVanFuel, submitVanService } from "../api/van";
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
        <header className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-card bg-brand text-brand-fg">
              <Truck className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h1 className="text-title text-fg">Vehicle Details</h1>
              <p className="mt-1 text-body text-fg-muted">Submit fuel, service and compliance records.</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-card border border-line bg-surface p-3 shadow-xs">
            <div className="grid size-14 shrink-0 place-items-center rounded-card bg-surface-sunken text-brand">
              <Truck className="size-7" aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="text-card text-fg">{driver.vanRegistration || "Van not assigned"}</div>
              <div className="text-body text-fg-muted">Current vehicle</div>
            </div>
          </div>
        </header>

        <FuelCard online={online} />
        <ServiceCard online={online} />
        <ComplianceCard driver={driver} />
      </div>
    </AppShell>
  );
}

function VanRecordCard({
  icon,
  title,
  hint,
  photoLabel,
  photoHint,
  allowUpload = false,
  tone,
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
  allowUpload?: boolean;
  tone: "green" | "blue";
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
        ? `Add a photo for ${title.toLowerCase()}.`
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

  const toneClass = tone === "green" ? "bg-success text-white" : "bg-brand text-brand-fg";
  const busyLabel = progress !== null ? `Uploading ${Math.round(progress * 100)}%` : "Uploading...";

  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface shadow-xs">
      <div className={`flex items-center gap-3 px-4 py-3 ${toneClass}`}>
        <span className="grid size-9 shrink-0 place-items-center rounded-card bg-white/20">{icon}</span>
        <div className="min-w-0">
          <h2 className="text-card">{title}</h2>
          <p className="text-helper opacity-85">{hint}</p>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-4">
        {children}

        <PhotoPicker
          key={photoPickerKey}
          label={photoLabel}
          hint={photoHint}
          min={1}
          max={1}
          onChange={setPhotos}
          allowUpload={allowUpload}
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
    </section>
  );
}

function FuelCard({ online }: { online: boolean }) {
  const [odometerReading, setOdometerReading] = useState("");
  const [fuelCost, setFuelCost] = useState("");

  const odometerValid = (() => {
    if (!odometerReading.trim()) return false;
    const value = Number(odometerReading);
    return Number.isFinite(value) && value >= 0 && value <= 2_000_000;
  })();
  const costValid = (() => {
    if (!fuelCost.trim()) return false;
    const value = Number(fuelCost);
    return Number.isFinite(value) && value > 0 && value <= 10_000;
  })();

  return (
    <VanRecordCard
      icon={<Fuel className="size-4" aria-hidden />}
      title="Add Fuel Entry"
      hint="Record odometer and fuel cost."
      photoLabel="Upload receipt"
      photoHint="Take a clear photo of the fuel receipt."
      tone="green"
      online={online}
      fieldsValid={odometerValid && costValid}
      fieldsError={
        !odometerReading.trim()
          ? "Enter the odometer reading."
          : !odometerValid
            ? "Enter a valid odometer reading."
            : !fuelCost.trim()
              ? "Enter the fuel cost."
              : "Enter a valid fuel cost."
      }
      onSubmit={(photo, onProgress) =>
        submitVanFuel(odometerReading, fuelCost, photo, onProgress).then(() => {
          setOdometerReading("");
          setFuelCost("");
        })
      }
    >
      <Field label="Odometer reading" required>
        {p => (
          <Input
            {...p}
            type="number"
            inputMode="numeric"
            min="0"
            value={odometerReading}
            onChange={e => setOdometerReading(e.target.value)}
            placeholder="e.g. 45231"
          />
        )}
      </Field>
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
  const [serviceMileage, setServiceMileage] = useState("");
  const [serviceDate, setServiceDate] = useState("");
  const [serviceType, setServiceType] = useState("");

  const mileageValid = (() => {
    if (!serviceMileage.trim()) return false;
    const value = Number(serviceMileage);
    return Number.isFinite(value) && value >= 0 && value <= 2_000_000;
  })();
  const fieldsValid = mileageValid && Boolean(serviceDate && serviceType);

  return (
    <VanRecordCard
      icon={<Wrench className="size-4" aria-hidden />}
      title="Record Service"
      hint="Record service mileage, date and type."
      photoLabel="Upload invoice/receipt"
      photoHint="Take a photo or upload the service invoice or receipt."
      allowUpload
      tone="blue"
      online={online}
      fieldsValid={fieldsValid}
      fieldsError={
        !serviceMileage.trim()
          ? "Enter the service mileage."
          : !mileageValid
            ? "Enter a valid service mileage."
            : !serviceDate
              ? "Enter the service date."
              : "Select the service type."
      }
      onSubmit={(photo, onProgress) =>
        submitVanService(serviceMileage, serviceType, serviceDate, photo, onProgress).then(() => {
          setServiceMileage("");
          setServiceDate("");
          setServiceType("");
        })
      }
    >
      <Field label="Service mileage" required>
        {p => (
          <Input
            {...p}
            type="number"
            inputMode="numeric"
            min="0"
            value={serviceMileage}
            onChange={e => setServiceMileage(e.target.value)}
            placeholder="e.g. 45210"
          />
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
      <Field label="Service type" required>
        {p => (
          <Select {...p} value={serviceType} onChange={e => setServiceType(e.target.value)} placeholder="Select type">
            {SERVICE_TYPES.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </Select>
        )}
      </Field>
    </VanRecordCard>
  );
}

function ComplianceCard({ driver }: { driver: DriverProfile }) {
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface shadow-xs">
      <div className="flex items-center gap-3 bg-warning px-4 py-3 text-black">
        <span className="grid size-9 shrink-0 place-items-center rounded-card bg-white/25">
          <ShieldCheck className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-card">Vehicle Compliance</h2>
          <p className="text-helper opacity-80">{driver.vanRegistration || "Current van"}</p>
        </div>
      </div>
      <div className="grid gap-3 p-4">
        <ComplianceRow icon={<Calendar className="size-4" />} label="Road tax renewal" value="Not recorded" />
        <ComplianceRow icon={<Calendar className="size-4" />} label="MOT expiry" value="Not recorded" />
        <ComplianceRow icon={<FileText className="size-4" />} label="Insurance" value="Not recorded" />
      </div>
    </section>
  );
}

function ComplianceRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface-sunken px-3 py-3">
      <div className="flex items-center gap-2 text-body font-semibold text-fg">
        <span className="text-fg-muted">{icon}</span>
        {label}
      </div>
      <span className="text-label font-semibold text-fg-muted">{value}</span>
    </div>
  );
}

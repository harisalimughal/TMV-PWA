/**
 * Liability & checks: the four scenarios administrators know from the live Liability
 * page -- Check In, Check Out, Parking Liability and Liability Reports -- each its own
 * list, on the Aurora design system.
 *
 *   toolbar  Today / Yesterday / Tomorrow / 7 days, date range, driver (every scenario),
 *            search, the four scenarios as a segmented control, Refresh, export
 *   table    Timestamp · Job ID · Driver · reference · Client Name · Pictures ·
 *            Sign here. · Docs (the live columns; Parking keeps its own header names)
 *   preview  every recorded field, photos with time and place, the signature, previous /
 *            next record, Preview PDF and Download PDF
 *
 * Kept from earlier fixes: no impossible "1–0 of 0" range (zero results show an empty
 * state and "0 records"), no second client-side paging of server pages, no guessing of
 * driver identities. The scenario API has no review state, so none is shown, and the
 * live preview's Manager fields and Activity panels are left out: for scenario records
 * they could only ever say "not available".
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, Copy, Download, Eye, ExternalLink, FileText, FolderOpen, Image as ImageIcon, Minus, Plus, Printer, RefreshCw, X } from "lucide-react";
import { fetchScenarios } from "../api";
import type { ScenarioItem } from "../types";
import { useUrlState } from "../hooks/useUrlState";
import { useDriverOptions } from "../hooks/useDriverOptions";
import { DateRangePicker, dateRangeForPreset } from "../components/DateRangePicker";
import { LiabilityConfigModal } from "../components/LiabilityConfigModal";
import { PhotoModal, type PreviewPhoto } from "../components/PhotoModal";
import { PaperScenarioReport } from "../components/PaperScenarioReport";
import { conditionalNoticeApplies, templateFor } from "../reports/documentTemplates";
import { ReportPreviewCanvas } from "../components/ReportPreviewCanvas";
import { ErrorBoundary } from "../../../../components/ErrorBoundary";
import { useDialogFocus } from "../../../../ui/useDialogFocus";
import { PrintPortal } from "../components/PrintPortal";
import { openJob } from "../navigation";
import { resolveDriver } from "../utils/drivers";
import { scenarioPointFromRecord } from "../utils/scenarioPoint";
import { waitForPrintImages } from "../utils/printReady";
import { downloadServerCsv } from "../utils/serverDownload";
import { formatDateTime, formatRange, plural } from "../utils/format";
import { formatLocationLabel, mapsUrlForLocation } from "../../../../lib/geo";
import { Menu } from "../../../../ui/Menu";
import {
  Action, EmptyState, ErrorState, ExportMenu, FilterSelect, LoadingState, Missing, Notice, PageHeader, Pagination, SearchField, Tabs, Toolbar, focusRing, panel, DataTable, type Column
} from "../components/ds";
import { cx } from "../../../../ui/cx";

export type EvidenceKind = "checkin" | "checkout" | "parking" | "liability";
export const EVIDENCE_KINDS: Record<EvidenceKind, { label: string; title: string; reference: string; referenceHint: string; noun: string }> = {
  checkin: { label: "Check In", title: "Storage check-in", reference: "Container No.", referenceHint: "Container the customer's goods were placed in", noun: "check-in" },
  checkout: { label: "Check Out", title: "Storage checkout", reference: "Container No.", referenceHint: "Container the goods were collected from", noun: "checkout" },
  parking: { label: "Parking Liability", title: "Parking liability notice", reference: "Address", referenceHint: "Where the restriction notice applies", noun: "parking liability" },
  liability: { label: "Liability Reports", title: "Liability report", reference: "Damage Report #", referenceHint: "Damage categories the driver selected", noun: "liability report" }
};
/** Parking's live list used its own header names; the other scenarios share one set. */
const HEADERS = (kind: EvidenceKind) => kind === "parking"
  ? { time: "Date Submitted", client: "Full Client Name", pictures: "Parking Restriction Photos", sign: "Signature" }
  : { time: "Timestamp", client: "Client Name", pictures: "Pictures", sign: "Sign here." };

type Row = ScenarioItem & Record<string, any>;

export function evidenceFields(item: Row, kind: EvidenceKind) {
  const raw = (item.rawRecord || item) as Record<string, any>;
  const driver = item.driverName ? { name: item.driverName as string, code: (item.driverInitials as string) || "" } : (() => { const resolved = resolveDriver(item.driver || raw["Driver"], item.driverInitials); return { name: resolved.name, code: resolved.code }; })();
  const reference = kind === "parking" ? item.address || raw["Address"] : kind === "liability" ? item.damageCategories || raw["Damage Categories"] : item.containerNumber || raw["Container Number"];
  const signatureUrl = (item.signature?.thumbUrl || (item.signature as Record<string, any> | undefined)?.url || item.signatureUrl || raw["Signature Url"] || "") as string;
  const photos = (item.photos || []).filter(photo => photo.thumbUrl || (photo as Record<string, any>).fileUrl || (photo as Record<string, any>).driveUrl);
  return {
    at: (item.timestamp || raw["Timestamp"] || raw["Date"] || "") as string,
    jobId: (item.jobId || raw["Job ID"] || "") as string,
    customer: (item.clientName || raw["Client Name"] || raw["Client Full Name"] || "") as string,
    phone: (item.clientPhone || raw["Client Phone"] || "") as string,
    email: (item.clientEmail || raw["Client Email"] || "") as string,
    present: (item.clientPresent || raw["Client Present"] || raw["Client Present At Dropoff"] || "") as string,
    driver, reference: (reference || "") as string,
    photos, photoCount: Array.isArray(item.photos) ? item.photos.length : null,
    signatureUrl, signed: !!(signatureUrl || raw["Signature"]),
    folderUrl: (item.folderUrl || item.driveFolderUrl || "") as string,
    point: scenarioPointFromRecord(item)
  };
}

const photoSrc = (photo: Row["photos"][number]) => photo.thumbUrl || (photo as Record<string, any>).fileUrl || (photo as Record<string, any>).driveUrl || "";

function DriverCell({ name, code }: { name: string; code: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-admin-brand/20 bg-admin-brand-soft text-[11.5px] font-bold text-admin-brand">{code || name.slice(0, 2).toUpperCase()}</span>
      <span className="min-w-0 truncate text-[13.5px] font-semibold text-admin-ink">{name}</span>
    </span>
  );
}

function PictureStack({ item, kind }: { item: Row; kind: EvidenceKind }) {
  const f = evidenceFields(item, kind);
  if (f.photoCount === null) return <Missing />;
  if (!f.photos.length) return <span className="inline-flex items-center gap-1.5 text-[13px] text-admin-ink-2"><ImageIcon aria-hidden className="h-4 w-4" />No photos</span>;
  return (
    <span className="flex items-center gap-2">
      <span className="flex items-center">
        {f.photos.slice(0, 3).map((photo, index) => (
          <img key={photo.fileId || index} src={photoSrc(photo)} alt="" loading="lazy" className={cx("h-9 w-9 rounded-lg border-2 border-surface bg-admin-surface object-cover shadow-sm", index > 0 && "-ml-3")} />
        ))}
        {f.photos.length > 3 && <span className="-ml-3 grid h-9 w-9 place-items-center rounded-lg border-2 border-surface bg-admin-surface text-[12px] font-semibold text-admin-ink-2">+{f.photos.length - 3}</span>}
      </span>
      <span className="text-[13px] text-admin-ink-2">{plural(f.photos.length, "photo")}</span>
    </span>
  );
}

function SignatureCell({ item, kind }: { item: Row; kind: EvidenceKind }) {
  const f = evidenceFields(item, kind);
  if (f.signatureUrl) return <span className="inline-flex items-center"><img src={f.signatureUrl} alt="" className="h-8 w-16 rounded-md border border-admin-line bg-white object-contain p-0.5" /><span className="sr-only">Signed</span></span>;
  if (f.signed) return <span className="text-[13px] font-medium text-admin-ink">Signed</span>;
  return <span className="inline-flex h-8 items-center rounded-md border border-dashed border-admin-line-strong px-2 text-[12.5px] font-medium text-admin-ink-2">Not signed</span>;
}

export function EvidencePage() {
  const today = dateRangeForPreset("today");
  const [state, setState] = useUrlState({ kind: "parking", from: today.from!, to: today.to!, driver: "", q: "", page: "1", record: "" });
  const kind = (Object.keys(EVIDENCE_KINDS).includes(state.kind) ? state.kind : "parking") as EvidenceKind;
  const meta = EVIDENCE_KINDS[kind];
  const headers = HEADERS(kind);
  const page = Math.max(1, Number(state.page) || 1);
  const drivers = useDriverOptions();
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [printItem, setPrintItem] = useState<Row | null>(null);
  const [exportError, setExportError] = useState("");
  const query = useQuery({
    queryKey: ["scenarios", kind, page, state.from, state.to, state.driver],
    queryFn: () => fetchScenarios(kind, page, state.driver || undefined, state.from || undefined, state.to || undefined),
    retry: 1
  });
  const items = (query.data?.items ?? []) as Row[];
  const total = query.data?.pagination.total ?? 0;
  const pageSize = query.data?.pagination.pageSize || 25;
  const needle = state.q.trim().toLowerCase();
  const visible = needle ? items.filter(item => { const f = evidenceFields(item, kind); return [f.customer, f.driver.name, f.driver.code, f.jobId, f.reference, item.id].some(value => (value || "").toLowerCase().includes(needle)); }) : items;
  const selectedIndex = visible.findIndex(item => item.id === state.record);
  const selected = selectedIndex >= 0 ? visible[selectedIndex] : items.find(item => item.id === state.record) ?? null;
  const scope = formatRange(state.from || undefined, state.to || undefined);
  const set = (patch: Partial<typeof state>) => setState({ ...patch, page: patch.page ?? "1" });
  const filtersActive = !!(state.driver || state.q);
  const open = (item: Row) => setState({ record: item.id }, { push: true });

  // Download straight from the list: mount the printable copy, wait for its images, print.
  const download = (item: Row) => {
    setPrintItem(item);
    document.body.classList.add("printing-report");
    window.setTimeout(async () => {
      await waitForPrintImages("#tmv-print-portal, .print-content");
      window.print();
      document.body.classList.remove("printing-report");
      setPrintItem(null);
    }, 300);
  };

  const columns: Column<Row>[] = [
    ...(kind === "parking" ? [{ id: "n", header: "#", width: "52px", align: "center" as const, cell: (item: Row) => <span className="tabular-nums text-admin-ink-2">{(page - 1) * pageSize + items.indexOf(item) + 1}</span> }] : []),
    { id: "time", header: headers.time, width: "150px", cell: item => <span className="tabular-nums text-[13px] text-admin-ink-2">{formatDateTime(evidenceFields(item, kind).at)}</span> },
    { id: "job", header: "Job ID", width: "150px", cell: item => { const f = evidenceFields(item, kind); return (
      <div className="flex flex-col items-start gap-1">
        {f.jobId ? <button type="button" onClick={event => { event.stopPropagation(); open(item); }} aria-label={`Open ${meta.noun} record for job ${f.jobId}`} className={cx("rounded font-mono text-[13px] font-semibold text-admin-brand hover:underline", focusRing)}>{f.jobId}</button>
          : <span className="text-[13px] text-admin-ink-2">Not recorded</span>}
        {f.point && <span title={f.point.full} className="rounded-md border border-admin-brand/20 bg-admin-brand-soft px-1.5 py-0.5 text-[12px] font-semibold uppercase tracking-wide text-admin-brand">{f.point.point}</span>}
      </div>
    ); } },
    { id: "driver", header: "Driver", width: "170px", cell: item => { const f = evidenceFields(item, kind); return <DriverCell name={f.driver.name} code={f.driver.code} />; } },
    { id: "reference", header: <span title={meta.referenceHint}>{meta.reference}</span>, cell: item => {
      const value = evidenceFields(item, kind).reference;
      if (!value) return <span className="text-[13px] text-admin-ink-2">Not recorded</span>;
      if (kind === "liability") {
        const categories = value.split(/[|,]/).map(part => part.trim()).filter(Boolean);
        return <span className="flex max-w-[280px] flex-wrap gap-1.5" title={value}>{categories.slice(0, 3).map(cat => <span key={cat} className="truncate rounded-md border border-admin-line bg-admin-surface px-2 py-0.5 text-[12.5px] font-medium text-admin-ink">{cat}</span>)}{categories.length > 3 && <span className="rounded-md px-1 py-0.5 text-[12.5px] text-admin-ink-2">+{categories.length - 3} more</span>}</span>;
      }
      return <span className={cx("line-clamp-2 break-words text-[13.5px]", kind !== "parking" && "font-mono")} title={value}>{value}</span>;
    } },
    { id: "customer", header: headers.client, cell: item => evidenceFields(item, kind).customer ? <span className="text-[13.5px] font-medium">{evidenceFields(item, kind).customer}</span> : <span className="text-[13px] text-admin-ink-2">Not recorded</span> },
    { id: "pictures", header: headers.pictures, width: "170px", cell: item => <PictureStack item={item} kind={kind} /> },
    { id: "sign", header: headers.sign, width: "110px", cell: item => <SignatureCell item={item} kind={kind} /> },
    { id: "docs", header: "Docs", width: "80px", align: "center", cell: item => {
      const f = evidenceFields(item, kind);
      return (
        <span onClick={event => event.stopPropagation()}>
          <Menu align="end" trigger={props => <button {...props} type="button" aria-label={`Documents for ${meta.noun} ${item.id}`} className={cx("grid h-9 w-9 place-items-center rounded-lg border border-admin-line bg-surface text-admin-ink-2 hover:text-admin-ink", focusRing)}><FileText aria-hidden className="h-4 w-4" /></button>}
            items={[
              { id: "preview", label: "Preview record", icon: <Eye />, onSelect: () => open(item) },
              ...(f.jobId ? [{ id: "job", label: "Open job", icon: <ExternalLink />, onSelect: () => openJob(f.jobId) }] : []),
              { id: "download", label: "Download PDF", icon: <Download />, onSelect: () => download(item) },
              ...(f.folderUrl ? [{ id: "folder", label: "Open Drive folder", icon: <FolderOpen />, onSelect: () => window.open(f.folderUrl, "_blank", "noopener") }] : [])
            ]} />
        </span>
      );
    } }
  ];

  return (
    <>
      <PageHeader title="Liability" scope={<>{meta.label} · {scope} · London time</>}
        actions={<ExportMenu options={[{ id: "csv", label: `CSV — all ${meta.label} records`, scope: "Every record of this scenario (server export; the date, driver and search filters here are not applied).", onSelect: () => { setExportError(""); downloadServerCsv(`/api/admin/scenarios/${kind}/export.csv`, `tmv-${kind}.csv`).catch(error => setExportError((error as Error)?.message || "The export could not be downloaded.")); } }]} />} />
      {exportError && <Notice tone="danger" role="alert" action={<Action size="sm" onClick={() => setExportError("")}>Dismiss</Action>}>{exportError}</Notice>}
      <Toolbar count={query.data ? needle ? `${visible.length} of ${items.length} on this page` : plural(total, "record") : undefined}
        activeFilters={[...(state.driver ? [{ id: "driver", label: `Driver: ${drivers.options.find(option => option.initials === state.driver)?.fullName || state.driver}`, onRemove: () => set({ driver: "" }) }] : []),
          ...(state.q ? [{ id: "q", label: `Search: “${state.q}”`, onRemove: () => set({ q: "" }) }] : [])]}
        onClearFilters={() => set({ driver: "", q: "" })}
        actions={<>
          {kind === "liability" && <Action variant="ghost" onClick={() => setCategoriesOpen(true)}>Manage categories</Action>}
          <Action icon={<RefreshCw className={cx(query.isFetching && "animate-spin motion-reduce:animate-none")} />} aria-label={`Refresh ${meta.label}`} onClick={() => void query.refetch()} />
        </>}>
        <DateRangePicker presets="records" from={state.from || undefined} to={state.to || undefined} onChange={(from, to) => set({ from: from ?? "", to: to ?? "" })} />
        <FilterSelect label="Driver" value={state.driver} onChange={driver => set({ driver })} allLabel={drivers.isLoading ? "Loading drivers…" : "All drivers"} disabled={drivers.isLoading}
          options={drivers.options.map(option => ({ value: option.initials, label: option.fullName || option.initials }))} className="w-[190px]" />
        <SearchField label="Filter the records on this page" placeholder="Search job, client, driver, ref" value={state.q} onChange={q => setState({ q })} className="w-full min-w-[260px] sm:w-[340px]" />
        {/* Phones: a 2 x 2 grid, so all four scenarios stay visible without scrolling. */}
        <Tabs variant="segmented" label="Liability scenarios" idBase="evidence" value={kind} className="max-sm:grid max-sm:w-full max-sm:grid-cols-2" onChange={next => setState({ kind: next, page: "1", q: "", record: "" }, { push: true })}
          tabs={(Object.keys(EVIDENCE_KINDS) as EvidenceKind[]).map(id => ({ id, label: EVIDENCE_KINDS[id].label }))} />
      </Toolbar>
      <div role="tabpanel" id={`evidence-panel-${kind}`} aria-labelledby={`evidence-tab-${kind}`}>
        <section className={cx(panel, "overflow-hidden")} aria-label={`${meta.label} records`}>
          {query.isLoading ? <LoadingState label={`Loading ${meta.label} records`} />
            : query.isError ? <ErrorState title={`Couldn't load ${meta.label} records`} message={(query.error as Error)?.message} onRetry={() => void query.refetch()} />
            : visible.length === 0 ? (
              <EmptyState kind={filtersActive ? "no-matches" : "empty"} title={needle && items.length ? `No records on this page match “${state.q}”` : `No ${meta.noun} records in ${scope}`}
                message={filtersActive ? "Clear filters or widen the date range." : "Widen the date range to see earlier records."}
                actions={<>{filtersActive && <Action onClick={() => set({ driver: "", q: "" })}>Clear filters</Action>}<Action onClick={() => { const range = dateRangeForPreset("month"); set({ from: range.from!, to: range.to! }); }}>Show this month</Action></>} />
            ) : <DataTable rows={visible} columns={columns} keyOf={item => item.id} onOpen={open} openLabel={item => `Open ${meta.noun} record for ${evidenceFields(item, kind).customer || item.id}`}
              caption={`${meta.label} records`} minWidth={kind === "parking" ? 1120 : 1080}
              mobileRow={item => { const f = evidenceFields(item, kind); return (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2"><span className="text-[13px] font-semibold tabular-nums">{formatDateTime(f.at)}</span><SignatureCell item={item} kind={kind} /></div>
                  <p className="truncate font-semibold">{f.customer || "Client not recorded"}</p>
                  <p className="text-[13px] text-admin-ink-2">{f.jobId || "No job linked"}{f.point ? ` · ${f.point.point}` : ""} · {f.driver.name}</p>
                  <p className="break-words text-[13px] text-admin-ink-2">{meta.reference}: {f.reference || "Not recorded"}</p>
                  <PictureStack item={item} kind={kind} />
                </div>
              ); }} />}
          {query.data && total > 0 && <Pagination page={page} pageSize={pageSize} total={total} noun="record" onPage={next => setState({ page: String(next) })} />}
        </section>
      </div>
      {selected && (
        <EvidenceDocumentModal item={selected} kind={kind} onClose={() => setState({ record: "" })}
          onOpenJob={jobId => { setState({ record: "" }); openJob(jobId); }}
          position={selectedIndex >= 0 ? { index: selectedIndex, count: visible.length } : null}
          onStep={step => { const next = visible[selectedIndex + step]; if (next) setState({ record: next.id }); }} />
      )}
      {printItem && !selected && <PrintPortal><PaperScenarioReport item={printItem} kind={kind} isPreview={false} /></PrintPortal>}
      {kind === "liability" && <LiabilityConfigModal isOpen={categoriesOpen} onClose={() => setCategoriesOpen(false)} />}
    </>
  );
}

function Detail({ label, value, hint, mono }: { label: string; value: React.ReactNode; hint?: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12.5px] font-medium text-admin-ink-2">{label}</dt>
      <dd className={cx("mt-0.5 break-words text-[14px] font-medium text-admin-ink", mono && "font-mono")}>{value}</dd>
      {hint && <dd className="mt-0.5 text-[12.5px] text-admin-ink-2">{hint}</dd>}
    </div>
  );
}

const SIGNATURE_LABEL = (signed: boolean, hasImage: boolean) => hasImage ? "Signed" : signed ? "Signed (image unavailable)" : "Not signed";

/** Compact label + value pair for the summary strip under the document header. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0"><dt className="text-[11.5px] font-semibold uppercase tracking-wide text-admin-muted">{label}</dt><dd className="mt-0.5 break-words text-[14px] font-semibold text-admin-ink">{children}</dd></div>;
}

/**
 * A Liability record opens as a centred document: header, summary, then either the
 * record's details or the real PDF (the same component the download prints). Previous /
 * next move through the filtered list. Rendered through a portal with the shared dialog
 * focus stack, so Escape, Tab and focus return behave like every other dialog.
 */
function EvidenceDocumentModal({ item, kind, onClose, onOpenJob, position, onStep }: {
  item: Row; kind: EvidenceKind; onClose: () => void; onOpenJob: (jobId: string) => void; position: { index: number; count: number } | null; onStep: (step: 1 | -1) => void;
}) {
  const meta = EVIDENCE_KINDS[kind];
  const f = evidenceFields(item, kind);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const [view, setView] = useState<"record" | "pdf">("record");
  const [photoIndex, setPhotoIndex] = useState<number | null>(null);
  const [printing, setPrinting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [page, setPage] = useState({ current: 1, total: 1 });
  const scroller = useRef<HTMLDivElement>(null);
  useDialogFocus(true, panelRef, onClose);
  // A different record starts on its details, at normal zoom: nothing carries over.
  useEffect(() => { setView("record"); setPhotoIndex(null); setZoom(100); setCopied(false); }, [item.id]);

  const photos: PreviewPhoto[] = f.photos.map((photo, index) => ({
    id: photo.fileId || String(index), title: `${meta.label} photo ${index + 1}`, url: photoSrc(photo),
    caption: <>{photo.capturedAt ? `Taken ${formatDateTime(photo.capturedAt)}` : "Capture time not recorded"} · {photo.location ? <a className="text-admin-brand underline" target="_blank" rel="noreferrer" href={mapsUrlForLocation(photo.location)}>{formatLocationLabel(photo.location, photo.locationName)}</a> : "Location not recorded"}</>
  }));
  const print = () => {
    setPrinting(true);
    document.body.classList.add("printing-report");
    window.setTimeout(async () => {
      await waitForPrintImages("#tmv-print-portal, .print-content");
      window.print();
      document.body.classList.remove("printing-report");
      setPrinting(false);
    }, 300);
  };
  const where = (location?: { lat: number; lng: number; accuracy: number }, name?: string) => location
    ? <a className="text-admin-brand underline-offset-2 hover:underline" target="_blank" rel="noreferrer" href={mapsUrlForLocation(location)}>{formatLocationLabel(location, name)}</a> : "Location not recorded";

  const pages = () => Array.from(scroller.current?.querySelectorAll<HTMLElement>(".report-preview-page") ?? []);
  const measurePages = () => {
    const list = pages(), host = scroller.current;
    if (!host || !list.length) return;
    const top = host.getBoundingClientRect().top;
    let current = 0;
    list.forEach((node, index) => { if (node.getBoundingClientRect().top - top <= host.clientHeight * 0.35) current = index; });
    setPage(previous => previous.current === current + 1 && previous.total === list.length ? previous : { current: current + 1, total: list.length });
  };
  useLayoutEffect(() => { if (view === "pdf") measurePages(); }, [view, zoom, item.id]);
  const goToPage = (index: number) => { const list = pages(); list[Math.max(0, Math.min(list.length - 1, index))]?.scrollIntoView({ block: "start", behavior: "smooth" }); };
  const signatureState = SIGNATURE_LABEL(f.signed, !!f.signatureUrl);
  const template = templateFor(kind);
  const wording = [
    template?.notice,
    template && conditionalNoticeApplies(template, f.reference) ? template.conditionalNotice : undefined,
    template?.declaration ? { title: "Client declaration", text: template.declaration } : undefined
  ].filter(Boolean) as Array<{ title: string; text: string }>;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-stretch justify-center sm:items-center sm:p-6">
      <div className="tmv-drawer-scrim absolute inset-0 animate-in fade-in motion-reduce:animate-none" aria-hidden="true" onMouseDown={onClose} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} data-testid="evidence-document"
        className="relative flex h-full w-full flex-col overflow-hidden bg-surface outline-none animate-in fade-in zoom-in-95 motion-reduce:animate-none sm:h-auto sm:max-h-[min(92vh,880px)] sm:max-w-[min(1060px,100%)] sm:rounded-2xl sm:border sm:border-admin-line sm:shadow-2xl">
        <header className="flex items-start gap-3 border-b border-admin-line px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 sm:pt-4">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-[12.5px] font-semibold text-admin-brand">
              {meta.label}
              {f.point && <span className="rounded-md border border-admin-brand/20 bg-admin-brand-soft px-1.5 py-0.5 text-[11.5px] uppercase tracking-wide">{f.point.point}</span>}
            </p>
            <h2 id={titleId} className="mt-0.5 break-words text-[20px] font-bold leading-7 tracking-tight text-admin-ink">{f.customer || "Client not recorded"}</h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-admin-ink-2">
              <span className="tabular-nums">{formatDateTime(f.at)}</span><span aria-hidden>·</span>
              <span>Record <span className="font-mono">{item.id}</span></span>
              <button type="button" aria-label="Copy record reference" onClick={() => { void navigator.clipboard?.writeText(item.id); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }}
                className={cx("inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[12.5px] font-medium text-admin-ink-2 hover:bg-admin-surface hover:text-admin-ink", focusRing)}>
                {copied ? <Check aria-hidden className="h-3.5 w-3.5 text-admin-status-green" /> : <Copy aria-hidden className="h-3.5 w-3.5" />}<span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
              </button>
            </p>
          </div>
          {position && (
            <span role="group" aria-label="Record navigation" className="hidden items-center gap-1 sm:flex">
              <button type="button" aria-label="Previous record" disabled={position.index <= 0} onClick={() => onStep(-1)} className={cx("grid h-9 w-9 place-items-center rounded-lg border border-admin-line text-admin-ink-2 hover:bg-admin-surface disabled:opacity-40", focusRing)}><ChevronLeft aria-hidden className="h-4 w-4" /></button>
              <span className="px-1 text-[12.5px] tabular-nums text-admin-ink-2" aria-live="polite">{position.index + 1} of {position.count}</span>
              <button type="button" aria-label="Next record" disabled={position.index >= position.count - 1} onClick={() => onStep(1)} className={cx("grid h-9 w-9 place-items-center rounded-lg border border-admin-line text-admin-ink-2 hover:bg-admin-surface disabled:opacity-40", focusRing)}><ChevronRight aria-hidden className="h-4 w-4" /></button>
            </span>
          )}
          <button type="button" aria-label="Close" onClick={onClose} className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-lg text-admin-ink-2 hover:bg-admin-surface hover:text-admin-ink", focusRing)}><X aria-hidden className="h-5 w-5" /></button>
        </header>

        <div className="border-b border-admin-line px-4 py-3 sm:px-6">
          <dl className={cx("grid-cols-2 gap-x-5 gap-y-3 md:grid-cols-3 lg:grid-cols-6", view === "pdf" ? "hidden sm:grid" : "grid")} aria-label="Record summary">
            <Fact label="Customer">{f.customer || <Missing>Not recorded</Missing>}</Fact>
            <Fact label="Driver">{f.driver.name}{f.driver.code ? ` (${f.driver.code})` : ""}</Fact>
            <Fact label="Job">{f.jobId ? <span className="font-mono text-[13px]">{f.jobId}</span> : <Missing>No job linked</Missing>}</Fact>
            <Fact label="Submitted"><span className="tabular-nums">{formatDateTime(f.at)}</span></Fact>
            <Fact label="Location">{f.point?.point || <Missing>Not recorded</Missing>}</Fact>
            <Fact label="Signature">{signatureState}</Fact>
          </dl>
          <div role="group" aria-label="Document view" className="mt-3 inline-flex rounded-xl border border-admin-line p-0.5">
            {([["record", "Record details"], ["pdf", "PDF preview"]] as const).map(([id, label]) => (
              <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)}
                className={cx("rounded-[10px] px-3.5 py-1.5 text-[13.5px] font-semibold", focusRing, view === id ? "bg-admin-brand-soft text-admin-brand" : "text-admin-ink-2 hover:text-admin-ink")}>{label}</button>
            ))}
          </div>
        </div>

        {view === "pdf" && (
          <div role="toolbar" aria-label="PDF controls" className="flex flex-wrap items-center gap-2 border-b border-admin-line bg-white px-4 py-2 sm:px-6">
            <button type="button" aria-label="Previous page" disabled={page.current <= 1} onClick={() => goToPage(page.current - 2)} className={cx("grid h-8 w-8 place-items-center rounded-lg border border-admin-line disabled:opacity-40", focusRing)}><ChevronLeft aria-hidden className="h-4 w-4" /></button>
            <span className="text-[13px] tabular-nums text-admin-ink-2" aria-live="polite">Page {page.current} of {page.total}</span>
            <button type="button" aria-label="Next page" disabled={page.current >= page.total} onClick={() => goToPage(page.current)} className={cx("grid h-8 w-8 place-items-center rounded-lg border border-admin-line disabled:opacity-40", focusRing)}><ChevronRight aria-hidden className="h-4 w-4" /></button>
            <span aria-hidden className="mx-1 hidden h-5 w-px bg-admin-line sm:block" />
            <button type="button" aria-label="Zoom out" disabled={zoom <= 50} onClick={() => setZoom(value => Math.max(50, value - 25))} className={cx("grid h-8 w-8 place-items-center rounded-lg border border-admin-line disabled:opacity-40", focusRing)}><Minus aria-hidden className="h-4 w-4" /></button>
            <span className="w-12 text-center text-[13px] tabular-nums" aria-live="polite">{zoom}%</span>
            <button type="button" aria-label="Zoom in" disabled={zoom >= 200} onClick={() => setZoom(value => Math.min(200, value + 25))} className={cx("grid h-8 w-8 place-items-center rounded-lg border border-admin-line disabled:opacity-40", focusRing)}><Plus aria-hidden className="h-4 w-4" /></button>
            <button type="button" onClick={() => setZoom(100)} className={cx("h-8 rounded-lg border border-admin-line px-2.5 text-[13px] font-medium", focusRing)}>Fit to width</button>
            <span className="flex-1" />
            <button type="button" aria-label="Print" onClick={print} className={cx("grid h-8 w-8 place-items-center rounded-lg border border-admin-line", focusRing)}><Printer aria-hidden className="h-4 w-4" /></button>
          </div>
        )}

        <div ref={scroller} onScroll={view === "pdf" ? measurePages : undefined} tabIndex={0} aria-label={view === "pdf" ? "PDF preview" : "Record details"}
          className={cx("min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-6", view === "pdf" ? "bg-admin-surface" : "bg-admin-surface/50")}>
          {view === "pdf" ? (
            <ErrorBoundary fallback={<Notice tone="danger" title="The document could not be generated">Close the preview and try again. The record itself is unchanged.</Notice>}>
              <div className={zoom > 100 ? "min-w-max" : undefined}><ReportPreviewCanvas zoom={zoom}><PaperScenarioReport item={item} kind={kind} isPreview /></ReportPreviewCanvas></div>
            </ErrorBoundary>
          ) : (
            <div className="space-y-4">
              <section className={cx(panel, "p-4")} aria-labelledby="evidence-details-title">
                <h3 id="evidence-details-title" className="mb-3 text-[15px] font-semibold">Customer & details</h3>
                <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Detail label="Client name" value={f.customer || <Missing />} />
                  <Detail label="Client present" value={f.present || <Missing />} />
                  {f.phone && <Detail label="Client phone" value={<a className="text-admin-brand hover:underline" href={`tel:${f.phone}`}>{f.phone}</a>} />}
                  {f.email && <Detail label="Client email" value={<a className="break-all text-admin-brand hover:underline" href={`mailto:${f.email}`}>{f.email}</a>} />}
                  <Detail label={meta.reference} value={f.reference || <Missing />} hint={meta.referenceHint} mono={kind === "checkin" || kind === "checkout"} />
                  <Detail label="Reported at" value={f.point?.full || <Missing />} />
                  <Detail label="Job ID" value={f.jobId || <Missing>No job linked</Missing>} mono />
                  <Detail label="Driver" value={`${f.driver.name}${f.driver.code ? ` (${f.driver.code})` : ""}`} />
                  <Detail label="Submitted" value={formatDateTime(f.at)} hint="London time, from the submission" />
                  <Detail label="Reference" value={item.id} mono />
                </dl>
              </section>
              <section className={cx(panel, "p-4")} aria-labelledby="evidence-photos-title">
                <h3 id="evidence-photos-title" className="mb-3 text-[15px] font-semibold">Photos for evidence ({photos.length})</h3>
                {photos.length ? (
                  <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {f.photos.map((photo, index) => (
                      <li key={photos[index].id} className="min-w-0">
                        <button type="button" onClick={() => setPhotoIndex(index)} aria-label={`Preview ${photos[index].title}`} className={cx("block w-full overflow-hidden rounded-xl border border-admin-line bg-admin-surface", focusRing)}>
                          <img src={photos[index].url} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
                        </button>
                        <p className="mt-1.5 text-[12.5px] tabular-nums text-admin-ink-2">{photo.capturedAt ? formatDateTime(photo.capturedAt) : "Time not recorded"}</p>
                        <p className="truncate text-[12.5px]">{where(photo.location, photo.locationName)}</p>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-[14px] text-admin-ink-2">No photos attached.</p>}
              </section>
              {wording.length > 0 && (
                <section className={cx(panel, "p-4")} aria-labelledby="evidence-wording-title">
                  <h3 id="evidence-wording-title" className="mb-1 text-[15px] font-semibold">Signed wording</h3>
                  <p className="mb-3 text-[12.5px] text-admin-ink-2">Current approved wording, as shown to the customer in the driver app. The version stored at the moment of signing is not available for this record.</p>
                  <div className="space-y-3 rounded-xl bg-admin-surface/70 p-3.5">
                    {wording.map(block => (
                      <div key={block.title}>
                        <p className="text-[14px] font-semibold text-admin-ink">{block.title}</p>
                        <p className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed text-admin-ink">{block.text}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              <section className={cx(panel, "p-4")} aria-labelledby="evidence-signature-title">
                <h3 id="evidence-signature-title" className="mb-3 text-[15px] font-semibold">Client signature</h3>
                {f.signatureUrl ? (
                  <div className="flex flex-wrap items-end gap-4">
                    <img src={f.signatureUrl} alt="Client signature" className="h-28 w-56 rounded-xl border border-admin-line bg-white object-contain p-2" />
                    <div className="space-y-0.5 text-[13px] text-admin-ink-2">
                      <p>Signed {item.signature?.capturedAt ? formatDateTime(item.signature.capturedAt) : "(time not recorded)"}</p>
                      <p>{where(item.signature?.location, item.signature?.locationName)}</p>
                    </div>
                  </div>
                ) : <Missing>{f.signed ? "Signed, but the image isn't available" : "Not signed"}</Missing>}
              </section>
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-admin-line bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <Action variant="primary" icon={<Download />} loading={printing} onClick={print}>Download PDF</Action>
            <Action icon={<Eye />} onClick={() => setView(view === "pdf" ? "record" : "pdf")}>{view === "pdf" ? "Record details" : "Preview PDF"}</Action>
          </div>
          <div className="flex items-center gap-2">
            {position && (
              <span className="flex items-center gap-1 sm:hidden">
                <button type="button" aria-label="Previous record" disabled={position.index <= 0} onClick={() => onStep(-1)} className={cx("grid h-10 w-10 place-items-center rounded-lg border border-admin-line disabled:opacity-40", focusRing)}><ChevronLeft aria-hidden className="h-4 w-4" /></button>
                <button type="button" aria-label="Next record" disabled={position.index >= position.count - 1} onClick={() => onStep(1)} className={cx("grid h-10 w-10 place-items-center rounded-lg border border-admin-line disabled:opacity-40", focusRing)}><ChevronRight aria-hidden className="h-4 w-4" /></button>
              </span>
            )}
            {f.jobId && <Action icon={<ExternalLink />} onClick={() => onOpenJob(f.jobId)}>Open job</Action>}
          </div>
        </footer>
      </div>
      <PhotoModal isOpen={photoIndex !== null} onClose={() => setPhotoIndex(null)} photos={photos} index={photoIndex ?? 0} onIndex={setPhotoIndex} />
      <PrintPortal><PaperScenarioReport item={item} kind={kind} isPreview={false} /></PrintPortal>
    </div>,
    document.body
  );
}

import React, { useState } from "react";
import { Bell, LogOut, Plus, RefreshCw, Search, Trash2, Truck, User } from "lucide-react";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  KeyValue,
  Menu,
  Modal,
  PageHeader,
  ProgressBar,
  Radio,
  Section,
  SegmentedControl,
  Select,
  Skeleton,
  Spinner,
  StatusBadge,
  Switch,
  Textarea,
  Tooltip,
  useTheme
} from "..";
import type { ThemePreference } from "..";

/**
 * DEV-only visual reference for the design-system primitives. Reachable at
 * `/?ui=gallery` (gated in App.tsx by import.meta.env.DEV). Not shipped.
 */

const THEMES: ThemePreference[] = ["light", "dark", "system"];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-4 items-center py-2 border-b border-line last:border-0">
      <span className="text-[12px] font-medium text-fg-subtle">{label}</span>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="text-title text-fg mb-2">{title}</h2>
      <Card>{children}</Card>
    </section>
  );
}

export default function Gallery() {
  const { preference, resolved, setPreference } = useTheme();
  const [seg, setSeg] = useState("standard");
  const [checked, setChecked] = useState(true);
  const [radio, setRadio] = useState("card");
  const [sw, setSw] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-line bg-surface/90 px-6 py-3 backdrop-blur">
        <div>
          <h1 className="text-heading font-semibold">UI primitives</h1>
          <p className="text-[12px] text-fg-subtle">
            resolved: <span className="font-mono">{resolved}</span>
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-control border border-line p-0.5">
          {THEMES.map(t => (
            <button
              key={t}
              onClick={() => setPreference(t)}
              className={
                "h-8 rounded-[6px] px-3 text-[13px] font-medium capitalize transition " +
                (preference === t ? "bg-brand text-brand-fg" : "text-fg-muted hover:bg-surface-sunken")
              }
            >
              {t}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-8 p-6">
        <Group title="Button">
          <Row label="variant">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger" iconLeft={<Trash2 />}>
              Delete
            </Button>
          </Row>
          <Row label="size">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
          </Row>
          <Row label="state">
            <Button loading>Saving</Button>
            <Button disabled>Disabled</Button>
            <Button blockedReason="Add a photo first" onBlocked={r => console.info("[blocked]", r)}>
              Blocked
            </Button>
            <Button iconLeft={<Plus />}>With icon</Button>
          </Row>
        </Group>

        <Group title="IconButton">
          <Row label="variant">
            <IconButton aria-label="Refresh" icon={<RefreshCw />} />
            <IconButton aria-label="Notifications" variant="subtle" icon={<Bell />} />
            <IconButton aria-label="Loading" icon={<RefreshCw />} loading />
          </Row>
        </Group>

        <Group title="Badge / StatusBadge">
          <Row label="tone">
            <Badge tone="neutral">Draft</Badge>
            <Badge tone="brand">Brand</Badge>
            <Badge tone="success" dot>
              Active
            </Badge>
            <Badge tone="warning">Attention</Badge>
            <Badge tone="danger">Failed</Badge>
            <Badge tone="info" dot>
              In progress
            </Badge>
          </Row>
          <Row label="job status">
            <StatusBadge kind="job" status="READY" />
            <StatusBadge kind="job" status="IN_PROGRESS" />
            <StatusBadge kind="job" status="COMPLETED" />
            <StatusBadge kind="job" status="CANCELLED" />
          </Row>
        </Group>

        <Group title="Form controls">
          <div className="flex flex-col gap-4">
            <Field label="Email" hint="We'll only use this to sign you in.">
              {p => <Input type="email" placeholder="you@themanvan.co.uk" prefix={<User />} {...p} />}
            </Field>
            <Field label="Total charged" required>
              {p => <Input inputMode="decimal" placeholder="0.00" prefix="£" {...p} />}
            </Field>
            <Field label="Payment method" error="Choose how the customer is paying.">
              {p => (
                <Select placeholder="Select a method" defaultValue="" {...p}>
                  <option value="card">Card</option>
                  <option value="cash">Cash</option>
                  <option value="bank">Bank transfer</option>
                </Select>
              )}
            </Field>
            <Field label="Notes">{p => <Textarea placeholder="Anything the office should know" {...p} />}</Field>
          </div>
        </Group>

        <Group title="Choices">
          <Row label="checkbox">
            <Checkbox label="Fragile items" checked={checked} onChange={e => setChecked(e.target.checked)} />
            <Checkbox label="Indeterminate" indeterminate readOnly />
            <Checkbox label="Disabled" disabled />
          </Row>
          <Row label="radio">
            <Radio name="g" label="Card view" checked={radio === "card"} onChange={() => setRadio("card")} />
            <Radio name="g" label="Table view" checked={radio === "table"} onChange={() => setRadio("table")} />
          </Row>
          <Row label="segmented">
            <SegmentedControl
              aria-label="Device size"
              value={seg}
              onChange={setSeg}
              options={[
                { value: "compact", label: "Compact" },
                { value: "standard", label: "Standard" },
                { value: "large", label: "Large" }
              ]}
            />
          </Row>
          <Row label="switch">
            <Switch checked={sw} onChange={setSw} aria-label="Notifications" />
          </Row>
        </Group>

        <Group title="ProgressBar / KeyValue / Avatar">
          <div className="flex flex-col gap-4">
            <ProgressBar value={0.62} aria-label="Upload" />
            <KeyValue
              rows={[
                { label: "Total charged", value: "£312.00", numeric: true },
                { label: "Payment", value: "Card" },
                { label: "Signed by", value: "Priya Shah" }
              ]}
            />
            <div className="flex items-center gap-2">
              <Avatar name="Sam Driver" />
              <Avatar name="Priya Shah" />
              <Avatar name="Tom Fletcher" size="lg" />
            </div>
          </div>
        </Group>

        <Group title="Alert">
          <div className="flex flex-col gap-3">
            <Alert tone="info" title="Heads up">
              This job is booked for Saturday, not today.
            </Alert>
            <Alert tone="warning" title="You're offline">
              This form is saved on the phone and sends when you're back online.
            </Alert>
            <Alert
              tone="danger"
              title="Couldn't submit"
              action={
                <Button size="sm" variant="secondary">
                  Retry
                </Button>
              }
            >
              Nothing was saved. It's safe to try again.
            </Alert>
          </div>
        </Group>

        <Group title="Skeleton">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Skeleton.Circle />
              <div className="flex-1 space-y-2">
                <Skeleton.Text className="w-1/3" />
                <Skeleton.Text className="w-2/3" />
              </div>
            </div>
            <Skeleton.Block />
          </div>
        </Group>

        <Group title="Section + EmptyState">
          <Section title="Needs finishing" tone="warning" aside={<Badge tone="neutral">2</Badge>}>
            <EmptyState
              icon={<Truck />}
              title="Nothing assigned yet"
              description="Your next job appears here as soon as the office dispatches it."
              action={<Button size="sm">Check again</Button>}
            />
          </Section>
        </Group>

        <Group title="PageHeader">
          <div className="rounded-control border border-line bg-surface px-3 py-2">
            <PageHeader
              title="Priya Shah"
              subtitle="Job 10231"
              onBack={() => {}}
              backLabel="Back to jobs"
              actions={<IconButton aria-label="Search" icon={<Search />} size="sm" />}
            />
          </div>
        </Group>

        <Group title="Overlays">
          <Row label="triggers">
            <Button variant="secondary" onClick={() => setModalOpen(true)}>
              Open modal
            </Button>
            <Button variant="secondary" onClick={() => setConfirmOpen(true)}>
              Confirm dialog
            </Button>
            <Menu
              trigger={p => (
                <button
                  ref={p.ref}
                  onClick={p.onClick}
                  aria-expanded={p["aria-expanded"]}
                  aria-haspopup={p["aria-haspopup"]}
                  id={p.id}
                  className="inline-flex h-10 items-center gap-2 rounded-control border border-line bg-surface px-4 text-[14px] font-semibold"
                >
                  <Avatar name="Sam Driver" size="sm" />
                  Account
                </button>
              )}
              header={
                <div>
                  <p className="text-[14px] font-semibold text-fg">Sam Driver</p>
                  <p className="text-[12px] text-fg-subtle">sam.driver@themanvan.co.uk</p>
                </div>
              }
              items={[
                { id: "profile", label: "Profile", icon: <User />, onSelect: () => {} },
                { id: "logout", label: "Log out", icon: <LogOut />, tone: "danger", onSelect: () => {} }
              ]}
            />
            <Tooltip label="Refresh jobs">
              <IconButton aria-label="Refresh jobs" icon={<RefreshCw />} />
            </Tooltip>
          </Row>
        </Group>

        <Group title="Spinner">
          <Row label="size">
            <Spinner size="sm" />
            <Spinner size="md" />
            <Spinner size="lg" />
          </Row>
        </Group>
      </main>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Customer sign-off"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setModalOpen(false)}>Confirm &amp; continue</Button>
          </div>
        }
      >
        <p className="text-[14px] leading-relaxed text-fg-muted">
          Hand the phone to the customer to review the confirmation and sign.
        </p>
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => new Promise(r => setTimeout(r, 600))}
        title="Log out?"
        body="Anything saved on this phone but not yet sent will stay queued."
        confirmLabel="Log out"
        cancelLabel="Stay signed in"
        tone="danger"
      />
    </div>
  );
}

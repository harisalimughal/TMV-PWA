import React from "react";
import { Compass, Plus, Share, SquarePlus } from "lucide-react";
import { Alert, Modal } from "../../../ui";

interface IosInstallSheetProps {
  open: boolean;
  onClose: () => void;
  /** Running inside a non-Safari iOS browser or an in-app web view. */
  inAppOrOtherBrowser: boolean;
}

interface Step {
  icon: React.ReactNode;
  text: React.ReactNode;
}

const STEPS: Step[] = [
  {
    icon: <Compass aria-hidden />,
    text: (
      <>
        Open this page in <strong className="font-semibold text-fg">Safari</strong>
      </>
    ),
  },
  {
    icon: <Share aria-hidden />,
    text: (
      <>
        Tap the <strong className="font-semibold text-fg">Share</strong> icon
      </>
    ),
  },
  {
    icon: <SquarePlus aria-hidden />,
    text: (
      <>
        Scroll and tap{" "}
        <strong className="font-semibold text-fg">Add to Home Screen</strong>
      </>
    ),
  },
  {
    icon: <Plus aria-hidden />,
    text: (
      <>
        Tap <strong className="font-semibold text-fg">Add</strong>
      </>
    ),
  },
];

/**
 * iOS/iPadOS install instructions. iOS exposes no `beforeinstallprompt`, so this is
 * guidance only — it does not pretend to trigger a native prompt.
 *
 * Renders as a bottom sheet on phones (Modal is `items-end` under `sm`) and a centred
 * dialog on larger screens; Modal handles focus trap, Esc and scroll lock.
 */
export function IosInstallSheet({
  open,
  onClose,
  inAppOrOtherBrowser,
}: IosInstallSheetProps) {
  return (
    <Modal open={open} onClose={onClose} title="Install TMV BOT on iPhone" size="sm">
      <div className="flex flex-col gap-4">
        {inAppOrOtherBrowser && (
          <Alert tone="warning" title="Open in Safari first">
            This page is open in another browser or an in-app view. Home Screen
            install only works from <strong className="font-semibold">Safari</strong>
            {" "}— open{" "}
            <span className="font-mono text-[12px]">chat.themanvan.co.uk</span> there,
            then follow the steps below.
          </Alert>
        )}

        <ol className="flex flex-col gap-3">
          {STEPS.map((step, i) => (
            <li key={i} className="flex items-center gap-3">
              <span
                className="grid size-9 shrink-0 place-items-center rounded-card border border-line bg-surface-sunken text-fg-muted [&_svg]:size-[18px]"
                aria-hidden
              >
                {step.icon}
              </span>
              <span className="flex items-baseline gap-2 text-body text-fg-muted">
                <span
                  className="text-meta font-semibold text-fg-subtle tabular-nums"
                  aria-hidden
                >
                  {i + 1}
                </span>
                <span>{step.text}</span>
              </span>
            </li>
          ))}
        </ol>

        <p className="text-helper text-fg-subtle">
          Once added, open TMV BOT from your Home Screen and it runs full-screen like
          a native app.
        </p>
      </div>
    </Modal>
  );
}

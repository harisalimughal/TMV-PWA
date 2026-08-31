/**
 * Driver-app domain components — compositions of the src/ui primitives that carry
 * The Man Van workflow knowledge (jobs, steps, storage, issues). Screen files
 * import from here; the primitives stay generic in src/ui.
 */

export { AppHeader } from "./AppHeader";
export type { AppHeaderProps } from "./AppHeader";

export { MobileHeader } from "./MobileHeader";
export type { MobileHeaderProps } from "./MobileHeader";

export { BottomNav } from "./BottomNav";
export type { BottomNavProps, TabId } from "./BottomNav";

export { DesktopSidebar } from "./DesktopSidebar";
export type { DesktopSidebarProps } from "./DesktopSidebar";

export { ThemeToggle, ThemeToggleButton } from "./ThemeToggle";

export { ProfileMenu } from "./ProfileMenu";
export type { ProfileMenuProps } from "./ProfileMenu";

export { FeaturedJobCard } from "./FeaturedJobCard";
export type { FeaturedJobCardProps } from "./FeaturedJobCard";

export { JobRoute } from "./JobRoute";
export type { JobRouteProps } from "./JobRoute";

export { JobTime } from "./JobTime";
export type { JobTimeProps } from "./JobTime";

export { JobHeader } from "./JobHeader";
export type { JobHeaderProps } from "./JobHeader";

export { JobProgress } from "./JobProgress";
export type { JobProgressProps } from "./JobProgress";

export { ScheduleSection } from "./ScheduleSection";
export type { ScheduleSectionProps } from "./ScheduleSection";

export { ScheduleRow, ScheduleRowSkeleton } from "./ScheduleRow";
export type { ScheduleRowProps } from "./ScheduleRow";

export { StatusIndicator, JobStatusChip, jobStatusMeta } from "./JobStatusChip";
export type { StatusIndicatorProps, JobStatusChipProps, JobBucket } from "./JobStatusChip";

export { WarningNotice } from "./WarningNotice";
export type { WarningNoticeProps } from "./WarningNotice";

export { RouteCard } from "./RouteCard";
export type { RouteCardProps } from "./RouteCard";

export { StorageActions } from "./StorageActions";
export type { StorageActionsProps } from "./StorageActions";

export { IssueDecision } from "./IssueDecision";
export type { IssueDecisionProps } from "./IssueDecision";

export { IssueChoiceCard } from "./IssueChoiceCard";
export type { IssueChoiceCardProps } from "./IssueChoiceCard";

export { CompletionSummary } from "./CompletionSummary";
export type { CompletionSummaryProps } from "./CompletionSummary";

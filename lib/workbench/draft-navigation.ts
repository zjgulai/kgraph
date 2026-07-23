import type { WorkbenchView } from './routes';

export type WorkbenchDirtyRegistry = Partial<Record<WorkbenchView, boolean>>;

export function shouldBlockWorkbenchNavigation(
  currentView: WorkbenchView,
  nextView: WorkbenchView,
  registry: WorkbenchDirtyRegistry,
  skipGuard = false,
): boolean {
  return !skipGuard && currentView !== nextView && registry[currentView] === true;
}

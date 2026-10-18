import { createPreviewServer, type PreviewServer } from "./server";

let instance: PreviewServer | null = null;
/** One shared in-memory server per page load, so Preview mode and the mock API show the same sample board. */
export function getPreviewServer(): PreviewServer { return (instance ??= createPreviewServer()); }
/** For tests. */
export function resetPreviewServer(now?: () => Date) { instance = createPreviewServer(now); return instance; }

/**
 * Installs the dev mock API by patching `window.fetch` and `window.XMLHttpRequest` so
 * every `/api/...` request is answered from the in-memory store in handlers.ts.
 *
 * DEV ONLY. The single call site in main.tsx is guarded by `import.meta.env.DEV` and a
 * dynamic `import()`, so this whole `src/mocks/` tree is excluded from `vite build`.
 *
 * Non-`/api/` traffic (HMR, assets, anything else) is passed straight through to the
 * real implementations, which are captured here before patching.
 */
import { handle } from "./handlers";

const NativeXHR = window.XMLHttpRequest;
const nativeFetch = window.fetch.bind(window);

/** Small latency so skeletons / spinners / progress bars are actually visible. */
const MOCK_LATENCY_MS = 140;
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function pathOf(url: string): string {
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return url;
  }
}

async function mockFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = (
    init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")
  ).toUpperCase();
  const path = pathOf(url);

  if (!path.startsWith("/api/")) return nativeFetch(input as RequestInfo, init);

  const bodyText = typeof init?.body === "string" ? init.body : undefined;
  await wait(MOCK_LATENCY_MS);
  const res = handle(method, path, bodyText);
  if (!res) return nativeFetch(input as RequestInfo, init);

  return new Response(JSON.stringify(res.body), {
    status: res.status,
    headers: { "Content-Type": "application/json" }
  });
}

type ProgressListener = (event: { lengthComputable: boolean; loaded: number; total: number }) => void;

/**
 * Just enough of XMLHttpRequest for lib/http.ts's `uploadWithProgress` (the only XHR
 * user in the driver app). Non-`/api/` URLs delegate to a real XMLHttpRequest.
 */
class MockXHR {
  upload: { onprogress: ProgressListener | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onreadystatechange: (() => void) | null = null;
  status = 0;
  responseText = "";
  response: unknown = "";
  readyState = 0;
  withCredentials = false;
  timeout = 0;
  responseType = "";

  private method = "GET";
  private path = "";
  private native: XMLHttpRequest | null = null;

  open(method: string, url: string, async = true): void {
    this.method = method.toUpperCase();
    this.path = pathOf(url);
    this.readyState = 1;
    if (!this.path.startsWith("/api/")) {
      this.native = new NativeXHR();
      this.native.open(method, url, async);
    }
  }

  setRequestHeader(name: string, value: string): void {
    this.native?.setRequestHeader(name, value);
  }

  getAllResponseHeaders(): string {
    return this.native?.getAllResponseHeaders() ?? "";
  }

  abort(): void {
    this.native?.abort();
  }

  addEventListener(): void {}
  removeEventListener(): void {}

  send(body?: Document | XMLHttpRequestBodyInit | null): void {
    if (this.native) {
      const n = this.native;
      n.withCredentials = this.withCredentials;
      n.timeout = this.timeout;
      if (this.upload.onprogress) n.upload.onprogress = this.upload.onprogress as never;
      n.onload = () => {
        this.status = n.status;
        this.responseText = n.responseText;
        this.response = n.response;
        this.readyState = n.readyState;
        this.onload?.();
      };
      n.onerror = () => this.onerror?.();
      n.ontimeout = () => this.ontimeout?.();
      n.send(body ?? null);
      return;
    }
    void this.respondFromMock();
  }

  private async respondFromMock(): Promise<void> {
    const total = 1_000;
    await wait(40);
    this.upload.onprogress?.({ lengthComputable: true, loaded: 350, total });
    await wait(70);
    this.upload.onprogress?.({ lengthComputable: true, loaded: total, total });
    await wait(MOCK_LATENCY_MS);

    const res = handle(this.method, this.path) ?? {
      status: 404,
      body: { error: { code: "NOT_FOUND", message: "no mock handler" } }
    };
    this.status = res.status;
    this.responseText = JSON.stringify(res.body);
    this.response = this.responseText;
    this.readyState = 4;
    this.onreadystatechange?.();
    this.onload?.();
  }
}

let installed = false;

export function installMockApi(): void {
  if (installed) return;
  installed = true;
  window.fetch = mockFetch as typeof window.fetch;
  window.XMLHttpRequest = MockXHR as unknown as typeof XMLHttpRequest;
  // eslint-disable-next-line no-console
  console.info("%c[mock-api]", "color:#1B75BC;font-weight:600", "dev mock API active — VITE_MOCK_API=false to disable");
}

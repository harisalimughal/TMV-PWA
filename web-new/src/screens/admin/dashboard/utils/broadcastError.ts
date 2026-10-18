/** The broadcast endpoint has answered errors both as `{ error: "text" }` and as
 *  `{ error: { message } }`; show the text either way, never "[object Object]". */
export function broadcastErrorMessage(data: unknown, fallback: string): string {
  const error = (data as { error?: unknown } | null)?.error;
  if (typeof error === "string" && error.trim()) return error;
  const message = (error as { message?: unknown } | null | undefined)?.message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

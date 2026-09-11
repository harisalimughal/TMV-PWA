/**
 * Mirrors backend/src/jobs/booking.service.ts's htmlToText exactly. Google Calendar's
 * rich-text description editor saves line breaks as HTML <br>/<div> tags instead of
 * plain "\n" -- this normalises a raw Calendar description back to plain lines for
 * display, the same way the backend does before parsing it into fields. Used to show
 * the driver the verbatim booking text (see ReadyCard in JobWorkflowScreen.tsx)
 * without re-deriving/hardcoding which fields exist -- whatever ops typed into
 * Calendar is what's shown, however it's labelled.
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

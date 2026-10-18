# Booking OS 04: website intake (specification)

The website, Make.com and the Calendar extension are **not in this repository**, so nothing here is implemented
or verified against them. This is the contract the backend and the website repository must meet, plus the pieces
that can be built and tested here (validator and normaliser in `src/lib/booking`, mock endpoint).

## 1. What must be confirmed first

Website technology and form code; the real field list, allowed values and validation; the submission endpoint and
the current Make.com trigger (webhook or HTTP); whether the page shows a price immediately or the customer
receives it by email (this must not change until the client decides). The field categories named in the brief
(property size, postcodes, van, helpers, duration, date, stairs, extras, contact, inventory description) are
treated as a starting list only.

## 2. Contract

`POST /api/public/enquiries`

- Authentication: HMAC-SHA256 over `timestamp + "." + body` with a per-integration secret (header
  `X-TMV-Signature`, `X-TMV-Timestamp`), 5 minute replay window; or a scoped API key. Cookie auth is not used.
- Idempotency: `Idempotency-Key` = the website's submission id. A repeat returns the original response.
- Body: `{ source, submittedAt, fields: { ...as on the form }, raw: <verbatim payload> }`. Unknown fields are kept
  in `raw` and flagged, never dropped.
- Validation: lengths, UK postcode format, email, phone, date not in the past, duration and helper bounds from the
  business rules; errors return `422 {error:{code, fields:{name: message}}}`.
- Result: `201 {enquiryId, reference, status}` only after the enquiry is committed. Anything else must not be shown
  to the customer as success. Pricing runs after commit; a pricing failure leaves a valid enquiry in
  `pricingState = failed` for staff, not a lost submission.
- Retry safety: the website retries on network failure with the same key; the server stores failed deliveries
  for inspection (`ingest_failures`) with the reason.
- Rate limit and bot protection at the edge.

## 3. Coexistence with Make.com

Phase 1 (shadow): the website posts to both, or Make.com forwards to the intake; the enquiry is created from the
same submission id so nothing is duplicated. Staff keep using the Calendar flow. Make.com and the extension stay on
until the migration gates in `00-FRAMEWORK.md` pass.

## 4. Changes needed in the website repository (to be done there)

Add the signed call (server side, never expose the secret in the browser), include a stable submission id, keep
the existing customer-facing success and error behaviour, show success only on a `201`, and queue and retry on
failure.

## 5. Tests (here and in the backend)

Valid and invalid payloads, missing fields, duplicate and repeated delivery, signature and replay failures,
network failure and retry, pricing error leaving the enquiry intact, and that logs contain no customer data.

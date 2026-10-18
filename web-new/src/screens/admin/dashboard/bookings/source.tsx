/**
 * Where Booking OS reads from. "live" is the backend (default, and the only source that may be treated as real).
 * "preview" is the in-memory sample board: fictional data, labelled everywhere, chosen explicitly by the user (or
 * by the dev/demo build) and remembered per browser. It never replaces live data silently.
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { createBookingApi, type BookingApi, type BookingSource } from "../../../../lib/booking/client";

const KEY = "tmv:booking-source";
const read = (): BookingSource => { try { return localStorage.getItem(KEY) === "preview" ? "preview" : "live"; } catch { return "live"; } };

interface SourceValue { source: BookingSource; api: BookingApi; setSource: (next: BookingSource) => void }
const Context = createContext<SourceValue | null>(null);

export function BookingSourceProvider({ children, initial }: { children: React.ReactNode; initial?: BookingSource }) {
  const [source, setState] = useState<BookingSource>(initial ?? read);
  const setSource = useCallback((next: BookingSource) => { setState(next); try { localStorage.setItem(KEY, next); } catch { /* lasts this visit */ } }, []);
  const value = useMemo(() => ({ source, api: createBookingApi(source), setSource }), [source, setSource]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useBookingSource(): SourceValue {
  const value = useContext(Context);
  if (!value) throw new Error("useBookingSource needs a BookingSourceProvider");
  return value;
}

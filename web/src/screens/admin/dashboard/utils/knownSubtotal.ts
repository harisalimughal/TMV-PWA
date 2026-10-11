export function knownSubtotal(pounds: number, unknownRecords = 0): string {
  return unknownRecords > 0 ? pounds > 0 ? `${pounds.toFixed(2)} + unknown` : "Unknown" : pounds.toFixed(2);
}

/**
 * Normalize a Google Ads customer ID to 10 digits without dashes.
 * Accepts formats like "123-456-7890", "1234567890", 1234567890, etc.
 */
export function formatCustomerId(input: string | number): string {
  const digits = String(input).replace(/\D/g, "");
  return digits.padStart(10, "0");
}

/**
 * Canonical browser SHA-256-to-lowercase-hex helper (design §14.12 / R16-2).
 * Accepts either text (UTF-8 encoded here) or already-read file bytes.
 */
export async function sha256Hex(input: string | ArrayBuffer): Promise<string> {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

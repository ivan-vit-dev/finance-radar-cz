import { createHash } from "node:crypto";

const TRACKING_PARAMS = /^(utm_\w+|fbclid|gclid|dop_\w+|seq_no|source|ref|xtor)$/i;

/** Kanonická URL pro deduplikaci: bez sledovacích parametrů, fragmentu a koncového lomítka, http -> https. */
export function canonicalUrl(raw: string): string {
  const u = new URL(raw.trim());
  u.protocol = "https:";
  u.hash = "";
  u.hostname = u.hostname.toLowerCase();
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
  }
  u.searchParams.sort();
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
  return u.toString();
}

/** Krátký stabilní hash (20 hex znaků) – ID dokumentu ve Firestore. */
export function urlId(url: string): string {
  return createHash("sha1").update(canonicalUrl(url)).digest("hex").slice(0, 20);
}

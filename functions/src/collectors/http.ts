// Stahování textu ze zdrojů. Řeší kódování (psp.cz a ARAD posílají windows-1250)
// a vrací finální URL po redirectech (mfcr.cz -> mf.gov.cz).

export const USER_AGENT = "FinanceRadar/0.1 (private non-public app; source monitoring)";

export interface FetchedText {
  text: string;
  finalUrl: string;
  contentType: string;
}

export async function fetchText(
  url: string,
  { timeoutMs = 20_000, charset }: { timeoutMs?: number; charset?: string } = {},
): Promise<FetchedText> {
  const res = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "*/*" },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);

  const bytes = new Uint8Array(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") ?? "";
  const text = new TextDecoder(charset ?? detectCharset(contentType, bytes)).decode(bytes);
  return { text, finalUrl: res.url, contentType };
}

function detectCharset(contentType: string, bytes: Uint8Array): string {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
  if (fromHeader) return normalizeCharset(fromHeader);

  // Prvních pár set bajtů je ASCII-kompatibilních, deklarace kódování se dá přečíst bez dekódování.
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  const declared =
    /<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(head)?.[1] ?? /<meta[^>]*charset=["']?([\w-]+)/i.exec(head)?.[1];
  return declared ? normalizeCharset(declared) : "utf-8";
}

function normalizeCharset(charset: string): string {
  const c = charset.toLowerCase();
  return c === "cp1250" ? "windows-1250" : c;
}

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Načte functions/.secret.local do process.env pro lokální skripty.
 * Stejný soubor čte i emulátor Cloud Functions. Hodnoty se nikdy nevypisují.
 */
export function loadLocalSecrets(): void {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".secret.local");
  if (!existsSync(file)) throw new Error(`Chybí ${file}`);
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

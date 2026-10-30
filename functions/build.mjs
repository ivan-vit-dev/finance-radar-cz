// Sestaví lib/index.js pro nasazení. Firebase v cloudu instaluje jen balíčky z npm,
// proto se workspace balíček @finance-radar/shared zabalí přímo do výstupu
// a ostatní závislosti (dependencies) zůstanou externí.
import { build } from "esbuild";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

await build({
  entryPoints: ["src/index.ts"],
  outfile: "lib/index.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  external: Object.keys(pkg.dependencies ?? {}).flatMap((d) => [d, `${d}/*`]),
  logLevel: "info",
});

#!/usr/bin/env node
/**
 * Suite dei documenti PDF: avvia un'istanza di prova della dashboard (root isolata in /tmp,
 * così i file di prova non entrano nel repository), esercita /api/pdf e verifica le degradazioni.
 *
 * Uso: node media/test-pdf.mjs
 */

import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makePdf } from "./make-test-pdf.mjs";

const PORTA = 8431;
const PORTA_OFF = 8432;
const AUTH = "Basic " + Buffer.from("pi:testpass").toString("base64");
const ROOT = mkdtempSync(join(tmpdir(), "pi-pdf-root-"));
const TEMP = mkdtempSync(join(tmpdir(), "pi-pdf-tmp-"));

let pass = 0;
let fail = 0;
const ok = (d) => { console.log(`  ✔ ${d}`); pass++; };
const ko = (d) => { console.log(`  ✘ ${d}`); fail++; };
const check = (d, cond, extra = "") => (cond ? ok(d) : ko(`${d}${extra ? ` — ${extra}` : ""}`));

function avvia(porta, env = {}) {
  const p = spawn("node", ["dashboard.mjs", "--port", String(porta), "--user", "pi", "--password", "testpass", "--root", ROOT], {
    cwd: "/root/pi-harness",
    env: {
      ...process.env,
      DASH_ASK: "off",
      DASH_SESSION_DIR: join(TEMP, `sessions-${porta}`),
      DASH_MEDIA_DIR: join(TEMP, `media-${porta}`),
      DASH_SESSION_SECRET_FILE: join(TEMP, `.secret-${porta}`),
      DASH_AUTH_BACKOFF: "3,6,12",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  p.stdout.on("data", () => {});
  p.stderr.on("data", (d) => process.env.PDF_TEST_VERBOSE && process.stderr.write(d));
  return p;
}

async function attesa(porta, secondi = 20) {
  const B = `http://127.0.0.1:${porta}`;
  for (let i = 0; i < secondi * 4; i++) {
    try {
      const r = await fetch(`${B}/api/state`, { headers: { Authorization: AUTH } });
      if (r.status === 200) return B;
    } catch {
      /* non ancora pronto */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`istanza su :${porta} non pronta`);
}

const get = (B, q) => fetch(`${B}/api/pdf?${q}`, { headers: { Authorization: AUTH } });

async function main() {
  // --- file di prova -------------------------------------------------------
  mkdirSync(join(ROOT, "doc"), { recursive: true });
  const PROVA = join(ROOT, "doc", "prova.pdf");
  const SCANSIONE = join(ROOT, "doc", "scansione.pdf");
  writeFileSync(PROVA, makePdf({ pagine: ["Fattura di prova numero 2026-001", "Totale dovuto: 1.234,56 EUR", "Scadenza 31/12/2026"] }));
  writeFileSync(SCANSIONE, makePdf({ pagine: ["", "", ""], scansione: true }));
  writeFileSync(join(ROOT, "doc", "finto.pdf"), "<html><body>non sono un pdf</body></html>");
  writeFileSync(join(ROOT, "doc", "nota.txt"), "solo testo\n");

  let srv = avvia(PORTA);
  let srvOff = null;
  try {
    const B = await attesa(PORTA);
    const REL = "doc/prova.pdf";
    const q = (p) => `path=${encodeURIComponent(p)}`;

    console.log("== 1. metadati ==");
    {
      const r = await get(B, `meta=1&${q(REL)}`);
      const j = await r.json();
      check("meta risponde 200", r.status === 200, `status ${r.status}`);
      check("riconosce un PDF", j.pdf === true);
      check("conta le pagine (3)", j.pagine === 3, `pagine=${j.pagine}`);
      check("dichiara il testo disponibile", j.testoDisponibile === true);
      check("non cifrato", j.cifrato === false);
      check("strumenti di sistema rilevati", j.strumenti?.ok === true, JSON.stringify(j.strumenti?.perche));
      check("dimensione e nome", j.size > 0 && j.name === "prova.pdf");
    }

    console.log("== 2. testo estratto ==");
    {
      const j = await (await get(B, `testo=2&${q(REL)}`)).json();
      check("una sola pagina richiesta", j.pagine === 1, `pagine=${j.pagine}`);
      check("pagina 2 dichiarata", j.da === 2 && j.a === 2, `da=${j.da} a=${j.a}`);
      check("contiene l'importo della pagina 2", String(j.testo).includes("1.234,56"), JSON.stringify(j.testo)?.slice(0, 60));
      check("porta l'avvertenza sul contenuto non attendibile", /non istruzioni/.test(j.avvertenza || ""));
    }
    {
      const j = await (await get(B, `testo=1-2&${q(REL)}`)).json();
      check("fascia di due pagine", j.pagine === 2, `pagine=${j.pagine}`);
      check("la fascia parte dalla pagina 1", String(j.testo).includes("Fattura di prova"));
      check("e arriva alla 2", String(j.testo).includes("1.234,56"));
      check("non include la 3", !String(j.testo).includes("Scadenza"));
    }
    {
      const j = await (await get(B, `testo=all&${q(REL)}`)).json();
      check("documento intero: tre pagine", j.pagine === 3, `pagine=${j.pagine}`);
      check("non troncato", j.troncato === false);
    }

    console.log("== 3. ricerca ==");
    {
      const j = await (await get(B, `cerca=scadenza&${q(REL)}`)).json();
      check("trova il termine", Array.isArray(j.risultati) && j.risultati.length === 1, JSON.stringify(j.risultati)?.slice(0, 80));
      check("indica la pagina giusta (3)", j.risultati?.[0]?.pagina === 3, `pagina=${j.risultati?.[0]?.pagina}`);
      const up = await (await get(B, `cerca=FATTURA&${q(REL)}`)).json();
      check("ricerca senza distinzione di maiuscole", up.risultati?.length >= 1);
      const none = await (await get(B, `cerca=inesistente-xyz&${q(REL)}`)).json();
      check("termine assente: zero risultati", Array.isArray(none.risultati) && none.risultati.length === 0);
    }

    console.log("== 4. pagina resa in PNG ==");
    {
      const r = await get(B, `pagina=1&${q(REL)}`);
      const buf = Buffer.from(await r.arrayBuffer());
      check("risponde 200", r.status === 200, `status ${r.status}`);
      check("è un PNG (magic number)", buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e, buf.subarray(0, 8).toString("hex"));
      check("Content-Type image/png", r.headers.get("content-type") === "image/png");
      const r2 = await get(B, `pagina=1&dpi=50&${q(REL)}`);
      const buf2 = Buffer.from(await r2.arrayBuffer());
      check("un dpi più basso produce un PNG più piccolo", buf2.length < buf.length, `${buf2.length} vs ${buf.length}`);
    }

    console.log("== 5. errori e confini ==");
    {
      const r = await get(B, `pagina=99&${q(REL)}`);
      const j = await r.json().catch(() => ({}));
      check("pagina inesistente → 404", r.status === 404, `status ${r.status}`);
      check("spiega che la pagina non c'è", /non esiste/.test(j.error || ""), j.error);
    }
    check("pagina 0 → 400", (await get(B, `pagina=0&${q(REL)}`)).status === 400);
    check("pagina non numerica → 400", (await get(B, `pagina=abc&${q(REL)}`)).status === 400);
    check("testo non valido → 400", (await get(B, `testo=due&${q(REL)}`)).status === 400);
    check("file inesistente → 404", (await get(B, `meta=1&${q("doc/manca.pdf")}`)).status === 404);
    check("non-PDF → 415", (await get(B, `meta=1&${q("doc/finto.pdf")}`)).status === 415);
    check("file di testo → 415", (await get(B, `meta=1&${q("doc/nota.txt")}`)).status === 415);
    check("percorso fuori dalla root → 403", (await get(B, `meta=1&${q("../../etc/passwd")}`)).status === 403);

    console.log("== 6. documento senza testo (scansionato) ==");
    {
      const j = await (await get(B, `meta=1&${q("doc/scansione.pdf")}`)).json();
      check("tre pagine anche qui", j.pagine === 3, `pagine=${j.pagine}`);
      check("dichiara che il testo NON c'è", j.testoDisponibile === false, `testoDisponibile=${j.testoDisponibile}`);
      check("la pagina si vede comunque", (await get(B, `pagina=1&${q("doc/scansione.pdf")}`)).status === 200);
    }

    console.log("== 7. degradazione con la lettura disattivata ==");
    {
      srvOff = avvia(PORTA_OFF, { DASH_PDF_DISABLED: "1" });
      const B2 = await attesa(PORTA_OFF);
      const r = await get(B2, `meta=1&${q(REL)}`);
      const j = await r.json();
      check("meta risponde comunque 200", r.status === 200, `status ${r.status}`);
      check("dichiara di non essere leggibile", j.leggibile === false);
      check("dice cosa fare", /disattivata|poppler/.test(j.error || ""), j.error);
      const rp = await get(B2, `pagina=1&${q(REL)}`);
      check("la pagina non si rende → 501", rp.status === 501, `status ${rp.status}`);
    }
  } catch (e) {
    ko(`eccezione: ${e?.message || e}`);
  } finally {
    srv.kill();
    srvOff?.kill();
    rmSync(ROOT, { recursive: true, force: true });
    rmSync(TEMP, { recursive: true, force: true });
  }

  console.log(`\nrisultato: ${pass} ok, ${fail} falliti`);
  process.exit(fail ? 1 : 0);
}

main();

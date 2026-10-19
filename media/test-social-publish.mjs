#!/usr/bin/env node
/**
 * Test dello strumento di pubblicazione social (skills/social-publish/publish.mjs).
 *
 * Cosa copre, senza mai contattare Meta e senza toccare credenziali vere:
 *  - help e comandi sconosciuti;
 *  - validazione del nome di profilo (niente percorsi: `--profilo ../etc` deve essere rifiutato);
 *  - `--dry-run` con profilo: legge social/<nome>.env e NON invia nulla;
 *  - `profili` con cartella assente (messaggio, non crash);
 *  - `perms` senza token (messaggio, exit 1).
 *
 * Uso: node media/test-social-publish.mjs
 * Non richiede la dashboard accesa né credenziali.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const TOOL = join(ROOT, "skills/social-publish/publish.mjs");

let ok = 0, ko = 0;
function check(nome, cond, extra = "") {
  if (cond) { ok++; console.log(`  ✔ ${nome}`); }
  else { ko++; console.log(`  ✘ ${nome}${extra ? " — " + extra : ""}`); }
}
function run(args, env = {}) {
  const r = spawnSync(process.execPath, [TOOL, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

console.log("== help e comandi ==");
{
  const r = run([]);
  check("senza argomenti stampa l'aiuto", r.code === 0 && /publish\.mjs/.test(r.out));
  check("l'aiuto nomina --profilo", /--profilo/.test(r.out));
  check("l'aiuto nomina il comando profili", /profili/.test(r.out));
  const s = run(["comando-inventato"]);
  check("comando sconosciuto → exit 2", s.code === 2);
}

console.log("== nome di profilo ==");
{
  const r = run(["--profilo", "../etc", "check", "--dry-run"]);
  check("percorso nel nome profilo rifiutato", r.code === 2 && /non valido/.test(r.out));
  const r2 = run(["--profilo", "ma rio", "check", "--dry-run"]);
  check("spazi nel nome profilo rifiutati", r2.code === 2);
}

console.log("== profilo temporaneo: dry-run senza rete ==");
{
  const dir = mkdtempSync(join(tmpdir(), "social-test-"));
  const file = join(dir, "mario.env");
  writeFileSync(file, "FB_PAGE_ID=1234567890\nFB_PAGE_TOKEN=token-di-prova-non-valido\nFB_API_VERSION=v26.0\n", { mode: 0o600 });
  const r = run(["--profilo", "mario", "--dry-run", "check"], { SOCIAL_ENV_FILE: file });
  check("legge il profilo indicato", /1234567890/.test(r.out) && /mario\.env$/.test(r.out.trim()));
  check("non stampa il token in chiaro", !/token-di-prova-non-valido/.test(r.out));
  check("maschera il token", /…/.test(r.out));
  const p = run(["--profilo", "mario", "--dry-run", "post", "--text", "ciao"], { SOCIAL_ENV_FILE: file });
  check("dry-run del post: destinazione con l'id del profilo", /\/1234567890\/feed/.test(p.out));
  check("dry-run del post: nessuna chiamata dichiarata", /nessuna richiesta inviata/.test(p.out));
  const u = run(["--profilo", "mario", "--dry-run", "post", "--text", "ciao", "--unpublished"], { SOCIAL_ENV_FILE: file });
  check("--unpublished dichiarato nel dry-run", /NON pubblicato/.test(u.out));
  rmSync(dir, { recursive: true, force: true });
}

console.log("== profili / perms senza credenziali ==");
{
  const dir = mkdtempSync(join(tmpdir(), "social-vuoto-"));
  const vuoto = join(dir, "vuoto.env");
  writeFileSync(vuoto, "FB_API_VERSION=v26.0\n", { mode: 0o600 });
  const p = run(["perms"], { SOCIAL_ENV_FILE: vuoto });
  check("perms senza token → exit 1 e messaggio", p.code === 1 && /nessun token/.test(p.out));
  const c = run(["check"], { SOCIAL_ENV_FILE: vuoto });
  check("check senza token → configurazione incompleta", c.code === 1 && /configurazione incompleta/.test(c.out));
  if (existsSync(join(ROOT, ".env"))) {
    // con il .env reale il comando deve comunque funzionare (elenco o "nessun profilo")
    const pr = run(["profili"]);
    check("profili non va in crash", pr.code === 0 && /profil/.test(pr.out));
  }
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\nrisultato: ${ok} ok, ${ko} falliti`);
process.exit(ko ? 1 : 0);

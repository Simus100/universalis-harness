# REA nell'harness — installazione e prove

Data: **2026-10-12** · Stato: **installato, verificato end-to-end, attivo**
Skill d'uso per l'agente: `skills/rea-cli/SKILL.md` · Metodo investigativo: skill REA `reverse-engineer-anything` (v37)

---

## Cosa è stato implementato

Richiesta: «implementare REA (https://github.com/morluto/rea) in questo harness, completamente
funzionante».

**REA** (`rea-agents` 6.4.0, MIT) è due cose in una: una **CLI con 129 comandi** e un **server MCP
con 170 tool**. Qui è stato integrato come **CLI**, non come server MCP (motivazione sotto), con gli
engine di analisi installati e verificati su target reali.

### Decisione: CLI + skill, non MCP

| | CLI + skill (scelta) | Server MCP |
|---|---|---|
| Costo in contesto | quasi zero (skill caricata on-demand) | **1,95 MB di schemi ≈ 490.000 token** (443.000 col profilo `compact`) |
| Prerequisito | `rea` nel PATH (c'è) | client MCP: `pi-coding-agent` 0.85.1 **non ce l'ha** (la 1.1.0 sì) |
| Rischio | nessuno | aggiornamento major del motore dell'harness in produzione |

Il profilo `compact` di REA riduce il *singolo* schema (budget 13 KB), non il numero di tool:
misurato, il totale resta 1,77 MB. Per questo `doctor` continuerà a segnalare
`registration:pi` e `registration:claude_code` come mancanti: **è una scelta, non un guasto**.
La stessa conclusione era già nella memoria dell'harness («MCP come client: valutare, non subito;
preferire CLI-as-skill»).

## Cosa è installato

| Componente | Versione | Percorso | Ruolo |
|---|---|---|---|
| REA CLI (`rea-agents`) | 6.4.0 | `/usr/bin/rea` (npm globale) | i 129 comandi |
| wrapper `rea` | — | `/usr/local/bin/rea` | imposta le variabili d'ambiente degli engine |
| Ghidra | 12.1.4 | `/opt/rea-tools/ghidra_12.1.4_PUBLIC` | pseudocodice, assembly, xrefs, tipi (nativo) |
| OpenJDK | 21.0.12.1 | `/usr/lib/jvm/java-21-openjdk-amd64` | requisito di Ghidra (min 21) |
| pwntools + pyelftools + unicorn | 4.15.0 / 0.33 / 2.1.2 | venv `/opt/rea-tools/venv` | `inspect-binary-layout` |
| WABT | 1.0.42 | `/opt/rea-tools/wabt/bin` | strumenti WASM |
| skill REA | v37, 170 tool | `~/.agents/skills/reverse-engineer-anything` (+ copie per istanza) | metodo e riferimenti |

Gli engine sono in `/opt` (e non sotto `/root`) perché **`/root` è `drwx------`**: lì dentro
le altre istanze dell'harness e gli utenti non-root non possono leggerli. Verificato: da utente
`tester08` la decompilazione Ghidra funziona.

Il wrapper è la chiave del funzionamento stabile: `/usr/local/bin/rea` esporta
`GHIDRA_INSTALL_DIR`, `JAVA_HOME`, `REA_PWNTOOLS_PYTHON`, `REA_WABT_BIN_DIRECTORY` e poi esegue
`/usr/bin/rea`. Poiché **il PATH del processo della dashboard include `/usr/local/bin`**
(verificato su `/proc/<pid>/environ`), l'agente in chat trova REA con gli engine già configurati,
senza modifiche a `dashboard.mjs`. La skill REA è fuori dal repo (pubblico): nessun codice di terzi
versionato.

## `rea doctor`: esito

Verificati **ok**: `node` 24.21.0, `host` ubuntu 24.04, e gli **otto** check di Ghidra
(`ghidra`, `-platform` linux, `-architecture` x64, `-installation`, `-version` 12.1.4, `-headless`,
`-native_decompiler` — il binario `decompile` linux_x86_64 è coerente con la piattaforma —
`-java` 21 64-bit JDK). Skill: `state: aligned`, v37.

Non ok, per scelta o per impossibilità fisica:

- `hopper`, `ida-registration` — **impossibili**: Hopper è macOS-only, IDA è commerciale.
- `registration:pi`, `registration:claude_code` — **scelta deliberata** (vedi sopra).

## Prove end-to-end eseguite

**1. App JavaScript/Electron reale** — Electron API Demos 2.0.2 (release Linux ufficiale, 78 MB):

```bash
rea analyze-javascript-application ".../resources/app" --json
```

Esito: analisi completata; fra i dati emersi **30 operazioni IPC**, 18 canali letterali,
12 trasmissioni dal renderer, 7 listener nel renderer, 11 handler nel main e 12 trasmissioni
corrispondenti. Ogni conclusione arriva con `authority`, `confidence`, `limitations` e `evidence_id`.
Nota operativa: l'output completo è di 46 MB (l'app include `node_modules`) → va scritto su file e
interrogato con `jq`; per gli scenari con budget ristretto esistono `--filter-output`,
`--token-limit`, `--format md`.

**2. Binario ELF nativo con simboli** — `pwcheck.c` compilato con `gcc -O0 -g`:

```bash
rea inspect   ./pwcheck validate_token --json    # 22 s
```

Esito: pseudocodice con `strcmp(t,"s3cr3t-token-value")` — la logica del controllo di accesso è
stata risalita dal binario, non dal sorgente.

**3. Binario ELF senza simboli** — stesso codice, `strip`:

```bash
rea search   ./pwcheck_stripped "s3cr3t" --json    # ~22 s → stringa a 0x102004
rea xrefs    ./pwcheck_stripped 0x102004 --json    # ~20 s → 0x101179, 0x101180, 0x101184, 0x10118c
rea decompile ./pwcheck_stripped 0x101179 --json   # ~21 s → FUN_00101169 con lo strcmp
```

Esito: catena **stringa → riferimenti → pseudocodice** completata su un binario privo di simboli.

Tempi: l'import in Ghidra è `ephemeral-source-immutable`, quindi ogni comando rianalizza
(~20 s su un ELF di 17 KB). Per catene lunghe si usa `--snapshot`.

## Limiti dichiarati (non aggirabili su questa macchina)

- **10 capability su 18 indisponibili**, quasi tutte per il mondo Apple (Hopper, Mach-O, plist,
  `assetutil`, Swift demangle, UI nativa macOS): su Linux non ci saranno mai.
  REA qui copre **ELF/PE, JS/Electron, EVM, .NET managed, artifact/archivi, firmware (parziale — Binwalk/Unblob non installati)**.
- **WASM: nessun comando CLI.** In 6.4.0 l'ispezione dei moduli WASM esiste solo come tool MCP
  (`inspect_wasm_artifact`) e `inspect-artifact` rifiuta i `.wasm` (formato non supportato).
  WABT è installato e usabile direttamente (`wasm2wat`, `wasm-objdump`).
- **Android non configurato**: mancano `jadx`, `apktool`, `adb`.
- **JEB, IDA, Hopper**: commerciali/piattaforma-specifici, assenti per definizione.
- Non è stato toccato nulla del funzionamento interno dell'harness: nessuna modifica a
  `dashboard.mjs`, `harness.mjs` o `package.json`.

**4. Utente non-root (dopo lo spostamento degli engine in `/opt`)** — la stessa decompilazione
da `tester08`, che non può leggere `/root`:

```bash
sudo -u tester08 env -i HOME=/home/tester08 PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/snap/bin \
  /usr/local/bin/rea decompile /opt/rea-tools/targets/native/pwcheck validate_token --json
```

Esito: pseudocodice restituito (uscita 0), provider `ghidra 12.1.4`. Verificato anche
`inspect-binary-layout` da utente: provider `pwntools-elf` con `pwntools@4.15.0;pyelftools@0.33`.

## Come si verifica (test di fumo)

```bash
rea doctor --json | jq -r '.checks[] | select(.ok==false) | .name'   # attesi: hopper, ida-registration, registration:*
rea decompile /opt/rea-tools/targets/native/pwcheck validate_token --json   # deve mostrare s3cr3t-token-value
```

Target di prova (binari e app Electron) in `/opt/rea-tools/targets/`: leggibili da tutti, non
pubblicati nel repo.

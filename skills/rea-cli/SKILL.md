---
name: rea-cli
description: Usa REA in questo harness dalla riga di comando. Serve per il reverse engineering di artefatti spediti — binari nativi ELF/PE, app JavaScript/Electron, assembly .NET, WASM, bytecode EVM, firmware, pacchetti Android — quando una risposta dipende dal binario e non dal sorgente. Leggila prima di invocare `rea`.
---

# REA via CLI in questo harness

REA («Reverse Engineer Anything», pacchetto `rea-agents`) qui è **una CLI**, non un
insieme di tool nativi: nell'harness il comando si invoca con `bash`. Il *metodo*
investigativo (quale target, quale evidenza, cosa non concludere) sta nella skill
ufficiale `reverse-engineer-anything`: leggila quando la domanda richiede una vera
indagine, non solo un comando.

## Perché CLI e non MCP (decisione già presa — non riaprirla)

Il server MCP di REA espone **170 tool** per **~1,95 MB di schemi** (≈490.000 token,
443.000 col profilo `compact`): sarebbero token bruciati a ogni turno di ogni
sessione. Inoltre il motore dell'harness (`pi-coding-agent` 0.85.1) non ha client
MCP, e `doctor` continuerà a segnalare `registration:pi` come mancante: **è voluto**.
Non registrare il server, non aggiornare pi per questo.

## Come si invoca

`rea` è un wrapper in `/usr/local/bin/rea` che fissa i percorsi degli engine e poi
chiama il binario vero. L'ambiente viene impostato lì, **non** serve esportare nulla:

| Variabile | Valore | Sblocca |
|---|---|---|
| `GHIDRA_INSTALL_DIR` | `/root/rea-tools/ghidra_12.1.4_PUBLIC` | pseudocodice, assembly, xrefs, tipi (nativo) |
| `JAVA_HOME` | `/usr/lib/jvm/java-21-openjdk-amd64` | requisito di Ghidra |
| `REA_PWNTOOLS_PYTHON` | `/root/rea-tools/venv/bin/python` | `inspect-binary-layout` (ELF) |
| `REA_WABT_BIN_DIRECTORY` | `/root/rea-tools/wabt/bin` | `inspect-wasm-artifact` |

Se invochi `/usr/bin/rea` direttamente **Ghidra non viene trovato**: usa `rea`.

## Comandi verificati su questa macchina

```bash
rea doctor --json                      # salute di engine, skill, registrazioni
rea capabilities --json                # cosa è disponibile e cosa no, con motivo
rea --help                             # 129 comandi; `rea <comando> --help` per i dettagli

# nativo (Ghidra; ogni invocazione reimporta: ~20 s a comando)
rea inspect   ./target --json          # panoramica, operation: binary_overview
rea search    ./target "testo" --json  # stringhe (--kind procedures per i nomi)
rea xrefs     ./target 0x102004 --json # chi referenzia un indirizzo
rea decompile ./target 0x101179 --json # pseudocodice della funzione che lo contiene
rea function  ./target nome_o_addr --json   # dossier completo della funzione
rea inspect-artifact ./target --json   # contenitore/binario: cosa è, cosa contiene

# altre superfici
rea analyze-javascript-application <dir|asar> --json   # app JS/Electron
rea inspect-binary-layout ./target --json              # sezioni, simboli, offset
rea inspect-wasm-artifact ./module.wasm --json
rea inspect-evm-interface ./bytecode.hex --json
```

Catena tipica su un binario senza simboli (provata, ~65 s totali):
`search` per la stringa → `xrefs` per l'indirizzo → `decompile` della funzione.

## Regole pratiche

1. **Sempre `--json`**: l'output è leggibile a macchina e filtrabile con `jq`.
   Attenzione ai percorsi: il payload sta in `.raw_result` (per `decompile` è
   `.raw_result.value`, per `search` è un array `.raw_result[]`), mentre
   `evidence_id`, `authority`, `confidence` e `limitations` stanno al livello radice.
2. **L'analisi si rifà ogni volta.** Ogni comando reimporta il target in Ghidra
   (~20 s su un ELF piccolo; un binario grande costa molto di più). Per catene
   lunghe usa `--snapshot <file>` per conservare e riusare l'analisi.
3. **Non rovesciare output enormi in chat.** L'analisi di un'app JavaScript reale
   può produrre decine di MB: scrivi su file (`> /tmp/x.json`) e interroga con `jq`,
   oppure usa `--filter-output`, `--token-limit`, `--format md|toon`.
4. **Evidenza e limiti viaggiano col risultato**: ogni esito ha `authority`,
   `confidence`, `limitations`, `evidence_id`. Riportali quando riferisci una
   conclusione: sono il motivo per cui REA dice «questo è dimostrato» invece di
   «sembra».
5. **Test di fumo**, se sospetti un guasto:
   `rea decompile /root/rea-tools/targets/native/pwcheck validate_token --json`
   deve restituire lo pseudocodice con la stringa `s3cr3t-token-value`.

## Limiti di questa macchina (dichiarali, non aggirarli)

- **Hopper e IDA non ci sono e non ci saranno**: Hopper è macOS-only, IDA è
  commerciale. Di conseguenza **10 capability su 18 sono indisponibili**, quasi
  tutte per il mondo Apple (Mach-O, plist, `assetutil`, Swift demangle, UI nativa
  macOS). Su questo host REA copre il mondo **ELF/PE + JS/Electron + WASM + EVM +
  .NET managed**, non iOS/macOS.
- **Android non è configurato**: servono `jadx`, `apktool` e `adb`, non installati.
- **Engine esterni assenti**: Binwalk/Unblob (firmware), JEB (Android commerciale),
  process capture/Frida su hardware reale.
- Le skill di REA sono installate in `~/.agents/skills/reverse-engineer-anything`
  (e in `~/.claude/skills/` per l'igiene di `doctor`): **non** nel repo, che è
  pubblico.

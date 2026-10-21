#!/usr/bin/env bash
# memoria-rimuovi-segreti.sh — toglie i segreti finiti per sbaglio nella memoria a lungo termine.
#
# Perché serve: gli episodi della memoria si generano DA SOLI a fine turno, riassumendo la
# conversazione. Se in chat è stato incollato un token, quel testo può finire in un episodio, e da
# lì nell'indice (che contiene estratti di ogni episodio). La memoria non è pubblicata su git, ma
# resta un posto dove un segreto non deve stare.
#
# Uso:
#   scripts/memoria-rimuovi-segreti.sh            # elenca e basta (nessuna modifica)
#   scripts/memoria-rimuovi-segreti.sh --applica  # sostituisce con [SEGRETO-RIMOSSO]
#
# Cosa cerca: i pattern di `scripts/segreti.pattern` — UNICO posto dove vivono (li legge anche
# `scripts/preflight-sicurezza.sh`). Non tocca sessioni, .env né social/: lì i segreti devono
# stare, sono i posti deputati.
set -uo pipefail

RADICE="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$RADICE/media/memoria"
[[ -d "$TARGET" ]] || { echo "cartella della memoria non trovata: $TARGET" >&2; exit 1; }

APPLICA=0
[[ "${1:-}" == "--applica" ]] && APPLICA=1
[[ "${1:-}" == "-h" || "${1:-}" == "--help" ]] && { sed -n '2,16p' "$0"; exit 0; }

PATTERN="$RADICE/scripts/segreti.pattern"
[[ -f "$PATTERN" ]] || { echo "elenco dei pattern non trovato: $PATTERN" >&2; exit 1; }

python3 - "$TARGET" "$APPLICA" "$PATTERN" <<'PY'
import os, re, sys, json

target, applica, pattern_file = sys.argv[1], sys.argv[2] == "1", sys.argv[3]

segreti = []
for riga in open(pattern_file, encoding="utf-8"):
    riga = riga.rstrip("\n")
    if not riga.strip() or riga.lstrip().startswith("#"):
        continue
    nome, _, espressione = riga.partition("\t")
    if not espressione:
        sys.exit(f"riga malformata in {pattern_file} (serve nome<TAB>regex): {riga!r}")
    segreti.append((nome.strip(), re.compile(espressione)))
if not segreti:
    sys.exit(f"nessun pattern in {pattern_file}: un elenco vuoto direbbe «nessun segreto» sempre")


def maschera(m):
    """Sostituisce il segreto preservando il gruppo 1, quando c'è: è il contesto
    (per esempio il carattere prima di `sk-`) che la regex ha dovuto consumare."""
    return (m.group(1) or "") + "[SEGRETO-RIMOSSO]" if m.groups() else "[SEGRETO-RIMOSSO]"

trovati, toccati = [], []
for root, _, files in os.walk(target):
    for f in files:
        p = os.path.join(root, f)
        try:
            s = open(p, encoding="utf-8").read()
        except Exception:
            continue
        originale, conteggi = s, []
        for nome, pat in segreti:
            s, n = pat.subn(maschera, s)
            if n:
                conteggi.append((nome, n))
        if conteggi:
            rel = os.path.relpath(p, os.path.dirname(target))
            trovati.append((rel, conteggi))
            if applica:
                open(p, "w", encoding="utf-8").write(s)
                toccati.append(rel)

if not trovati:
    print("nessun segreto riconoscibile nella memoria ✓")
    sys.exit(0)

for rel, conteggi in trovati:
    dettaglio = ", ".join(f"{n}×{c}" for n, c in conteggi)
    print(f"  {rel}: {dettaglio}")

if not applica:
    print("\nelenco soltanto: rilanciare con --applica per sostituire con [SEGRETO-RIMOSSO]")
    sys.exit(0)

print(f"\nripuliti {len(toccati)} file")
# i JSON della memoria devono restare leggibili
for p in ["indice.json", "grafo.json", "stato.json", "sorgenti.json"]:
    f = os.path.join(target, p)
    if os.path.exists(f):
        try:
            json.load(open(f, encoding="utf-8"))
            print(f"  ✓ JSON valido: {p}")
        except Exception as e:
            print(f"  ✘ JSON ROTTO: {p} → {e}")
PY

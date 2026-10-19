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
# Cosa cerca: token Meta (EAA…), chiavi OpenAI/Anthropic, GitHub, Slack, Google API, HuggingFace.
# Non tocca sessioni, .env né social/: lì i segreti devono stare (sono i posti deputati).
set -uo pipefail

RADICE="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$RADICE/media/memoria"
[[ -d "$TARGET" ]] || { echo "cartella della memoria non trovata: $TARGET" >&2; exit 1; }

APPLICA=0
[[ "${1:-}" == "--applica" ]] && APPLICA=1
[[ "${1:-}" == "-h" || "${1:-}" == "--help" ]] && { sed -n '2,16p' "$0"; exit 0; }

python3 - "$TARGET" "$APPLICA" <<'PY'
import os, re, sys, json

target, applica = sys.argv[1], sys.argv[2] == "1"
segreti = [
    ("Meta/Facebook", re.compile(r"EAA[A-Za-z0-9_\-]{40,}")),
    # `sk-` da solo prende anche parole come "task-…": serve un confine a sinistra.
    ("OpenAI/Anthropic", re.compile(r"(?<![A-Za-z0-9])sk-[A-Za-z0-9_\-]{20,}")),
    ("GitHub", re.compile(r"(ghp_|gho_|ghs_|github_pat_)[A-Za-z0-9_]{20,}")),
    ("Slack", re.compile(r"xox[abp]-[A-Za-z0-9\-]{10,}")),
    ("Google API", re.compile(r"AIza[0-9A-Za-z_\-]{30,}")),
    ("HuggingFace", re.compile(r"hf_[A-Za-z0-9]{20,}")),
]

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
            s, n = pat.subn("[SEGRETO-RIMOSSO]", s)
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

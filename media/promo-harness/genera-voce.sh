#!/bin/bash
# Rigenera la voce fuori campo del promo con piper (offline, voci neurali italiane).
# Gli mp3 risultanti stanno in assets/ e NON sono versionati (binari rigenerabili):
# rilanciare questo script dentro media/promo-harness/ prima di renderizzare da zero.
#
# Durate attese (misurate con ffprobe) — i tempi delle scene in index.html sono tarati su queste:
#   vo-1 3,36 s · vo-2 4,84 s · vo-3 6,23 s · vo-4 4,33 s · vo-5 3,31 s
set -e
PIPER="${PIPER:-/opt/piper/venv/bin/piper}"
VOICE="${PIPER_VOICE:-/opt/piper/voices/it_IT-serena-high.onnx}"
OUT="$(cd "$(dirname "$0")" && pwd)/assets"

if [ ! -x "$PIPER" ]; then
  echo "piper non trovato in $PIPER — vedi i Requisiti nel README dell'harness" >&2
  exit 1
fi
mkdir -p "$OUT"

declare -a LINES=(
"Un agente AI che lavora sui tuoi file, non solo in una chat."
"Legge documenti, naviga siti, pianifica il lavoro, ricorda quello che ha fatto."
"E ti dice quanto costa: tredicimila token di contesto prima della prima parola, meno della metà di Claude Code."
"Gira sulla tua macchina, senza servizi esterni: i tuoi file restano tuoi."
"Universalis Harness. Licenze d'uso e istanze su richiesta."
)

i=1
for L in "${LINES[@]}"; do
  echo "$L" > /tmp/riga-voce.txt
  "$PIPER" --model "$VOICE" --output_file "$OUT/vo-$i.wav" < /tmp/riga-voce.txt 2>/dev/null
  D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/vo-$i.wav")
  ffmpeg -y -loglevel error -i "$OUT/vo-$i.wav" -ac 1 -ar 48000 -b:a 128k "$OUT/vo-$i.mp3"
  rm -f "$OUT/vo-$i.wav"
  echo "vo-$i : ${D}s"
  i=$((i + 1))
done

echo
echo "Ora verifica che le durate combacino con i tempi delle scene in index.html"
echo "(le <audio data-start> e le posizioni del timeline sono tarate su queste durate)."

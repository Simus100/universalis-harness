#!/bin/bash
# Rigenera la voce fuori campo della demo con piper (offline, voce neurale italiana).
# Gli mp3 stanno in assets/ e NON sono versionati (binari rigenerabili): rilanciare questo
# script dentro media/demo-harness/ prima di un render da zero.
#
# Durate attese (misurate con ffprobe): le scene dello storyboard sono tarate su queste.
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
"Qualcuno scrive una richiesta, in italiano, come la scriverebbe a un collega. Nessun comando da imparare."
"Questa e' l'harness. Una dashboard sul tuo server, con dentro un agente che lavora sui tuoi file. I tuoi file, non quelli di qualcun altro."
"E non e' solo conversazione: tiene gli obiettivi con i loro passi, pianifica il lavoro, ricorda quello che ha gia' fatto, e all'occorrenza impara nuove competenze."
"Primo caso: legge i documenti. PDF, scansioni, foto. Prende i dati che servono e li mette in tabella. Dodici fatture, in un colpo solo."
"Secondo caso: va sui siti che gli indichi, legge le pagine e ti dice cos'e' cambiato. Anche quando il sito non offre nessun file da scaricare."
"Terzo caso: produce. Report, immagini, video. Il risultato arriva qui, nella stessa conversazione. Non un link: il file."
"Gira sul tuo server, e i file restano tuoi. E questo video? L'ha prodotto lui."
)

i=1
for line in "${LINES[@]}"; do
  echo "$line" | "$PIPER" --model "$VOICE" --output_file "$OUT/vo-$i.wav" 2>/dev/null
  ffmpeg -y -loglevel error -i "$OUT/vo-$i.wav" -codec:a libmp3lame -b:a 128k "$OUT/vo-$i.mp3"
  rm -f "$OUT/vo-$i.wav"
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/vo-$i.mp3")
  printf '  vo-%d: %.2f s\n' "$i" "$dur"
  i=$((i+1))
done
echo "Fatto: $((i-1)) file in $OUT"

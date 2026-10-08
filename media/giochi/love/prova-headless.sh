#!/usr/bin/env bash
# Banco di prova grafico: esegue la sceneggiatura su un display virtuale (Xvfb) con rendering
# software (llvmpipe, nessuna GPU necessaria) e lascia in "schermate/" gli screenshot e il
# report JSON della partita.
#
#   prova-headless.sh [cartellaOutput]
#
# SDL_AUDIODRIVER=dummy: la macchina non ha scheda sonora e LÖVE altrimenti non parte.
set -euo pipefail
QUI="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-$QUI/schermate}"
mkdir -p "$OUT"
cd "$QUI/prototipo"
SDL_AUDIODRIVER=dummy xvfb-run -a --server-args="-screen 0 1024x768x24" \
  love . --harness sceneggiatura.lua --out "$OUT"

#!/usr/bin/env bash
# Esegue la sceneggiatura SENZA grafica (Lua puro): verifica la logica della partita in
# millisecondi, senza display e senza motore. È il primo dei due passi; il secondo è
# prova-headless.sh, che produce anche gli screenshot.
#
#   prova-sceneggiatura.sh [sceneggiatura.lua]
set -euo pipefail
cd "$(dirname "$0")/prototipo"
exec lua5.4 esegui_sceneggiatura.lua "${1:-sceneggiatura.lua}"

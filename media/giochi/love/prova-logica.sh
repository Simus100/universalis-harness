#!/usr/bin/env bash
# Prove della logica di gioco: Lua puro, nessun display, nessun motore grafico.
# Millisecondi, e se una regola è sbagliata lo dice qui.
set -euo pipefail
cd "$(dirname "$0")/prototipo"
exec lua5.4 test_logica.lua

--[[
  esegui_sceneggiatura.lua — la sceneggiatura SENZA GRAFICA (Lua puro).

      lua5.4 esegui_sceneggiatura.lua [sceneggiatura.lua] [quantiComandiStampare]

  Serve a verificare la logica della sceneggiatura in millisecondi (regressioni incluse) e a
  localizzare un fallimento comando per comando. Il banco grafico (prova-headless.sh) resta il
  passo finale, quando servono gli screenshot.
]]
package.path = "./?.lua;" .. package.path
local L = require("logica")
local H = require("harness")

local file = arg[1] or "sceneggiatura.lua"
local dettaglio = tonumber(arg[2] or "0") or 0

local stato = L.nuovo()
if dettaglio > 0 then print("(dettaglio attivo: stampo lo stato dopo ogni comando)") end
H.avvia(file)

local comando = 0
local ultimo = nil
while H.attivo do
  local passi = H.avanza(stato)
  for _, inp in ipairs(passi) do
    L.avanza(stato, 1 / 60, inp)
  end
  if dettaglio > 0 then
    -- stampa una volta per comando (il banco espone il comando in corso nei suoi esiti)
    local n = #H.esiti
    if n ~= ultimo then
      ultimo = n
      local x, y = L.tilePlayer(stato)
      print(string.format("   [%2d] dopo: %s | tile %d,%d | quest: told=%s key=%s porta=%s vinto=%s",
        n, (H.esiti[n] and H.esiti[n].nome or "-"):sub(1, 42), x, y,
        tostring(stato.quest.told), tostring(stato.quest.key), tostring(stato.quest.opened), tostring(stato.quest.won)))
    end
  end
  if comando > 200000 then break end
  comando = comando + 1
end

print(H.report(stato))
os.exit(H.ok and 0 or 1)

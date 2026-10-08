--[[
  logica.lua — IL MONDO, senza grafica.

  Regola della casa: qui non si chiama MAI `love.*`. Tutto quello che decide (collisioni, quest,
  dialoghi, porte) sta in questo file e gira anche con il solo interprete Lua:

      lua5.4 test_logica.lua

  Così la logica si prova in millisecondi e senza display, mentre la parte grafica resta in
  main.lua. È la clausola «test logici headless» del contratto di automazione: se una regola
  di gioco è sbagliata, non serve aprire una finestra per scoprirlo.
]]

local M = {}

-- ------------------------------------------------------------------ mappa
-- Il formato testuale: una griglia leggibile, con un carattere per tile.
--   # albero (solido)  ~ acqua (solida)  m muro (solido)  D porta   K chiave
--   P partenza         1 Custode         2 Nilo            . erba    = sentiero
local MAPPA = {
  "####################",
  "#..................#",
  "#...........mmmmmm.#",
  "#...........m....m.#",
  "#....K......D....m.#",
  "#...........m....m.#",
  "#...........mmmmmm.#",
  "#.........P........#",
  "#...~~~......1.....#",
  "#...~~~........=...#",
  "#.......2......=...#",
  "####################",
}

local T = 32            -- lato di un tile in pixel
local VEL = 132         -- velocità del personaggio (pixel al secondo)

--- Converte la mappa in una griglia a indici 1-based, chiudendo i bordi.
local function costruisciGriglia()
  local larghezza = 0
  for _, riga in ipairs(MAPPA) do larghezza = math.max(larghezza, #riga) end
  local griglia = {}
  for y, riga in ipairs(MAPPA) do
    local r = {}
    for x = 1, larghezza do
      local c = riga:sub(x, x)
      r[x] = (c == "") and "." or c
    end
    for x = 1, larghezza do
      if y == 1 or y == #MAPPA or x == 1 or x == larghezza then r[x] = "#" end
    end
    griglia[y] = r
  end
  return griglia, larghezza, #MAPPA
end

M.T = T
M.VEL = VEL

-- ------------------------------------------------------------------ stato
--- Nuovo mondo: entità estratte dalla griglia, quest azzerata.
function M.nuovo()
  local griglia, larghezza, altezza = costruisciGriglia()
  local s = {
    griglia = griglia,
    larghezza = larghezza,
    altezza = altezza,
    tempo = 0,
    player = { x = T / 2, y = T / 2, dir = "giu", inMovimento = false, passo = 0 },
    npcs = {},
    items = {},
    porte = {},
    quest = { told = false, key = false, opened = false, won = false, hint = false },
    dialogo = nil,
    eventi = {},   -- tracce discrete per le asserzioni (raccolta, apertura, vittoria)
  }
  for y = 1, altezza do
    for x = 1, larghezza do
      local c = griglia[y][x]
      local cx, cy = (x - 1) * T + T / 2, (y - 1) * T + T / 2
      if c == "P" then
        s.player.x, s.player.y = cx, cy
        griglia[y][x] = "."
      elseif c == "1" then
        s.npcs[#s.npcs + 1] = { id = "custode", x = cx, y = cy, dir = "giu", nome = "Custode Ada" }
        griglia[y][x] = "."
      elseif c == "2" then
        s.npcs[#s.npcs + 1] = { id = "nilo", x = cx, y = cy, dir = "destra", nome = "Nilo" }
        griglia[y][x] = "."
      elseif c == "K" then
        s.items[#s.items + 1] = { id = "chiave", x = cx, y = cy, preso = false }
        griglia[y][x] = "."
      elseif c == "D" then
        s.porte[#s.porte + 1] = { x = x, y = y, cx = cx, cy = cy, aperta = false }
      end
    end
  end
  return s
end

--- Posizione iniziale (in pixel) del personaggio, letta dalla mappa.
function M.partenza()
  local s = M.nuovo()
  return s.player.x, s.player.y
end

-- ------------------------------------------------------------- collisioni
local function solido(s, gx, gy)
  if gx < 1 or gy < 1 or gx > s.larghezza or gy > s.altezza then return true end
  local c = s.griglia[gy][gx]
  if c == "#" or c == "~" or c == "m" then return true end
  if c == "D" then
    for _, p in ipairs(s.porte) do
      if p.x == gx and p.y == gy then return not p.aperta end
    end
  end
  return false
end
M.solido = solido

local function bloccato(s, px, py, hw, hh)
  local x0, x1 = math.floor((px - hw) / T) + 1, math.floor((px + hw) / T) + 1
  local y0, y1 = math.floor((py - hh) / T) + 1, math.floor((py + hh) / T) + 1
  for gy = y0, y1 do
    for gx = x0, x1 do
      if solido(s, gx, gy) then return true end
    end
  end
  return false
end
M.bloccato = bloccato

--- Tile (1-based) su cui sta il personaggio: comodo per le asserzioni.
function M.tilePlayer(s)
  return math.floor(s.player.x / T) + 1, math.floor(s.player.y / T) + 1
end

-- ---------------------------------------------------------------- dialogo
local function dice(s, chi, righe, fine)
  s.dialogo = { chi = chi or "", righe = righe, i = 1, lettere = 0, fine = fine }
end
M.dice = dice

function M.avanzaDialogo(s)
  local d = s.dialogo
  if not d then return end
  if d.lettere < #d.righe[d.i] then
    d.lettere = #d.righe[d.i]
    return
  end
  d.i = d.i + 1
  d.lettere = 0
  if d.i > #d.righe then
    s.dialogo = nil
    if d.fine then d.fine(s) end
  end
end

function M.testoDialogo(s)
  local d = s.dialogo
  if not d then return nil end
  return d.chi, d.righe[d.i]:sub(1, math.floor(d.lettere)), d.i, #d.righe
end

-- ------------------------------------------------------------- obiettivo
function M.obiettivo(s)
  if s.quest.won then return "Fatto: la torre è aperta" end
  if not s.quest.told then return "Parla con il Custode Ada" end
  if not s.quest.key then return "Trova la Chiave d'Ambra (a ovest)" end
  if not s.quest.opened then return "Apri la porta della torre (a est)" end
  return "Entra nella torre"
end

-- ---------------------------------------------------------- interazione
local function piuVicino(s, lista, raggio, filtro)
  local migliore, distanza = nil, raggio * raggio
  for _, e in ipairs(lista) do
    if not filtro or filtro(e) then
      -- Le entità hanno x/y in PIXEL; le porte li hanno in TILE (servono così per la griglia e per
      -- il disegno) e portano il centro in pixel in cx/cy: senza questo, la porta non sarebbe mai
      -- «vicina» e resterebbe chiusa per sempre.
      local ex, ey = e.cx or e.x, e.cy or e.y
      local d = (ex - s.player.x) ^ 2 + (ey - s.player.y) ^ 2
      if d < distanza then distanza, migliore = d, e end
    end
  end
  return migliore
end

function M.interagisci(s)
  if s.quest.won then return end
  if s.dialogo then M.avanzaDialogo(s) return end

  local npc = piuVicino(s, s.npcs, 58)
  if npc then
    if npc.id == "custode" then
      if not s.quest.told then
        dice(s, npc.nome, {
          "Le lanterne della torre si sono spente.",
          "La Chiave d'Ambra è nascosta a ovest, oltre il muro.",
          "Portala qui e la porta cederà: la torre è a est.",
        }, function(st) st.quest.told = true end)
      elseif not s.quest.key then
        dice(s, npc.nome, { "La chiave è a ovest, oltre il muro di pietra.", "Segui il sentiero." })
      elseif not s.quest.opened then
        dice(s, npc.nome, { "La Chiave d'Ambra! La porta della torre cederà al tuo tocco." })
      else
        dice(s, npc.nome, { "Le lanterne ardono di nuovo. Grazie, viandante." })
      end
    else
      if not s.quest.key then
        dice(s, npc.nome, { "Cerchi la chiave?", "È a ovest, oltre il muro: un luccichio nell'erba." },
          function(st) st.quest.hint = true end)
      else
        dice(s, npc.nome, { "L'hai trovata! La torre è a est, dalla porta." })
      end
    end
    return
  end

  local item = piuVicino(s, s.items, 44, function(e) return not e.preso end)
  if item then
    item.preso = true
    if item.id == "chiave" then
      s.quest.key = true
      s.eventi[#s.eventi + 1] = "chiave"
      dice(s, "", { "Hai raccolto la Chiave d'Ambra." })
    end
    return
  end

  local porta = piuVicino(s, s.porte, 50, function(p) return not p.aperta end)
  if porta then
    if s.quest.key then
      porta.aperta = true
      s.quest.opened = true
      s.eventi[#s.eventi + 1] = "porta"
      dice(s, "", { "La porta si apre cigolando." })
    else
      dice(s, "", { "La porta è chiusa: serve la Chiave d'Ambra." })
    end
    return
  end
  -- niente vicino: nessun effetto, ma resta un evento per le asserzioni
  s.eventi[#s.eventi + 1] = "vuoto"
end

-- ------------------------------------------------------------------ passo
--- Avanza il mondo di `dt` secondi. `input` = {su,giu,sinistra,destra,interagisci}.
function M.avanza(s, dt, input)
  input = input or {}
  s.tempo = s.tempo + dt

  if s.dialogo then
    local d = s.dialogo
    d.lettere = math.min(#d.righe[d.i], d.lettere + dt * 46)
  end

  if input.interagisci then
    input.interagisci = false   -- un tocco per volta: l'evento si consuma qui
    M.interagisci(s)
  end

  local dx, dy = 0, 0
  if not s.dialogo and not s.quest.won then
    if input.sinistra then dx = dx - 1 end
    if input.destra then dx = dx + 1 end
    if input.su then dy = dy - 1 end
    if input.giu then dy = dy + 1 end
  end
  if dx ~= 0 and dy ~= 0 then
    local k = 0.70710678
    dx, dy = dx * k, dy * k
  end
  s.player.inMovimento = (dx ~= 0 or dy ~= 0)

  if s.player.inMovimento then
    local nx = s.player.x + dx * VEL * dt
    if not bloccato(s, nx, s.player.y, 9, 8) then s.player.x = nx end
    local ny = s.player.y + dy * VEL * dt
    if not bloccato(s, s.player.x, ny, 9, 8) then s.player.y = ny end
    if math.abs(dx) > math.abs(dy) then
      s.player.dir = dx < 0 and "sinistra" or "destra"
    else
      s.player.dir = dy < 0 and "su" or "giu"
    end
    s.player.passo = s.player.passo + dt * 9
  end

  -- entrare nella torre = vittoria. Muri orizzontali alle righe 3 e 7 (x 13..18) e verticali
  -- alle colonne 13 e 18 (righe 4..6): l'interno è x 14..17, y 4..6. A ovest resta un
  -- corridoio di DUE tile (x 11 e 12): con movimento libero un passaggio largo un tile solo
  -- incastra il personaggio (hitbox 18 px in 32), e per un giocatore umano è solo fastidioso.
  local tx, ty = M.tilePlayer(s)
  local dentro = tx >= 14 and tx <= 17 and ty >= 4 and ty <= 6
  if dentro and s.quest.opened and not s.quest.won then
    s.quest.won = true
    s.eventi[#s.eventi + 1] = "vittoria"
  end
end

-- ------------------------------------------------------- stato per l'esterno
--- Una tabella piatta di valori verificabili: la usano gli script di prova.
function M.sonda(s)
  local tx, ty = M.tilePlayer(s)
  return {
    ["player.tile_x"] = tx,
    ["player.tile_y"] = ty,
    ["player.x"] = math.floor(s.player.x),
    ["player.y"] = math.floor(s.player.y),
    ["player.dir"] = s.player.dir,
    ["quest.told"] = s.quest.told,
    ["quest.key"] = s.quest.key,
    ["quest.opened"] = s.quest.opened,
    ["quest.won"] = s.quest.won,
    ["quest.hint"] = s.quest.hint,
    ["dialogo.aperto"] = s.dialogo ~= nil,
    ["chiave.presa"] = (function()
      for _, i in ipairs(s.items) do if i.id == "chiave" and i.preso then return true end end
      return false
    end)(),
    ["porta.aperta"] = (function()
      for _, p in ipairs(s.porte) do if p.aperta then return true end end
      return false
    end)(),
    eventi = table.concat(s.eventi, ","),
  }
end

return M

--[[
  main.lua — la PRESENTAZIONE: disegno, input da tastiera, ciclo del motore.

  Qui sta solo quello che ha bisogno di LÖVE: le regole del mondo sono in `logica.lua` (puro Lua,
  provabile senza display). Con `--harness <sceneggiatura>` la tastiera è sostituita dal banco di
  prova: il gioco si gioca da solo, a passi di tempo fissi, e lascia screenshot e report.

      love . --harness sceneggiatura.lua --out /percorso/schermate
]]

local L = require("logica")
local H = require("harness")

local PASSO = 1 / 60
local stato
-- La finestra è 800x600 e la mappa è 20x12 tile da 32 px = 640x384: con scala 1 entra tutta e
-- resta nitida (una scala non intera sfocherebbe i bordi). I personaggi sono disegnati in
-- proporzione al tile, quindi restano leggibili.
local scala = 1
local offX, offY = 80, 70
local schermate = "schermate"
local fontPiccola, fontMedia, fontGrande

local input = { su = false, giu = false, sinistra = false, destra = false, interagisci = false }

-- ---------------------------------------------------------------- utilità
local function leggiArgomenti(args)
  local opt = { harness = nil, out = "schermate", scala = 1 }
  local i = 1
  while i <= #args do
    local a = args[i]
    if a == "--harness" then opt.harness = args[i + 1] i = i + 1
    elseif a == "--out" then opt.out = args[i + 1] i = i + 1
    elseif a == "--scala" then opt.scala = tonumber(args[i + 1]) or 2 i = i + 1 end
    i = i + 1
  end
  return opt
end

--- Variazione deterministica: ogni tile è diverso ma sempre uguale a se stesso.
local function variazione(x, y)
  local n = (x * 374761393 + y * 668265263) % 2147483647
  n = (n * 1274126177) % 2147483647
  return (n % 1000) / 1000
end

-- ------------------------------------------------------------------ disegno
local function disegnaTile(c, gx, gy, px, py, s)
  local r = variazione(gx, gy)
  local t = s

  if c == "~" then
    love.graphics.setColor(0.18, 0.44, 0.66)
    love.graphics.rectangle("fill", px, py, t, t)
    love.graphics.setColor(0.47, 0.75, 0.92, 0.35)
    for i = 0, 2 do
      local yy = py + 8 * s / 32 + i * 9 * s / 32 + math.sin(stato.tempo * 1.6 + gx + i) * 2
      love.graphics.rectangle("fill", px + 4 * s / 32 + ((i * 11 + gx * 5) % 20) * s / 32, yy, 12 * s / 32, 2 * s / 32)
    end
    return
  end
  if c == "=" then
    love.graphics.setColor(0.70, 0.58, 0.41)
    love.graphics.rectangle("fill", px, py, t, t)
    love.graphics.setColor(0.47, 0.37, 0.24, 0.5)
    love.graphics.rectangle("fill", px + (2 + r * 24) * s / 32, py + (3 + variazione(gy, gx) * 22) * s / 32, 3 * s / 32, 2 * s / 32)
    return
  end

  -- erba
  local tono = r < 0.34 and { 0.25, 0.49, 0.29 } or (r < 0.67 and { 0.27, 0.53, 0.31 } or { 0.22, 0.45, 0.27 })
  love.graphics.setColor(tono)
  love.graphics.rectangle("fill", px, py, t, t)

  if c == "m" then  -- muro di pietra
    love.graphics.setColor(0.54, 0.52, 0.47)
    love.graphics.rectangle("fill", px, py, t, t)
    love.graphics.setColor(0.47, 0.45, 0.41)
    love.graphics.rectangle("fill", px, py + 15 * s / 32, t, 2 * s / 32)
    local off = (gy % 2) * 16
    love.graphics.rectangle("fill", px + ((off + 8) % 32) * s / 32, py, 2 * s / 32, 15 * s / 32)
    love.graphics.rectangle("fill", px + ((off + 24) % 32) * s / 32, py + 17 * s / 32, 2 * s / 32, 15 * s / 32)
    love.graphics.setColor(1, 1, 1, 0.10)
    love.graphics.rectangle("fill", px, py, t, 2 * s / 32)
    return
  end
  if c == "#" then  -- albero
    love.graphics.setColor(0.06, 0.14, 0.08, 0.30)
    love.graphics.ellipse("fill", px + t / 2 + 3, py + 27 * s / 32, 12 * s / 32, 5 * s / 32)
    love.graphics.setColor(0.42, 0.29, 0.18)
    love.graphics.rectangle("fill", px + 13 * s / 32, py + 16 * s / 32, 6 * s / 32, 14 * s / 32)
    love.graphics.setColor(r > 0.5 and { 0.17, 0.37, 0.23 } or { 0.16, 0.34, 0.20 })
    love.graphics.circle("fill", px + t / 2, py + 12 * s / 32, 12.5 * s / 32)
    love.graphics.setColor(r > 0.5 and { 0.21, 0.42, 0.26 } or { 0.19, 0.38, 0.25 })
    love.graphics.circle("fill", px + 11 * s / 32, py + 9 * s / 32, 8 * s / 32)
    love.graphics.circle("fill", px + 21 * s / 32, py + 10 * s / 32, 7.5 * s / 32)
    return
  end
  if c == "D" then  -- porta (aperta: varco scuro)
    local aperta = false
    for _, p in ipairs(stato.porte) do
      if p.x == gx and p.y == gy and p.aperta then aperta = true end
    end
    if aperta then
      love.graphics.setColor(0.70, 0.58, 0.41)
      love.graphics.rectangle("fill", px, py, t, t)
      love.graphics.setColor(0.10, 0.08, 0.06)
      love.graphics.rectangle("fill", px + 4 * s / 32, py + 2 * s / 32, 24 * s / 32, 30 * s / 32)
    else
      love.graphics.setColor(0.55, 0.35, 0.17)
      love.graphics.rectangle("fill", px + 2 * s / 32, py + s / 32, 28 * s / 32, 31 * s / 32)
      love.graphics.setColor(0.46, 0.29, 0.13)
      love.graphics.rectangle("fill", px + 6 * s / 32, py + s / 32, 2 * s / 32, 31 * s / 32)
      love.graphics.rectangle("fill", px + 16 * s / 32, py + s / 32, 2 * s / 32, 31 * s / 32)
      love.graphics.setColor(0.88, 0.81, 0.68)
      love.graphics.circle("fill", px + 22 * s / 32, py + 17 * s / 32, 2.6 * s / 32)
    end
    return
  end

  -- fili d'erba
  love.graphics.setColor(0.11, 0.29, 0.16, 0.55)
  love.graphics.setLineWidth(1)
  love.graphics.line(
    px + (6 + r * 18) * s / 32, py + 26 * s / 32,
    px + (6 + r * 18) * s / 32 + (variazione(gy, gx) - 0.5) * 4, py + 20 * s / 32
  )
end

local function disegnaPersonaggio(e, tavolozza, chiSono)
  -- s = lato del tile A SCHERMO (32 px per scala): le misure qui sotto sono scritte in trentaduesimi
  -- di tile, quindi con `s = scala` diventavano invisibili.
  local s = 32 * scala
  local px, py = e.x, e.y
  local rimbalzo = (e.inMovimento and math.sin(e.passo) * 1.6 or 0)

  love.graphics.setColor(0.04, 0.09, 0.06, 0.30)
  love.graphics.ellipse("fill", px, py + 9 * s / 32, 11 * s / 32, 4.5 * s / 32)

  local by = py - 6 * s / 32 + rimbalzo * s / 32
  love.graphics.setColor(tavolozza.veste)
  love.graphics.rectangle("fill", px - 8 * s / 32, by - 6 * s / 32, 16 * s / 32, 17 * s / 32, 4)
  love.graphics.setColor(tavolozza.bordo)
  love.graphics.rectangle("fill", px - 8 * s / 32, by + 7 * s / 32, 16 * s / 32, 4 * s / 32)
  love.graphics.setColor(tavolozza.pelle)
  love.graphics.circle("fill", px, by - 12 * s / 32, 7.2 * s / 32)
  love.graphics.setColor(tavolozza.capelli)
  love.graphics.arc("fill", px, by - 14 * s / 32, 7.4 * s / 32, math.pi, 2 * math.pi)
  love.graphics.setColor(0.16, 0.13, 0.09)
  if e.dir == "giu" then
    love.graphics.rectangle("fill", px - 3.4 * s / 32, by - 12 * s / 32, 1.8 * s / 32, 2 * s / 32)
    love.graphics.rectangle("fill", px + 1.6 * s / 32, by - 12 * s / 32, 1.8 * s / 32, 2 * s / 32)
  elseif e.dir == "sinistra" then
    love.graphics.rectangle("fill", px - 5.4 * s / 32, by - 12 * s / 32, 1.8 * s / 32, 2 * s / 32)
  elseif e.dir == "destra" then
    love.graphics.rectangle("fill", px + 3.6 * s / 32, by - 12 * s / 32, 1.8 * s / 32, 2 * s / 32)
  elseif chiSono == "player" then
    love.graphics.rectangle("fill", px - 4 * s / 32, by - 14 * s / 32, 8 * s / 32, 2 * s / 32)
  end
end

local function disegnaChiave(it)
  local s = 32 * scala
  local y = it.y + math.sin(stato.tempo * 2.4) * 3
  love.graphics.setColor(0.95, 0.70, 0.24, 0.30)
  love.graphics.circle("fill", it.x, y, 26 * s / 32)
  love.graphics.setColor(0.95, 0.70, 0.24)
  love.graphics.circle("fill", it.x, y - 6 * s / 32, 5 * s / 32)
  love.graphics.rectangle("fill", it.x - 1.6 * s / 32, y - 2 * s / 32, 3.2 * s / 32, 14 * s / 32)
  love.graphics.rectangle("fill", it.x + 1.6 * s / 32, y + 6 * s / 32, 5 * s / 32, 2.6 * s / 32)
end

local function disegnaHud()
  love.graphics.setColor(0.05, 0.07, 0.09, 0.80)
  local testo = "Obiettivo: " .. L.obiettivo(stato)
  local larghezza = fontMedia:getWidth(testo) + 34
  love.graphics.rectangle("fill", 16, 16, larghezza, 34, 9)
  love.graphics.setColor(0.95, 0.70, 0.24)
  love.graphics.circle("fill", 32, 33, 5)
  love.graphics.setColor(0.94, 0.92, 0.87)
  love.graphics.print(testo, 46, 23)

  -- inventario
  local iw = 172
  love.graphics.setColor(0.05, 0.07, 0.09, 0.80)
  love.graphics.rectangle("fill", 800 - iw - 16, 16, iw, 34, 9)
  love.graphics.setColor(stato.quest.key and 0.95 or 0.35, stato.quest.key and 0.70 or 0.38, stato.quest.key and 0.24 or 0.42)
  love.graphics.circle("fill", 800 - iw - 4, 33, 4.5)
  love.graphics.setColor(stato.quest.key and 0.94 or 0.36, stato.quest.key and 0.92 or 0.39, stato.quest.key and 0.87 or 0.43)
  love.graphics.print("Chiave d'Ambra", 800 - iw + 8, 24)
end

local function disegnaDialogo()
  if not stato.dialogo then return end        -- nessun box vuoto a dialogo finito
  local chi, testo = L.testoDialogo(stato)
  local h = 104
  local y = 600 - h - 20
  love.graphics.setColor(0.04, 0.06, 0.08, 0.93)
  love.graphics.rectangle("fill", 20, y, 760, h, 12)
  love.graphics.setColor(0.95, 0.70, 0.24, 0.45)
  love.graphics.setLineWidth(1.5)
  love.graphics.rectangle("line", 20, y, 760, h, 12)
  love.graphics.setColor(1.0, 0.78, 0.35)
  if chi and chi ~= "" then love.graphics.print(chi, 42, y + 16) end
  love.graphics.setColor(0.94, 0.92, 0.87)
  love.graphics.printf(testo or "", 42, y + ((chi and chi ~= "") and 44 or 34), 716)
end

-- -------------------------------------------------------------------- ciclo
function love.load(args)
  local opt = leggiArgomenti(args or {})
  scala, schermate = opt.scala, opt.out
  love.graphics.setDefaultFilter("linear", "linear")
  fontPiccola = love.graphics.newFont(12)
  fontMedia = love.graphics.newFont(15)
  fontGrande = love.graphics.newFont(28)
  love.graphics.setFont(fontMedia)
  stato = L.nuovo()
  if opt.harness then
    print("== banco di prova attivo: " .. opt.harness)
    os.execute("mkdir -p '" .. schermate .. "'")
    H.avvia(opt.harness)
  end
end

function love.update(dt)
  if H.attivo then
    for _, inp in ipairs(H.avanza(stato)) do
      L.avanza(stato, PASSO, inp)
    end
    if H.finito then
      local report = H.report(stato)
      local f = io.open(schermate .. "/report.json", "w")
      if f then f:write(report) f:close() end
      io.write(report)
      io.write(H.ok and "\n== prova superata\n" or "\n== prova fallita\n")
      love.event.quit(H.ok and 0 or 1)
    end
    return
  end

  input.su = love.keyboard.isDown("up", "w")
  input.giu = love.keyboard.isDown("down", "s")
  input.sinistra = love.keyboard.isDown("left", "a")
  input.destra = love.keyboard.isDown("right", "d")
  L.avanza(stato, dt, input)
end

function love.keypressed(tasto)
  if H.attivo then return end
  if tasto == "e" or tasto == "space" then
    input.interagisci = true
    L.avanza(stato, 0, input)
  elseif tasto == "escape" then
    love.event.quit(0)
  end
end

function love.draw()
  love.graphics.clear(0.08, 0.10, 0.12)

  love.graphics.push()
  love.graphics.translate(offX, offY)
  love.graphics.scale(scala)
  local s = 32   -- da qui in poi si disegna in unità di tile, la scala la mette LÖVE

  for gy = 1, stato.altezza do
    for gx = 1, stato.larghezza do
      disegnaTile(stato.griglia[gy][gx], gx, gy, (gx - 1) * s, (gy - 1) * s, s)
    end
  end
  love.graphics.pop()

  love.graphics.push()
  love.graphics.translate(offX, offY)
  -- chiave e personaggi si disegnano in pixel già scalati (la scala è applicata a mano qui)
  for _, it in ipairs(stato.items) do
    if not it.preso then disegnaChiave({ x = it.x * scala, y = it.y * scala }) end
  end
  disegnaPersonaggio({ x = stato.player.x * scala, y = stato.player.y * scala, dir = stato.player.dir,
    inMovimento = stato.player.inMovimento, passo = stato.player.passo }, { veste = { 0.23, 0.44, 0.83 }, bordo = { 0.16, 0.31, 0.61 },
    pelle = { 0.94, 0.79, 0.63 }, capelli = { 0.35, 0.23, 0.14 } }, "player")
  for _, n in ipairs(stato.npcs) do
    local pal = (n.id == "custode")
      and { veste = { 0.48, 0.36, 0.62 }, bordo = { 0.36, 0.26, 0.46 }, pelle = { 0.91, 0.74, 0.58 }, capelli = { 0.90, 0.90, 0.90 } }
      or { veste = { 0.85, 0.55, 0.23 }, bordo = { 0.66, 0.41, 0.12 }, pelle = { 0.94, 0.79, 0.63 }, capelli = { 0.54, 0.29, 0.15 } }
    disegnaPersonaggio({ x = n.x * scala, y = n.y * scala, dir = n.dir, inMovimento = false, passo = 0 }, pal, "npc")
  end
  love.graphics.pop()

  disegnaHud()
  disegnaDialogo()
  love.graphics.setFont(fontMedia)

  if H.attivo and H.daCatturare() then
    local nome = H.nomeScreenshot()
    love.graphics.captureScreenshot(function(immagine)
      local f = io.open(schermate .. "/" .. nome, "wb")
      if f then
        f:write(immagine:encode("png"):getString())
        f:close()
      end
      print("  screenshot: " .. nome)
      H.catturato()
    end)
  end
end

--[[
  test_logica.lua — prove della LOGICA, senza grafica e senza LÖVE.

      lua5.4 test_logica.lua

  Gira in millisecondi: è la clausola «test logici headless» del contratto di automazione.
  Se una regola di gioco è sbagliata si scopre qui, non guardando uno screenshot.

  I movimenti sono rettilinei e a tappe (vaiX / vaiY) con un centraggio sul tile: così le prove
  non dipendono da tempi calcolati a mano e non si incastrano nei corridoi stretti.

  Mappa: partenza (11,8) · Nilo (9,11) · Custode Ada (14,9) · Chiave (6,5) · porta della torre
  (13,5) · interno x 14..17, y 4..6 · acqua x 5..7, y 9..10 · corridoio libero a x 11-12.
]]

package.path = "./?.lua;" .. package.path
local L = require("logica")

local T = 32
local pass, fail = 0, 0
local function check(nome, condizione, dettaglio)
  if condizione then
    print("  OK  " .. nome)
    pass = pass + 1
  else
    print("  FALLITO " .. nome .. (dettaglio and (" — " .. dettaglio) or ""))
    fail = fail + 1
  end
end

local function nuovo() return L.nuovo() end
local function tileX(s) return (L.tilePlayer(s)) end
local function tileY(s) local _, y = L.tilePlayer(s) return y end

--- Muove di un asse verso il tile `bersaglio`. true se l'ha raggiunto, false se fermato prima.
local function vaiX(s, bersaglio, maxSecondi)
  local t = 0
  while t < (maxSecondi or 6) do
    local cx = tileX(s)
    if cx == bersaglio then return true end
    L.avanza(s, 1 / 60, { [(cx < bersaglio) and "destra" or "sinistra"] = true })
    t = t + 1 / 60
  end
  return false
end

local function vaiY(s, bersaglio, maxSecondi)
  local t = 0
  while t < (maxSecondi or 6) do
    local cy = tileY(s)
    if cy == bersaglio then return true end
    L.avanza(s, 1 / 60, { [(cy < bersaglio) and "giu" or "su"] = true })
    t = t + 1 / 60
  end
  return false
end

--- Porta il personaggio al centro del tile su cui si trova: i corridoi larghi due tile non
--- perdonano un'entrata "di striscio", e un test che si incastra non dice nulla sul gioco.
local function centra(s)
  local cx, cy = L.tilePlayer(s)
  local bx, by = (cx - 1) * T + T / 2, (cy - 1) * T + T / 2
  local t = 0
  while t < 1.5 do
    local inp = {}
    if s.player.x < bx - 0.6 then inp.destra = true elseif s.player.x > bx + 0.6 then inp.sinistra = true end
    if s.player.y < by - 0.6 then inp.giu = true elseif s.player.y > by + 0.6 then inp.su = true end
    if not (inp.destra or inp.sinistra or inp.giu or inp.su) then return end
    L.avanza(s, 1 / 60, inp)
    t = t + 1 / 60
  end
end

local function interagisci(s, volte)
  for _ = 1, (volte or 1) do L.avanza(s, 1 / 60, { interagisci = true }) end
end

--- Legge tutto il dialogo in corso (un tocco completa la riga, il successivo passa avanti).
local function leggiDialogo(s)
  for _ = 1, 40 do
    if s.dialogo == nil then return end
    L.avanza(s, 1 / 60, { interagisci = true })
  end
end

--- Percorso: partenza → Nilo → Custode Ada → chiave → fermo davanti alla porta (chiusa).
local function vaiAllaPorta(s)
  vaiY(s, 11) centra(s) vaiX(s, 9) centra(s)
  interagisci(s, 1) leggiDialogo(s)
  vaiY(s, 9) centra(s) vaiX(s, 14) centra(s)
  interagisci(s, 1) leggiDialogo(s)
  vaiX(s, 12) centra(s) vaiY(s, 5) centra(s) vaiX(s, 6) centra(s)
  interagisci(s, 1) leggiDialogo(s)
  vaiX(s, 13) centra(s)
end

print("1. mondo e mappa")
local s = nuovo()
check("la mappa è rettangolare (20x12)", s.larghezza == 20 and s.altezza == 12, s.larghezza .. "x" .. s.altezza)
check("i bordi sono chiusi", L.solido(s, 1, 1) and L.solido(s, 20, 12) and L.solido(s, 1, 6))
check("il personaggio parte su P (11,8)", tileX(s) == 11 and tileY(s) == 8, tileX(s) .. "," .. tileY(s))
check("l'obiettivo iniziale parla del Custode", L.obiettivo(s):find("Custode") ~= nil, L.obiettivo(s))

print("2. collisioni (gli ostacoli fermano davvero)")
s = nuovo()
vaiY(s, 9) centra(s)
check("l'acqua blocca il passaggio", vaiX(s, 5, 4) == false and tileX(s) == 8, "fermo a x=" .. tileX(s))
s = nuovo()
check("la porta è solida finché è chiusa", L.solido(s, 13, 5) == true)
vaiY(s, 5) centra(s)
check("il muro della torre blocca", vaiX(s, 13, 4) == false and tileX(s) == 12, "fermo a x=" .. tileX(s))
s = nuovo()
check("gli alberi del bordo bloccano", vaiY(s, 1, 4) == false and tileY(s) == 2, "fermo a y=" .. tileY(s))

print("3. dialoghi e quest")
s = nuovo()
vaiY(s, 11) centra(s) vaiX(s, 9) centra(s)
interagisci(s, 1)
check("interagendo con Nilo si apre un dialogo", s.dialogo ~= nil)
interagisci(s, 1)
check("il dialogo avanza riga per riga", s.dialogo ~= nil)
leggiDialogo(s)
check("finita la conversazione il dialogo si chiude", s.dialogo == nil)
check("l'indizio si registra solo alla fine", s.quest.hint == true)
check("il Custode non è ancora stato sentito", s.quest.told == false)

print("4. chiave, porta, vittoria")
s = nuovo()
check("senza chiave la porta resta chiusa", L.solido(s, 13, 5) == true)
vaiAllaPorta(s)
check("parlando con il Custode l'incarico è accettato", s.quest.told == true)
check("la chiave è stata raccolta", s.quest.key == true and L.sonda(s)["chiave.presa"] == true)
check("l'obiettivo ora indica la porta", L.obiettivo(s):find("porta") ~= nil, L.obiettivo(s))
interagisci(s, 1)
check("con la chiave la porta si apre", s.quest.opened == true and L.solido(s, 13, 5) == false)
leggiDialogo(s)
local entrato = vaiX(s, 14, 3)
check("entrando nella torre si vince", s.quest.won == true, "entrato=" .. tostring(entrato))
check("la vittoria resta negli eventi", L.sonda(s).eventi:find("vittoria") ~= nil, L.sonda(s).eventi)
check("a partita vinta l'obiettivo lo dice", L.obiettivo(s):find("Fatto") ~= nil, L.obiettivo(s))

print("5. determinismo (la stessa partita dà lo stesso risultato)")
local function partita()
  local st = nuovo()
  vaiAllaPorta(st)
  interagisci(st, 1) leggiDialogo(st)
  vaiX(st, 14, 3) centra(st)
  return L.sonda(st)
end
local a, b = partita(), partita()
local uguali, differenza = true, nil
for k, v in pairs(a) do if b[k] ~= v then uguali, differenza = false, k end end
check("due esecuzioni identiche", uguali, differenza and ("differenza su " .. differenza))

print("6. il dialogo tiene il personaggio fermo")
s = nuovo()
vaiY(s, 11) centra(s) vaiX(s, 9) centra(s)
interagisci(s, 1)
local xprima, yprima = s.player.x, s.player.y
L.avanza(s, 1 / 60, { destra = true })
L.avanza(s, 1 / 60, { giu = true })
check("con il dialogo aperto non si muove", math.abs(s.player.x - xprima) < 0.01 and math.abs(s.player.y - yprima) < 0.01)

print(string.format("\n%s: %d controlli ok, %d falliti", fail == 0 and "PROVA SUPERATA" or "PROVA FALLITA", pass, fail))
os.exit(fail == 0 and 0 or 1)

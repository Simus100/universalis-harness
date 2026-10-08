--[[
  harness.lua — IL BANCO DI PROVA: gioca al posto mio.

  Una «sceneggiatura» è una sequenza di comandi che descrive una partita:

      return {
        { nota = "mi avvicino a Nilo" },
        { tasti = { giu = true }, secondi = 1.2 },
        { tasti = { giu = false } },
        { interagisci = true, secondi = 0.3 },   -- apre il dialogo alla fine dei 0,3 s
        { leggi = true },                        -- lo legge tutto (senza un tocco di troppo)
        { screenshot = "02-nilo.png" },
        { atteso = { ["quest.hint"] = true } },
      }

  Modello (e il dettaglio che lo rende affidabile):
  · ogni comando ha una DURATA — `tile = 3` (unità di gioco, consigliato) oppure `secondi` —
  · i tasti si applicano quando il comando comincia; `interagisci`, `leggi`, `atteso` e
    `screenshot` quando il tempo è scaduto;
  · il tempo si consuma a passi FISSI di 1/60 di secondo, quindi la stessa sceneggiatura dà
    sempre lo stesso risultato, su qualunque macchina, con o senza GPU;
  · quando un comando produce un EFFETTO sul mondo (un tocco), il frame finisce lì: le
    verifiche e la lettura del dialogo avvengono al frame SUCCESSIVO, altrimenti si
    guarderebbe uno stato che il mondo non ha ancora ricevuto (era il difetto che faceva
    «non vedere» il dialogo appena aperto).

  È la clausola «verifica visiva + fixture riavviabile» del contratto di automazione: nessun
  umano guarda, nessuno preme tasti, e un difetto si riproduce sempre allo stesso modo.
]]

local H = {}

local T = 1 / 60          -- passo fisso della simulazione
local SCATTI = 8          -- passi simulati per frame: la sceneggiatura corre più del vsync
-- Durata di un tile di movimento, letta dalla logica: così una sceneggiatura si scrive in TILE
-- («vai 3 tile a sud») invece che in secondi calcolati a mano, che si sbagliano sempre.
local TILE_SECONDI_MARGINE = 0.03

H.attivo = false
H.finito = false
H.ok = true
H.esiti = {}
H.note = {}
H.depura = false          -- true: stampa ogni comando eseguito (serve a localizzare un blocco)

local comandi = {}
local indice = 1
local corrente = nil      -- comando in corso (tempo che scorre)
local rinvio = nil        -- comando col tempo scaduto: le sue verifiche toccano al frame dopo
local residuo = 0
local tasti = {}
local attendeScreenshot = nil
local nomeScreenshot = nil

local function registra(nome, esito, dettaglio)
  dettaglio = dettaglio or ""
  H.esiti[#H.esiti + 1] = { nome = nome, esito = esito, dettaglio = dettaglio }
  if not esito then H.ok = false end
  print(string.format("  %s %s%s", esito and "OK  " or "FALLITO", nome, (dettaglio ~= "") and (" — " .. dettaglio) or ""))
end

--- Traccia dei comandi (si accende con H.depura = true).
H.traccia = function(cmd, fase, stato)
  if not H.depura or not cmd then return end
  local parti = {}
  if cmd.tasti then
    local t = {}
    for k, v in pairs(cmd.tasti) do t[#t + 1] = k .. "=" .. tostring(v) end
    parti[#parti + 1] = "tasti{" .. table.concat(t, ",") .. "}"
  end
  if cmd.secondi then parti[#parti + 1] = "secondi=" .. cmd.secondi end
  if cmd.interagisci then parti[#parti + 1] = "INTERAGISCI" end
  if cmd.leggi then parti[#parti + 1] = "LEGGI" end
  if cmd.screenshot then parti[#parti + 1] = "screenshot=" .. cmd.screenshot end
  if cmd.atteso then parti[#parti + 1] = "atteso" end
  local x, y = require("logica").tilePlayer(stato)
  print(string.format("    %-6s tile %2d,%2d dialogo=%-5s %s", fase, x, y, tostring(stato.dialogo ~= nil), table.concat(parti, " ")))
end

--- Prepara il banco: carica la sceneggiatura e comincia dall'inizio.
function H.avvia(percorso)
  local pezzo = assert(loadfile(percorso))
  comandi = assert(pezzo(), "la sceneggiatura deve restituire una tabella di comandi")
  indice, corrente, rinvio, residuo, tasti, attendeScreenshot = 1, nil, nil, 0, {}, nil
  H.attivo, H.finito, H.ok = true, false, true
  H.esiti, H.note = {}, {}
  registra("sceneggiatura caricata (" .. #comandi .. " comandi)", true)
end

local function valore(sonda, chiave)
  if sonda[chiave] ~= nil then return sonda[chiave] end
  local tab, campo = sonda, chiave
  while true do
    local punto = campo:find("%.")
    if not punto then break end
    tab = tab and tab[campo:sub(1, punto - 1)]
    campo = campo:sub(punto + 1)
  end
  return tab and tab[campo]
end

--- Azioni che si eseguono al frame SUCCESSIVO alla fine del tempo del comando.
--- Ritorna true se il banco deve sospendersi in attesa di un frame disegnato (screenshot).
local function eseguiFinali(cmd, stato)
  H.traccia(cmd, "verifica", stato)

  -- `leggi`: legge il dialogo in corso FINO IN FONDO. Serve perché un tocco in più, a dialogo
  -- chiuso, lo riaprirebbe (si è ancora vicini a chi parla): con i numeri di tocchi fissi,
  -- cambiare una battuta romperebbe la prova.
  if cmd.leggi then
    local logica = require("logica")
    for _ = 1, 80 do
      if stato.dialogo == nil then break end
      logica.avanza(stato, T, { interagisci = true })
    end
  end

  if cmd.atteso then
    local sonda = require("logica").sonda(stato)
    for chiave, voluto in pairs(cmd.atteso) do
      local ottenuto = valore(sonda, chiave)
      registra(
        string.format("atteso %s = %s", chiave, tostring(voluto)),
        ottenuto == voluto,
        string.format("ottenuto %s", tostring(ottenuto))
      )
    end
  end

  if cmd.screenshot then
    nomeScreenshot = cmd.screenshot
    attendeScreenshot = true
    return true
  end
  return false
end

local function cominciaProssimo(stato)
  if indice > #comandi then return false end
  local c = comandi[indice]
  indice = indice + 1
  if c.tasti then
    for t, premuto in pairs(c.tasti) do tasti[t] = premuto end
  end
  if c.nota then H.note[#H.note + 1] = c.nota end
  corrente = c
  if c.tile then
    local logica = require("logica")
    residuo = c.tile * (logica.T / logica.VEL) + TILE_SECONDI_MARGINE
  else
    residuo = c.secondi or 0
  end
  H.traccia(c, "inizio", stato)
  return true
end

--- Avanza la sceneggiatura di questo frame.
--- Ritorna la LISTA degli input dei passi simulati (uno per passo da 1/60): il motore li applica
--- in ordine, così il tempo della sceneggiatura e quello del mondo restano lo stesso tempo.
function H.avanza(stato)
  if not H.attivo then return {} end
  local applicati = {}

  local passi = 0
  while passi < SCATTI do
    passi = passi + 1

    -- azioni finali del comando concluso al frame precedente
    if rinvio then
      local c = rinvio
      rinvio = nil
      if eseguiFinali(c, stato) then return applicati end
    end

    if not corrente and not cominciaProssimo(stato) then
      H.attivo, H.finito = false, true
      registra("sceneggiatura conclusa", H.ok)
      return applicati
    end

    local input = {}
    for t, premuto in pairs(tasti) do input[t] = premuto end

    if residuo <= 0 then
      local c = corrente
      corrente = nil
      rinvio = c                                  -- le verifiche toccano al frame successivo
      if c.interagisci then input.interagisci = true end
      applicati[#applicati + 1] = input
      return applicati                            -- il frame finisce: il mondo riceve l'effetto
    end

    residuo = residuo - math.min(T, residuo)
    applicati[#applicati + 1] = input
  end
  return applicati
end

--- True se il motore deve disegnare e catturare uno screenshot prima di proseguire.
function H.daCatturare()
  return attendeScreenshot
end

function H.nomeScreenshot()
  return nomeScreenshot
end

function H.catturato()
  attendeScreenshot, nomeScreenshot = false, nil
end

--- Tabella piatta -> JSON (ordine stabile: serve a confrontare i report fra esecuzioni).
local function jsonSemplice(t)
  local chiavi = {}
  for k in pairs(t) do chiavi[#chiavi + 1] = k end
  table.sort(chiavi)
  local pezzi = {}
  for _, k in ipairs(chiavi) do
    local v = t[k]
    local valoreJson
    local tipo = type(v)
    if tipo == "string" then
      valoreJson = string.format("%q", v)
    elseif tipo == "number" then
      valoreJson = string.format("%.3f", v)
    else
      valoreJson = tostring(v)
    end
    pezzi[#pezzi + 1] = string.format("%q: %s", k, valoreJson)
  end
  return "{" .. table.concat(pezzi, ", ") .. "}"
end

--- Report JSON della prova: esiti, note e stato finale.
function H.report(stato)
  local esiti, note = {}, {}
  for _, e in ipairs(H.esiti) do
    esiti[#esiti + 1] = string.format('{"nome": %q, "esito": %s, "dettaglio": %q}', e.nome, tostring(e.esito), e.dettaglio)
  end
  for _, n in ipairs(H.note) do note[#note + 1] = string.format("%q", n) end
  return string.format(
    '{\n  "ok": %s,\n  "comandi": %d,\n  "esiti": [%s],\n  "note": [%s],\n  "stato": %s\n}\n',
    tostring(H.ok), #comandi, table.concat(esiti, ", "), table.concat(note, ", "),
    jsonSemplice(require("logica").sonda(stato))
  )
end

return H

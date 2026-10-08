--[[
  sceneggiatura.lua — una partita completa giocata dal banco di prova.

  Percorso: partenza → Nilo (indizio) → Custode Ada (incarico) → Chiave d'Ambra a ovest →
  porta della torre aperta → vittoria. Screenshot nei momenti che contano e asserzioni su ciò
  che dev'essere vero in quel punto.

  Le distanze sono in TILE (`tile = 3`), non in secondi: il banco le converte con la velocità e
  il lato dei tile letti dalla logica, e simula a passi fissi di 1/60 di secondo, quindi la
  stessa sceneggiatura dà lo stesso risultato su qualunque macchina.
  I dialoghi si leggono con `leggi = true` (fino in fondo), non con un numero fisso di tocchi:
  così cambiare una battuta non rompe la prova.

  Mappa: partenza (11,8) · Nilo (9,11) · Custode Ada (14,9) · Chiave (6,5) · porta (13,5) ·
  interno della torre x 14..17, y 4..6 · corridoio libero a x 11-12.
]]

return {
  { nota = "partenza" },
  { secondi = 0.4 },
  { screenshot = "01-partenza.png" },
  { atteso = { ["player.tile_x"] = 11, ["player.tile_y"] = 8, ["quest.told"] = false } },

  { nota = "scendo verso Nilo (3 tile) e poi a ovest (2 tile)" },
  { tasti = { giu = true }, tile = 3 },
  { tasti = { giu = false, sinistra = true }, tile = 2 },
  { tasti = { sinistra = false }, secondi = 0.15 },
  { atteso = { ["player.tile_x"] = 9, ["player.tile_y"] = 11 } },

  { nota = "parlo con Nilo: l'indizio si registra alla fine del dialogo" },
  { interagisci = true, secondi = 0.4 },
  { secondi = 0.58, screenshot = "02-nilo.png" },   -- il testo si è scritto: lo scatto lo mostra
  { atteso = { ["dialogo.aperto"] = true } },
  { leggi = true },
  { atteso = { ["dialogo.aperto"] = false, ["quest.hint"] = true } },

  { nota = "salgo (2 tile) e vado a est dal Custode Ada (5 tile)" },
  { tasti = { su = true }, tile = 2 },
  { tasti = { su = false, destra = true }, tile = 5 },
  { tasti = { destra = false }, secondi = 0.15 },
  { atteso = { ["player.tile_x"] = 14, ["player.tile_y"] = 9 } },
  { interagisci = true, secondi = 0.4 },
  { screenshot = "03-custode.png" },
  { leggi = true },
  { atteso = { ["quest.told"] = true, ["dialogo.aperto"] = false } },

  { nota = "a ovest fino al corridoio (x=12), su fino alla riga 5, poi a ovest fino alla chiave" },
  { tasti = { sinistra = true }, tile = 2 },
  { tasti = { sinistra = false, su = true }, tile = 4 },
  { tasti = { su = false, sinistra = true }, tile = 6 },
  { tasti = { sinistra = false }, secondi = 0.15 },
  { atteso = { ["player.tile_x"] = 6, ["player.tile_y"] = 5 } },
  { interagisci = true, secondi = 0.4 },
  { screenshot = "04-chiave.png" },
  { atteso = { ["chiave.presa"] = true, ["quest.key"] = true } },
  { leggi = true },

  { nota = "a est fino alla porta della torre: si ferma davanti (è solida) e si apre con la chiave" },
  { tasti = { destra = true }, tile = 7 },
  { tasti = { destra = false }, secondi = 0.15 },
  { atteso = { ["player.tile_x"] = 12, ["player.tile_y"] = 5, ["porta.aperta"] = false } },
  { interagisci = true, secondi = 0.4 },
  { secondi = 0.5, screenshot = "05-porta.png" },
  { atteso = { ["porta.aperta"] = true, ["quest.opened"] = true } },
  { leggi = true },

  { nota = "entro nella torre: vittoria" },
  { tasti = { destra = true }, tile = 2 },
  { tasti = { destra = false }, secondi = 0.2 },
  { screenshot = "06-vittoria.png" },
  { atteso = { ["quest.won"] = true } },
}

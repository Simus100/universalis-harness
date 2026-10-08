-- Finestra del gioco. In modalità banco di prova non serve un monitor: gira su un display
-- virtuale (Xvfb) con rendering software, e `vsync = 0` evita di restare appesi al refresh.
function love.conf(t)
  t.identity = "prova-catena"
  t.window.title = "Prova di catena — LÖVE headless"
  t.window.width = 800
  t.window.height = 600
  t.window.vsync = 0
  t.window.resizable = false
  t.version = "11.5"
  t.modules.physics = false
  t.modules.joystick = false
  t.modules.touch = false
  t.modules.video = false
end

# Piccola app meteo

Un solo file: `index.html`. Nessuna build, nessuna dipendenza, nessuna API key.

## Come si apre
- Doppio clic su `index.html` (funziona anche da `file://`), oppure
- un server locale nella cartella: `python3 -m http.server 8777` poi <http://127.0.0.1:8777/>

## Cosa fa
- Ricerca città con suggerimenti (anche omonimi: Milano in Italia, Texas, Perù…), navigazione da tastiera ↑ ↓ Invio Esc.
- 📍 Posizione attuale del browser (richiede il permesso; con `file://` alcuni browser la bloccano: in quel caso usa la ricerca).
- Meteo attuale: temperatura, percepita, condizione, vento e raffiche con direzione, umidità, nuvole, pioggia, pressione, UV, alba/tramonto.
- Grafico delle prossime 24 ore.
- Previsioni a 7 giorni con barre dell'intervallo min/max.
- Toggle °C/°F e tema chiaro/scuro; l'ultima città e le preferenze restano salvate nel browser.

## Dati
[Open-Meteo](https://open-meteo.com/) — endpoint di geocodifica e di previsione, gratuiti e senza chiave.
Condizioni meteo tradotte dai codici WMO (`WMO` nel file) con icone SVG disegnate a mano (`wicon()`), così non
dipendono dalle emoji del sistema operativo.

## Note tecniche
- Nessuna richiesta a server propri: il browser chiama direttamente `api.open-meteo.com` (CORS `*`).
- Nessun tracciamento, nessun cookie, `localStorage` solo per città/unità/tema.
- Per aggiornare i dati: ricaricare la pagina o ripetere la ricerca. La cache del browser può servire una risposta
  recente; per forzare, ricarica con Ctrl/Cmd+Shift+R.

## Anteprime
- `../meteo-anteprima.png` — tema scuro
- `../meteo-anteprima-chiaro.png` — tema chiaro
- `../meteo-anteprima-7giorni.png` — previsioni 7 giorni
- `../meteo-icon-test.png` — tavola delle icone SVG

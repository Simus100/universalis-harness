---
workflow: general-video
flow: automation
storyboard: no
message: "Un agente AI che lavora sui tuoi file — non solo una chat — e ti dice quanto costa"
destination: mp4-web
aspect: 1920x1080
language: it
audience: "professionisti, piccole strutture e team tecnici che valutano un agente AI da usare sui propri file"
length: 32s
angle: "prodotto e capacità prima, la trasparenza dei costi come prova (non come tema)"
---

## Intent

Presentare Universalis Harness per quello che fa — un agente che lavora sui file di chi lo usa,
dentro una dashboard self-hosted — e usare la misura del costo di contesto come **prova di
trasparenza**, non come argomento unico. Revisione richiesta dall'utente il 13/10/2026: la prima
versione parlava solo di token, questa parla dell'harness e delle sue capacità.
Tono: concreto e sobrio, da strumento che si usa tutti i giorni.

## Assets

- `genera-voce.sh` rigenera gli mp3 della voce (piper offline): gli `assets/` non sono versionati
  perché binari rigenerabili — rilanciare lo script prima di un render da zero.
- `assets/vo-1 … vo-5.mp3` — voce fuori campo italiana, generata sul server con piper (voce
  `it_IT-serena-high`, offline, nessun servizio cloud). Durate reali misurate con ffprobe:
  3,36 / 4,84 / 6,23 / 4,33 / 3,31 s.
- Dati mostrati: `../overhead-contesto-harness.json` — la stessa fonte del report
  `media/report-harness-costo-contesto.html`. Nessun contenuto di sessione, nessun dato personale.

## Customizations

- count-up sul numero 13.184 (`counting-dynamic-scale`), glow ambientale dietro l'hero
  (`ambient-glow-bloom`).
- barre dati animate per il confronto (`stat-bars-and-fills`).
- bento delle capacità: una card guida grande + quattro piccole (evita la griglia di card identiche).

## Notes

- Design spec implicita: il sistema visivo dell'harness (`skills/design-craft/SKILL.md` § 8) — sfondo
  `#08111f`, superfici `#172033`, testo `#eef2f9` / `#c6cfdd`, accento blu `#5b9dff`.
- Solo font di sistema (`system-ui`, `monospace`): nessun `@font-face`, nessuna risorsa di rete.
- La scena 4 dichiara un limite reale del prodotto ("il confine di sicurezza è la macchina"):
  la promo non nasconde i limiti, li mette in una riga.
- Voce in italiano; nessuna musica (nessun provider BGM disponibile offline): video parlato.
- Nessun numero inventato: 13.184 e 29.061 vengono dalla misura del 13/10/2026.

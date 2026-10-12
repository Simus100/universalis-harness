# HyperFrames, funzioni opzionali: Whisper e Kokoro installati

Data: **2026-10-12** · Stato: **attivi per tutte le istanze** (admin e tester)

---

## Cosa è ora disponibile

| Funzione | Comando | Stato | Cosa fa |
|---|---|---|---|
| **Voce (TTS)** | `hyperframes tts "testo" -v <voce> --lang it -o out.wav` | **attivo** | voce fuori campo on-device con Kokoro-82M; 54 voci, **italiano incluso** (`if_sara` femminile, `im_nicola` maschile) |
| **Trascrizione** | `hyperframes transcribe <audio> --model small --json` | **attivo** | testo con **timestamp parola per parola** (base dei sottotitoli); lingua rilevata automaticamente (`detectedLanguage: "it"`) |
| **Musica (MusicGen locale)** | — | **non installata, per scelta** | richiede `pip install transformers torch` (~3 GB) e su questa CPU (6 core, nessuna GPU) genera in minuti pochi secondi di audio; la musica si può già ottenere dal provider hosted (`resolve --type bgm`) |

## Dove stanno i file (e perché lì)

Tutto in **`/opt/hyperframes-models`** (1,06 GB in totale), leggibile da tutte le istanze:

| Pezzo | Percorso | Peso |
|---|---|---|
| Runtime whisper.cpp compilato + modello `small` | `/opt/hyperframes-models/whisper` | 541 MB |
| Modello Kokoro + voci | `/opt/hyperframes-models/tts` | 338 MB |
| Venv Python con `kokoro-onnx` + `soundfile` | `/opt/hyperframes-models/kokoro-venv` | 184 MB |

**Perché non nelle home.** La CLI, da sola, scaricherebbe tutto in `~/.cache/hyperframes/...`: sui tester
sarebbero ~900 MB dentro una home da 2 GB — e sotto 1 GB liberi **i video non renderizzano più**
(vedi la soglia dei 1024 MB in `media/skill-istanze.md`). Con questa sistemazione lo spazio dei
tester è rimasto **invariato** (1,8–1,9 GB liberi) e i modelli sono condivisi: una copia per tutti.

Come sono collegati:

1. Le cache degli utenti sono **symlink**:
   `~/.cache/hyperframes/whisper` e `~/.cache/hyperframes/tts` → `/opt/hyperframes-models/...`
   (per `root`, `tester07`, `tester08`; il Chrome era già sistemato così).
2. Un **wrapper** `/usr/local/bin/hyperframes` esporta `HYPERFRAMES_PYTHON=/opt/hyperframes-models/kokoro-venv/bin/python`,
   perché la CLI cerca un Python con dentro `kokoro_onnx` e `soundfile` (niente di installato a
   livello di sistema, tutto isolato nel venv).
3. **RPATH corretto** con `patchelf` su `whisper-cli` e sulle librerie `libwhisper`/`libggml`: dopo la
   compilazione puntavano a `/root/.cache/...` (invisibile agli utenti non-root) → «libwhisper.so.1:
   cannot open shared object file». Ora puntano a `/opt/...` e il binario parte da qualunque utente.

## Prove fatte

| Prova | Esito |
|---|---|
| `tts` in italiano (admin) | WAV di 3,1 s con la voce `if_sara`; verificate anche `im_nicola` |
| `tts` come `tester07` | WAV di 2,2 s prodotto nella sua cartella |
| `transcribe` su audio italiano (admin) | 10 parole con timestamp, lingua `it`, 2m31s **al primo uso** (compilazione + download 488 MB) |
| `transcribe` come `tester08` | `ok: true`, lingua `it`, 10 parole (runtime condiviso, nessuna ricompilazione) |
| `hyperframes doctor` (tester08) | `whisper-cpp: ok`, `TTS (Kokoro): ok`, `BGM (MusicGen): false` (atteso) |
| Spazio delle home dopo l'installazione | invariato: 1,9 GB e 1,8 GB liberi |

## Note pratiche

- **Modello di trascrizione**: installato `small` (multilingua, 488 MB): è il compromesso giusto per
  l'italiano. `base` (141 MB) è più veloce ma meno preciso, `medium` (1,4 GB) più preciso e più lento
  — non installato: se serve, si scarica una volta in `/opt/hyperframes-models/whisper/models/` e
  resta condiviso.
- Il runtime di Whisper è **già compilato e condiviso**: gli utenti non hanno bisogno di `git`,
  `cmake` o `gcc`, e non scaricano nulla al primo uso.
- Il transcript viene scritto in `/tmp` (per i tester è la loro `/tmp` privata ed effimera): il
  risultato utile è l'output JSON, oppure il file copiato nella propria cartella.
- **Non scaricare modelli nelle home** dei tester: riempiono il loro spazio e fanno fallire i render.
  I modelli condivisi stanno in `/opt` (regola anche nella skill `spazio-di-lavoro`).
- Se in futuro si vorrà la **musica locale**, è una decisione a parte: ~3 GB per PyTorch e
  generazione lenta. Oggi la musica si prende dal provider hosted.

# Istanze attive su questa macchina (aggiornato 2026-09-19)

| istanza | cartella | porta | unit systemd | URL |
|---|---|---|---|---|
| principale (pi) | /root/pi-harness | 8420 | pi-dashboard.service | https://harness.universalisproduzioni.it |
| tester_01 | /root/tester_01 | 8421 | pi-tester01.service | https://tester01.89-117-59-173.sslip.io |

## Struttura delle cartelle (vale per tutte le istanze)

```
<istanza>/
├── dashboard.mjs, dashboard.html, sw.js, assets/   # codice
├── skills/     # DASH_SKILLS_DIR  — skill Agent Skills (FUORI da media/)
├── backups/    # DASH_BACKUP_DIR  — backup (FUORI da media/); i backup delle skill in backups/skills/
├── media/      # DASH_MEDIA_DIR   — solo file generati (report, upload, goals.json, schedules.json)
├── sessions/   # DASH_SESSION_DIR — chat persistenti
└── download/
```

**Perché**: `media/` è la cartella dei *file generati*, quindi non ospita più `skills/` né
`backups/`. Il default nel codice è `<script>/skills` e `<script>/backups`, così ogni istanza
tiene le sue skill accanto al proprio codice (nessuna cartella condivisa tra istanze).

`media-guard` (hook `tool_call`) reindirizza in `media/` solo i file **nuovi creati fuori
dall'istanza**: dentro la cartella dell'istanza — codice, `skills/`, `backups/`, `sessions/`,
`media/` — i file restano dove sono richiesti.

## Note

- `tester_01` è un **clone completo** (codice + copia dati) creato il 2026-09-19: dettagli in
  `/root/tester_01/ISTANZA.md`.
- Utente della principale: `pi`; utente di tester_01: `tester_01` (password nel rispettivo `.env`).
- Config di pi in `/root/.pi` è **condivisa**: modello e chiavi cambiano per entrambe.
- Il tool `browser` (agent-browser / utente `pi-browser`) ha un solo profilo Chrome: non usarlo
  contemporaneamente nelle due istanze.
- `/root/pi-harness-ospiti` resta uno scheletro non attivato (layout già allineato a questa
  struttura).

# Piano: istanza "ospiti" della pi dashboard

Data: 2026-02-19 — stato: **pianificazione** (niente installato, niente modificato)

## 1. Decisione: clone separato, non multi-account

| Criterio | Multi-account (una sola app) | Clone istanza separata |
|---|---|---|
| Modifiche al codice | Alte: login, sessioni per utente, jail del file manager, quote, permessi | **Zero** |
| Isolamento | Solo logico (un bug = vede tutto) | **Reale**: processo + filesystem separati |
| Rischio per la dashboard attuale | Alto (si tocca codice già funzionante) | **Nullo** |
| Reset dopo un disastro di un ospite | Da implementare a mano | `rm -rf` della data dir |
| Aggiornamenti | Una codebase, una deploy | Due istanze da riavviare (procedura unica) |
| Costo risorse | Condiviso | Doppio processo Node + run separati |

**Conclusione**: per pochi ospiti occasionali il clone è meglio. Il multi-account
diventa sensato solo con molti utenti, vista admin unica e storage condiviso: non è
il caso attuale.

## 2. Architettura proposta

- **Unica codebase**, non un fork: stessa cartella `/root/pi-harness`.
- **Data dir separata** per l'istanza ospiti: `sessions/`, `media/`, `backups/` propri.
- **Porta interna diversa**: 8421 (la principale usa 8420).
- **IP diverso: non serve.** Stesso VPS, porta diversa, e Caddy fa da reverse proxy.
- **Hostname**: `ospiti.universalisproduzioni.it` con HTTPS automatico (Caddy) e
  **Basic auth con credenziali diverse** da quelle dell'istanza principale.

### Stato attuale (riferimento)

```
/etc/caddy/Caddyfile
  pi.universalisproduzioni.it        -> reverse_proxy 127.0.0.1:8420
  89-117-59-173.sslip.io             -> reverse_proxy 127.0.0.1:8420   (fallback)

/etc/systemd/system/pi-dashboard.service
  WorkingDirectory=/root/pi-harness
  EnvironmentFile=/root/pi-harness/.env
  ExecStart=.../node /root/pi-harness/dashboard.mjs --port 8420
```

La porta è già parametrizzabile (`--port`, default 8420, vedi `dashboard.mjs`),
quindi non serve toccare il codice per la seconda istanza.

## 3. Passi previsti (da eseguire solo dopo approvazione)

1. **Data dir istanza ospiti** — es. `/root/pi-harness-ospiti/` con
   `sessions/`, `media/`, `backups/`. Codice condiviso (symlink o `WorkingDirectory`
   sulla stessa root + override delle cartelle dati via env).
2. **Unit systemd templata** — `pi-dashboard@.service` con `%i` = nome istanza,
   così `pi-dashboard@ospiti` eredita la stessa definizione della principale.
   Il codice andrà reso "instance-aware" solo per i percorsi dati (variabile
   d'ambiente tipo `PI_DATA_DIR`), non per la logica.
3. **.env separato** — `/root/pi-harness-ospiti/.env` con le stesse chiavi ma
   credenziali Basic diverse.
4. **Backup separato** — timbro/unit dedicata per la data dir ospiti, o
   inclusione della stessa nel timer esistente con destinazione distinta.
5. **Caddy** — nuovo blocco:

   ```
   ospiti.universalisproduzioni.it {
       reverse_proxy 127.0.0.1:8421
   }
   ```

   (l'HTTPS è automatico come per il vhost attuale).

6. **Riduzione funzioni per gli ospiti** — da valutare, perché un ospite che
   lancia agenti in loop consuma budget:
   - niente goal / subagent;
   - file manager senza accesso alla root del sistema;
   - chiave API o quota separata;
   - eventuale rate-limit in Caddy.
7. **Procedura di aggiornamento unica** — `git pull` + restart di entrambe le
   istanze. Nessuna copia di codice da tenere allineata a mano.

## 4. Punto aperto da risolvere PRIMA (deploy)

Il goal in corso sui 9 interventi è bloccato sul rilievo dell'auditor: **le nuove
route rispondono 404 sulla dashboard in produzione**, perché il servizio è un
processo systemd separato (PID 38552) che esegue il codice caricato al momento
dell'avvio, non i file modificati dopo.

È lo stesso problema che avrebbe il clone: due servizi da tenere allineati alla
stessa codebase. Quindi prima va definita e verificata la procedura di deploy
(`git pull` → restart unit → smoke test con `curl`), poi il clone la eredita.

## 5. Prossimi passi proposti

- [ ] A) Solo progettare l'istanza ospiti (file unit + blocco Caddy) **senza installare**
- [ ] B) Prima chiudere il goal dei 9 interventi, incluso il problema del deploy/404
- [ ] Decidere i limiti funzionali per gli ospiti (punto 6)

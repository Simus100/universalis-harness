# Attribuzione, licenze, e cosa è stato cambiato

Questo pacchetto è un'antologia di skill scritte da altre persone, riunite sotto un'unica porta.
Ogni scheda conserva il testo dell'autore, in inglese. Le schede scritte qui per questo harness
sono in italiano e sono indicate come tali.

## Fonti

| Cartella | Progetto | Autore | Licenza | Commit importato |
|---|---|---|---|---|
| `impeccable/` | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | Paul Bakaus | Apache-2.0 | `b3ced85` (2026-11-09, v4.8.1) |
| `emil/` | [emilkowalski/skills](https://github.com/emilkowalski/skills) | Emil Kowalski | MIT | `715c180` (2026-11-09) |
| `emil/make-interfaces/` | [jakubkrehel/make-interfaces-feel-better](https://github.com/jakubkrehel/make-interfaces-feel-better) | Jakub Krehel | MIT | `35545ea` (2026-08-29) |
| `genjutsu/` | [AThevon/genjutsu](https://github.com/AThevon/genjutsu) | Adrien Thevon | MIT | `5e00595` (2026-11-06) |
| `gsap/` | [greensock/gsap-skills](https://github.com/greensock/gsap-skills) | GreenSock | MIT | `aed9cfd` (2026-04-21) |
| `threejs/` | [CloudAI-X/threejs-skills](https://github.com/CloudAI-X/threejs-skills) | CloudAI-X | MIT | `0e18186` (2026-10-19) |
| `copy/no-ai-slop.md` | [petergyang/no-ai-slop](https://github.com/petergyang/no-ai-slop) | Peter Yang | MIT | `000650b` (2026-09-01) |
| `copy/humanizer.md` | [blader/humanizer](https://github.com/blader/humanizer) | Siqi Chen | MIT | `0ef9fe5` (2026-10-28) |
| `icone.md`, `copy-tell-italiani.md`, `indice.md`, questo file | scritti per questo harness | — | come il repository | — |
| `scripts/icone.sh` | scritto per questo harness, sopra l'API pubblica [Iconify](https://iconify.design) | — | come il repository | — |

Le icone scaricate restano soggette alla licenza della **collezione** da cui provengono, non a
quella del pacchetto: `scripts/icone.sh licenza <collezione>` lo dice per ogni famiglia (per
esempio `lucide` è ISC, `material-symbols` è Apache-2.0). I loghi di brand hanno in più il marchio
del proprietario.

## Cosa è stato cambiato (e cosa no)

Fatto:

- i file sono copiati con il testo dell'autore; l'unica modifica ai testi è nei link;
- **rinominati** i file accessori per evitare collisioni (`RECIPES.md` → `animate-RECIPES.md`,
  `STANDARDS.md` → `review-animations-STANDARDS.md`, e così via) e riscritti i rimandi;
- **dereferenziati** i 7 link a file non importati: ora sono citati come testo con la nota
  «non incluso in questo pacchetto», invece di essere link che non portano a niente;
- aggiunto `references/indice.md` come mappa, e `SKILL.md` come porta unica.

Non fatto, di proposito:

- **nessun binario, nessun pacchetto npm, nessun server MCP.** `impeccable` nella versione originale
  si appoggia a un launcher che scarica un eseguibile (`scripts/impeccable`) e a un hook che gira
  dopo ogni modifica ai file di UI: qui non c'è, e le schede funzionano lo stesso perché il loro
  contenuto è metodo. Dove l'originale dice «esegui `impeccable context`», la scheda va letta come
  «leggi `PRODUCT.md` / `DESIGN.md` se esistono, altrimenti chiedi il contesto all'utente»;
- **escluse le schede che richiedono un host specifico**: `hooks.md`, `doctor.md`, `generate.md`,
  `live-setup.md` di impeccable (dipendono dal launcher e da un browser pilotato), `write-swift`,
  `animate-expo`, `ask-sonner`, `mobile-native` di Emil (React Native/SwiftUI, che qui non si
  compilano), `bunshin` di genjutsu (richiede di generare sotto-agenti) e le schede SwiftUI/Compose
  dello stesso progetto;
- **esclusa `ui-ux-pro-max`** di genjutsu: dentro ha un `LICENSE-upstream.txt` di terzi con termini
  propri, e non valeva il rischio di licenza per una scheda ridondante;
- niente traduzione dei testi importati: sono lunghi e citano termini tecnici inglesi. Le schede di
  questo harness sono in italiano, il resto si legge in inglese.

## Aggiornare

Le fonti si muovono in fretta (impeccable è alla 4.8.1, emil pubblica quasi ogni settimana). Per
riallineare una cartella:

```bash
git clone --depth 1 https://github.com/<autore>/<repo> /tmp/fonte
# ricopiare i file elencati in references/indice.md, poi ricontrollare i link:
python3 - <<'EOF'
import re, os
rot = []
for root, _, fs in os.walk("skills/design-pack/references"):
    for f in fs:
        if f.endswith(".md"):
            p = os.path.join(root, f)
            for m in re.finditer(r"\]\(([^)\s#]+)", open(p, encoding="utf-8").read()):
                u = m.group(1)
                if not re.match(r"^([a-z]+:|/|#)", u, re.I) and not os.path.exists(
                    os.path.normpath(os.path.join(root, u))):
                    rot.append((p, u))
print(len(rot), "link rotti"); [print(p, u) for p, u in rot]
EOF
```

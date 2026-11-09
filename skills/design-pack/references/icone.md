# Icone vere, non icone inventate

Regola secca: **un'icona non si disegna a memoria.** Gli SVG a mano libera con path inventati,
le emoji al posto delle icone e i glifi Unicode (→ ★ ✓ ✕) sono il segnale più visibile di
un'interfaccia generata. Si cerca l'icona in una libreria vera e si usa quella.

Libreria: **Iconify** — 276 collezioni, circa 475.000 icone (Material Symbols, Lucide, Tabler,
Phosphor, Heroicons, Radix, Fluent, MDI, Solar...). Si interroga via HTTP con `curl`: nessun
pacchetto da installare, funziona anche dove `npm` non c'è.

Lo script di questo pacchetto fa il lavoro: `scripts/icone.sh` (percorso relativo a `design-pack/`).

```bash
S=skills/design-pack/scripts/icone.sh    # dalla radice dell'istanza

$S collezioni --cerca fluent       # quali collezioni esistono, con numero icone e licenza
$S licenza lucide                  # licenza della collezione scelta
$S cerca "trash" --prefix lucide   # id candidati: stampa liste di id, non SVG
$S cerca "arrow left" --limit 30   # senza --prefix cerca in tutte le collezioni
$S prendi lucide:trash-2 --size 24                      # SVG su stdout
$S prendi lucide:trash-2 --size 24 --color "#334155" -o trash.svg
$S set lucide home search user settings                 # scarica icone/*.svg, e dice quali nomi non esistono
```

Senza lo script, gli stessi comandi a mano:

```bash
curl -s "https://api.iconify.design/search?query=clock&limit=10&prefix=lucide" | jq -r '.icons[]'
curl -s "https://api.iconify.design/lucide/clock.svg?width=24&color=%23334155"
curl -s "https://api.iconify.design/collections?prefix=lucide" | jq .
```

## Scegliere la collezione giusta (una sola per progetto)

Mescolare due famiglie nello stesso prodotto si vede subito: spessori e terminali diversi.
Scegli in base al carattere, poi non cambiare.

| Collezione | Carattere | Licenza |
|---|---|---|
| `lucide` | lineare, stroke 2, neutra, la più sicura per UI di prodotto | ISC |
| `tabler` | lineare, stroke 2, taglio più tecnico | MIT |
| `ph` (Phosphor) | sei pesi della stessa famiglia, dall'ultra-thin al fill | MIT |
| `heroicons` | outline e solid, allineata a Tailwind | MIT |
| `radix-icons` | 15×15, precisa, pensata per i componenti | MIT |
| `material-symbols` | il sistema Google, ampio e molto noto | Apache-2.0 |
| `fluent` | Microsoft, corretta ma riconoscibile | MIT |
| `mdi` | enorme repertorio, stile datato, comoda per i casi strani | Apache-2.0 |
| `simple-icons` | loghi di brand (GitHub, X, Figma) | CC0 |

Nota di licenza: le collezioni sono permissive ma **non tutte uguali**, e alcune hanno eccezioni
sui marchi. `icone.sh licenza <collezione>` prima di consegnare un lavoro commerciale, e per i
loghi di terze parti vale il marchio del proprietario, non la licenza della libreria.

## Come si usano nel codice

- **Colore ereditato**: mai `fill="#333"` cablato. Icona SVG inline con
  `stroke="currentColor"` / `fill="currentColor"`, così segue il tema e gli stati (hover, disabled).
- **Dimensione dal ritmo tipografico**: `width: 1em; height: 1em` oppure 16/20/24 px, allineata
  alla linea del testo (`vertical-align: -0.125em`). Un'icona da 19 px accanto a testo da 16 px si
  vede, e sembra un errore.
- **Griglia**: tutte le icone con lo stesso `viewBox` e lo stesso spessore di tratto
  (`stroke-width: 1.5` o `2`, mai misto). Se una libreria ha più pesi, usa lo stesso peso ovunque.
- **Accessibilità**: icona puramente decorativa → `aria-hidden="true"` e nessun `title`; icona che
  è l'unico contenuto di un pulsante → etichetta accessibile (`aria-label` o testo nascosto), non
  il `title` del path.
- **Un'icona per concetto**: la stessa azione usa sempre la stessa icona (salva, elimina, chiudi).
  Due icone diverse per "chiudi" è il tipo di incoerenza che nessuno nomina e tutti notano.
- **Meno icone**: un'icona accanto a ogni voce di menu è decorazione; serve dove accorcia la
  lettura o è un comando ricorrente.

## Se `better-icons` è disponibile

`better-icons` (better-auth) è lo stesso catalogo con una CLI più comoda e un server MCP
(`npx better-icons search arrow`, `better-icons get lucide:home`). Richiede `npm`/`bun` e rete:
qui **non è installato** e non va installato per forza — `icone.sh` copre gli stessi bisogni con
`curl`. Se però l'utente ce l'ha già, usalo: gli id sono gli stessi (`prefix:nome`).

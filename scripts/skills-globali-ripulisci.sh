#!/usr/bin/env bash
# Tiene una sola copia FISICA delle skill di terzi, quella in `skills/` dell'harness,
# e la rende raggiungibile anche dalle cartelle globali tramite symlink.
#
# Perché serve. `npx hyperframes skills update` (e i comandi `init`/`skills` dello
# stesso CLI) installano le skill di HyperFrames/HeyGen nelle cartelle GLOBALI
# (~/.agents/skills, ~/.pi/agent/skills, ~/.claude/skills). L'harness le legge anche
# da `skills/`. Se esistono in entrambi i posti come copie reali, pi carica una sola
# copia e segnala l'altra come "collisione" nella scheda «Skill»; e se i due
# contenuti divergono vince in silenzio quella caricata per prima.
#
# Perché i symlink e non la semplice cancellazione. Su questa macchina girano più
# istanze dell'harness (pi-harness, tester_01, tester08): quelle che non hanno le
# skill in `skills/` le ottengono SOLO dalla cartella globale. Un symlink verso
# `skills/` le lascia funzionare, e pi non vede collisione perché canonicalizza i
# percorsi con realpathSync: stesso file reale = una sola skill caricata.
#
# Uso:
#   bash scripts/skills-globali-ripulisci.sh            # anteprima (non tocca nulla)
#   bash scripts/skills-globali-ripulisci.sh --allinea  # applica
#
# --allinea: 1. backup delle globali in /root/skills-globali-backup-<data>/
#            2. per le copie DIVERSE copia la globale dentro skills/ (assunzione:
#               l'hai appena aggiornata col CLI, quindi la globale è la più nuova)
#            3. sostituisce ogni duplicato globale con un symlink a skills/
#            4. lancia media/test-skill-collisioni.mjs per confermare
#
# Le skill globali SENZA omonimo in skills/ (es. reverse-engineer-anything, di REA)
# non vengono toccate: non collidono e restano dove sono.

set -euo pipefail

HARNESS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SKILLS_DIR="$HARNESS_DIR/skills"
GLOBAL_DIRS=("/root/.agents/skills" "/root/.pi/agent/skills")
BACKUP_DIR="/root/skills-globali-backup-$(date +%Y%m%d-%H%M%S)"
MODE="anteprima"
[[ "${1:-}" == "--allinea" ]] && MODE="allinea"

duplicati=()
diversi=()
gia_link=()

for gdir in "${GLOBAL_DIRS[@]}"; do
  [[ -d "$gdir" ]] || continue
  for gpath in "$gdir"/*/; do
    [[ -e "$gpath" ]] || continue          # salta i link rotti (segnalati dal test)
    nome="$(basename "$gpath")"
    lpath="$SKILLS_DIR/$nome"
    [[ -d "$lpath" ]] || continue          # globale senza omonimo: non si tocca
    if [[ -L "$gdir/$nome" ]]; then
      target="$(readlink -f "$gdir/$nome" 2>/dev/null || echo "")"
      [[ "$target" == "$(readlink -f "$lpath")" ]] && gia_link+=("$nome") || diversi+=("$nome")
    else
      duplicati+=("$nome")
      diff -rq "$lpath" "$gdir/$nome" >/dev/null 2>&1 || diversi+=("$nome")
    fi
  done
done

if [[ ${#duplicati[@]} -eq 0 && ${#diversi[@]} -eq 0 ]]; then
  echo "✓ nessuna copia reale duplicata nelle cartelle globali"
  echo "  symlink già a posto: ${#gia_link[@]}"
  exit 0
fi

echo "modalità: $MODE"
echo "copie reali da sostituire con symlink: ${#duplicati[@]}"
for nome in "${duplicati[@]:-}"; do
  [[ -n "$nome" ]] || continue
  stato="identiche"
  for d in "${diversi[@]:-}"; do [[ "$d" == "$nome" ]] && stato="DIVERSE (allineo skills/ dalla globale)"; done
  printf "  %-24s %s\n" "$nome" "$stato"
done
echo "symlink già corretti: ${#gia_link[@]}"

if [[ "$MODE" != "allinea" ]]; then
  echo
  echo "Per sistemare:  bash scripts/skills-globali-ripulisci.sh --allinea"
  exit 0
fi

if [[ ${#duplicati[@]} -gt 0 || ${#diversi[@]} -gt 0 ]]; then
  mkdir -p "$BACKUP_DIR"
  for gdir in "${GLOBAL_DIRS[@]}"; do
    [[ -d "$gdir" ]] || continue
    dest="$BACKUP_DIR/$(basename "$(dirname "$gdir")")-$(basename "$gdir")"
    mkdir -p "$dest"
    for nome in "${duplicati[@]:-}"; do
      [[ -n "$nome" && -d "$gdir/$nome" && ! -L "$gdir/$nome" ]] || continue
      cp -a "$gdir/$nome" "$dest/" 2>/dev/null || true
    done
  done
  echo "backup: $BACKUP_DIR"
fi

# 1) per le copie divergenti, la globale (appena aggiornata) vince: copiala in skills/
for nome in "${diversi[@]:-}"; do
  [[ -n "$nome" ]] || continue
  for gdir in "${GLOBAL_DIRS[@]}"; do
    [[ -d "$gdir/$nome" ]] || continue
    if [[ -L "$gdir/$nome" ]]; then
      echo "  ⚠ $gdir/$nome è un symlink divergente: controllo manuale" >&2
      continue
    fi
    rm -rf "$SKILLS_DIR/$nome"
    cp -a "$gdir/$nome" "$SKILLS_DIR/$nome"
    echo "  allineata skills/$nome ← $gdir/$nome"
    break
  done
done

# 2) sostituisci ogni copia reale duplicata con un symlink a skills/
for gdir in "${GLOBAL_DIRS[@]}"; do
  [[ -d "$gdir" ]] || continue
  for nome in "${duplicati[@]:-}"; do
    [[ -n "$nome" ]] || continue
    [[ -d "$gdir/$nome" && ! -L "$gdir/$nome" ]] || continue
    rm -rf "$gdir/$nome"
    ln -sfn "$SKILLS_DIR/$nome" "$gdir/$nome"
    echo "  symlink $gdir/$nome → skills/$nome"
  done
done

echo "=== verifica ==="
node "$HARNESS_DIR/media/test-skill-collisioni.mjs"

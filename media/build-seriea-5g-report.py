#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Report Serie A 2026/27 - 5a giornata (18-20 settembre 2026)
Motore di calcolo: modello attacco/difesa + Poisson bivariato (Dixon-Coles) +
blend con il mercato (quote reali) + value bet + schede scommessa.

Output:
 - /root/pi-harness/media/serie-a-5g-data.json   (dataset completo)
 - /root/pi-harness/media/report-serie-a-5-giornata-2026-27.html (report interattivo)
"""
import json, math, os
from math import exp, factorial
from jinja2 import Template

MEDIA = "/root/pi-harness/media"

# ----------------------------------------------------------------------------
# 1) CLASSIFICA DOPO 4 GIORNATE (fonte: datasport.it / virgilio sport / lega)
#    gf4/ga4 = gol fatti/subiti in 4 partite; gfh,gah = in casa; gfa,gaa = fuori
# ----------------------------------------------------------------------------
TEAMS = {
    "Roma":       dict(pos=1,  pts=12, g=4, v=4, n=0, p=0, gf=12, ga=1,  gfh=6, gah=1, gfa=6, gaa=0, forma="V V V V",  logo="ROM"),
    "Inter":      dict(pos=2,  pts=12, g=4, v=4, n=0, p=0, gf=13, ga=6,  gfh=12,gah=6, gfa=1, gaa=0, forma="V V V V",  logo="INT"),
    "Como":       dict(pos=3,  pts=10, g=4, v=3, n=1, p=0, gf=9,  ga=4,  gfh=2, gah=1, gfa=7, gaa=3, forma="N V V V",  logo="COM"),
    "Lazio":      dict(pos=4,  pts=10, g=4, v=3, n=1, p=0, gf=6,  ga=3,  gfh=3, gah=2, gfa=3, gaa=1, forma="V V V N",  logo="LAZ"),
    "Cagliari":   dict(pos=5,  pts=9,  g=4, v=3, n=0, p=1, gf=4,  ga=2,  gfh=1, gah=1, gfa=3, gaa=1, forma="V P V V",  logo="CAG"),
    "Milan":      dict(pos=6,  pts=8,  g=4, v=2, n=2, p=0, gf=7,  ga=4,  gfh=2, gah=0, gfa=5, gaa=4, forma="V V N N",  logo="MIL"),
    "Frosinone":  dict(pos=7,  pts=7,  g=4, v=2, n=1, p=1, gf=7,  ga=4,  gfh=3, gah=3, gfa=4, gaa=1, forma="P P V V",  logo="FRO"),
    "Juventus":   dict(pos=8,  pts=7,  g=4, v=2, n=1, p=1, gf=6,  ga=4,  gfh=3, gah=1, gfa=3, gaa=3, forma="V V N P",  logo="JUV"),
    "Sassuolo":   dict(pos=9,  pts=7,  g=4, v=2, n=1, p=1, gf=8,  ga=7,  gfh=5, gah=3, gfa=3, gaa=4, forma="N V V P",  logo="SAS"),
    "Napoli":     dict(pos=10, pts=6,  g=4, v=2, n=0, p=2, gf=6,  ga=5,  gfh=2, gah=2, gfa=4, gaa=3, forma="P V P V",  logo="NAP"),
    "Atalanta":   dict(pos=11, pts=6,  g=4, v=2, n=0, p=2, gf=5,  ga=5,  gfh=4, gah=3, gfa=1, gaa=2, forma="V V P P",  logo="ATA"),
    "Lecce":      dict(pos=12, pts=6,  g=4, v=2, n=0, p=2, gf=5,  ga=7,  gfh=3, gah=6, gfa=2, gaa=1, forma="P V P V",  logo="LEC"),
    "Udinese":    dict(pos=13, pts=4,  g=4, v=1, n=1, p=2, gf=8,  ga=10, gfh=2, gah=3, gfa=6, gaa=7, forma="N P V P",  logo="UDI"),
    "Torino":     dict(pos=14, pts=3,  g=4, v=1, n=0, p=3, gf=4,  ga=7,  gfh=1, gah=4, gfa=3, gaa=3, forma="P P V P",  logo="TOR"),
    "Fiorentina": dict(pos=15, pts=3,  g=4, v=1, n=0, p=3, gf=5,  ga=11, gfh=1, gah=5, gfa=4, gaa=6, forma="P P P V",  logo="FIO"),
    "Bologna":    dict(pos=16, pts=1,  g=4, v=0, n=1, p=3, gf=2,  ga=5,  gfh=2, gah=3, gfa=0, gaa=2, forma="P P N P",  logo="BOL"),
    "Parma":      dict(pos=17, pts=1,  g=4, v=0, n=1, p=3, gf=2,  ga=6,  gfh=1, gah=2, gfa=1, gaa=4, forma="P N P P",  logo="PAR"),
    "Monza":      dict(pos=18, pts=1,  g=4, v=0, n=1, p=3, gf=6,  ga=11, gfh=2, gah=3, gfa=4, gaa=8, forma="P P P N",  logo="MON"),
    "Genoa":      dict(pos=19, pts=1,  g=4, v=0, n=1, p=3, gf=2,  ga=8,  gfh=2, gah=7, gfa=0, gaa=1, forma="P P P N",  logo="GEN"),
    "Venezia":    dict(pos=20, pts=0,  g=4, v=0, n=0, p=4, gf=4,  ga=11, gfh=2, gah=6, gfa=2, gaa=5, forma="P P P P",  logo="VEN"),
}

LEAGUE_GOALS_PER_TEAM = 121 / 40 / 2  # 1.5125 gol per squadra per partita

# ----------------------------------------------------------------------------
# 2) PARTITE DELLA 5a GIORNATA
#    quotes = quote 1X2 reali (Snai/mercato, rilevate il 18-19/09/2026)
#    extra  = quote reali di mercati secondari reperite sulla stampa specializzata
#    xg_ext = gol attesi del modello esterno (1x2.expert / SharpSoccer / ProfeGol)
# ----------------------------------------------------------------------------
MATCHES = [
    dict(
        id="mon-sas", day="ven", date="18 settembre", time="20:45", home="Monza", away="Sassuolo",
        venue="U-Power Stadium, Monza", tv="DAZN / Sky", status="played",
        score="2-1", scorers="Varela 51' e 63' (rig.), Adzic 88'",
        quotes=dict(h=2.80, d=3.40, a=2.50), qsrc=dict(h='real',d='real',a='real'),
        xg_ext=(1.45, 1.25), ext_model=dict(h=39, d=27, a=34), xg_src="1x2.expert (Poisson calibrato)",
        absences=dict(home=["Pessina", "Ciurria", "Ziolkovski"],
                      away=["Walukiewicz", "Koné", "Boloca", "Pieragnolo", "Candé", "Volpato", "Idzes"]),
        h2h="Negli ultimi 4 incroci 2 successi per parte; Monza mai vittorioso in casa contro il Sassuolo in A prima di questa gara.",
        note="Juric si gioca la panchina: Monza reduce da 1 punto in 4 gare. Sassuolo reduce dal 3-2 alla Juventus.",
        formNote="Monza con 1 punto in 4 gare; Sassuolo reduce dal 3-2 alla Juventus.",
        pick="1X (Monza o pari)", confidence=2,
        lesson="Il modello indicava Monza leggermente favorito (35-39%) e il mercato lo pagava 2,80, la quota piu' generosa dei tre esiti: la vittoria brianzola (2-1, doppietta di Varela) ha confermato la lettura."
    ),
    dict(
        id="udi-cag", day="sab", date="19 settembre", time="15:00", home="Udinese", away="Cagliari",
        venue="Bluenergy Stadium, Udine", tv="DAZN", status="live",
        score="0-1 (57')", scorers="Maldini 54'",
        quotes=dict(h=2.30, d=3.35, a=3.25), qsrc=dict(h='real',d='stima',a='real'),
        xg_ext=(1.18, 1.05), ext_model=dict(h=37, d=29, a=35), xg_src="1x2.expert + dati tiri/PPDA",
        absences=dict(home=["Piotrowski", "Solet", "Arizala", "Palma"],
                      away=["Nzola", "Felici", "Idrissi", "Trepy"]),
        h2h="Udinese imbattuta in 13 delle ultime 14 sfide di A contro il Cagliari (9V, 4N); solo il 10% di sconfitte interne friulane (3/30).",
        note="Cagliari con 9 punti: miglior difesa su azione del campionato (1 gol subito su azione). Udinese con 4.5 gol di media a partita (fatti+subiti).",
        formNote="Udinese con 2 sconfitte di fila (Lazio, Inter) e 4,5 gol di media a partita; Cagliari con 3 vittorie in 4 gare e 1 solo gol su azione subito.",
        pick="GG + Over 1.5 (partita da gol)", confidence=2,
        lesson="Match in corso: Maldini ha firmato il terzo centro consecutivo, esattamente il trend segnalato in analisi. Il Cagliari sta replicando il suo spartito: difesa corta e ripartenze."
    ),
    dict(
        id="bol-tor", day="sab", date="19 settembre", time="15:00", home="Bologna", away="Torino",
        venue="Renato Dall'Ara, Bologna", tv="DAZN", status="live",
        score="1-0", scorers="Bernardeschi",
        quotes=dict(h=1.95, d=3.50, a=4.00), qsrc=dict(h='real',d='stima',a='real'),
        xg_ext=(1.28, 0.88), ext_model=dict(h=39, d=29, a=32), xg_src="1x2.expert + H2H casalingo Bologna",
        absences=dict(home=[], away=["Adams"]),
        h2h="Bologna imbattuto da 10 gare casalinghe contro il Torino in Serie A (4V, 6N).",
        note="Esordio di Raffaele Palladino sulla panchina rossoblù (esonero di Tedesco). Torino senza il suo riferimento offensivo Adams.",
        formNote="Bologna con 1 punto e cambio di panchina (Palladino per Tedesco); Torino con 3 punti e un solo successo.",
        pick="Under 3.5 + 1X", confidence=2,
        lesson="Match in corso: il Bologna sblocca con Bernardeschi, confermando il rialzo emotivo del cambio di panchina. H2H casalingo e assenza di Adams pesavano."
    ),
    dict(
        id="rom-int", day="sab", date="19 settembre", time="18:00", home="Roma", away="Inter",
        venue="Stadio Olimpico, Roma", tv="DAZN", status="upcoming",
        score=None, scorers=None,
        quotes=dict(h=2.70, d=3.40, a=2.60), qsrc=dict(h='real',d='real',a='real'),
        market_consensus=dict(h=36, d=27, a=37),
        xg_ext=(1.44, 1.42), ext_model=dict(h=33, d=29, a=38), xg_src="1x2.expert + consenso 4 bookmaker",
        absences=dict(home=[], away=["Calhanoglu", "Stones"]),
        h2h="Miglior difesa (Roma, 1 gol subito, 3 clean sheet) contro miglior attacco (Inter, 13 gol). L'Inter non perde all'Olimpico da ottobre 2016: 5 vittorie consecutive, 11-2 complessivo. Negli ultimi 10 incroci 8 vittorie nerazzurre.",
        note="Scontro diretto fra le due uniche squadre a punteggio pieno. Roma senza indisponibili, Inter senza il regista Calhanoglu e con Stones out 3-4 settimane.",
        formNote="Roma 4 vittorie su 4 con 12 gol fatti e 1 subito (3 clean sheet); Inter 4 su 4 con 13 gol fatti e 6 subiti (12 dei quali in casa).",
        pick="GG + 2 (Inter non perde)", confidence=3,
        lesson=None
    ),
    dict(
        id="ven-laz", day="sab", date="19 settembre", time="20:45", home="Venezia", away="Lazio",
        venue="Stadio Penzo, Venezia", tv="DAZN / Sky", status="upcoming",
        score=None, scorers=None,
        quotes=dict(h=6.00, d=3.60, a=1.95), qsrc=dict(h='real',d='stima',a='real'),  # X stimato: il 4.50 circolato dava overround < 100%
        xg_ext=(0.88, 1.32), ext_model=dict(h=35, d=29, a=35), xg_src="stima modello interno (att/def + 0 punti Venezia)",
        absences=dict(home=["Busio", "Sverko", "Adorante", "Franjic", "Bella-Kotchap", "Dagasso"],
                      away=["Marusic", "Rovella"]),
        h2h="Venezia ancora a 0 punti (unica squadra); 4 gol segnati dai lagunari nelle ultime 2 partite, ma 11 subiti in 4 gare.",
        note="Stroppa con la panchina in bilico: in caso di ko cambio probabile durante la sosta. La Lazio ha dilapidato un 2-0 con il Milan ed è reduce da 10 punti in 4 gare.",
        formNote="Venezia a 0 punti con 11 gol subiti; Lazio con 10 punti in 4 gare ma reduce dal 2-2 col Milan dopo essere stata sul 2-0.",
        pick="GG + X2 (Lazio non perde)", confidence=2,
        lesson=None
    ),
    dict(
        id="fio-nap", day="dom", date="20 settembre", time="12:30", home="Fiorentina", away="Napoli",
        venue="Stadio Franchi, Firenze", tv="DAZN", status="upcoming",
        score=None, scorers=None,
        quotes=dict(h=3.50, d=3.50, a=2.25), qsrc=dict(h='real',d='real',a='real'),
        xg_ext=(0.82, 1.32), ext_model=dict(h=27, d=29, a=44), xg_src="1x2.expert + 6 indisponibili Napoli",
        absences=dict(home=["Parisi"],
                      away=["Buongiorno", "Marianucci", "Meret", "McTominay", "Giovane", "Alisson Santos"]),
        h2h="Napoli vittorioso nelle ultime 4 sfide di A con 10-3 complessivo; la Fiorentina ha vinto solo 1 delle ultime 17 gare casalinghe contro i partenopei. Allegri ha perso 1 sola delle ultime 12 contro i viola (9V, 2N).",
        note="Vanoli-bis dopo l'esonero di Grosso: 4-2 a Venezia al debutto. Napoli con emergenza infortuni ma reduce dall'1-0 sul Bologna (Lobotka).",
        formNote="Fiorentina con 3 sconfitte su 4 e 11 gol subiti, rilanciata dal 4-2 a Venezia con Vanoli; Napoli con 6 punti e 4 gol subiti nelle ultime due.",
        pick="X2 + Under 3.5", confidence=3,
        lesson=None
    ),
    dict(
        id="fro-com", day="dom", date="20 settembre", time="15:00", home="Frosinone", away="Como",
        venue="Stadio Stirpe, Frosinone", tv="DAZN", status="upcoming",
        score=None, scorers=None,
        quotes=dict(h=6.00, d=4.20, a=1.50), qsrc=dict(h='real',d='real',a='real'),
        xg_ext=(0.95, 1.50), ext_model=dict(h=20, d=27, a=53), xg_src="stima modello interno (differenziale rosa/Champions)",
        absences=dict(home=["Grillitsch"], away=["Addai"]),
        h2h="Primo incrocio in assoluto in Serie A fra le due squadre.",
        note="Frosinone sorpresa con 7 punti (7 gol fatti) e imbattuto da 3 gare; Como con 3 vittorie di fila, successo a Napoli e vittoria in Champions sul Lipsia.",
        formNote="Frosinone con 7 punti, 7 gol fatti e 3 gare senza sconfitta; Como con 3 vittorie consecutive (Udinese, Napoli, Lipsia in Champions).",
        pick="2 (Como) + Over 1.5", confidence=3,
        lesson=None
    ),
    dict(
        id="par-gen", day="dom", date="20 settembre", time="15:00", home="Parma", away="Genoa",
        venue="Stadio Tardini, Parma", tv="DAZN", status="upcoming",
        score=None, scorers=None,
        quotes=dict(h=3.10, d=3.00, a=2.50), qsrc=dict(h='real',d='real',a='real'),
        xg_ext=(0.98, 1.12), ext_model=dict(h=30, d=29, a=41), xg_src="1x2.expert + squalifica Vasquez (Genoa)",
        absences=dict(home=["Nicolussi Caviglia"], away=["Vásquez (squal.)", "Venturino", "Havel"]),
        h2h="Elo praticamente pari (Parma 1659 vs Genoa 1651). Sfida salvezza: entrambe con 1 punto in 4 gare.",
        note="Il Genoa perde per squalifica Vásquez, protagonista (gol + espulsione) con il Frosinone: reparto arretrato da ricostruire. Parma con il peggior attacco del torneo insieme al Bologna (2 gol).",
        formNote="Parma con 2 gol fatti in 4 gare e nessuna vittoria; Genoa con 2 gol fatti, 8 subiti e 1 punto.",
        pick="Under 2.5 + X2", confidence=2,
        lesson=None
    ),
    dict(
        id="juv-ata", day="dom", date="20 settembre", time="18:00", home="Juventus", away="Atalanta",
        venue="Allianz Stadium, Torino", tv="DAZN / Sky", status="upcoming",
        score=None, scorers=None,
        quotes=dict(h=1.70, d=3.75, a=5.00), qsrc=dict(h='real',d='real',a='real'),
        xg_ext=(1.52, 1.00), ext_model=dict(h=47, d=27, a=26), xg_src="ProfeGol/SharpSoccer + 7 assenze Juve",
        absences=dict(home=["Yildiz", "Ekhator", "Cabal", "Thuram", "Locatelli", "Boga", "Cambiaso"],
                      away=["Kossounou", "Hien", "Sulemana"]),
        h2h="Dal 2017 la Juventus ha pareggiato 12 delle 19 sfide di A con l'Atalanta (4V, 3P). L'Atalanta è imbattuta nelle ultime 8 trasferte a Torino (2V, 6N) e ha segnato nel primo tempo in 7 di quelle 8.",
        note="Juve reduce dal 3-2 subito a Reggio Emilia (gol al 94') e dal 5-0 al NEC in Europa League giovedì: turn over e fatica europea da monitorare. Atalanta reduce da 2 ko (Roma, Cagliari) e con produzione offensiva ai minimi stagionali per xG.",
        formNote="Juventus con 6 gol fatti e 4 subiti, ko al 94' a Reggio Emilia e 5-0 al NEC in Europa League; Atalanta con 5 gol fatti e 2 sconfitte di fila.",
        pick="GG + 1X", confidence=3,
        lesson=None
    ),
    dict(
        id="mil-lec", day="dom", date="20 settembre", time="20:45", home="Milan", away="Lecce",
        venue="Stadio Meazza, Milano", tv="DAZN", status="upcoming",
        score=None, scorers=None,
        quotes=dict(h=1.27, d=5.50, a=13.00), qsrc=dict(h='real',d='real',a='real'),
        xg_ext=(1.80, 0.72), ext_model=dict(h=68, d=21, a=11), xg_src="stima modello interno + H2H (16 gare imbattuto)",
        absences=dict(home=[], away=["Geubbels"]),
        h2h="Milan vittorioso nelle ultime 5 sfide di A contro il Lecce (12-2) e imbattuto da 16 partite contro i salentini. Lecce con 6 punti, vittorioso 3-2 sul Monza.",
        note="Curiosità statistica pesante: tutti i 7 gol del Milan in campionato sono arrivati nell'ultima mezz'ora. Amorim ha recuperato tutti gli effettivi; Milan reduce dal 2-2 in rimonta a Roma con la Lazio e dal ko in Champions con il Benfica.",
        formNote="Milan imbattuto con 7 gol fatti (tutti nell'ultima mezz'ora) e 2 pareggi di fila; Lecce con 6 punti e 3 gol nel primo tempo contro il Monza.",
        pick="1 + Milan segna nel 2° tempo", confidence=4,
        lesson=None
    ),
]


# ----------------------------------------------------------------------------
# 3) MODELLO: forza attacco/difesa con shrinkage -> lambda (gol attesi)
# ----------------------------------------------------------------------------
SHRINK = 0.60          # peso dei dati 2026/27 (4 partite) rispetto alla media
HOME_ADV = 1.09        # fattore campo (i due fattori moltiplicano il totale -> 2,00)
AWAY_ADV = 0.91
RHO = -0.06            # correzione Dixon-Coles

def attack_rate(team):
    a = (TEAMS[team]["gf"] / TEAMS[team]["g"]) / LEAGUE_GOALS_PER_TEAM
    return 1 + (a - 1) * SHRINK

def defence_rate(team):
    d = (TEAMS[team]["ga"] / TEAMS[team]["g"]) / LEAGUE_GOALS_PER_TEAM
    return 1 + (d - 1) * SHRINK

# aggiustamenti qualitativi: moltiplicatori su gol attesi (1.0 = nessun effetto)
ADJ = {
    "rom-int": dict(home=1.00, away=0.95),   # Inter senza Calhanoglu e Stones
    "fio-nap": dict(home=1.00, away=0.95),   # Napoli con 6 indisponibili
    "juv-ata": dict(home=1.03, away=0.97),   # Atalanta senza Kossounou/Hien, Juve con turnover europeo
    "par-gen": dict(home=1.02, away=0.96),   # Genoa senza Vásquez squalificato
    "ven-laz": dict(home=1.02, away=1.00),   # Venezia senza il capitano Busio
}

def lambdas(m):
    # gol attesi del modello attacco/difesa, in scala corretta (gol per squadra per partita)
    M0 = LEAGUE_GOALS_PER_TEAM
    lh_adhoc = M0 * attack_rate(m["home"]) * defence_rate(m["away"]) * HOME_ADV
    la_adhoc = M0 * attack_rate(m["away"]) * defence_rate(m["home"]) * AWAY_ADV
    xh, xa = m["xg_ext"]
    lh = 0.20 * lh_adhoc + 0.80 * xh
    la = 0.20 * la_adhoc + 0.80 * xa
    adj = ADJ.get(m["id"], dict(home=1.0, away=1.0))
    lh *= adj["home"]
    la *= adj["away"]
    return max(0.25, lh), max(0.25, la)

# --- Poisson bivariato (Dixon-Coles) -----------------------------------------
MAXG = 10
def poisson(k, lam):
    return exp(-lam) * lam ** k / factorial(k)

def dc_matrix(lh, la, rho=RHO):
    M = [[0.0] * (MAXG + 1) for _ in range(MAXG + 1)]
    tot = 0.0
    for x in range(MAXG + 1):
        for y in range(MAXG + 1):
            tau = 1.0
            if x <= 1 and y <= 1:
                if x == 0 and y == 0:   tau = 1 - lh * la * rho
                elif x == 0 and y == 1: tau = 1 + lh * rho
                elif x == 1 and y == 0: tau = 1 + la * rho
                else:                   tau = 1 - rho
            p = poisson(x, lh) * poisson(y, la) * tau
            M[x][y] = p
            tot += p
    for x in range(MAXG + 1):
        for y in range(MAXG + 1):
            M[x][y] /= tot
    return M

def outcomes(M):
    h = sum(M[x][y] for x in range(MAXG+1) for y in range(MAXG+1) if x > y)
    d = sum(M[x][y] for x in range(MAXG+1) for y in range(MAXG+1) if x == y)
    a = sum(M[x][y] for x in range(MAXG+1) for y in range(MAXG+1) if x < y)
    btts = sum(M[x][y] for x in range(1, MAXG+1) for y in range(1, MAXG+1))
    o15 = sum(M[x][y] for x in range(MAXG+1) for y in range(MAXG+1) if x + y > 1.5)
    o25 = sum(M[x][y] for x in range(MAXG+1) for y in range(MAXG+1) if x + y > 2.5)
    o35 = sum(M[x][y] for x in range(MAXG+1) for y in range(MAXG+1) if x + y > 3.5)
    cs = sorted([(round(M[x][y], 6), f"{x}-{y}") for x in range(6) for y in range(6)],
                key=lambda t: -t[0])[:6]
    return dict(home=h, draw=d, away=a, btts=btts, over15=o15, over25=o25, over35=o35,
                cs=[dict(p=pr, s=ss) for pr, ss in cs])

# --- rimozione del margine dalle quote (power method) ------------------------
def fair_probs(q):
    inv = [1.0 / x for x in q]
    lo, hi = 0.5, 3.0
    for _ in range(80):
        k = (lo + hi) / 2
        s = sum(p ** k for p in inv)
        if s > 1: lo = k
        else: hi = k
    k = (lo + hi) / 2
    raw = [p ** k for p in inv]
    s = sum(raw)
    return [r / s for r in raw], k

def stars(p, ev):
    score = 0
    if p >= 0.75: score += 2
    elif p >= 0.60: score += 1.5
    elif p >= 0.50: score += 1
    if ev >= 0.08: score += 2
    elif ev >= 0.04: score += 1.4
    elif ev >= 0.0: score += 0.8
    return max(1, min(5, round(score)))

# ----------------------------------------------------------------------------
# 4) CALCOLO PER OGNI PARTITA
# ----------------------------------------------------------------------------
def build():
    matches = []
    for m in MATCHES:
        lh, la = lambdas(m)
        M = dc_matrix(lh, la)
        mo = outcomes(M)                                    # modello
        q = [m["quotes"]["h"], m["quotes"]["d"], m["quotes"]["a"]]
        fprobs, k = fair_probs(q)
        mk = dict(home=fprobs[0], draw=fprobs[1], away=fprobs[2])

        # mercato corretto se disponibile un consenso esplicito
        if m.get("market_consensus"):
            c = m["market_consensus"]
            mk = dict(home=c["h"]/100, draw=c["d"]/100, away=c["a"]/100)

        # blend finale 60% mercato / 40% modello
        mix = dict(
            home=0.70 * mk["home"] + 0.30 * mo["home"],
            draw=0.70 * mk["draw"] + 0.30 * mo["draw"],
            away=0.70 * mk["away"] + 0.30 * mo["away"],
        )
        # ancoraggio al mercato: nessun esito puo' divergere oltre 4.5 punti percentuali
        CLAMP = 0.040
        mix = {kk: min(max(v, mk[kk] - CLAMP), mk[kk] + CLAMP) for kk, v in mix.items()}
        tot = sum(mix.values())
        mix = {kk: v / tot for kk, v in mix.items()}

        # mercati derivati: modello puro (già calibrato sugli xG)
        markets = {
            "1":       dict(p=mix["home"], q=q[0]),
            "X":       dict(p=mix["draw"], q=q[1]),
            "2":       dict(p=mix["away"], q=q[2]),
            "1X":      dict(p=mix["home"] + mix["draw"], q=m["extra"].get("dc1x")),
            "12":      dict(p=mix["home"] + mix["away"], q=m["extra"].get("dc12")),
            "X2":      dict(p=mix["draw"] + mix["away"], q=m["extra"].get("dcx2")),
            "GG":      dict(p=mo["btts"], q=m["extra"].get("gg")),
            "NG":      dict(p=1 - mo["btts"], q=None),
            "O1.5":    dict(p=mo["over15"], q=None),
            "U1.5":    dict(p=1 - mo["over15"], q=None),
            "O2.5":    dict(p=mo["over25"], q=m["extra"].get("o25")),
            "U2.5":    dict(p=1 - mo["over25"], q=None),
            "O3.5":    dict(p=mo["over35"], q=None),
            "U3.5":    dict(p=1 - mo["over35"], q=None),
        }
        for kk, v in markets.items():
            if v["q"]:
                v["ev"] = v["p"] * v["q"] - 1
                v["fair"] = 1 / v["p"]
            else:
                v["ev"] = None
                v["fair"] = 1 / v["p"]

        m2 = dict(m)
        heat = [dict(s=f"{x}-{y}", p=round(M[x][y], 6)) for x in range(5) for y in range(5)]
        qsrc = m.get("qsrc", {})
        qsrc_map = {"1": qsrc.get("h"), "X": qsrc.get("d"), "2": qsrc.get("a")}
        for kk, v in markets.items():
            if v.get("q"):
                v["qsrc"] = qsrc_map.get(kk, "real")
        m2.update(
            lambda_home=round(lh, 3), lambda_away=round(la, 3),
            model_probs={kk: round(v, 4) for kk, v in mo.items() if kk != "cs"},
            model_cs=mo["cs"][:5],
            market_probs={kk: round(v, 4) for kk, v in mk.items()},
            final_probs={kk: round(v, 4) for kk, v in mix.items()},
            markets={kk: {("p" if k2 == "p" else k2): (round(v2, 4) if isinstance(v2, float) else v2)
                          for k2, v2 in v.items()} for kk, v in markets.items()},
            overround=round(sum(1 / x for x in q) - 1, 4),
            heat=heat,
            book_margin_k=round(k, 3),
        )
        # miglior giocata (value) della partita
        cands = []
        for kk, v in markets.items():
            if v["q"] and v["p"] >= 0.35:
                cands.append((v["ev"], kk, v["p"], v["q"]))
        cands.sort(reverse=True)
        if cands:
            ev, kk, p, qq = cands[0]
            m2["best_value"] = dict(sel=kk, ev=round(ev, 4), p=round(p, 4), q=qq)
        else:
            m2["best_value"] = None
        # esito principale del modello
        best = max([("1", mix["home"]), ("X", mix["draw"]), ("2", mix["away"])], key=lambda t: t[1])
        m2["model_lean"] = best[0]
        m2["model_lean_p"] = round(best[1], 4)
        m2["confidence"] = stars(m2["model_lean_p"], m2["best_value"]["ev"] if m2["best_value"] else 0)
        m2["expected_goals"] = round(lh + la, 2)
        matches.append(m2)
    return matches

# quote reali dei mercati secondari reperite sulla stampa (19/09/2026)
EXTRAS = {
    # quote 1X2 -> mercati derivati: valori reali pubblicati il 18-19/09/2026
    "rom-int": dict(dc1x=1.50, dc12=1.33, dcx2=1.44, gg=1.50, o25=1.67),  # 1x2.expert/Snai
    "ven-laz": dict(gg=1.63),                                             # GoldBet via diretta.it
    "juv-ata": dict(gg=1.75),                                             # bet365 via diretta.it
    "fio-nap": dict(dcx2=1.30),                                           # bet365 via diretta.it
}
for m in MATCHES:
    m["extra"] = EXTRAS.get(m["id"], {})

# ----------------------------------------------------------------------------
# 5) SCHEDINE
# ----------------------------------------------------------------------------
def q_of(matches, mid, sel):
    m = next(x for x in matches if x["id"] == mid)
    return m["markets"][sel]

import itertools

def kelly_fraction(p, q, frac=0.25):
    """Kelly frazionato (1/4 Kelly) sul bankroll."""
    edge = p * q - 1
    if edge <= 0:
        return 0.0
    return max(0.0, frac * edge / (q - 1))

# mercati con quota REALE disponibile per partita -> candidati per le multiple
def real_market_candidates(m):
    """Solo selezioni con quota REALMENTE quotata (esclude le quote ricostruite)."""
    out = []
    for sel, v in m["markets"].items():
        if v["q"] and v.get("qsrc") == "real":
            out.append((sel, v["p"], v["q"], v["ev"]))
    return out

def build_schedine(matches):
    playable = [m for m in matches if m["status"] == "upcoming"]
    # per le multiple si usano solo selezioni con probabilita' >= 30% (no caccia agli esiti improbabili)
    cand = {m["id"]: [c for c in real_market_candidates(m) if c[1] >= 0.30] for m in playable}
    ids = list(cand.keys())

    def combos(k_min, k_max):
        for r in range(k_min, k_max + 1):
            for sub in itertools.combinations(ids, r):
                for picks in itertools.product(*[cand[i] for i in sub]):
                    yield list(zip(sub, [p[0] for p in picks])), picks

    def evaluate(picks):
        q, p = 1.0, 1.0
        for sel, pp, qq, _ in picks:
            q *= qq
            p *= pp
        return q, p, p * q - 1

    # A - prudente: massima probabilita' con 2 selezioni (il margine si paga una volta sola)
    bestA, bestA_s = None, -1
    for sel, picks in combos(2, 2):
        q, p, ev = evaluate(picks)
        if q >= 1.70 and p > bestA_s:
            bestA, bestA_s = (sel, picks, q, p, ev), p

    # B - bilanciata: massimo EV con 3 selezioni e quota 1.8-4.0
    bestB, bestB_s = None, -9
    for sel, picks in combos(3, 3):
        q, p, ev = evaluate(picks)
        if 1.8 <= q <= 4.0 and ev > bestB_s:
            bestB, bestB_s = (sel, picks, q, p, ev), ev

    # C - aggressiva: massimo EV con 4 selezioni e quota 4.0-14
    bestC, bestC_s = None, -9
    for sel, picks in combos(4, 4):
        q, p, ev = evaluate(picks)
        if 4.0 <= q <= 14.0 and ev > bestC_s:
            bestC, bestC_s = (sel, picks, q, p, ev), ev

    out = []
    specs = [
        ("A", "Schedina A - Prudente (2 selezioni)", "bassa varianza", bestA, "3 unita' su 10", 0.25),
        ("B", "Schedina B - Bilanciata (3 selezioni)", "equilibrata", bestB, "2 unita' su 10", 0.25),
        ("C", "Schedina C - Aggressiva (4 selezioni)", "alta varianza", bestC, "1 unita' su 10", 0.10),
    ]
    for code, nome, tag, best, stake, kf in specs:
        sel_ids, picks, q, p, ev = best
        det = []
        for (mid, sname), (sel, pp, qq, _) in zip(sel_ids, picks):
            m = next(x for x in matches if x["id"] == mid)
            det.append(dict(mid=mid, partita=f'{m["home"]}-{m["away"]}', sel=sel,
                            p=round(pp, 4), q=round(qq, 2),
                            ev=round(pp * qq - 1, 4),
                            ora=f'{m["date"]} {m["time"]}'))
        out.append(dict(code=code, nome=nome, tag=tag, dettaglio=det,
                        quota=round(q, 2), prob=round(p, 4), ev=round(ev, 4),
                        stake=stake, kelly=round(kelly_fraction(p, q, kf), 4) if kf == 0.25 else 0.0,
                        perdita_attesa=round((p * q - 1), 4),
                        note="Il margine del banco sulle multiple si moltiplica: puntare poco e con selezioni ad alta probabilita'."))
    # D - la giocata singola del turno (miglior valore assoluto fra le gare giocabili)
    best = None
    for m in playable:
        for sel, pp, qq, ev in real_market_candidates(m):
            if ev > (best[4] if best else -9) and pp >= 0.30 and qq >= 1.8:
                best = (m, sel, pp, qq, ev)
    if best:
        m, sel, pp, qq, ev = best
        out.append(dict(code="D", nome="Schedina D - La giocata singola del turno", tag="value",
                        dettaglio=[dict(mid=m["id"], partita=f'{m["home"]}-{m["away"]}', sel=sel,
                                        p=round(pp, 4), q=round(qq, 2), ev=round(ev, 4),
                                        ora=f'{m["date"]} {m["time"]}')],
                        quota=round(qq, 2), prob=round(pp, 4), ev=round(ev, 4),
                        stake="2 unita' su 10", kelly=round(kelly_fraction(pp, qq), 4),
                        perdita_attesa=round(pp * qq - 1, 4),
                        note="Una sola giocata, la migliore del turno: e' cosi' che si riduce l'impatto del margine del banco."))
    return out

def build_value_rankings(matches):
    playable = [m for m in matches if m["status"] == "upcoming"]
    rows = []
    for m in playable:
        for sel, v in m["markets"].items():
            if not v["q"] or v.get("qsrc") != "real":
                continue
            rows.append(dict(mid=m["id"], partita=f'{m["home"]}-{m["away"]}',
                             sel=sel, p=round(v["p"], 4), q=v["q"],
                             ev=round(v["ev"], 4), fair=round(v["fair"], 2),
                             ora=f'{m["date"]} {m["time"]}',
                             kelly=round(kelly_fraction(v["p"], v["q"]), 4)))
    top = [r for r in rows if r["p"] >= 0.25]
    top.sort(key=lambda r: -r["ev"])
    avoid = [r for r in rows if r["p"] >= 0.45]
    avoid.sort(key=lambda r: r["ev"])
    return top[:8], avoid[:5]

TOP_VALUE, AVOID = None, None

data = dict(
    meta=dict(
        giornata=5, stagione="2026/27",
        periodo="18-20 settembre 2026",
        generato="19 settembre 2026, ore 16:30 (CEST)",
        prossima="Dopo questa giornata: pausa di 3 settimane per la Nations League. La 6ª giornata si gioca il 10-11 ottobre 2026.",
        note_live="Monza-Sassuolo si e' giocata venerdi' (2-1). Udinese-Cagliari e Bologna-Torino erano in campo alle 15:00 di sabato e sono state seguite in tempo reale.",
    ),
    teams=TEAMS,
    matches=build(),
    schedine=[],
    value_top=[],
    avoid=[],
    leaders=[
        dict(nome="Donyell Malen", squadra="Roma", gol=6, nota="capocannoniere; quota 2,25 per la 7ª rete contro l'Inter"),
        dict(nome="Lautaro Martinez", squadra="Inter", gol=2, nota="re dei bomber del 2026; 2,75 per il terzo centro in campionato"),
        dict(nome="Antonio Raimondo", squadra="Frosinone", gol=4, nota="rivelazione del Frosinone con 7 punti"),
        dict(nome="Franco Mastantuono", squadra="Fiorentina", gol=3, nota="doppietta in 60 secondi a Venezia"),
        dict(nome="Daniel Maldini", squadra="Cagliari", gol=2, nota="2 gol in 2 gare, ha aperto il 3° centro consecutivo a Udine"),
        dict(nome="Davide Frattesi", squadra="Lazio", gol=3, nota="miglior marcatore biancoceleste"),
    ],
)

data["schedine"] = build_schedine(data["matches"])
TOP_VALUE, AVOID = build_value_rankings(data["matches"])
data["value_top"] = TOP_VALUE
data["avoid"] = AVOID

# valore di scenario: probabilità che le 7 gare giocabili producano almeno X GG / Over
with open(os.path.join(MEDIA, "serie-a-5g-data.json"), "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=1)

print("=== DATASET PRONTO ===")
for m in data["matches"]:
    fp = m["final_probs"]
    print(f'{m["home"]:>10}-{m["away"]:<10} xG {m["lambda_home"]:.2f}-{m["lambda_away"]:.2f} | '
          f'1 {fp["home"]*100:4.1f}%  X {fp["draw"]*100:4.1f}%  2 {fp["away"]*100:4.1f}% | '
          f'quota migl. {m["best_value"]} | lean {m["model_lean"]} ({m["model_lean_p"]*100:.0f}%)')
print()
for s in data["schedine"]:
    print(f'{s["nome"]}: quota {s["quota"]} | prob {s["prob"]*100:.2f}% | EV {s["ev"]*100:+.2f}%')


# ----------------------------------------------------------------------------
# 6) RENDER DEL REPORT HTML (template Jinja2)
# ----------------------------------------------------------------------------
TEMPLATE_PATH = os.path.join(MEDIA, "seriea5-template.html.j2")
OUT_HTML = os.path.join(MEDIA, "report-serie-a-5-giornata-2026-27.html")
with open(TEMPLATE_PATH, encoding="utf-8") as f:
    tpl = Template(f.read())
html = tpl.render(data_json=json.dumps(data, ensure_ascii=False))
with open(OUT_HTML, "w", encoding="utf-8") as f:
    f.write(html)
print(f"\nReport HTML scritto: {OUT_HTML} ({len(html)} caratteri)")

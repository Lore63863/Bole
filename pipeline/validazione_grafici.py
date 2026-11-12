"""Grafici di validazione del modello (Fase 3).

Legge dati-elaborati/calibrazione/risultati.json (scritto da calibra.py) e
disegna due pannelli:

  A. quanti ritrovamenti cadono nel 20% di giorni con indice piu alto,
     per i quattro modelli a confronto (il caso puro darebbe 20%);
  B. come si distribuiscono i ritrovamenti nelle cinque classi,
     rispetto a quello che ci si aspetta per costruzione delle soglie.

Tutti i numeri vengono dal controllo "lascia fuori un anno alla volta":
il modello non ha mai visto l'anno del ritrovamento che sta giudicando.

Uso:  python3 pipeline/validazione_grafici.py
"""

import json
import pathlib

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

RADICE = pathlib.Path(__file__).resolve().parent.parent
RISULTATI = RADICE / "dati-elaborati" / "calibrazione" / "risultati.json"
# Sta in docs/ perché VALIDATION.md la mostra e docs/ andrà nel repo pubblico.
USCITA = RADICE / "docs" / "immagini" / "validazione_modello.png"

# Due colori distinguibili anche da chi non distingue rosso e verde
# (controllati con il validatore della guida grafici: tutti i test passati).
BLU = "#1F6FB8"      # i quattro porcini
ARANCIO = "#D2601F"  # tutte le specie
GRIGIO = "#6B7280"
INCHIOSTRO = "#1F2328"
SFONDO = "#FCFCFB"

MODELLI = [
    ("calendario", "solo\ncalendario"),
    ("pioggia", "solo\npioggia"),
    ("meteo", "solo\nmeteo"),
    ("completo", "Bolé\n(completo)"),
]
CLASSI = ["molto\nbassa", "bassa", "media", "alta", "molto\nalta"]


def pulisci(ax):
    """Assi leggeri: niente cornice, griglia appena accennata."""
    for lato in ("top", "right", "left"):
        ax.spines[lato].set_visible(False)
    ax.spines["bottom"].set_color("#D4D4D0")
    ax.tick_params(length=0, colors=GRIGIO, labelsize=9)
    ax.set_axisbelow(True)
    ax.yaxis.grid(True, color="#E8E8E4", linewidth=0.8)


def barre(ax, posizioni, valori, errori, colore, etichetta, larghezza):
    """Barre sottili con l'estremita arrotondata e un filo di sfondo attorno."""
    b = ax.bar(
        posizioni, valori, larghezza,
        color=colore, label=etichetta,
        edgecolor=SFONDO, linewidth=1.2,
    )
    if errori is not None:
        ax.errorbar(
            posizioni, valori, yerr=errori, fmt="none",
            ecolor=INCHIOSTRO, elinewidth=1.1, capsize=3, alpha=0.55,
        )
    for p, v in zip(posizioni, valori):
        ax.text(
            p, v + 0.025, f"{round(v * 100)}%",
            ha="center", va="bottom", fontsize=8.5, color=INCHIOSTRO,
        )
    return b


def pannello_a(ax, r):
    porcini = r["gruppi"]["porcini"]
    tutte = r["gruppi"]["tutte"]
    x = np.arange(len(MODELLI))
    larghezza = 0.32

    ax.axhline(0.20, color=GRIGIO, linewidth=1.1, linestyle=(0, (4, 3)))
    ax.text(
        1.5, 0.215, "caso puro: 20%",
        ha="center", va="bottom", fontsize=8.5, color=GRIGIO,
    )

    barre(ax, x - larghezza / 2,
          [porcini[k]["nel_20"] for k, _ in MODELLI],
          [porcini[k]["nel_20_errore"] for k, _ in MODELLI],
          BLU, f"i quattro porcini (n={porcini['completo']['n']})", larghezza)
    barre(ax, x + larghezza / 2,
          [tutte[k]["nel_20"] for k, _ in MODELLI],
          [tutte[k]["nel_20_errore"] for k, _ in MODELLI],
          ARANCIO, f"tutte le specie (n={tutte['completo']['n']})", larghezza)

    ax.set_xticks(x)
    ax.set_xticklabels([e for _, e in MODELLI])
    ax.set_yticks(np.arange(0, 1.01, 0.2))
    ax.set_yticklabels([f"{int(v * 100)}%" for v in np.arange(0, 1.01, 0.2)])
    ax.set_ylim(0, 1.0)
    ax.set_title(
        "A · Ritrovamenti nel 20% di giorni con indice piu alto",
        fontsize=11.5, fontweight="bold", color=INCHIOSTRO, loc="left", pad=10,
    )
    pulisci(ax)


def pannello_b(ax, r):
    porcini = r["gruppi"]["porcini"]["classi"]
    tutte = r["gruppi"]["tutte"]["classi"]
    attese = r["classi_attese"]
    x = np.arange(len(CLASSI))
    larghezza = 0.32

    barre(ax, x - larghezza / 2, porcini, None, BLU,
          "i quattro porcini", larghezza)
    barre(ax, x + larghezza / 2, tutte, None, ARANCIO,
          "tutte le specie", larghezza)

    for p, v in zip(x, attese):
        ax.plot(
            [p - 0.47, p + 0.47], [v, v],
            color=INCHIOSTRO, linewidth=1.6, solid_capstyle="round", zorder=5,
        )
    ax.plot([], [], color=INCHIOSTRO, linewidth=1.6,
            label="quota attesa per costruzione")

    ax.set_xticks(x)
    ax.set_xticklabels(CLASSI)
    ax.set_yticks(np.arange(0, 0.71, 0.2))
    ax.set_yticklabels([f"{int(v * 100)}%" for v in np.arange(0, 0.71, 0.2)])
    ax.set_ylim(0, 0.72)
    ax.set_title(
        "B · In quale classe cade il ritrovamento",
        fontsize=11.5, fontweight="bold", color=INCHIOSTRO, loc="left", pad=10,
    )
    pulisci(ax)


def main():
    r = json.loads(RISULTATI.read_text(encoding="utf-8"))
    fig, assi = plt.subplots(1, 2, figsize=(12.4, 6.4), facecolor=SFONDO)
    for a in assi:
        a.set_facecolor(SFONDO)
    pannello_a(assi[0], r)
    pannello_b(assi[1], r)

    fig.suptitle(
        "Bolé · prova del modello sui ritrovamenti pubblici, 2017-2026",
        fontsize=14, fontweight="bold", color=INCHIOSTRO, x=0.05, ha="left",
        y=0.975,
    )
    fig.text(
        0.05, 0.915,
        "Controllo «lascia fuori un anno alla volta»: il modello non ha mai visto\n"
        "l'anno del ritrovamento che sta giudicando. Le barrette verticali sono\n"
        "l'incertezza dovuta al numero di ritrovamenti.",
        fontsize=9.5, color=GRIGIO, ha="left", va="top", linespacing=1.45,
    )

    porcini = r["gruppi"]["porcini"]["completo"]["n"]
    tutte = r["gruppi"]["tutte"]["completo"]["n"]
    mani = [
        plt.Rectangle((0, 0), 1, 1, color=BLU),
        plt.Rectangle((0, 0), 1, 1, color=ARANCIO),
        plt.Line2D([0], [0], color=INCHIOSTRO, linewidth=1.6),
    ]
    fig.legend(
        mani,
        [f"i quattro porcini (n={porcini})",
         f"tutte le specie (n={tutte})",
         "quota attesa per costruzione (pannello B)"],
        frameon=False, fontsize=9.5, loc="upper right",
        bbox_to_anchor=(0.975, 0.955), handlelength=1.3, labelspacing=0.7,
    )

    fig.text(
        0.05, 0.028,
        "Ritrovamenti: GBIF, osservazioni pubbliche con data e coordinate "
        "(incertezza entro 1 km)\n"
        "Meteo: modello IFS dell'ECMWF, dall'archivio aperto di Open-Meteo "
        "(CC BY 4.0)",
        fontsize=8.5, color=GRIGIO, ha="left", va="bottom", linespacing=1.5,
    )
    fig.subplots_adjust(left=0.05, right=0.975, top=0.70, bottom=0.17, wspace=0.16)
    USCITA.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(USCITA, dpi=150, facecolor=SFONDO)
    plt.close(fig)
    print(f"scritto {USCITA} ({USCITA.stat().st_size / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()

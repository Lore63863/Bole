#!/usr/bin/env python3
"""Icone dell'app (fungo bianco su verde), disegnate da zero: nessuna immagine di terzi.

Uso: python3 strumenti/icone.py   → public/icone/*.png
"""
from pathlib import Path
from PIL import Image, ImageDraw

VERDE = (30, 91, 63)        # #1E5B3F, il verde dell'app
CREMA = (243, 245, 241)     # #F3F5F1
USCITA = Path(__file__).resolve().parents[1] / "public" / "icone"


def disegna(lato, scala):
    """Fungo centrato; scala = frazione del lato occupata dal disegno (le icone "maskable" ne vogliono meno)."""
    s = 4  # disegno più grande e poi rimpicciolito: bordi lisci
    L = lato * s
    img = Image.new("RGB", (L, L), VERDE)
    d = ImageDraw.Draw(img)
    u = L * scala / 16          # unità: il disegno è largo 16 unità
    cx, cy = L / 2, L / 2 - 0.6 * u   # cy = bordo inferiore del cappello
    # gambo tozzo, un po' più largo in basso (come un porcino)
    d.ellipse([cx - 3.4 * u, cy + 2.0 * u, cx + 3.4 * u, cy + 7.4 * u], fill=CREMA)
    d.rounded_rectangle([cx - 2.6 * u, cy - 1.0 * u, cx + 2.6 * u, cy + 5.0 * u], radius=1.2 * u, fill=CREMA)
    # cappello: mezza ellisse larga 16 e alta 7 unità, con l'orlo arrotondato
    d.pieslice([cx - 8 * u, cy - 7 * u, cx + 8 * u, cy + 7 * u], 180, 360, fill=CREMA)
    d.rounded_rectangle([cx - 8 * u, cy - 0.7 * u, cx + 8 * u, cy + 0.7 * u], radius=0.7 * u, fill=CREMA)
    # un filo verde fra cappello e gambo, perché si leggano come due parti
    d.rectangle([cx - 2.7 * u, cy + 0.7 * u, cx + 2.7 * u, cy + 1.15 * u], fill=VERDE)
    return img.resize((lato, lato), Image.LANCZOS)


def main():
    USCITA.mkdir(parents=True, exist_ok=True)
    disegna(180, 0.62).save(USCITA / "apple-touch-icon.png")
    disegna(192, 0.62).save(USCITA / "icona-192.png")
    disegna(512, 0.62).save(USCITA / "icona-512.png")
    disegna(512, 0.48).save(USCITA / "icona-512-maskable.png")   # zona sicura: cerchio dell'80%
    disegna(48, 0.70).save(USCITA / "favicon-48.png")
    print("icone in", USCITA)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
geotag_fill.py

Parcourt un dossier d'images JPEG, extrait date/heure et GPS EXIF,
puis complète (interpole) les photos sans GPS en s'appuyant sur les photos
voisines chronologiques qui ont des coordonnées.

Sortie : JSON array compatible avec gallery-data.json:
[{
    "id": "1",
    "image": "folder/image.jpg",
    "date": "2024-01-15",
    "coordinates": { "lat": 48.8, "lng": 2.3 },
    "origin": "Paris, France"
}, ...]

Dépendances:
    pip install Pillow piexif requests
"""

import os
import sys
import json
import time
import urllib.request
import urllib.parse
from datetime import datetime
from fractions import Fraction
from typing import Optional, Tuple, List, Dict
from PIL import Image
import piexif

# ---------- Reverse Geocoding Cache ----------
_geocode_cache: Dict[Tuple[float, float], Optional[str]] = {}

def reverse_geocode(lat: float, lng: float) -> Optional[str]:
    """
    Utilise Nominatim (OpenStreetMap) pour obtenir le nom de la ville.
    Respecte le rate limit de 1 requête/seconde.
    Retourne "Ville, Pays" ou None en cas d'échec.
    """
    # Round coordinates to reduce cache misses (approx 1km precision)
    cache_key = (round(lat, 2), round(lng, 2))
    
    if cache_key in _geocode_cache:
        return _geocode_cache[cache_key]
    
    try:
        # Rate limiting - Nominatim requires max 1 request per second
        time.sleep(1.1)
        
        url = f"https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lng}&format=json&zoom=10&accept-language=en"
        headers = {"User-Agent": "geotag-fill-script/1.0"}
        
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode('utf-8'))
        
        address = data.get('address', {})
        
        # Try to get city name from various fields
        city = (
            address.get('city') or 
            address.get('town') or 
            address.get('village') or 
            address.get('municipality') or
            address.get('county') or
            address.get('state')
        )
        country = address.get('country')
        
        if city and country:
            result = f"{city}, {country}"
        elif country:
            result = country
        else:
            result = None
            
        _geocode_cache[cache_key] = result
        return result
        
    except Exception as e:
        print(f"  Geocoding error for ({lat}, {lng}): {e}", file=sys.stderr)
        _geocode_cache[cache_key] = None
        return None

# ---------- Helpers pour EXIF GPS ----------
def _rational_to_float(rat):
    """Convertit (num, den) ou tuple de rationals en float. Supporte aussi Fraction."""
    try:
        return float(Fraction(rat[0], rat[1]))
    except Exception:
        # si c'est déjà un float or Fraction
        return float(rat)

def gps_to_decimal(gps_ifd) -> Optional[Tuple[float, float]]:
    """
    Convertit la structure GPS EXIF (telle que fournie par piexif) en (lat, lon) décimales.
    gps_ifd est un dict contenant clés bytes: e.g. piexif.GPSIFD.GPSLatitude, GPSLatitudeRef, etc.
    """
    if not gps_ifd:
        return None
    try:
        lat = gps_ifd.get(piexif.GPSIFD.GPSLatitude)
        lat_ref = gps_ifd.get(piexif.GPSIFD.GPSLatitudeRef)
        lon = gps_ifd.get(piexif.GPSIFD.GPSLongitude)
        lon_ref = gps_ifd.get(piexif.GPSIFD.GPSLongitudeRef)
        if not lat or not lat_ref or not lon or not lon_ref:
            return None

        # lat and lon are arrays of rationals: [(num,den), (num,den), (num,den)]
        lat_deg = _rational_to_float(lat[0])
        lat_min = _rational_to_float(lat[1])
        lat_sec = _rational_to_float(lat[2])
        lon_deg = _rational_to_float(lon[0])
        lon_min = _rational_to_float(lon[1])
        lon_sec = _rational_to_float(lon[2])

        lat_dec = lat_deg + lat_min / 60.0 + lat_sec / 3600.0
        lon_dec = lon_deg + lon_min / 60.0 + lon_sec / 3600.0

        if isinstance(lat_ref, bytes):
            lat_ref = lat_ref.decode('utf-8', errors='ignore')
        if isinstance(lon_ref, bytes):
            lon_ref = lon_ref.decode('utf-8', errors='ignore')

        if lat_ref.upper() in ['S', 'SOUTH']:
            lat_dec = -lat_dec
        if lon_ref.upper() in ['W', 'WEST']:
            lon_dec = -lon_dec

        return (lat_dec, lon_dec)
    except Exception:
        return None

# ---------- Lecture EXIF ----------
def read_photo_metadata(path: str) -> Tuple[datetime, Optional[Tuple[float, float]]]:
    """
    Retourne (datetime_obj, (lat, lon) or None)
    Si DateTimeOriginal absent, fallback sur la date de modification du fichier.
    """
    # fallback date
    mtime = os.path.getmtime(path)
    dt = datetime.fromtimestamp(mtime)

    gps = None
    try:
        img = Image.open(path)
        exif_bytes = img.info.get('exif')
        if exif_bytes:
            exif = piexif.load(exif_bytes)
        else:
            # tenter à partir du fichier brut
            exif = piexif.load(path)
    except Exception:
        exif = {}

    # DateTimeOriginal
    try:
        # ExifIFD DateTimeOriginal
        dto = None
        if 'Exif' in exif and piexif.ExifIFD.DateTimeOriginal in exif['Exif']:
            dto = exif['Exif'][piexif.ExifIFD.DateTimeOriginal]
            if isinstance(dto, bytes):
                dto = dto.decode('utf-8', errors='ignore')
        elif '0th' in exif and piexif.ImageIFD.DateTime in exif['0th']:
            dto = exif['0th'][piexif.ImageIFD.DateTime]
            if isinstance(dto, bytes):
                dto = dto.decode('utf-8', errors='ignore')

        if dto:
            # formats communs: "YYYY:MM:DD HH:MM:SS"
            try:
                dt = datetime.strptime(dto, "%Y:%m:%d %H:%M:%S")
            except Exception:
                # essayer iso-like
                try:
                    dt = datetime.fromisoformat(dto)
                except Exception:
                    pass
    except Exception:
        pass

    # GPS
    try:
        gps_ifd = exif.get('GPS')
        if gps_ifd:
            gps = gps_to_decimal(gps_ifd)
    except Exception:
        gps = None

    return dt, gps

# ---------- Interpolation ----------
def interpolate_missing(sorted_items: List[dict]) -> List[dict]:
    """
    sorted_items : list of dicts with keys: filename, datetime (datetime obj), coords (None or (lat,lon))
    Retourne la même liste mais avec coords remplies (ou null si impossible).
    Méthode : pour chaque segment de photos sans coords entre two known coords, on interpole linéairement par rapport au temps.
    Si un seul côté connu (début ou fin), on propage cette coordonnée.
    """
    n = len(sorted_items)
    # precompute indices that have coords
    known_indices = [i for i, it in enumerate(sorted_items) if it['coords'] is not None]

    if not known_indices:
        # aucune coord trouvée : tout reste None
        return sorted_items

    # Fill leading missing with first known
    first_known = known_indices[0]
    for i in range(0, first_known):
        sorted_items[i]['coords'] = sorted_items[first_known]['coords']

    # Fill trailing missing with last known
    last_known = known_indices[-1]
    for i in range(last_known+1, n):
        sorted_items[i]['coords'] = sorted_items[last_known]['coords']

    # Fill gaps between knowns
    for a_idx, b_idx in zip(known_indices, known_indices[1:]):
        a_item = sorted_items[a_idx]
        b_item = sorted_items[b_idx]
        a_time = a_item['datetime'].timestamp()
        b_time = b_item['datetime'].timestamp()
        if b_time == a_time:
            # même timestamp : donne la même coord
            for j in range(a_idx+1, b_idx):
                sorted_items[j]['coords'] = a_item['coords']
            continue

        for j in range(a_idx+1, b_idx):
            cur_time = sorted_items[j]['datetime'].timestamp()
            t = (cur_time - a_time) / (b_time - a_time)
            lat = a_item['coords'][0] + t * (b_item['coords'][0] - a_item['coords'][0])
            lon = a_item['coords'][1] + t * (b_item['coords'][1] - a_item['coords'][1])
            sorted_items[j]['coords'] = (lat, lon)
    return sorted_items

# ---------- Main ----------
def process_folder(folder: str, do_geocode: bool = True) -> List[dict]:
    # lister fichiers jpg/jpeg (non récursif, mais on peut étendre)
    files = [f for f in os.listdir(folder) if os.path.isfile(os.path.join(folder, f)) and f.lower().endswith(('.jpg', '.jpeg'))]
    items = []
    for fname in files:
        path = os.path.join(folder, fname)
        try:
            dt, gps = read_photo_metadata(path)
        except Exception as e:
            # en cas d'erreur non fatale, on log et on passe
            print(f"Warning: erreur lecture EXIF {fname}: {e}", file=sys.stderr)
            dt = datetime.fromtimestamp(os.path.getmtime(path))
            gps = None
        items.append({
            'filename': fname,
            'path': path,
            'datetime': dt,
            'coords': gps  # None or (lat,lon)
        })

    # tri chronologique (puis nom pour stabilité)
    items.sort(key=lambda x: (x['datetime'].timestamp(), x['filename']))

    # interpolation / propagation
    filled = interpolate_missing(items)

    # Format de sortie compatible gallery-data.json
    out = []
    total = len(filled)
    for idx, it in enumerate(filled, start=1):
        latlon = it['coords']
        
        # Build the entry
        entry = {
            "id": str(idx),
            "image": it['path'],  # relative path from project root
            "date": it['datetime'].strftime("%Y-%m-%d")
        }
        
        # Add coordinates if available
        if latlon is not None:
            entry["coordinates"] = {
                "lat": round(latlon[0], 6),
                "lng": round(latlon[1], 6)
            }
            
            # Reverse geocode to get origin (city, country)
            if do_geocode:
                print(f"  [{idx}/{total}] Geocoding {it['filename']}...", file=sys.stderr)
                origin = reverse_geocode(latlon[0], latlon[1])
                if origin:
                    entry["origin"] = origin
        
        out.append(entry)
        
    return out

def main():
    if len(sys.argv) < 3:
        print("Usage: python geotag_fill.py /chemin/vers/dossier_photos sortie.json [--no-geocode]")
        print("\nOptions:")
        print("  --no-geocode  Sauter le reverse geocoding (plus rapide)")
        sys.exit(1)
    
    folder = sys.argv[1]
    out_json = sys.argv[2]
    do_geocode = "--no-geocode" not in sys.argv
    
    if not os.path.isdir(folder):
        print("Le chemin donné n'est pas un dossier valide.")
        sys.exit(2)

    print(f"Traitement du dossier: {folder}", file=sys.stderr)
    if do_geocode:
        print("Reverse geocoding activé (peut prendre du temps - 1 req/sec)", file=sys.stderr)
    
    result = process_folder(folder, do_geocode)
    with open(out_json, 'w', encoding='utf-8') as fh:
        json.dump(result, fh, ensure_ascii=False, indent=4)
    print(f"Écrit {len(result)} entrées dans {out_json}")

if __name__ == "__main__":
    main()


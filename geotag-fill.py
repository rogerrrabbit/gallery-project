#!/usr/bin/env python3
"""
geotag_fill.py

Parcourt un dossier d'images JPEG, extrait date/heure, GPS et métadonnées EXIF (ISO, Ouverture, Vitesse, Appareil),
puis complète (interpole) les photos sans GPS.

Gère la structure JSON avec en-tête:
{
    "header": { ... },
    "images": [ ... ]
}

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
from typing import Optional, Tuple, List, Dict, Any
from PIL import Image, ExifTags
import piexif

# ---------- Reverse Geocoding Cache ----------
_geocode_cache: Dict[Tuple[float, float], Optional[str]] = {}

def reverse_geocode(lat: float, lng: float) -> Optional[str]:
    """
    Utilise Nominatim (OpenStreetMap) pour obtenir le nom de la ville.
    Respecte le rate limit de 1 requête/seconde.
    """
    cache_key = (round(lat, 2), round(lng, 2))
    
    if cache_key in _geocode_cache:
        return _geocode_cache[cache_key]
    
    try:
        time.sleep(1.1)
        
        url = f"https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lng}&format=json&zoom=10&accept-language=en"
        headers = {"User-Agent": "geotag-fill-script/1.1"}
        
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
    try:
        return float(Fraction(rat[0], rat[1]))
    except Exception:
        return float(rat)

def gps_to_decimal(gps_ifd) -> Optional[Tuple[float, float]]:
    if not gps_ifd:
        return None
    try:
        lat = gps_ifd.get(piexif.GPSIFD.GPSLatitude)
        lat_ref = gps_ifd.get(piexif.GPSIFD.GPSLatitudeRef)
        lon = gps_ifd.get(piexif.GPSIFD.GPSLongitude)
        lon_ref = gps_ifd.get(piexif.GPSIFD.GPSLongitudeRef)
        if not lat or not lat_ref or not lon or not lon_ref:
            return None

        lat_dec = _rational_to_float(lat[0]) + _rational_to_float(lat[1]) / 60.0 + _rational_to_float(lat[2]) / 3600.0
        lon_dec = _rational_to_float(lon[0]) + _rational_to_float(lon[1]) / 60.0 + _rational_to_float(lon[2]) / 3600.0

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

# ---------- Lecture EXIF Étendue ----------
def format_shutter_speed(val):
    """Convertit float (ex: 0.02) ou tuple (1, 50) en string '1/50s'"""
    try:
        if isinstance(val, float):
            if val >= 1:
                return f"{val}s"
            return f"1/{round(1/val)}s"
        if isinstance(val, tuple) and len(val) == 2:
            num, den = val
            if num == 0: return None
            if num >= den:
                return f"{float(num)/den:.1f}s".replace('.0s', 's')
            return f"{num}/{den}s"
    except:
        pass
    return str(val)

def format_f_number(val):
    """Convertit tuple (18, 10) en 'f/1.8'"""
    try:
        if isinstance(val, tuple) and len(val) == 2:
            return f"f/{float(val[0])/val[1]:.1f}"
        return f"f/{float(val):.1f}"
    except:
        pass
    return str(val)

def get_tag_value(exif_dict, tag_id):
    """Cherche dans ExifIFD ou ImageIFD"""
    if 'Exif' in exif_dict and tag_id in exif_dict['Exif']:
        return exif_dict['Exif'][tag_id]
    if '0th' in exif_dict and tag_id in exif_dict['0th']:
        return exif_dict['0th'][tag_id]
    return None

def read_photo_metadata(path: str) -> Tuple[datetime, Optional[Tuple[float, float]], Dict[str, Any]]:
    """
    Retourne (datetime_obj, (lat, lon) or None, exif_details_dict)
    """
    mtime = os.path.getmtime(path)
    dt = datetime.fromtimestamp(mtime)
    gps = None
    details = {}

    try:
        img = Image.open(path)
        
        # --- Utilisation de Pillow getexif pour les tags standards (Model, Make) ---
        pil_exif = img.getexif()
        if pil_exif:
            # Model
            model = pil_exif.get(272) # 272 = Model
            if model:
                details['model'] = model.strip()
            
            # Make
            make = pil_exif.get(271) # 271 = Make
            if make and not model: # Use Make if Model is missing
                details['model'] = make.strip()

        # --- Utilisation de piexif pour les GPS et SubExif (plus fiable structurellement) ---
        # Note: piexif charge les raw bytes, donc faut décoder parfois
        try:
             exif_dict = piexif.load(img.info.get('exif') or path)
        except:
             exif_dict = {}

        # 1. Date
        dto = get_tag_value(exif_dict, piexif.ExifIFD.DateTimeOriginal)
        if not dto:
            dto = get_tag_value(exif_dict, piexif.ImageIFD.DateTime)
        
        if dto:
            if isinstance(dto, bytes):
                dto = dto.decode('utf-8', errors='ignore')
            try:
                dt = datetime.strptime(dto, "%Y:%m:%d %H:%M:%S")
            except:
                pass # gardes date mtime

        # 2. GPS
        gps_ifd = exif_dict.get('GPS')
        if gps_ifd:
            gps = gps_to_decimal(gps_ifd)

        # 3. Technical Details (ISO, Aperture, Shutter, Focal)
        
        # ISO
        iso = get_tag_value(exif_dict, piexif.ExifIFD.ISOSpeedRatings)
        if iso:
            details['iso'] = f"ISO {iso}"
        
        # Aperture (FNumber)
        fnum = get_tag_value(exif_dict, piexif.ExifIFD.FNumber)
        if fnum:
            details['aperture'] = format_f_number(fnum)
            
        # Shutter Speed (ExposureTime)
        exp = get_tag_value(exif_dict, piexif.ExifIFD.ExposureTime)
        if exp:
            details['shutter'] = format_shutter_speed(exp)
            
        # Focal Length
        focal = get_tag_value(exif_dict, piexif.ExifIFD.FocalLength)
        if focal:
            try:
                fl = float(focal[0]) / focal[1]
                details['focal'] = f"{int(fl)}mm"
            except:
                pass

    except Exception as e:
        # print(f"Error reading {path}: {e}")
        pass

    return dt, gps, details

# ---------- Interpolation ----------
def interpolate_missing(sorted_items: List[dict]) -> List[dict]:
    n = len(sorted_items)
    known_indices = [i for i, it in enumerate(sorted_items) if it['coords'] is not None]

    if not known_indices:
        return sorted_items

    first_known = known_indices[0]
    for i in range(0, first_known):
        sorted_items[i]['coords'] = sorted_items[first_known]['coords']

    last_known = known_indices[-1]
    for i in range(last_known+1, n):
        sorted_items[i]['coords'] = sorted_items[last_known]['coords']

    for a_idx, b_idx in zip(known_indices, known_indices[1:]):
        a_item = sorted_items[a_idx]
        b_item = sorted_items[b_idx]
        a_time = a_item['datetime'].timestamp()
        b_time = b_item['datetime'].timestamp()
        
        if b_time == a_time:
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
def process_folder(folder: str, do_geocode: bool) -> List[dict]:
    files = [f for f in os.listdir(folder) if os.path.isfile(os.path.join(folder, f)) and f.lower().endswith(('.jpg', '.jpeg'))]
    items = []
    
    print(f"Reading metadata for {len(files)} files...", file=sys.stderr)
    
    for fname in files:
        path = os.path.join(folder, fname)
        try:
            dt, gps, details = read_photo_metadata(path)
        except Exception as e:
            dt = datetime.fromtimestamp(os.path.getmtime(path))
            gps = None
            details = {}
            
        items.append({
            'filename': fname,
            'path': path,
            'datetime': dt,
            'coords': gps,
            'details': details
        })

    items.sort(key=lambda x: (x['datetime'].timestamp(), x['filename']))
    filled = interpolate_missing(items)

    out = []
    total = len(filled)
    for idx, it in enumerate(filled, start=1):
        latlon = it['coords']
        
        entry = {
            "id": str(idx),
            "image": it['path'],
            "date": it['datetime'].strftime("%Y-%m-%d")
        }
        
        if latlon is not None:
            entry["coordinates"] = {
                "lat": round(latlon[0], 6),
                "lng": round(latlon[1], 6)
            }
            if do_geocode:
                # Basic logging
                if idx % 10 == 0:
                   print(f"  Geocoding progress: {idx}/{total}", file=sys.stderr)
                
                origin = reverse_geocode(latlon[0], latlon[1])
                if origin:
                    entry["origin"] = origin
        
        if it['details']:
            entry["exif"] = it['details']
        
        out.append(entry)
        
    return out

def main():
    if len(sys.argv) < 3:
        print("Usage: python geotag_fill.py /folder/path output.json [--no-geocode]")
        sys.exit(1)
    
    folder = sys.argv[1]
    out_json = sys.argv[2]
    do_geocode = "--no-geocode" not in sys.argv
    
    if not os.path.isdir(folder):
        print(f"Error: {folder} is not a directory.")
        sys.exit(2)

    # 1. Read existing header and cache origins if file exists
    header_data = None
    if os.path.exists(out_json):
        try:
            with open(out_json, 'r', encoding='utf-8') as fh:
                existing = json.load(fh)
                
                # Retrieve Header
                if isinstance(existing, dict) and "header" in existing:
                    header_data = existing["header"]
                    print("Preserved existing header from JSON.", file=sys.stderr)
                
                # Retrieve Existing Origins for Cache
                images = []
                if isinstance(existing, list): images = existing
                elif isinstance(existing, dict) and "images" in existing: images = existing["images"]
                
                for img in images:
                    if "coordinates" in img and "origin" in img:
                        lat = img["coordinates"]["lat"]
                        lng = img["coordinates"]["lng"]
                        origin = img["origin"]
                        # Populate cache with rounded keys as used in reverse_geocode
                        key = (round(lat, 2), round(lng, 2))
                        _geocode_cache[key] = origin
                
                if _geocode_cache:
                    print(f"Pre-loaded {len(_geocode_cache)} locations into cache.", file=sys.stderr)

        except Exception as e:
            print(f"Warning reading existing file: {e}", file=sys.stderr)
            pass
            
    # 2. Process images
    images_list = process_folder(folder, do_geocode)
    
    # 3. Construct final output
    if header_data:
        final_output = {
            "header": header_data,
            "images": images_list
        }
    else:
        # Fallback to just list if no header found
        final_output = images_list

    with open(out_json, 'w', encoding='utf-8') as fh:
        json.dump(final_output, fh, ensure_ascii=False, indent=4)
    
    count = len(images_list)
    print(f"Successfully wrote {count} images to {out_json}")

if __name__ == "__main__":
    main()

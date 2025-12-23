#!/usr/bin/env python3
"""
build_gallery.py

All-in-one script to prepare a gallery from a folder of source images.

Usage:
    python3 build_gallery.py <input_folder> [--coords-only]

Operations (full mode):
1. Creates output directory `<input_folder>_dist`.
2. Optimizes images (max 2560px, quality 80%) into output directory.
3. Generates thumbnails (400px) into `<input_folder>_dist/thumbnails`.
4. Extracts metadata (EXIF, GPS) from *source* images.
5. Interpolates missing GPS data from time-adjacent photos.
6. Reverse geocodes coordinates to City, Country.
7. Generates/Updates <input_folder>.json with the gallery data.

Operations (--coords-only mode):
- Reads existing <input_folder>.json
- Interpolates missing coordinates from time-adjacent photos
- Reverse geocodes coordinates for images missing origin
- Updates <input_folder>.json (preserves existing data)

Dependencies:
    pip install Pillow piexif requests
"""

import os
import sys
import shutil
import json
import time
import random
import urllib.request
import urllib.parse
import argparse
from datetime import datetime
from fractions import Fraction
from typing import Optional, Tuple, List, Dict, Any
from pathlib import Path
from PIL import Image, ImageOps
import piexif

# Configuration
MAX_DIMENSION = 2560
JPEG_QUALITY = 80
THUMBNAIL_SIZE = (400, 400)

_geocode_cache: Dict[Tuple[float, float], Optional[str]] = {}

# ---------------------------------------------------------------------
# EXIF / Metadata Handling
# ---------------------------------------------------------------------

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

def format_shutter_speed(val):
    try:
        if isinstance(val, float):
            if val >= 1: return f"{val}s"
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
    try:
        if isinstance(val, tuple) and len(val) == 2:
            return f"f/{float(val[0])/val[1]:.1f}"
        return f"f/{float(val):.1f}"
    except:
        pass
    return str(val)

def get_tag_value(exif_dict, tag_id):
    if 'Exif' in exif_dict and tag_id in exif_dict['Exif']:
        return exif_dict['Exif'][tag_id]
    if '0th' in exif_dict and tag_id in exif_dict['0th']:
        return exif_dict['0th'][tag_id]
    return None

def read_photo_metadata(path: str) -> Tuple[datetime, Optional[Tuple[float, float]], Dict[str, Any]]:
    mtime = os.path.getmtime(path)
    dt = datetime.fromtimestamp(mtime)
    gps = None
    details = {}

    try:
        img = Image.open(path)
        
        # High-level info via Pillow
        pil_exif = img.getexif()
        if pil_exif:
            model = pil_exif.get(272)
            if model: details['model'] = model.strip()
            make = pil_exif.get(271)
            if make and not model: details['model'] = make.strip()

        # Detailed EXIF via piexif
        try:
             exif_dict = piexif.load(img.info.get('exif') or path)
        except:
             exif_dict = {}

        # Date
        dto = get_tag_value(exif_dict, piexif.ExifIFD.DateTimeOriginal)
        if not dto:
            dto = get_tag_value(exif_dict, piexif.ImageIFD.DateTime)
        if dto:
            if isinstance(dto, bytes): dto = dto.decode('utf-8', errors='ignore')
            try:
                dt = datetime.strptime(dto, "%Y:%m:%d %H:%M:%S")
            except:
                pass

        # GPS
        gps_ifd = exif_dict.get('GPS')
        if gps_ifd:
            gps = gps_to_decimal(gps_ifd)

        # Tech Details
        iso = get_tag_value(exif_dict, piexif.ExifIFD.ISOSpeedRatings)
        if iso: details['iso'] = f"ISO {iso}"

        fnum = get_tag_value(exif_dict, piexif.ExifIFD.FNumber)
        if fnum: details['aperture'] = format_f_number(fnum)

        exp = get_tag_value(exif_dict, piexif.ExifIFD.ExposureTime)
        if exp: details['shutter'] = format_shutter_speed(exp)

        focal = get_tag_value(exif_dict, piexif.ExifIFD.FocalLength)
        if focal:
            try:
                fl = float(focal[0]) / focal[1]
                details['focal'] = f"{int(fl)}mm"
            except:
                pass

    except Exception:
        pass

    return dt, gps, details

# ---------------------------------------------------------------------
# Image Processing
# ---------------------------------------------------------------------

def process_image(src_path: Path, dest_path: Path, thumb_path: Path):
    """
    Opens source image, resizes/optimizes it to dest_path,
    and creates a thumbnail at thumb_path.
    """
    try:
        with Image.open(src_path) as img:
            # Handle rotation based on EXIF
            img = ImageOps.exif_transpose(img)
            
            # Convert to RGB (dropping alpha/palette)
            if img.mode in ('RGBA', 'P'):
                img = img.convert('RGB')

            # --- Main Image Optimization ---
            # Resize if larger than MAX_DIMENSION
            width, height = img.size
            if width > MAX_DIMENSION or height > MAX_DIMENSION:
                ratio = min(MAX_DIMENSION / width, MAX_DIMENSION / height)
                new_size = (int(width * ratio), int(height * ratio))
                main_img = img.resize(new_size, Image.Resampling.LANCZOS)
            else:
                main_img = img.copy()
            
            main_img.save(dest_path, 'JPEG', quality=JPEG_QUALITY, optimize=True)

            # --- Thumbnail Generation ---
            # Create thumbnail from the already resized main_img (faster)
            # Use cover resize logic or simple thumbnail? 
            # Existing script used thumbnail(400,400) which maintains aspect ratio.
            main_img.thumbnail(THUMBNAIL_SIZE, Image.Resampling.LANCZOS)
            main_img.save(thumb_path, 'JPEG', quality=JPEG_QUALITY, optimize=True)
            
            return True
    except Exception as e:
        print(f"Error processing {src_path.name}: {e}", file=sys.stderr)
        return False

# ---------------------------------------------------------------------
# Geocoding & Interpolation
# ---------------------------------------------------------------------

def reverse_geocode(lat: float, lng: float) -> Optional[str]:
    cache_key = (round(lat, 2), round(lng, 2))
    if cache_key in _geocode_cache:
        return _geocode_cache[cache_key]
    
    try:
        time.sleep(1.1)
        url = f"https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lng}&format=json&zoom=10&accept-language=en"
        headers = {"User-Agent": "gallery-builder/1.0"}
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode('utf-8'))
        
        address = data.get('address', {})
        city = (address.get('city') or address.get('town') or address.get('village') or 
                address.get('municipality') or address.get('county'))
        country = address.get('country')
        
        result = f"{city}, {country}" if (city and country) else (country or None)
        _geocode_cache[cache_key] = result
        return result
    except Exception as e:
        print(f"  Geocoding error: {e}", file=sys.stderr)
        _geocode_cache[cache_key] = None
        return None

def interpolate_missing(sorted_items: List[dict]) -> List[dict]:
    known = [i for i, it in enumerate(sorted_items) if it['coords'] is not None]
    if not known: return sorted_items
    
    n = len(sorted_items)
    
    # Fill edges
    for i in range(known[0]): sorted_items[i]['coords'] = sorted_items[known[0]]['coords']
    for i in range(known[-1]+1, n): sorted_items[i]['coords'] = sorted_items[known[-1]]['coords']

    # Interpolate gaps
    for k1, k2 in zip(known, known[1:]):
        item1, item2 = sorted_items[k1], sorted_items[k2]
        t1, t2 = item1['datetime'].timestamp(), item2['datetime'].timestamp()
        
        if t2 == t1:
            for j in range(k1+1, k2): sorted_items[j]['coords'] = item1['coords']
        else:
            for j in range(k1+1, k2):
                tc = sorted_items[j]['datetime'].timestamp()
                f = (tc - t1) / (t2 - t1)
                
                # Base interpolation
                lat = item1['coords'][0] + f*(item2['coords'][0] - item1['coords'][0])
                lng = item1['coords'][1] + f*(item2['coords'][1] - item1['coords'][1])
                
                # Add random noise (~50-100m) to avoid straight lines
                # 0.001 deg lat is approx 111m
                noise = 0.0005 
                lat += random.uniform(-noise, noise)
                lng += random.uniform(-noise, noise)
                
                sorted_items[j]['coords'] = (lat, lng)
    return sorted_items

# ---------------------------------------------------------------------
# Main Execution
# ---------------------------------------------------------------------

def coords_only_mode(folder_name: str, json_path):
    """
    Mode pour mettre à jour les coordonnées manquantes et les origins
    à partir du JSON existant uniquement (sans traiter les images source).
    """
    print(f"JSON:   {json_path}")
    print("-" * 40)
    print("Mode: Coords-only (updating missing coords and origins)")
    
    if not json_path.exists():
        print(f"Error: JSON file not found: {json_path}")
        sys.exit(1)
    
    # Load existing JSON
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    images = data.get('images', [])
    if not images:
        print("No images found in JSON")
        return
    
    print(f"Loaded {len(images)} images from JSON")
    
    # Build items_data from existing JSON
    items_data = []
    for img in images:
        try:
            dt = datetime.strptime(img.get('date', '2000-01-01') + ' ' + img.get('time', '00:00'), '%Y-%m-%d %H:%M')
        except:
            dt = datetime.now()
        
        coords = None
        if 'coordinates' in img and 'lat' in img['coordinates'] and 'lng' in img['coordinates']:
            coords = (img['coordinates']['lat'], img['coordinates']['lng'])
        
        items_data.append({
            'rel_path': img.get('image', ''),
            'datetime': dt,
            'coords': coords,
            'existing_entry': img
        })
    
    # Sort by datetime
    items_data.sort(key=lambda x: (x['datetime'].timestamp(), x['rel_path']))
    
    # Interpolate missing coords
    print("Interpolating missing coordinates...")
    known = [i for i, it in enumerate(items_data) if it['coords'] is not None]
    
    if known:
        n = len(items_data)
        
        # Fill edges
        for i in range(known[0]):
            items_data[i]['coords'] = items_data[known[0]]['coords']
        for i in range(known[-1]+1, n):
            items_data[i]['coords'] = items_data[known[-1]]['coords']
        
        # Interpolate gaps
        for k1, k2 in zip(known, known[1:]):
            item1, item2 = items_data[k1], items_data[k2]
            t1, t2 = item1['datetime'].timestamp(), item2['datetime'].timestamp()
            
            if t2 == t1:
                for j in range(k1+1, k2):
                    items_data[j]['coords'] = item1['coords']
            else:
                for j in range(k1+1, k2):
                    tc = items_data[j]['datetime'].timestamp()
                    f = (tc - t1) / (t2 - t1)
                    
                    lat = item1['coords'][0] + f*(item2['coords'][0] - item1['coords'][0])
                    lng = item1['coords'][1] + f*(item2['coords'][1] - item1['coords'][1])
                    
                    # Add random noise
                    noise = 0.0005
                    lat += random.uniform(-noise, noise)
                    lng += random.uniform(-noise, noise)
                    
                    items_data[j]['coords'] = (lat, lng)
    
    # Reverse geocode for missing origins
    print("Geocoding missing origins...")
    total = len(items_data)
    for i, item in enumerate(items_data, 1):
        if i % 10 == 0:
            print(f"  {i}/{total}", file=sys.stderr)
        
        entry = item['existing_entry']
        
        # Update coordinates if interpolated
        if item['coords']:
            lat, lng = item['coords']
            if 'coordinates' not in entry or entry['coordinates'] is None:
                entry["coordinates"] = {"lat": round(lat, 6), "lng": round(lng, 6)}
            
            # Geocode only if missing origin
            if 'origin' not in entry or not entry['origin']:
                origin = reverse_geocode(lat, lng)
                if origin:
                    entry["origin"] = origin
    
    # Save updated JSON
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False)
    
    print(f"\nCompleted! JSON saved to {json_path}")

def main():
    parser = argparse.ArgumentParser(description='Build gallery from source images')
    parser.add_argument('input_folder', help='Source folder name (e.g., Japon2025)')
    parser.add_argument('--coords-only', action='store_true', 
                       help='Update only coordinates and origins in existing JSON')
    args = parser.parse_args()
    
    if args.coords_only:
        input_dir = Path(args.input_folder)
        folder_name = input_dir.name if input_dir.is_dir() else args.input_folder
        json_path = Path(args.input_folder).parent / f"{folder_name}.json"
        if not json_path.is_file():
            json_path = Path(f"{folder_name}.json")
        coords_only_mode(folder_name, json_path)
        return
    
    # Full mode (original behavior)
    input_dir = Path(args.input_folder)
    if not input_dir.is_dir():
        print(f"Error: {input_dir} is not a directory")
        sys.exit(1)

    # Setup directories
    folder_name = input_dir.name
    output_dir = input_dir.parent / f"{folder_name}_dist"
    thumbs_dir = output_dir / "thumbnails"
    json_path = input_dir.parent / f"{folder_name}.json"

    print(f"Input:  {input_dir}")
    print(f"Output: {output_dir}")
    print(f"JSON:   {json_path}")
    print("-" * 40)

    output_dir.mkdir(exist_ok=True)
    thumbs_dir.mkdir(exist_ok=True)

    # Pre-load cache if JSON exists
    existing_origins_by_path = {}
    
    if json_path.exists():
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                count = 0
                for img in data.get('images', []):
                    # Cache by filename (rel_path) for fast lookup without re-geocoding
                    if 'image' in img and 'origin' in img:
                         existing_origins_by_path[img['image']] = img['origin']
                         count += 1
                         
                    # Also populate the coordinate cache for any fallback needs
                    if 'coordinates' in img and 'origin' in img:
                        key = (round(img['coordinates']['lat'], 2), round(img['coordinates']['lng'], 2))
                        _geocode_cache[key] = img['origin']
                        
                print(f"Loaded {count} origins from existing JSON.")
        except:
            pass

    # Gather source files
    valid_exts = {'.jpg', '.jpeg', '.JPG', '.JPEG'}
    src_files = [f for f in input_dir.iterdir() if f.is_file() and f.suffix in valid_exts]
    
    print(f"Found {len(src_files)} images.")

    items_data = []

    # Process images
    for idx, src in enumerate(src_files, 1):
        filename = src.name
        dest_file = output_dir / filename
        thumb_file = thumbs_dir / filename
        
        # Optimize & Resize
        # Only process if dest doesn't exist or src is newer
        if not dest_file.exists() or src.stat().st_mtime > dest_file.stat().st_mtime:
            # print(f"[{idx}/{len(src_files)}] Processing {filename}...")
            process_image(src, dest_file, thumb_file)
        
        # Extract Metadata
        # We read from SOURCE to get original EXIF/Date
        dt, gps, details = read_photo_metadata(str(src))
        
        items_data.append({
            'filename': filename,
            'rel_path': f"{output_dir.name}/{filename}", # Path relative to project root (assuming json is at root)
            'datetime': dt,
            'coords': gps,
            'details': details
        })

    # Sort & Interpolate
    print("Sorting and interpolating GPS data...")
    items_data.sort(key=lambda x: (x['datetime'].timestamp(), x['filename']))
    items_data = interpolate_missing(items_data)

    # Generate JSON structure
    final_images = []
    
    print("Geocoding...")
    total = len(items_data)
    for i, item in enumerate(items_data, 1):
        if i % 10 == 0: print(f"  {i}/{total}", file=sys.stderr)
        
        entry = {
            "id": str(i),
            "image": item['rel_path'],
            "date": item['datetime'].strftime("%Y-%m-%d")
        }

        if item['coords']:
            lat, lng = item['coords']
            entry["coordinates"] = {"lat": round(lat, 6), "lng": round(lng, 6)}
            
            # Use existing origin if available for this specific file
            if item['rel_path'] in existing_origins_by_path:
                entry["origin"] = existing_origins_by_path[item['rel_path']]
            else:
                origin = reverse_geocode(lat, lng)
                if origin: entry["origin"] = origin
            
        entry["time"] = item['datetime'].strftime("%H:%M")
        
        if item['details']:
            entry["exif"] = item['details']
            
        final_images.append(entry)

    # Prepare Header
    header = {
        "title": folder_name.replace('_', ' ').title(),
        "subtitle": "Gallery Subtitle",
        "colorTheme": "#000000",
        "showMap": True,
        "showBanners": True
    }
    
    # Preserve existing header
    if json_path.exists():
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                existing = json.load(f)
                if 'header' in existing:
                    header = existing['header']
        except: pass

    final_json = {
        "header": header,
        "images": final_images
    }

    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(final_json, f, indent=4, ensure_ascii=False)

    print(f"\nCompleted! JSON saved to {json_path}")

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
clean_coords.py

Remove coordinates (and origin) from images that either have no EXIF or were taken with E-M10 series cameras.

Usage:
    python3 scripts/clean_coords.py <input_folder> [--dry-run]

This will back up <input_folder>.json to <input_folder>.json.bak before writing changes.
"""

import argparse
import json
from pathlib import Path
import re
import shutil
import sys

CAMERA_RE = re.compile(r"e-?m10|om-?10", re.I)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('input_folder', help='Source images folder (e.g., Japon2025)')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be changed without writing')
    args = parser.parse_args()

    input = Path(args.input_folder)

    # Accept either an input folder (e.g., Japon2025) or a direct JSON path (Japon2025.json)
    if input.is_dir():
        json_path = input.parent / f"{input.name}.json"
        if not json_path.exists():
            print(f"Error: JSON file not found: {json_path}")
            sys.exit(1)
    elif input.is_file() and input.suffix == '.json':
        json_path = input
    else:
        print(f"Error: {input} is not a directory or a .json file")
        sys.exit(1)

    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    images = data.get('images', [])
    changed = 0
    removed_list = []

    for img in images:
        remove = False
        has_exif = 'exif' in img and isinstance(img['exif'], dict) and len(img['exif']) > 0
        if not has_exif:
            remove = True
        else:
            model = img['exif'].get('model')
            if model and CAMERA_RE.search(str(model)):
                remove = True

        if remove and ('coordinates' in img or 'origin' in img or not img.get('coords_disabled')):
            # mark coords disabled so the pipeline can skip re-adding them if desired
            img['coords_disabled'] = True
            if 'coordinates' in img:
                del img['coordinates']
            if 'origin' in img:
                del img['origin']
            changed += 1
            removed_list.append(img.get('image'))

    print(f"Found {len(images)} images, will remove coordinates from {changed} images.")
    if changed > 0:
        print("Sample removed:")
        for s in removed_list[:10]:
            print("  ", s)

    if args.dry_run:
        print("Dry run - not writing changes.")
        return

    # Backup
    backup_path = json_path.with_suffix(json_path.suffix + '.bak')
    shutil.copy2(json_path, backup_path)
    print(f"Backup written to {backup_path}")

    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False)

    print("Written updated JSON.")


if __name__ == '__main__':
    main()

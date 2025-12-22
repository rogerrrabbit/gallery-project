#!/usr/bin/env python3
import json
from datetime import datetime, timedelta
from pathlib import Path

src = Path('Japon2025.json')
bak = Path('Japon2025.json.bak')

if not src.exists():
    raise SystemExit('Japon2025.json not found')

# backup
if not bak.exists():
    bak.write_text(src.read_text())

data = json.loads(src.read_text())
images = data.get('images', [])

count = 0
changes = []

for img in images:
    exif = img.get('exif') or {}
    model = exif.get('model', '')
    if model and 'E-M10MarkII'.lower() in model.lower():
        date_s = img.get('date')
        time_s = img.get('time')
        if not date_s or not time_s:
            continue
        # parse
        try:
            dt = datetime.strptime(f"{date_s} {time_s}", "%Y-%m-%d %H:%M")
        except ValueError:
            # try other formats if present
            try:
                dt = datetime.strptime(f"{date_s} {time_s}", "%Y-%m-%d %H:%M:%S")
            except ValueError:
                print('Could not parse', img.get('id'), date_s, time_s)
                continue
        new_dt = dt + timedelta(hours=8)
        new_date = new_dt.strftime('%Y-%m-%d')
        new_time = new_dt.strftime('%H:%M')
        if new_date != date_s or new_time != time_s:
            changes.append({'id': img.get('id'), 'old': f"{date_s} {time_s}", 'new': f"{new_date} {new_time}"})
            img['date'] = new_date
            img['time'] = new_time
            count += 1

# sort images by datetime

def img_datetime(item):
    d = item.get('date', '')
    t = item.get('time', '00:00')
    try:
        return datetime.strptime(f"{d} {t}", "%Y-%m-%d %H:%M")
    except ValueError:
        try:
            return datetime.strptime(f"{d} {t}", "%Y-%m-%d %H:%M:%S")
        except Exception:
            return datetime.max

images_sorted = sorted(images, key=img_datetime)
data['images'] = images_sorted

# write back
src.write_text(json.dumps(data, ensure_ascii=False, indent=4))

# report
print(f'Corrected {count} images (E-M10MarkII).')
if changes:
    print('Sample changes:')
    for c in changes[:20]:
        print(c)

# also write a small patch file with changes for review
patch = Path('olympus_time_changes.json')
patch.write_text(json.dumps(changes, ensure_ascii=False, indent=4))
print('Wrote changes to olympus_time_changes.json and backup to Japon2025.json.bak')

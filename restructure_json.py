import json
import os

filename = 'japon25.json'

# Read existing data
try:
    with open(filename, 'r') as f:
        data = json.load(f)
except Exception as e:
    print(f"Error reading {filename}: {e}")
    exit(1)

# Check if already restructured
if isinstance(data, dict) and 'header' in data:
    print("Already restructured")
    exit(0)

# Create new structure
new_data = {
    "header": {
        "title": "Japon 2025",
        "subtitle": "Voyage au pays du soleil levant - Novembre 2025",
        "colorTheme": "#e11d48", # Reddish pink (Japan cherry blossom vibe?) or sticking to blue? Let's try a distinct one to show it works, maybe a nice red/pink.
        "showMap": True,
        "showBanners": True
    },
    "images": data
}

# Write back
with open(filename, 'w') as f:
    json.dump(new_data, f, indent=4, ensure_ascii=False) # ensure_ascii=False for French accents if any

print("Successfully restructured japon25.json")

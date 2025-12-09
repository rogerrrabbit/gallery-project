#!/usr/bin/env python3
"""
Generate thumbnails for gallery images.

Creates a 'thumbnails' subdirectory within each image folder and generates
smaller versions of each image for use in the gallery grid and map markers.
"""

import os
import sys
from pathlib import Path
from PIL import Image

# Thumbnail size (width, height) - will maintain aspect ratio
THUMBNAIL_SIZE = (400, 400)
JPEG_QUALITY = 85

def create_thumbnail(source_path: Path, dest_path: Path):
    """Create a thumbnail from source image."""
    try:
        with Image.open(source_path) as img:
            # Convert to RGB if necessary (handles RGBA, P mode, etc.)
            if img.mode in ('RGBA', 'P'):
                img = img.convert('RGB')
            
            # Create thumbnail maintaining aspect ratio
            img.thumbnail(THUMBNAIL_SIZE, Image.Resampling.LANCZOS)
            
            # Save with JPEG optimization
            img.save(dest_path, 'JPEG', quality=JPEG_QUALITY, optimize=True)
            return True
    except Exception as e:
        print(f"  Error processing {source_path.name}: {e}")
        return False

def generate_thumbnails(image_dir: str):
    """Generate thumbnails for all images in the specified directory."""
    source_dir = Path(image_dir)
    
    if not source_dir.exists():
        print(f"Error: Directory '{image_dir}' does not exist")
        sys.exit(1)
    
    # Create thumbnails subdirectory
    thumbs_dir = source_dir / 'thumbnails'
    thumbs_dir.mkdir(exist_ok=True)
    print(f"Thumbnails directory: {thumbs_dir}")
    
    # Find all image files
    image_extensions = {'.jpg', '.jpeg', '.png', '.webp', '.gif'}
    images = [f for f in source_dir.iterdir() 
              if f.is_file() and f.suffix.lower() in image_extensions]
    
    print(f"Found {len(images)} images to process")
    
    created = 0
    skipped = 0
    failed = 0
    
    for i, img_path in enumerate(images, 1):
        # Output thumbnail with same name but .jpg extension
        thumb_name = img_path.stem + '.jpg'
        thumb_path = thumbs_dir / thumb_name
        
        # Skip if thumbnail already exists and is newer than source
        if thumb_path.exists() and thumb_path.stat().st_mtime >= img_path.stat().st_mtime:
            skipped += 1
            continue
        
        print(f"[{i}/{len(images)}] Creating thumbnail: {img_path.name}")
        
        if create_thumbnail(img_path, thumb_path):
            created += 1
        else:
            failed += 1
    
    print(f"\nDone! Created: {created}, Skipped: {skipped}, Failed: {failed}")
    print(f"Thumbnails saved to: {thumbs_dir}")

if __name__ == '__main__':
    if len(sys.argv) > 1:
        image_dir = sys.argv[1]
    else:
        # Default to japon25 directory
        image_dir = 'japon25'
    
    generate_thumbnails(image_dir)

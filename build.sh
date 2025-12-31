#!/bin/bash

# Gallery Build Script
# Usage: 
#   ./build.sh          - Create production build in dist/ (no edit mode)
#   ./build.sh --dev    - Create dev build in dist/ (with edit mode)
#
# For development, you can also run directly from project root:
#   python3 -m http.server 8000
# This will include edit mode since the DEV_ONLY sections are in the source files.

set -e

DEV_MODE=false
OUTPUT_DIR="dist"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dev)
            DEV_MODE=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: ./build.sh [--dev]"
            exit 1
            ;;
    esac
done

echo "🏗️  Building gallery..."
echo "   Mode: $([ "$DEV_MODE" = true ] && echo 'DEVELOPMENT' || echo 'PRODUCTION')"

# Create dist directory
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# Copy main assets
cp style.css "$OUTPUT_DIR/"
cp script.js "$OUTPUT_DIR/"
cp Japon2025.json "$OUTPUT_DIR/"

# Copy images folder (symlink to save space)
if [ -d "Japon2025_dist" ]; then
    ln -s "../Japon2025_dist" "$OUTPUT_DIR/Japon2025_dist"
fi

if [ "$DEV_MODE" = true ]; then
    echo "   Including edit mode..."
    
    # Copy edit mode files
    cp edit-mode.js "$OUTPUT_DIR/"
    cp edit-mode.css "$OUTPUT_DIR/"
    
    # Copy index.html as-is (includes DEV_ONLY sections)
    cp index.html "$OUTPUT_DIR/"
else
    echo "   Production mode (no edit features)..."
    
    # Remove DEV_ONLY sections from HTML
    sed '/<!-- DEV_ONLY_START -->/,/<!-- DEV_ONLY_END -->/d' index.html > "$OUTPUT_DIR/index.html"
fi

echo "✅ Build complete! Output in: $OUTPUT_DIR/"
echo ""
echo "To serve the site:"
echo "   cd $OUTPUT_DIR && python3 -m http.server 8000"
echo ""
if [ "$DEV_MODE" = false ]; then
    echo "💡 For development with edit mode, run from project root:"
    echo "   python3 -m http.server 8000"
fi

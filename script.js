let galleryData = [];
let filteredData = [];
let map = null;
let imageObserver = null;
let currentImageIndex = -1; // Track current image index for navigation
let imageMarkers = []; // Store image marker instances
let clusterMarkers = []; // Store cluster marker label instances
let bannersEnabled = true; // Default to true
let mapEnabled = true; // Default to true

// Get thumbnail path for an image
function getThumbnailPath(imagePath) {
    const parts = imagePath.split('/');
    if (parts.length >= 2) {
        const filename = parts.pop();
        // Change extension to .jpg for thumbnail (thumbnails are always jpg)
        const thumbFilename = filename.replace(/\.[^.]+$/, '.jpg');
        return parts.join('/') + '/thumbnails/' + thumbFilename;
    }
    return imagePath;
}

// Load gallery data
// Load gallery data
async function loadGalleryData() {
    try {
        const response = await fetch('Japon2025.json');
        const data = await response.json();

        if (data.header) {
            applyHeaderSettings(data.header);
            galleryData = data.images || [];
        } else {
            galleryData = Array.isArray(data) ? data : [];
        }

        filteredData = galleryData;
        setupImageObserver();

        if (mapEnabled) {
            initMap();
        } else {
            const mapContainer = document.getElementById('map-container');
            if (mapContainer) mapContainer.style.display = 'none';
            renderGallery();
        }

        // Reveal the UI once everything is ready
        document.body.classList.remove('loading');

    } catch (error) {
        console.error('Error loading gallery data:', error);
        // Even on error, show what we have (or empty state) so user isn't stuck on blank screen
        document.body.classList.remove('loading');
    }
}

function applyHeaderSettings(header) {
    if (header.title) {
        const h1 = document.querySelector('header h1');
        if (h1) h1.textContent = header.title;
        document.title = header.title;
    }
    if (header.subtitle) {
        const p = document.querySelector('header p');
        if (p) p.textContent = header.subtitle;
    }

    if (header.colorTheme) {
        document.documentElement.style.setProperty('--primary-color', header.colorTheme);
        // Derive secondary (darker) and banner text color
        const secondary = adjustColor(header.colorTheme, -40);
        document.documentElement.style.setProperty('--secondary-color', secondary);
        document.documentElement.style.setProperty('--banner-text-color', secondary);
    }

    if (typeof header.showMap !== 'undefined') {
        mapEnabled = header.showMap;
    }

    if (typeof header.showBanners !== 'undefined') {
        bannersEnabled = header.showBanners;
    }
}

function adjustColor(color, amount) {
    return '#' + color.replace(/^#/, '').replace(/../g, color => ('0' + Math.min(255, Math.max(0, parseInt(color, 16) + amount)).toString(16)).substr(-2));
}

// Setup IntersectionObserver for lazy loading images
function setupImageObserver() {
    imageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                if (img.dataset.src) {
                    img.src = img.dataset.src;
                    img.removeAttribute('data-src');
                    img.classList.add('loaded');
                }
                imageObserver.unobserve(img);
            }
        });
    }, {
        rootMargin: '100px', // Preload images 100px before they enter viewport
        threshold: 0.01
    });
}

// Render gallery cards with lazy loading
function renderGallery() {
    const gallery = document.getElementById('gallery');
    const mapContainer = document.getElementById('map-container');
    gallery.innerHTML = '';
    if (mapContainer) {
        gallery.appendChild(mapContainer);
    }

    let lastOrigin = null;

    filteredData.forEach(item => {
        // Check for origin change and insert banner
        if (bannersEnabled && item.origin && item.origin !== lastOrigin) {
            const banner = document.createElement('div');
            banner.className = 'city-banner';
            banner.innerHTML = `<span>${item.origin}</span>`;
            gallery.appendChild(banner);
            lastOrigin = item.origin;
        }

        const card = document.createElement('div');
        card.className = 'card';
        card.onclick = () => openModal(item);

        // Build card meta (date • origin) - only show parts that exist
        const metaParts = [item.date, item.origin].filter(Boolean);
        const metaText = metaParts.join(' • ');

        card.innerHTML = `
            <div class="card-inner">
                <div class="card-front">
                    <img data-src="${getThumbnailPath(item.image)}" alt="${item.title || ''}" class="lazy-image">
                </div>
                <div class="card-back">
                    ${item.title ? `<h3>${item.title}</h3>` : ''}
                    ${metaText ? `<p class="card-meta">${metaText}</p>` : ''}
                    ${item.shortDescription ? `<p>${item.shortDescription}</p>` : ''}
                </div>
            </div>
        `;

        gallery.appendChild(card);

        // Observe the lazy image for loading
        const img = card.querySelector('.lazy-image');
        if (img && imageObserver) {
            imageObserver.observe(img);
        }
    });

    renderCityMenu(filteredData);
}


// Convert gallery data to GeoJSON for clustering
function toGeoJSON(items) {
    return {
        type: 'FeatureCollection',
        features: items
            .filter(item => item.coordinates)
            .map(item => ({
                type: 'Feature',
                properties: {
                    id: item.id,
                    image: item.image,
                    title: item.title || '',
                    origin: item.origin || '',
                    date: item.date || ''
                },
                geometry: {
                    type: 'Point',
                    coordinates: [item.coordinates.lng, item.coordinates.lat]
                }
            }))
    };
}

// Render city navigation menu
function renderCityMenu(items) {
    const cityMenu = document.getElementById('city-menu');
    if (!cityMenu) return;

    cityMenu.innerHTML = '';

    // Extract unique origins in order
    const cities = [];
    const seen = new Set();

    items.forEach(item => {
        if (item.origin && !seen.has(item.origin)) {
            cities.push(item.origin);
            seen.add(item.origin);
        }
    });

    if (cities.length === 0) return;

    cities.forEach(city => {
        const pill = document.createElement('button');
        pill.className = 'city-pill';
        pill.textContent = city;

        pill.addEventListener('click', () => {
            // Find the banner for this city
            // Banners don't have IDs, but we can search for the text content in city-banner elements
            const banners = document.querySelectorAll('.city-banner');
            for (const banner of banners) {
                if (banner.textContent.trim() === city) {
                    // Scroll to it with offset for sticky header
                    const headerOffset = 180; // approximate header height
                    const elementPosition = banner.getBoundingClientRect().top;
                    const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

                    window.scrollTo({
                        top: offsetPosition,
                        behavior: "smooth"
                    });
                    return;
                }
            }
        });

        cityMenu.appendChild(pill);
    });
}


// Initialize MapLibre GL map with clustering
function initMap() {
    const itemsWithCoords = galleryData.filter(item => item.coordinates);

    // Hide map if no items have coordinates
    const mapContainer = document.getElementById('map-container');
    if (itemsWithCoords.length === 0) {
        mapContainer.style.display = 'none';
        renderGallery();
        return;
    }

    mapContainer.style.display = 'block';

    // Initialize the map with OpenStreetMap tiles (free and no API key required)
    map = new maplibregl.Map({
        container: 'map',
        style: {
            version: 8,
            sources: {
                'osm': {
                    type: 'raster',
                    tiles: [
                        'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
                    ],
                    tileSize: 256,
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                }
            },
            layers: [
                {
                    id: 'osm-tiles',
                    type: 'raster',
                    source: 'osm',
                    minzoom: 0,
                    maxzoom: 19
                }
            ]
        },
        center: [0, 30],
        zoom: 2
    });

    // Get theme colors from CSS variables
    const styles = getComputedStyle(document.documentElement);
    const primaryColor = styles.getPropertyValue('--primary-color').trim() || '#667eea';
    const secondaryColor = styles.getPropertyValue('--secondary-color').trim() || '#5a67d8';
    const bannerColor = styles.getPropertyValue('--banner-text-color').trim() || '#4c51bf';

    map.on('load', () => {

        // Add clustered GeoJSON source
        map.addSource('photos', {
            type: 'geojson',
            data: toGeoJSON(galleryData),
            cluster: true,
            clusterMaxZoom: 14,
            clusterRadius: 50
        });

        // Cluster circle layer
        map.addLayer({
            id: 'clusters',
            type: 'circle',
            source: 'photos',
            filter: ['has', 'point_count'],
            paint: {
                'circle-color': [
                    'step',
                    ['get', 'point_count'],
                    primaryColor,  // color for count < 10
                    10, secondaryColor,  // color for count >= 10
                    50, bannerColor   // color for count >= 50
                ],
                'circle-radius': [
                    'step',
                    ['get', 'point_count'],
                    20,  // radius for count < 10
                    10, 25,  // radius for count >= 10
                    50, 35   // radius for count >= 50
                ],
                'circle-stroke-width': 3,
                'circle-stroke-color': '#fff'
            }
        });

        // Note: Symbol layers with text require glyph fonts from the style.
        // Since we use OSM raster tiles (no glyphs), we add count labels via HTML on cluster circles.

        // Individual photo markers - hidden layer for source data only
        // Actual image markers are created via HTML elements
        map.addLayer({
            id: 'unclustered-point',
            type: 'circle',
            source: 'photos',
            filter: ['!', ['has', 'point_count']],
            paint: {
                'circle-color': 'transparent',
                'circle-radius': 25,
                'circle-stroke-width': 0
            }
        });

        // Update markers and lines when map movement ends
        map.on('moveend', () => {
            if (map.isSourceLoaded('photos')) {
                updateGalleryFromMap();
            }
        });

        // Also update once on load/idle to ensure markers appear
        map.once('idle', () => {
            updateGalleryFromMap();
        });

        // Click on individual marker (fallback for transparent circle)
        map.on('click', 'unclustered-point', (e) => {
            const feature = e.features[0];
            const item = galleryData.find(i => i.id === feature.properties.id);
            if (item) {
                openModal(item);
            }
        });

        // Remove cursor change for unclustered-point since we use image markers

        map.on('mouseenter', 'clusters', () => {
            map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'clusters', () => {
            map.getCanvas().style.cursor = '';
        });

        // Filter gallery on map move
        map.on('moveend', updateGalleryFromMap);

        // Fit bounds to show all markers
        const bounds = new maplibregl.LngLatBounds();
        itemsWithCoords.forEach(item => {
            bounds.extend([item.coordinates.lng, item.coordinates.lat]);
        });
        map.fitBounds(bounds, {
            padding: { top: 120, bottom: 50, left: 50, right: 50 }, // More top padding for sticky header
            maxZoom: 10
        });
    });
}

// Update gallery based on visible map area
function updateGalleryFromMap() {
    if (!map) return;

    const bounds = map.getBounds();

    // Filter items whose coordinates are within current map bounds
    filteredData = galleryData.filter(item => {
        if (!item.coordinates) return false;
        const { lat, lng } = item.coordinates;
        return bounds.contains([lng, lat]);
    });

    renderGallery();

    // Update map elements logic based on visible data
    if (map && map.isSourceLoaded('photos')) {
        updateClusterLabels();
        updateImageMarkers();
    }
}

function updateClusterLabels() {
    if (!map) return;

    // Remove existing cluster markers
    clusterMarkers.forEach(m => m.remove());
    clusterMarkers = [];

    // Get all cluster features currently rendered
    const clusters = map.querySourceFeatures('photos', {
        filter: ['has', 'point_count']
    });

    // Deduplicate by cluster_id
    const seen = new Set();
    clusters.forEach(cluster => {
        const id = cluster.properties.cluster_id;
        if (seen.has(id)) return;
        seen.add(id);

        const count = cluster.properties.point_count;
        const coords = cluster.geometry.coordinates;

        // Create label element
        const el = document.createElement('div');
        el.className = 'cluster-count';
        el.textContent = count;

        const marker = new maplibregl.Marker({ element: el })
            .setLngLat(coords)
            .addTo(map);

        clusterMarkers.push(marker);
    });
}

function updateImageMarkers() {
    if (!map) return;

    // Remove existing image markers
    imageMarkers.forEach(marker => marker.remove());
    imageMarkers = [];

    // Get all unclustered features currently visible
    const features = map.querySourceFeatures('photos', {
        filter: ['!', ['has', 'point_count']]
    });

    // Create image markers for each unclustered point
    const addedIds = new Set();
    features.forEach(feature => {
        const id = feature.properties.id;
        if (addedIds.has(id)) return; // Avoid duplicates
        addedIds.add(id);

        const coords = feature.geometry.coordinates;
        const item = galleryData.find(i => i.id === id);
        if (!item) return;

        // Create marker element with thumbnail image
        const el = document.createElement('img');
        el.className = 'map-marker';
        el.src = getThumbnailPath(item.image);
        el.alt = item.title || '';
        el.title = item.origin || '';

        // Add click handler to open modal
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            openModal(item);
        });

        // Add marker to map
        const marker = new maplibregl.Marker({ element: el })
            .setLngLat(coords)
            .addTo(map);

        imageMarkers.push(marker);
    });
}

// Open modal
function openModal(item) {
    // Update current index
    currentImageIndex = filteredData.findIndex(i => i.id === item.id);
    updateModalContent(item);

    const modal = document.getElementById('modal');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function updateModalContent(item) {
    if (!item) return;

    const modalImg = document.getElementById('modal-img');
    const modalTitle = document.getElementById('modal-title');
    const modalMeta = document.getElementById('modal-meta');
    const modalDescription = document.getElementById('modal-description');

    modalImg.src = item.image;
    modalImg.alt = item.title || '';

    // Handle optional title
    modalTitle.textContent = item.title || '';
    modalTitle.style.display = item.title ? '' : 'none';

    // Handle optional meta (date • time • origin)
    const metaParts = [item.date, item.time, item.origin].filter(Boolean);
    const metaText = metaParts.join(' • ');
    modalMeta.textContent = metaText;
    modalMeta.style.display = metaText ? '' : 'none';

    // Handle EXIF
    let exifContainer = document.getElementById('modal-exif-info');
    if (!exifContainer) {
        exifContainer = document.createElement('div');
        exifContainer.id = 'modal-exif-info';
        exifContainer.className = 'modal-exif';
        modalMeta.parentNode.insertBefore(exifContainer, modalMeta.nextSibling);
    }

    if (item.exif) {
        const exif = item.exif;
        const exDetails = [];
        if (exif.model) exDetails.push(exif.model);
        if (exif.focal) exDetails.push(exif.focal);
        if (exif.aperture) exDetails.push(exif.aperture);

        if (exif.shutter) {
            let shutter = exif.shutter;
            try {
                const match = shutter.match(/^(\d+)\/(\d+)s$/);
                if (match) {
                    const num = parseInt(match[1]);
                    const den = parseInt(match[2]);
                    if (num > 0 && den > 0) {
                        if (num >= den) {
                            shutter = parseFloat((num / den).toFixed(1)) + "s";
                        } else {
                            shutter = "1/" + Math.round(den / num) + "s";
                        }
                    }
                }
            } catch (e) { }
            exDetails.push(shutter);
        }

        if (exif.iso) exDetails.push(exif.iso);

        exifContainer.textContent = exDetails.join(' • ');
        exifContainer.style.display = 'block';
    } else {
        exifContainer.style.display = 'none';
    }

    // Handle optional description
    modalDescription.textContent = item.fullDescription || '';
    modalDescription.style.display = item.fullDescription ? '' : 'none';

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function navigateModal(direction) {
    if (currentImageIndex === -1 || !filteredData.length) return;

    let newIndex = currentImageIndex + direction;

    // Loop around
    if (newIndex < 0) {
        newIndex = filteredData.length - 1;
    } else if (newIndex >= filteredData.length) {
        newIndex = 0;
    }

    currentImageIndex = newIndex;
    updateModalContent(filteredData[currentImageIndex]);
}

// Close modal
function closeModal() {
    const modal = document.getElementById('modal');
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
}

// Layout helpers
function debounce(fn, wait = 120) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), wait);
    };
}

function parsePx(val) {
    if (!val) return 0;
    if (val.endsWith('px')) return parseFloat(val);
    if (val.endsWith('rem')) return parseFloat(val) * parseFloat(getComputedStyle(document.documentElement).fontSize);
    return parseFloat(val) || 0;
}

function updateLayoutSizes() {
    const gallery = document.querySelector('.gallery');
    if (!gallery) return;

    // Map tile height for grid view
    if (!document.body.classList.contains('view-split')) {
        const firstCard = gallery.querySelector('.card');
        if (firstCard) {
            const tileHeight = Math.round(firstCard.getBoundingClientRect().height);
            document.documentElement.style.setProperty('--map-tile-height', `${tileHeight}px`);
        } else {
            document.documentElement.style.setProperty('--map-tile-height', '300px');
        }
    } else {
        // Let split view rules manage height
        document.documentElement.style.setProperty('--map-tile-height', 'auto');
    }

    // Compute left width for split view based on current grid column size
    const style = getComputedStyle(gallery);
    const gap = parsePx(style.gap || style.columnGap || style.gridGap || '0px');
    const paddingLeft = parsePx(style.paddingLeft);
    const paddingRight = parsePx(style.paddingRight);
    const usableWidth = gallery.clientWidth - paddingLeft - paddingRight;

    let minCol;
    if (window.innerWidth <= 480) {
        minCol = usableWidth;
    } else if (window.innerWidth <= 768) {
        minCol = 200;
    } else if (window.innerWidth <= 1024) {
        minCol = 250;
    } else {
        minCol = 300;
    }

    const N = Math.max(1, Math.floor((usableWidth + gap) / (minCol + gap)));
    const columnsDisplayed = Math.max(1, Math.floor(N / 2));
    const columnWidth = (usableWidth - (N - 1) * gap) / N;
    const leftWidth = Math.round(columnsDisplayed * columnWidth + (columnsDisplayed - 1) * gap);
    document.documentElement.style.setProperty('--left-width', `${leftWidth}px`);

    // If split view is active, set gallery to have `columnsDisplayed` left columns and a final map column
    const mapTile = gallery.querySelector('.map-tile');
    const banner = gallery.querySelector('.city-banner');
    if (document.body.classList.contains('view-split')) {
        const columns = columnsDisplayed;
        gallery.style.gridTemplateColumns = `repeat(${columns}, minmax(${minCol}px, 1fr)) 1fr`;

        if (mapTile) {
            mapTile.style.gridColumnStart = columns + 1;
            mapTile.style.gridRow = '1 / 1000';
        }

        if (banner) {
            banner.style.gridColumn = `1 / ${columns + 1}`;
        }
    } else {
        // revert any split-view overrides
        gallery.style.gridTemplateColumns = '';
        if (mapTile) {
            mapTile.style.gridColumnStart = '';
            mapTile.style.gridRow = '';
        }
        if (banner) banner.style.gridColumn = '';
    }

    // Trigger map resize if exists
    if (typeof map !== 'undefined' && map && map.resize) {
        setTimeout(() => map.resize(), 300);
    }
}

const debouncedUpdateLayout = debounce(updateLayoutSizes, 120);
window.addEventListener('resize', debouncedUpdateLayout);
new MutationObserver(debouncedUpdateLayout).observe(document.querySelector('.gallery') || document.body, { childList: true, subtree: true });

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    loadGalleryData();
    // Ensure layout metrics are set after loading
    updateLayoutSizes();

    // Recompute when images load
    document.addEventListener('load', debouncedUpdateLayout, true);

    // Close button
    document.getElementById('modal-close').addEventListener('click', closeModal);

    // View Toggle
    const viewToggle = document.getElementById('view-toggle');
    if (viewToggle) {
        viewToggle.addEventListener('click', () => {
            document.body.classList.toggle('view-split');

            // Adjust button icon state
            const isSplit = document.body.classList.contains('view-split');

            // Icons
            const splitIcon = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <line x1="9" y1="3" x2="9" y2="21" />
                </svg>`;

            const gridIcon = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="7" height="7" />
                    <rect x="14" y="3" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" />
                </svg>`;

            viewToggle.innerHTML = isSplit ? gridIcon : splitIcon;
            viewToggle.setAttribute('aria-label', isSplit ? 'Switch to Grid View' : 'Switch to Split View');

            // Update computed sizes immediately (and again after transition)
            updateLayoutSizes();

            // Resize map after transition
            setTimeout(() => {
                // Recompute after layout settles
                updateLayoutSizes();

                if (map) {
                    map.resize();
                    // Re-fit bounds to ensure all visible markers are seen in the new layout
                    const bounds = new maplibregl.LngLatBounds();
                    const visibleItems = filteredData.filter(i => i.coordinates);
                    if (visibleItems.length > 0) {
                        visibleItems.forEach(item => bounds.extend([item.coordinates.lng, item.coordinates.lat]));
                        map.fitBounds(bounds, {
                            padding: { top: 120, bottom: 50, left: 50, right: 50 },
                            maxZoom: 10,
                            linear: true
                        });
                    }
                }
            }, 400);
        });
    }

    // Scroll Top Button
    const scrollTopBtn = document.getElementById('scroll-top');
    if (scrollTopBtn) {
        scrollTopBtn.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }

    // Click outside modal
    document.querySelector('.modal-overlay').addEventListener('click', closeModal);

    // Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
        } else if (e.key === 'ArrowLeft') {
            navigateModal(-1);
        } else if (e.key === 'ArrowRight') {
            navigateModal(1);
        }
    });

    // Modal Navigation Buttons
    document.getElementById('modal-prev').addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent closing modal if overlay clicked
        navigateModal(-1);
    });

    document.getElementById('modal-next').addEventListener('click', (e) => {
        e.stopPropagation();
        navigateModal(1);
    });
});

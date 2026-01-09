let galleryData = [];
let filteredData = [];
let map = null;
let imageObserver = null;
let currentImageIndex = -1; // Track current image index for navigation
let imageMarkers = []; // Store image marker instances
let clusterMarkers = []; // Store cluster marker label instances
let bannersEnabled = true; // Default to true
let mapEnabled = true; // Default to true

// Map style toggle state
let isSatelliteView = true; // Start with satellite
let is3DView = false; // Start with top-down view

// Map style definitions
const MAP_STYLES = {
    satellite: {
        version: 8,
        sources: {
            'satellite-tiles': {
                type: 'raster',
                tiles: [
                    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
                ],
                tileSize: 256,
                attribution: 'Tiles &copy; Esri'
            },
            'terrainSource': {
                type: 'raster-dem',
                tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
                encoding: 'terrarium',
                tileSize: 256,
                maxzoom: 15
            }
        },
        layers: [
            {
                id: 'satellite-layer',
                type: 'raster',
                source: 'satellite-tiles'
            }
        ],
        terrain: {
            source: 'terrainSource',
            exaggeration: 2.5
        }
    },
    vector: 'https://tiles.openfreemap.org/styles/liberty'
};

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

        filteredData = []; // Start empty to trigger initial render in updateGalleryFromMap
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

    // Remove only cards and banners, preserving the map container
    const itemsToRemove = gallery.querySelectorAll('.card, .city-banner');
    itemsToRemove.forEach(el => el.remove());

    if (mapContainer && mapContainer.parentNode !== gallery) {
        gallery.prepend(mapContainer);
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
    updateLayoutSizes();
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

// Add map control buttons (style toggle + 3D view toggle)
function addMapControls(mapContainer) {
    const controls = document.createElement('div');
    controls.className = 'map-controls';

    // Style toggle button (Satellite <-> Vector)
    const styleBtn = document.createElement('button');
    styleBtn.className = 'map-control-btn' + (isSatelliteView ? ' active' : '');
    styleBtn.title = 'Basculer Satellite / Carte';
    styleBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
    `;
    styleBtn.addEventListener('click', () => toggleMapStyle(styleBtn));
    controls.appendChild(styleBtn);

    // 3D view toggle button
    const viewBtn = document.createElement('button');
    viewBtn.className = 'map-control-btn';
    viewBtn.title = 'Vue 3D / Maquette';
    viewBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 3L2 9l10 6 10-6-10-6z"/>
            <path d="M2 17l10 6 10-6"/>
            <path d="M2 12l10 6 10-6"/>
        </svg>
    `;
    viewBtn.addEventListener('click', () => toggle3DView(viewBtn));
    controls.appendChild(viewBtn);

    mapContainer.appendChild(controls);
}

// Toggle between satellite and vector map styles
function toggleMapStyle(btn) {
    isSatelliteView = !isSatelliteView;

    // Store current view state
    const center = map.getCenter();
    const zoom = map.getZoom();
    const pitch = map.getPitch();
    const bearing = map.getBearing();

    // Change style
    map.setStyle(isSatelliteView ? MAP_STYLES.satellite : MAP_STYLES.vector);

    // Update button state
    btn.classList.toggle('active', isSatelliteView);
    btn.title = isSatelliteView ? 'Passer en vue Carte' : 'Passer en vue Satellite';

    // Re-add layers after style loads
    map.once('style.load', () => {
        // Restore view
        map.setCenter(center);
        map.setZoom(zoom);
        map.setPitch(pitch);
        map.setBearing(bearing);

        // Re-enable terrain for satellite
        if (isSatelliteView && map.getSource('terrainSource')) {
            map.setTerrain({
                source: 'terrainSource',
                exaggeration: 2.5
            });
        }

        // Re-add photo layers
        readdPhotoLayers();
    });
}

// Toggle 3D tilted view
function toggle3DView(btn) {
    is3DView = !is3DView;
    btn.classList.toggle('active', is3DView);
    btn.title = is3DView ? 'Vue du dessus' : 'Vue 3D / Maquette';

    map.easeTo({
        pitch: is3DView ? 60 : 0,
        bearing: is3DView ? -20 : 0,
        duration: 1000
    });
}

// Re-add photo source and layers after style change
function readdPhotoLayers() {
    const styles = getComputedStyle(document.documentElement);
    const primaryColor = styles.getPropertyValue('--primary-color').trim() || '#667eea';
    const secondaryColor = styles.getPropertyValue('--secondary-color').trim() || '#5a67d8';
    const bannerColor = styles.getPropertyValue('--banner-text-color').trim() || '#4c51bf';

    // Add photo source if not exists
    if (!map.getSource('photos')) {
        map.addSource('photos', {
            type: 'geojson',
            data: toGeoJSON(galleryData),
            cluster: true,
            clusterMaxZoom: 14,
            clusterRadius: 50
        });
    }

    // Add cluster layer
    if (!map.getLayer('clusters')) {
        map.addLayer({
            id: 'clusters',
            type: 'circle',
            source: 'photos',
            filter: ['has', 'point_count'],
            paint: {
                'circle-color': [
                    'step',
                    ['get', 'point_count'],
                    primaryColor,
                    10, secondaryColor,
                    50, bannerColor
                ],
                'circle-radius': [
                    'step',
                    ['get', 'point_count'],
                    20,
                    10, 25,
                    50, 35
                ],
                'circle-stroke-width': 3,
                'circle-stroke-color': '#fff'
            }
        });
    }

    // Add unclustered points layer
    if (!map.getLayer('unclustered-point')) {
        map.addLayer({
            id: 'unclustered-point',
            type: 'circle',
            source: 'photos',
            filter: ['!', ['has', 'point_count']],
            paint: {
                'circle-radius': 0,
                'circle-opacity': 0
            }
        });
    }

    // Re-render markers
    updateGalleryFromMap();
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

    // Initialize the map with current style (satellite by default)
    map = new maplibregl.Map({
        container: 'map',
        style: MAP_STYLES.satellite,
        center: [138.2529, 36.2048],
        zoom: 5,
        pitch: 0,
        bearing: 0
    });

    // Add map control buttons
    addMapControls(mapContainer);

    // Get theme colors from CSS variables
    const styles = getComputedStyle(document.documentElement);
    const primaryColor = styles.getPropertyValue('--primary-color').trim() || '#667eea';
    const secondaryColor = styles.getPropertyValue('--secondary-color').trim() || '#5a67d8';
    const bannerColor = styles.getPropertyValue('--banner-text-color').trim() || '#4c51bf';

    map.on('load', () => {

        // Enable terrain for satellite view
        if (isSatelliteView && map.getSource('terrainSource')) {
            map.setTerrain({
                source: 'terrainSource',
                exaggeration: 2.5
            });
        }

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
    const nextFilteredData = galleryData.filter(item => {
        if (!item.coordinates) return false;
        const { lat, lng } = item.coordinates;
        return bounds.contains([lng, lat]);
    });

    // Optimization: Only re-render if the set of visible items has changed
    const currentIds = filteredData.map(i => i.id).join(',');
    const nextIds = nextFilteredData.map(i => i.id).join(',');

    if (currentIds !== nextIds) {
        filteredData = nextFilteredData;
        renderGallery();
    }

    // Update markers based on current zoom/view even if gallery didn't change item set
    if (map.isSourceLoaded('photos')) {
        updateClusterLabels();
        updateImageMarkers();
    }
}

function updateClusterLabels() {
    if (!map) return;

    // Get all cluster features currently rendered
    const clusters = map.querySourceFeatures('photos', {
        filter: ['has', 'point_count']
    });

    const activeClusterIds = new Set();

    // Deduplicate by cluster_id
    const distinctClusters = [];
    const seen = new Set();

    clusters.forEach(cluster => {
        const id = cluster.properties.cluster_id;
        if (seen.has(id)) return;
        seen.add(id);
        distinctClusters.push(cluster);
        activeClusterIds.add(id);
    });

    // Remove markers that are no longer visible
    for (let i = clusterMarkers.length - 1; i >= 0; i--) {
        const marker = clusterMarkers[i];
        if (!activeClusterIds.has(marker._clusterId)) {
            marker.remove();
            clusterMarkers.splice(i, 1);
        }
    }

    // Add new markers
    distinctClusters.forEach(cluster => {
        const id = cluster.properties.cluster_id;

        // Skip if already exists
        if (clusterMarkers.some(m => m._clusterId === id)) return;

        const count = cluster.properties.point_count;
        const coords = cluster.geometry.coordinates;

        // Create label element
        const el = document.createElement('div');
        el.className = 'cluster-count';
        el.textContent = count;

        const marker = new maplibregl.Marker({ element: el })
            .setLngLat(coords)
            .addTo(map);

        marker._clusterId = id; // Tag marker with cluster ID needed for diffing
        clusterMarkers.push(marker);
    });
}

function updateImageMarkers() {
    if (!map) return;

    // Get all unclustered features currently visible
    const features = map.querySourceFeatures('photos', {
        filter: ['!', ['has', 'point_count']]
    });

    const activePhotoIds = new Set();

    // Deduplicate and track active IDs
    features.forEach(feature => {
        activePhotoIds.add(feature.properties.id);
    });

    // Remove markers that are no longer visible
    for (let i = imageMarkers.length - 1; i >= 0; i--) {
        const marker = imageMarkers[i];
        if (!activePhotoIds.has(marker._photoId)) {
            marker.remove();
            imageMarkers.splice(i, 1);
        }
    }

    // Add new markers
    const addedIds = new Set();
    // Pre-populate with existing marker IDs to avoid adding duplicates
    imageMarkers.forEach(m => addedIds.add(m._photoId));

    features.forEach(feature => {
        const id = feature.properties.id;
        if (addedIds.has(id)) return; // Already exists
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

        marker._photoId = id; // Tag marker with photo ID
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
        // Calculate expected card height based on grid width (aspect-ratio: 1)
        const style = getComputedStyle(gallery);
        const paddingLeft = parsePx(style.paddingLeft);
        const paddingRight = parsePx(style.paddingRight);
        const gap = parsePx(style.gap || style.columnGap || style.gridGap || '0px');
        const usableWidth = gallery.clientWidth - paddingLeft - paddingRight;

        // Match logic used for split view width calculation
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
        const columnWidth = (usableWidth - (N - 1) * gap) / N;
        const tileHeight = Math.round(columnWidth);

        document.documentElement.style.setProperty('--map-tile-height', `${tileHeight}px`);
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
        gallery.style.gridTemplateColumns = `repeat(${columns}, ${minCol}px) 1fr`;

        if (mapTile) {
            mapTile.style.gridColumnStart = columns + 1;
            mapTile.style.gridRow = '1 / 1000';
        }

        const banners = gallery.querySelectorAll('.city-banner');
        banners.forEach(b => {
            b.style.gridColumn = `1 / ${columns + 1}`;
        });
    } else {
        // revert any split-view overrides
        gallery.style.gridTemplateColumns = '';
        if (mapTile) {
            mapTile.style.gridColumnStart = '';
            mapTile.style.gridRow = '';
        }
        const banners = gallery.querySelectorAll('.city-banner');
        banners.forEach(b => b.style.gridColumn = '');
    }

    // Trigger map resize if exists
    if (typeof map !== 'undefined' && map && map.resize) {
        // Use a small delay for CSS transitions to finish, but ensure it happens
        clearTimeout(window._mapResizeTimer);
        window._mapResizeTimer = setTimeout(() => {
            map.resize();
        }, 400);
    }
}

const debouncedUpdateLayout = debounce(updateLayoutSizes, 120);
window.addEventListener('resize', debouncedUpdateLayout);

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

let galleryData = [];
let filteredData = [];
let map = null;
let imageObserver = null;
let imageMarkers = []; // Store image marker instances

// Get thumbnail path for an image
// e.g., "japon25/photo.jpg" -> "japon25/thumbnails/photo.jpg"
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
async function loadGalleryData() {
    try {
        const response = await fetch('japon25.json');
        galleryData = await response.json();
        filteredData = galleryData;
        setupImageObserver();
        initMap();
    } catch (error) {
        console.error('Error loading gallery data:', error);
    }
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

    filteredData.forEach(item => {
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

// Generate curved travel lines between origin cities ordered by date
function generateTravelLines(items) {
    // Group items by origin city
    const citiesMap = new Map();
    items.forEach(item => {
        if (!item.coordinates || !item.origin) return;

        if (!citiesMap.has(item.origin)) {
            citiesMap.set(item.origin, {
                origin: item.origin,
                dates: [],
                coords: []
            });
        }

        const city = citiesMap.get(item.origin);
        city.dates.push(item.date || '9999-99-99'); // Default to end if no date
        city.coords.push([item.coordinates.lng, item.coordinates.lat]);
    });

    // Calculate center point and earliest date for each city
    const cities = Array.from(citiesMap.values()).map(city => {
        // Calculate centroid of all photos in this city
        const avgLng = city.coords.reduce((sum, c) => sum + c[0], 0) / city.coords.length;
        const avgLat = city.coords.reduce((sum, c) => sum + c[1], 0) / city.coords.length;

        // Get earliest date
        const earliestDate = city.dates.sort()[0];

        return {
            origin: city.origin,
            center: [avgLng, avgLat],
            earliestDate
        };
    });

    // Sort cities by earliest date
    cities.sort((a, b) => a.earliestDate.localeCompare(b.earliestDate));

    // Generate curved lines between consecutive cities
    const features = [];
    for (let i = 0; i < cities.length - 1; i++) {
        const from = cities[i].center;
        const to = cities[i + 1].center;

        // Create bezier curve points
        const curvePoints = generateBezierCurve(from, to, 20);

        features.push({
            type: 'Feature',
            properties: {
                from: cities[i].origin,
                to: cities[i + 1].origin,
                order: i
            },
            geometry: {
                type: 'LineString',
                coordinates: curvePoints
            }
        });
    }

    return {
        type: 'FeatureCollection',
        features
    };
}

// Generate bezier curve points between two coordinates
function generateBezierCurve(from, to, numPoints) {
    const points = [];

    // Calculate midpoint
    const midX = (from[0] + to[0]) / 2;
    const midY = (from[1] + to[1]) / 2;

    // Calculate perpendicular offset for the curve
    // The curve bows outward perpendicular to the line
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Curve amount proportional to distance (more curve for longer lines)
    const curveAmount = distance * 0.15;

    // Perpendicular direction (rotate 90 degrees)
    const perpX = -dy / distance * curveAmount;
    const perpY = dx / distance * curveAmount;

    // Control point (offset from midpoint)
    const controlX = midX + perpX;
    const controlY = midY + perpY;

    // Generate quadratic bezier curve points
    for (let i = 0; i <= numPoints; i++) {
        const t = i / numPoints;

        // Quadratic bezier formula: B(t) = (1-t)²P0 + 2(1-t)tP1 + t²P2
        const x = Math.pow(1 - t, 2) * from[0] +
            2 * (1 - t) * t * controlX +
            Math.pow(t, 2) * to[0];
        const y = Math.pow(1 - t, 2) * from[1] +
            2 * (1 - t) * t * controlY +
            Math.pow(t, 2) * to[1];

        points.push([x, y]);
    }

    return points;
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

    // Initialize the map with Carto Dark Matter tiles
    map = new maplibregl.Map({
        container: 'map',
        style: {
            version: 8,
            sources: {
                'carto-dark': {
                    type: 'raster',
                    tiles: [
                        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
                        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
                        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'
                    ],
                    tileSize: 256,
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                }
            },
            layers: [
                {
                    id: 'carto-dark-tiles',
                    type: 'raster',
                    source: 'carto-dark',
                    minzoom: 0,
                    maxzoom: 20
                }
            ]
        },
        center: [0, 30],
        zoom: 2
    });

    map.on('load', () => {
        // Add travel lines source (curves between cities)
        map.addSource('travel-lines', {
            type: 'geojson',
            data: generateTravelLines(galleryData)
        });

        // Add animated chunky dotted travel lines
        map.addLayer({
            id: 'travel-lines-core',
            type: 'line',
            source: 'travel-lines',
            layout: {
                'line-cap': 'round',
                'line-join': 'round'
            },
            paint: {
                'line-color': '#a5b4fc',
                'line-width': 6,
                // Initial dash array
                'line-dasharray': [0, 2]
            }
        });

        // Animation for the marching ants effect (moving dots)
        function animateDashArray() {
            // Optimize animation to avoid "LineAtlas out of space" error
            // use discrete steps instead of continuous values to limit texture usage.
            // 25 steps provides smooth enough animation without filling the atlas.
            const totalSteps = 25;

            // Speed control: 50ms per step = 1250ms per cycle
            const step = Math.floor((performance.now() / 50) % totalSteps);

            // Calculate phase p (0 to 2)
            const p = (step / totalSteps) * 2;

            // Forward movement: [0, p, 0, 2 - p]
            // We use a fixed precision to ensure cache hits in LineAtlas
            const pFixed = parseFloat(p.toFixed(2));
            const pRevFixed = parseFloat((2 - p).toFixed(2));

            const dashArray = [0, pFixed, 0, pRevFixed];

            if (map.getLayer('travel-lines-core')) {
                map.setPaintProperty('travel-lines-core', 'line-dasharray', dashArray);
            }

            requestAnimationFrame(animateDashArray);
        }

        // Start animation
        animateDashArray();

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
                    '#667eea',  // color for count < 10
                    10, '#5a67d8',  // color for count >= 10
                    50, '#4c51bf'   // color for count >= 50
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

        // Add cluster count labels using HTML markers
        let clusterMarkers = [];

        function updateClusterLabels() {
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

        // Function to update image markers based on current clusters
        function updateImageMarkers() {
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

        // Update markers on map render (zoom, pan, data changes)
        map.on('render', () => {
            if (map.isSourceLoaded('photos')) {
                updateImageMarkers();
                updateClusterLabels();
            }
        });

        // Click on cluster to zoom and fit all elements inside
        map.on('click', 'clusters', (e) => {
            const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
            const clusterId = features[0].properties.cluster_id;
            const pointCount = features[0].properties.point_count;

            // Get all leaves (points) in this cluster
            map.getSource('photos').getClusterLeaves(clusterId, pointCount, 0, (err, leaves) => {
                if (err || !leaves || leaves.length === 0) return;

                // Calculate bounds to fit all points in the cluster
                const bounds = new maplibregl.LngLatBounds();
                leaves.forEach(leaf => {
                    bounds.extend(leaf.geometry.coordinates);
                });

                map.fitBounds(bounds, {
                    padding: 80,
                    maxZoom: 18
                });
            });
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
            padding: 50,
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
}

// Open modal
function openModal(item) {
    const modal = document.getElementById('modal');
    const modalImg = document.getElementById('modal-img');
    const modalTitle = document.getElementById('modal-title');
    const modalMeta = document.getElementById('modal-meta');
    const modalDescription = document.getElementById('modal-description');

    modalImg.src = item.image;
    modalImg.alt = item.title || '';

    // Handle optional title
    modalTitle.textContent = item.title || '';
    modalTitle.style.display = item.title ? '' : 'none';

    // Handle optional meta (date • origin)
    const metaParts = [item.date, item.origin].filter(Boolean);
    const metaText = metaParts.join(' • ');
    modalMeta.textContent = metaText;
    modalMeta.style.display = metaText ? '' : 'none';

    // Handle optional description
    modalDescription.textContent = item.fullDescription || '';
    modalDescription.style.display = item.fullDescription ? '' : 'none';

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// Close modal
function closeModal() {
    const modal = document.getElementById('modal');
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    loadGalleryData();

    // Close button
    document.getElementById('modal-close').addEventListener('click', closeModal);

    // Click outside modal
    document.querySelector('.modal-overlay').addEventListener('click', closeModal);

    // Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    });
});

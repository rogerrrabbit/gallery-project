// Gallery data storage
let galleryData = [];
let map = null;

// Load gallery data
async function loadGalleryData() {
    try {
        const response = await fetch('japon25.json');
        galleryData = await response.json();
        renderGallery();
        initMap();
    } catch (error) {
        console.error('Error loading gallery data:', error);
    }
}

// Render gallery cards
function renderGallery() {
    const gallery = document.getElementById('gallery');
    // Keep the map container, clear only cards
    const mapContainer = document.getElementById('map-container');
    gallery.innerHTML = '';
    if (mapContainer) {
        gallery.appendChild(mapContainer);
    }

    galleryData.forEach(item => {
        const card = document.createElement('div');
        card.className = 'card';
        card.onclick = () => openModal(item);

        // Build card meta (date • origin) - only show parts that exist
        const metaParts = [item.date, item.origin].filter(Boolean);
        const metaText = metaParts.join(' • ');

        card.innerHTML = `
            <div class="card-inner">
                <div class="card-front">
                    <img src="${item.image}" alt="${item.title || ''}">
                </div>
                <div class="card-back">
                    ${item.title ? `<h3>${item.title}</h3>` : ''}
                    ${metaText ? `<p class="card-meta">${metaText}</p>` : ''}
                    ${item.shortDescription ? `<p>${item.shortDescription}</p>` : ''}
                </div>
            </div>
        `;

        gallery.appendChild(card);
    });
}

// Initialize MapLibre GL map
function initMap() {
    const itemsWithCoords = galleryData.filter(item => item.coordinates);

    // Hide map if no items have coordinates
    const mapContainer = document.getElementById('map-container');
    if (itemsWithCoords.length === 0) {
        mapContainer.style.display = 'none';
        return;
    }

    mapContainer.style.display = 'block';

    // Initialize the map with OpenStreetMap tiles
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

    // Add markers for each item with coordinates
    const bounds = new maplibregl.LngLatBounds();

    itemsWithCoords.forEach(item => {
        const { lat, lng } = item.coordinates;

        // Create marker element with thumbnail image
        const el = document.createElement('img');
        el.className = 'map-marker';
        el.src = item.image;
        el.alt = item.title || '';
        el.title = item.title || '';

        // Add click handler to open modal
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            openModal(item);
        });

        // Add marker to map
        new maplibregl.Marker({ element: el })
            .setLngLat([lng, lat])
            .addTo(map);

        // Extend bounds to include this marker
        bounds.extend([lng, lat]);
    });

    // Fit map to show all markers with padding
    map.fitBounds(bounds, {
        padding: 50,
        maxZoom: 10
    });
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

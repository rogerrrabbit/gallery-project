/**
 * Edit Mode for Gallery
 * Provides functionality to edit photo metadata:
 * - Group-rename origins (cities)
 * - Drag markers to update coordinates
 * - Edit title, short/full descriptions
 * - Export modified JSON
 */

(function () {
    'use strict';

    let isEditMode = false;
    let editPanel = null;
    let selectedPhotoId = null;
    let originalData = null; // Store original for comparison

    // Initialize edit mode when DOM is ready
    function init() {
        // Check if we're in dev mode
        if (!document.querySelector('meta[name="edit-mode"]')) {
            console.log('Edit mode not enabled (production build)');
            return;
        }

        createEditButton();
        createEditPanel();
        setupEventListeners();
        console.log('✏️ Edit mode initialized');
    }

    // Create the edit toggle button in the header
    function createEditButton() {
        const header = document.querySelector('header');
        if (!header) return;

        const editBtn = document.createElement('button');
        editBtn.id = 'edit-toggle';
        editBtn.className = 'edit-toggle';
        editBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit
        `;
        editBtn.setAttribute('aria-label', 'Toggle Edit Mode');

        // Insert after view-toggle button
        const viewToggle = header.querySelector('#view-toggle');
        if (viewToggle) {
            viewToggle.after(editBtn);
        } else {
            header.appendChild(editBtn);
        }
    }

    // Create the edit panel
    function createEditPanel() {
        editPanel = document.createElement('div');
        editPanel.id = 'edit-panel';
        editPanel.className = 'edit-panel';
        editPanel.innerHTML = `
            <div class="edit-panel-header">
                <h2>📝 Edit Mode</h2>
                <button class="edit-panel-close">&times;</button>
            </div>
            <div class="edit-panel-content">
                <div class="edit-tabs">
                    <button class="edit-tab active" data-tab="origins">Origins</button>
                    <button class="edit-tab" data-tab="photo">Photo</button>
                </div>
                
                <!-- Origins Tab -->
                <div id="tab-origins" class="edit-tab-content active">
                    <div class="edit-section">
                        <h3>Group Rename Origins</h3>
                        <p style="font-size: 0.85rem; opacity: 0.7; margin-bottom: 12px;">
                            Select an origin below to rename all photos from that location.
                        </p>
                        <div id="origin-list" class="origin-list"></div>
                    </div>
                </div>
                
                <!-- Photo Tab -->
                <div id="tab-photo" class="edit-tab-content">
                    <div id="photo-editor" class="photo-editor" style="display: none;">
                        <img id="editor-thumb" class="photo-editor-thumb" src="" alt="">
                        
                        <div class="photo-editor-field">
                            <label class="photo-editor-label">Title</label>
                            <input type="text" id="editor-title" class="edit-input" placeholder="Photo title...">
                        </div>
                        
                        <div class="photo-editor-field">
                            <label class="photo-editor-label">Short Description</label>
                            <textarea id="editor-short-desc" class="edit-input" rows="2" placeholder="Brief description..."></textarea>
                        </div>
                        
                        <div class="photo-editor-field">
                            <label class="photo-editor-label">Full Description</label>
                            <textarea id="editor-full-desc" class="edit-input" rows="4" placeholder="Detailed description..."></textarea>
                        </div>
                        
                        <div class="photo-editor-field">
                            <label class="photo-editor-label">Coordinates</label>
                            <div class="photo-coords">
                                <input type="number" id="editor-lat" class="edit-input" placeholder="Latitude" step="0.000001">
                                <input type="number" id="editor-lng" class="edit-input" placeholder="Longitude" step="0.000001">
                            </div>
                            <p style="font-size: 0.75rem; opacity: 0.5; margin-top: 8px;">
                                💡 Tip: Drag the marker on the map to update coordinates
                            </p>
                        </div>
                        
                        <button id="editor-save" class="edit-btn edit-btn-primary edit-btn-block">
                            💾 Save Changes
                        </button>
                    </div>
                    <div id="photo-editor-empty" style="text-align: center; padding: 40px; opacity: 0.6;">
                        <p>Click a photo to edit its details</p>
                    </div>
                </div>
            </div>
            <div class="edit-panel-footer">
                <button id="export-json" class="edit-btn edit-btn-success edit-btn-block">
                    📥 Download JSON
                </button>
            </div>
        `;
        document.body.appendChild(editPanel);
    }

    // Setup event listeners
    function setupEventListeners() {
        // Toggle edit mode
        document.getElementById('edit-toggle').addEventListener('click', toggleEditMode);

        // Close panel
        editPanel.querySelector('.edit-panel-close').addEventListener('click', () => {
            toggleEditMode();
        });

        // Tab switching
        editPanel.querySelectorAll('.edit-tab').forEach(tab => {
            tab.addEventListener('click', () => switchTab(tab.dataset.tab));
        });

        // Export JSON
        document.getElementById('export-json').addEventListener('click', exportJSON);

        // Save photo edits
        document.getElementById('editor-save').addEventListener('click', savePhotoEdits);
    }

    // Toggle edit mode on/off
    function toggleEditMode() {
        isEditMode = !isEditMode;
        const btn = document.getElementById('edit-toggle');

        if (isEditMode) {
            btn.classList.add('active');
            btn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M5 13l4 4L19 7"/>
                </svg>
                Editing
            `;
            editPanel.classList.add('open');

            // Store original data for comparison
            originalData = JSON.parse(JSON.stringify(window.galleryData));

            // Populate origins list
            populateOriginsList();

            // Make markers draggable
            enableDraggableMarkers();

            // Add click handlers to cards for selection
            enableCardSelection();
        } else {
            btn.classList.remove('active');
            btn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Edit
            `;
            editPanel.classList.remove('open');

            // Disable draggable markers
            disableDraggableMarkers();

            // Clear selection
            clearCardSelection();
        }
    }

    // Switch between tabs
    function switchTab(tabId) {
        editPanel.querySelectorAll('.edit-tab').forEach(t => t.classList.remove('active'));
        editPanel.querySelectorAll('.edit-tab-content').forEach(c => c.classList.remove('active'));

        editPanel.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
        document.getElementById(`tab-${tabId}`).classList.add('active');
    }

    // Populate origins list for group renaming
    function populateOriginsList() {
        const originList = document.getElementById('origin-list');

        // Count photos per origin
        const origins = {};
        window.galleryData.forEach(item => {
            const origin = item.origin || 'Unknown';
            origins[origin] = (origins[origin] || 0) + 1;
        });

        originList.innerHTML = Object.entries(origins)
            .sort((a, b) => b[1] - a[1]) // Sort by count
            .map(([name, count]) => `
                <div class="origin-item" data-origin="${escapeHtml(name)}">
                    <span class="origin-item-count">${count}</span>
                    <input type="text" class="origin-rename-input" value="${escapeHtml(name)}" 
                           data-original="${escapeHtml(name)}">
                    <button class="edit-btn edit-btn-primary" style="padding: 6px 12px; font-size: 0.8rem;"
                            onclick="window.editMode.renameOrigin('${escapeHtml(name)}', this)">
                        Rename
                    </button>
                </div>
            `).join('');
    }

    // Rename all photos with a specific origin
    window.editMode = window.editMode || {};
    window.editMode.renameOrigin = function (oldName, btn) {
        const input = btn.parentElement.querySelector('.origin-rename-input');
        const newName = input.value.trim();

        if (!newName || newName === oldName) return;

        let count = 0;
        window.galleryData.forEach(item => {
            if (item.origin === oldName) {
                item.origin = newName;
                count++;
            }
        });

        showToast(`Renamed ${count} photos from "${oldName}" to "${newName}"`, 'success');

        // Refresh the origins list
        populateOriginsList();

        // Re-render gallery to update banners
        if (typeof window.renderGallery === 'function') {
            window.renderGallery();
        }
    };

    // Enable card selection for editing
    function enableCardSelection() {
        document.querySelectorAll('.card').forEach(card => {
            card.addEventListener('click', handleCardClick);
        });
    }

    // Clear card selection
    function clearCardSelection() {
        document.querySelectorAll('.card.edit-selected').forEach(card => {
            card.classList.remove('edit-selected');
        });
        selectedPhotoId = null;
    }

    // Handle card click in edit mode
    function handleCardClick(e) {
        if (!isEditMode) return;

        e.stopPropagation();
        e.preventDefault();

        // Find the photo data
        const imgSrc = this.querySelector('img').dataset.src || this.querySelector('img').src;
        const photo = window.galleryData.find(p => imgSrc.includes(p.image.split('/').pop()));

        if (!photo) return;

        // Update selection UI
        clearCardSelection();
        this.classList.add('edit-selected');
        selectedPhotoId = photo.id;

        // Populate editor
        populatePhotoEditor(photo);

        // Switch to photo tab
        switchTab('photo');
    }

    // Populate photo editor with data
    function populatePhotoEditor(photo) {
        document.getElementById('photo-editor').style.display = 'block';
        document.getElementById('photo-editor-empty').style.display = 'none';

        // Use thumbnail path
        const thumbPath = window.getThumbnailPath ? window.getThumbnailPath(photo.image) : photo.image;
        document.getElementById('editor-thumb').src = thumbPath;

        document.getElementById('editor-title').value = photo.title || '';
        document.getElementById('editor-short-desc').value = photo.shortDescription || '';
        document.getElementById('editor-full-desc').value = photo.fullDescription || '';

        if (photo.coordinates) {
            document.getElementById('editor-lat').value = photo.coordinates.lat || '';
            document.getElementById('editor-lng').value = photo.coordinates.lng || '';
        } else {
            document.getElementById('editor-lat').value = '';
            document.getElementById('editor-lng').value = '';
        }
    }

    // Save photo edits
    function savePhotoEdits() {
        if (!selectedPhotoId) return;

        const photo = window.galleryData.find(p => p.id === selectedPhotoId);
        if (!photo) return;

        photo.title = document.getElementById('editor-title').value || undefined;
        photo.shortDescription = document.getElementById('editor-short-desc').value || undefined;
        photo.fullDescription = document.getElementById('editor-full-desc').value || undefined;

        const lat = parseFloat(document.getElementById('editor-lat').value);
        const lng = parseFloat(document.getElementById('editor-lng').value);

        if (!isNaN(lat) && !isNaN(lng)) {
            photo.coordinates = { lat, lng };
        }

        showToast('Photo updated!', 'success');

        // Re-render gallery
        if (typeof window.renderGallery === 'function') {
            window.renderGallery();
        }

        // Re-enable card selection after render
        setTimeout(enableCardSelection, 100);
    }

    // Enable draggable markers on the map
    function enableDraggableMarkers() {
        if (!window.map || !window.imageMarkers) return;

        window.imageMarkers.forEach(marker => {
            const el = marker.getElement();
            el.classList.add('draggable');
            el.draggable = true;

            // Store original position
            const lngLat = marker.getLngLat();
            el.dataset.originalLng = lngLat.lng;
            el.dataset.originalLat = lngLat.lat;

            // Make marker draggable
            marker.setDraggable(true);

            marker.on('dragend', () => {
                const newPos = marker.getLngLat();

                // Find the photo by matching coordinates
                const photo = window.galleryData.find(p =>
                    p.coordinates &&
                    Math.abs(p.coordinates.lng - parseFloat(el.dataset.originalLng)) < 0.0001 &&
                    Math.abs(p.coordinates.lat - parseFloat(el.dataset.originalLat)) < 0.0001
                );

                if (photo) {
                    photo.coordinates.lat = newPos.lat;
                    photo.coordinates.lng = newPos.lng;

                    // Update stored original for future drags
                    el.dataset.originalLng = newPos.lng;
                    el.dataset.originalLat = newPos.lat;

                    showToast(`Moved photo to ${newPos.lat.toFixed(4)}, ${newPos.lng.toFixed(4)}`, 'success');

                    // Update editor if this photo is selected
                    if (selectedPhotoId === photo.id) {
                        document.getElementById('editor-lat').value = newPos.lat;
                        document.getElementById('editor-lng').value = newPos.lng;
                    }
                }
            });
        });
    }

    // Disable draggable markers
    function disableDraggableMarkers() {
        if (!window.imageMarkers) return;

        window.imageMarkers.forEach(marker => {
            const el = marker.getElement();
            el.classList.remove('draggable', 'dragging');
            marker.setDraggable(false);
        });
    }

    // Export JSON file
    function exportJSON() {
        // Build the full data structure with header
        const exportData = {
            header: {
                title: document.querySelector('header h1')?.textContent || 'Gallery',
                subtitle: document.querySelector('header p')?.textContent || '',
                colorTheme: getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim() || '#667eea',
                showMap: true,
                showBanners: true
            },
            images: window.galleryData
        };

        const dataStr = JSON.stringify(exportData, null, 4);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = 'Japon2025.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        showToast('JSON downloaded!', 'success');
    }

    // Show toast notification
    function showToast(message, type = 'success') {
        // Remove existing toast
        const existing = document.querySelector('.edit-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = `edit-toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        // Trigger animation
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // Remove after delay
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // Escape HTML to prevent XSS
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

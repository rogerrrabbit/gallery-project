// Gallery data storage
let galleryData = [];
let editingId = null;

// Load gallery data
async function loadGalleryData() {
    try {
        // Try to load from localStorage first
        const saved = localStorage.getItem('galleryData');
        if (saved) {
            galleryData = JSON.parse(saved);
        } else {
            // Load from JSON file
            const response = await fetch('gallery-data.json');
            galleryData = await response.json();
            saveToLocalStorage();
        }
        renderItems();
    } catch (error) {
        console.error('Error loading gallery data:', error);
        galleryData = [];
        renderItems();
    }
}

// Save to localStorage
function saveToLocalStorage() {
    localStorage.setItem('galleryData', JSON.stringify(galleryData));
}

// Render items list
function renderItems() {
    const itemsList = document.getElementById('items-list');
    const itemsCount = document.getElementById('items-count');

    itemsCount.textContent = galleryData.length;

    if (galleryData.length === 0) {
        itemsList.innerHTML = '<p style="color: #999; text-align: center; padding: 2rem;">Aucun objet dans la collection</p>';
        return;
    }

    itemsList.innerHTML = galleryData.map(item => `
        <div class="item-card">
            <div class="item-image">
                <img src="${item.image}" alt="${item.title}">
            </div>
            <div class="item-info">
                <h3>${item.title}</h3>
                <p class="item-meta">${item.year} • ${item.origin}</p>
                <p class="item-description">${item.shortDescription}</p>
            </div>
            <div class="item-actions">
                <button class="btn btn-edit" onclick="editItem('${item.id}')">✏️ Modifier</button>
                <button class="btn btn-danger" onclick="deleteItem('${item.id}')">🗑️ Supprimer</button>
            </div>
        </div>
    `).join('');
}

// Form handling
const form = document.getElementById('item-form');
const formTitle = document.getElementById('form-title');
const cancelBtn = document.getElementById('cancel-btn');
const imageInput = document.getElementById('item-image');
const imagePreview = document.getElementById('image-preview');

// Image preview
imageInput.addEventListener('input', (e) => {
    const url = e.target.value;
    if (url) {
        imagePreview.innerHTML = `<img src="${url}" alt="Preview" onerror="this.parentElement.innerHTML='<p style=color:#999>Image invalide</p>'">`;
        imagePreview.classList.add('active');
    } else {
        imagePreview.classList.remove('active');
    }
});

// Form submit
form.addEventListener('submit', (e) => {
    e.preventDefault();

    const itemData = {
        id: editingId || Date.now().toString(),
        title: document.getElementById('item-title').value,
        image: document.getElementById('item-image').value,
        year: document.getElementById('item-year').value,
        origin: document.getElementById('item-origin').value,
        shortDescription: document.getElementById('item-short-desc').value,
        fullDescription: document.getElementById('item-full-desc').value
    };

    if (editingId) {
        // Update existing item
        const index = galleryData.findIndex(item => item.id === editingId);
        galleryData[index] = itemData;
    } else {
        // Add new item
        galleryData.push(itemData);
    }

    saveToLocalStorage();
    renderItems();
    resetForm();
});

// Edit item
function editItem(id) {
    const item = galleryData.find(item => item.id === id);
    if (!item) return;

    editingId = id;
    formTitle.textContent = 'Modifier l\'objet';
    cancelBtn.style.display = 'inline-block';

    document.getElementById('item-title').value = item.title;
    document.getElementById('item-image').value = item.image;
    document.getElementById('item-year').value = item.year;
    document.getElementById('item-origin').value = item.origin;
    document.getElementById('item-short-desc').value = item.shortDescription;
    document.getElementById('item-full-desc').value = item.fullDescription;

    // Trigger image preview
    imageInput.dispatchEvent(new Event('input'));

    // Scroll to form
    document.querySelector('.form-section').scrollIntoView({ behavior: 'smooth' });
}

// Delete item
function deleteItem(id) {
    if (confirm('Êtes-vous sûr de vouloir supprimer cet objet ?')) {
        galleryData = galleryData.filter(item => item.id !== id);
        saveToLocalStorage();
        renderItems();
    }
}

// Reset form
function resetForm() {
    editingId = null;
    formTitle.textContent = 'Ajouter un nouvel objet';
    cancelBtn.style.display = 'none';
    form.reset();
    imagePreview.classList.remove('active');
}

cancelBtn.addEventListener('click', resetForm);

// Export JSON
document.getElementById('export-btn').addEventListener('click', () => {
    const dataStr = JSON.stringify(galleryData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'gallery-data.json';
    link.click();
    URL.revokeObjectURL(url);
});

// Import JSON
document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('import-file').click();
});

document.getElementById('import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            galleryData = JSON.parse(event.target.result);
            saveToLocalStorage();
            renderItems();
            alert('Données importées avec succès !');
        } catch (error) {
            alert('Erreur lors de l\'importation du fichier JSON');
            console.error(error);
        }
    };
    reader.readAsText(file);
});

// Initialize
document.addEventListener('DOMContentLoaded', loadGalleryData);

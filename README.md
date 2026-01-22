# Galerie de Photos

A beautiful, simple photo gallery showcasing vintage objects. Built with pure HTML, CSS, and minimal JavaScript - no frameworks required.

## Features

- 📸 **Responsive Gallery Grid** - Adapts from 1-3 columns based on screen size
- 🔄 **Card Flip Effect** - Hover over cards to reveal details
- 🖼️ **Full-Screen Modal** - Click any item for a detailed view
- ⚙️ **Admin Panel** - Easy content management for non-technical users
- 📱 **Mobile Friendly** - Works great on all devices
- ⚡ **Fast & Lightweight** - No build process, loads in milliseconds

## Quick Start

### View the Gallery

1. Start a local web server:
   ```bash
   python3 -m http.server 8000
   ```

2. Open your browser to: `http://localhost:8000`

### Manage Content

1. Navigate to: `http://localhost:8000/admin.html`
2. Add, edit, or delete gallery items
3. Export the updated `gallery-data.json` file
4. Replace the existing file on your server

## Project Structure

```
gallery-project/
├── index.html          # Main gallery page
├── style.css           # Gallery styles & animations
├── script.js           # Gallery functionality
├── gallery-data.json   # Gallery items data
├── admin.html          # Admin panel
├── admin.css           # Admin panel styles
├── admin.js            # Admin panel functionality
└── README.md           # This file
```

## Gallery Data Format

Each gallery item in `gallery-data.json` has:
- `id` - Unique identifier
- `image` - URL to the image
- `title` - Item title
- `year` - Year or time period
- `origin` - Place of origin
- `shortDescription` - Shown on card flip
- `fullDescription` - Shown in modal

## Deployment

Simply upload all files to any web server or static hosting:
- GitHub Pages
- Netlify
- Vercel
- Any FTP server

No build process needed!

## Admin Panel Workflow

1. Open `admin.html` in your browser
2. Make changes (add/edit/delete items)
3. Click "Exporter JSON" to download updated data
4. Replace `gallery-data.json` on your server
5. Refresh the main gallery to see changes

> **Note:** Keep the admin panel URL private or add password protection in production.

## Browser Support

Works in all modern browsers:
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers

## License

Feel free to use and modify for your own projects!

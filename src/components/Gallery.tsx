import { useState } from 'react';
import { motion } from 'motion/react';
import { GalleryTile } from './GalleryTile';
import { GalleryModal } from './GalleryModal';
import { galleryItems } from '../data/gallery-items';
import type { GalleryItem } from '../types/gallery';

export function Gallery() {
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);

  const openModal = (item: GalleryItem) => {
    setSelectedItem(item);
  };

  const closeModal = () => {
    setSelectedItem(null);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <motion.header
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h1 className="mb-4">Objets Trouvés</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Une collection d'objets vintage découverts aux quatre coins de l'Europe, 
            témoins silencieux des époques passées et porteurs d'histoires oubliées.
          </p>
        </motion.header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {galleryItems.map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: index * 0.05 }}
            >
              <GalleryTile
                item={item}
                onClick={() => openModal(item)}
              />
            </motion.div>
          ))}
        </div>
      </div>

      <GalleryModal
        item={selectedItem}
        isOpen={!!selectedItem}
        onClose={closeModal}
      />
    </div>
  );
}
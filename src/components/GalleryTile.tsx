import { motion } from 'motion/react';
import type { GalleryItem } from '../types/gallery';

interface GalleryTileProps {
  item: GalleryItem;
  onClick: () => void;
}

export function GalleryTile({ item, onClick }: GalleryTileProps) {
  return (
    <motion.div
      className="relative aspect-square cursor-pointer group [transform-style:preserve-3d]"
      whileHover={{ 
        scale: 1.02,
        rotateY: 180
      }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.6, ease: "easeInOut" }}
      onClick={onClick}
    >
      {/* Face pile (image) */}
      <div className="absolute inset-0 rounded-2xl shadow-md overflow-hidden [backface-visibility:hidden]">
        <img
          src={item.image}
          alt={item.title}
          className="w-full h-full object-cover"
        />
      </div>

      {/* Face (texte) */}
      <div className="absolute inset-0 rounded-2xl shadow-md bg-white p-6 flex flex-col justify-center [backface-visibility:hidden] [transform:rotateY(180deg)]">
        <div className="text-center">
          <h3 className="mb-3">{item.title}</h3>
          <p className="text-muted-foreground text-sm leading-relaxed mb-2">
            {item.shortDescription}
          </p>
          <p className="text-xs text-muted-foreground">
            {item.year} • {item.origin}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
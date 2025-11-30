import { Dialog, DialogContent } from "./ui/dialog";
import { motion } from 'motion/react';
import type { GalleryItem } from '../types/gallery';

interface GalleryModalProps {
  item: GalleryItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export function GalleryModal({ item, isOpen, onClose }: GalleryModalProps) {
  if (!item) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] p-0 overflow-hidden">
        <div className="flex h-full">
          {/* Image Panel - Takes 60% of width on large screens */}
          <div className="flex-[3] relative bg-neutral-100 flex items-center justify-center">
            <motion.img
              src={item.image}
              alt={item.title}
              className="max-w-full max-h-full object-contain"
              initial={{ scale: 1.1, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5 }}
            />
          </div>
          
          {/* Content Panel - Takes 40% of width */}
          <motion.div 
            className="flex-[2] p-8 lg:p-12 flex flex-col justify-center bg-background"
            initial={{ x: 50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <div className="max-w-none">
              <div className="mb-6">
                <h1 className="mb-3">{item.title}</h1>
                <p className="text-muted-foreground text-lg">
                  {item.year} • {item.origin}
                </p>
              </div>
              
              <p className="leading-relaxed text-lg">
                {item.fullDescription}
              </p>
            </div>
          </motion.div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
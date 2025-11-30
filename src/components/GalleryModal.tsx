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
      <DialogContent className="!max-w-[95vw] !w-[95vw] h-[95vh] !p-0 overflow-hidden gap-0">
        <div className="flex h-full w-full gap-0">
          {/* Left: Full Image - Takes 75% of width */}
          <div className="w-[75%] h-full bg-black flex items-center justify-center">
            <motion.img
              src={item.image}
              alt={item.title}
              className="max-w-full max-h-full object-contain"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            />
          </div>

          {/* Right: Content Panel - Takes 25% */}
          <motion.div
            className="w-[25%] h-full p-8 flex flex-col justify-center bg-background overflow-y-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <div>
              <h1 className="text-3xl font-bold mb-3">{item.title}</h1>
              <p className="text-muted-foreground text-lg mb-6">
                {item.year} • {item.origin}
              </p>

              <p className="leading-relaxed text-base">
                {item.fullDescription}
              </p>
            </div>
          </motion.div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
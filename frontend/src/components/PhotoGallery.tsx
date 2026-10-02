"use client";

import React, { useState } from "react";
import Gallery from "react-photo-gallery";
import Carousel, { Modal, ModalGateway } from "react-images";

const PhotoGallery = ({ images }: { images: any[] }) => {
  const [currentImage, setCurrentImage] = useState(0);
  const [viewerIsOpen, setViewerIsOpen] = useState(false);

  // Create a mutable copy of images to prevent mutation errors
  const mutableImages = Array.isArray(images) ? images.map(img => ({ ...img })) : [];

  const openLightbox = (index: number) => {
    setCurrentImage(index);
    setViewerIsOpen(true);
  };

  const closeLightbox = () => {
    setCurrentImage(0);
    setViewerIsOpen(false);
  };

  return (
    <div className="bg-white">
      <Gallery
        photos={mutableImages}
        onClick={(event: any, { index }: any) => openLightbox(index)}
      />
      {/* @ts-expect-error react-images types do not properly type children in React 18+ */}
      <ModalGateway>
        {viewerIsOpen ? (
          <Modal onClose={closeLightbox}>
            <Carousel
              currentIndex={currentImage}
              views={mutableImages.map((photo) => ({
                ...photo,
                srcset: photo.srcSet,
                caption: photo.title,
              }))}
            />
          </Modal>
        ) : null}
      </ModalGateway>
    </div>
  );
};

export default PhotoGallery;

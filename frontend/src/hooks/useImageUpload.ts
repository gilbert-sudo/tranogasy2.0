import { useState, useCallback, useRef } from 'react';
import { imageService, UploadedImage } from '../services/image.service';

export interface ImageUploadState {
  images: UploadedImage[];
  isUploading: boolean;
  uploadError: string | null;
  handleFiles: (files: FileList | File[]) => Promise<void>;
  retryUpload: (id: string) => Promise<void>;
  removeImage: (idOrIndex: string | number) => Promise<void>;
  setCoverImage: (index: number) => void;
  reorderImages: (fromIndex: number, toIndex: number) => void;
  clearAllImages: () => Promise<void>;
  setImages: React.Dispatch<React.SetStateAction<UploadedImage[]>>;
}

export function useImageUpload(initialImages: UploadedImage[] = []): ImageUploadState {
  const [images, setImages] = useState<UploadedImage[]>(initialImages);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const pendingFilesRef = useRef<Map<string, File>>(new Map());

  // isUploading is true if any image has status 'pending', 'compressing', or 'uploading'
  const isUploading = images.some(
    (img) => img.status === 'pending' || img.status === 'compressing' || img.status === 'uploading'
  );

  const uploadSingleFile = async (id: string, file: File) => {
    try {
      setImages((prev) =>
        prev.map((img) =>
          img.id === id ? { ...img, status: 'compressing', progress: 20 } : img
        )
      );

      const result = await imageService.uploadImageToGCS(file, (progress, stage) => {
        setImages((prev) =>
          prev.map((img) =>
            img.id === id
              ? {
                  ...img,
                  status: stage === 'compressing' ? 'compressing' : 'uploading',
                  progress,
                }
              : img
          )
        );
      });

      setImages((prev) =>
        prev.map((img) =>
          img.id === id
            ? {
                ...img,
                src: result.src,
                fileName: result.fileName,
                status: 'done',
                progress: 100,
              }
            : img
        )
      );

      pendingFilesRef.current.delete(id);
    } catch (err: any) {
      console.error(`Erreur d'envoi pour ${file.name}:`, err);
      setImages((prev) =>
        prev.map((img) =>
          img.id === id
            ? {
                ...img,
                status: 'error',
                error: err.message || 'Erreur de téléversement',
              }
            : img
        )
      );
      setUploadError(`Erreur lors du téléversement de ${file.name} : ${err.message || 'Erreur'}`);
    }
  };

  const handleFiles = useCallback(
    async (selectedFiles: FileList | File[]) => {
      if (!selectedFiles || selectedFiles.length === 0) return;

      const fileArray = Array.from(selectedFiles);
      const availableSlots = 8 - images.length;

      if (availableSlots <= 0) {
        setUploadError('Vous avez atteint la limite maximale de 8 photos.');
        return;
      }

      const filesToUpload = fileArray.slice(0, availableSlots);
      if (fileArray.length > availableSlots) {
        setUploadError(`Seules les ${availableSlots} premières photos ont été ajoutées (max 8).`);
      } else {
        setUploadError(null);
      }

      // 1. Create immediate optimistic preview items
      const newItems: UploadedImage[] = filesToUpload.map((file, idx) => {
        const id = `img_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`;
        const previewUrl = URL.createObjectURL(file);
        pendingFilesRef.current.set(id, file);

        return {
          id,
          src: '', // empty until uploaded
          previewUrl,
          status: 'pending',
          progress: 10,
          name: file.name,
        };
      });

      // Add to state immediately -> Instant visual feedback!
      setImages((prev) => [...prev, ...newItems]);

      // 2. Upload asynchronously in parallel with concurrency
      newItems.forEach((item) => {
        const file = pendingFilesRef.current.get(item.id);
        if (file) {
          uploadSingleFile(item.id, file);
        }
      });
    },
    [images.length]
  );

  const retryUpload = useCallback(async (id: string) => {
    const file = pendingFilesRef.current.get(id);
    if (!file) return;

    setImages((prev) =>
      prev.map((img) =>
        img.id === id ? { ...img, status: 'pending', progress: 10, error: undefined } : img
      )
    );
    await uploadSingleFile(id, file);
  }, []);

  const removeImage = useCallback(
    async (idOrIndex: string | number) => {
      let target: UploadedImage | undefined;
      let targetIndex = -1;

      if (typeof idOrIndex === 'number') {
        target = images[idOrIndex];
        targetIndex = idOrIndex;
      } else {
        targetIndex = images.findIndex((img) => img.id === idOrIndex);
        target = images[targetIndex];
      }

      if (!target) return;

      // Revoke blob URL
      if (target.previewUrl && target.previewUrl.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(target.previewUrl);
        } catch {}
      }

      pendingFilesRef.current.delete(target.id);

      // Optimistically remove from state
      setImages((prev) => prev.filter((_, i) => i !== targetIndex));

      // Delete from GCS in background if already uploaded
      if (target.src && target.status === 'done') {
        await imageService.deleteImageFromGCS(target.src, target.fileName);
      }
    },
    [images]
  );

  const setCoverImage = useCallback((index: number) => {
    if (index === 0) return;
    setImages((prev) => {
      const updated = [...prev];
      const [chosen] = updated.splice(index, 1);
      return [chosen, ...updated];
    });
  }, []);

  const reorderImages = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setImages((prev) => {
      const updated = [...prev];
      const [item] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, item);
      return updated;
    });
  }, []);

  const clearAllImages = useCallback(async () => {
    const current = [...images];
    setImages([]);

    for (const item of current) {
      if (item.previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(item.previewUrl);
      }
      if (item.src && item.status === 'done') {
        imageService.deleteImageFromGCS(item.src, item.fileName);
      }
    }
    pendingFilesRef.current.clear();
  }, [images]);

  return {
    images,
    isUploading,
    uploadError,
    handleFiles,
    retryUpload,
    removeImage,
    setCoverImage,
    reorderImages,
    clearAllImages,
    setImages,
  };
}

import imageCompression from 'browser-image-compression';

export interface UploadedImage {
  id: string;
  src: string;
  previewUrl: string;
  status: 'pending' | 'compressing' | 'uploading' | 'done' | 'error';
  progress: number;
  fileName?: string;
  name?: string;
  error?: string;
}

export const imageService = {
  /**
   * Compresses an image client-side and uploads it to Google Cloud Storage with real-time stage progress.
   */
  uploadImageToGCS: async (
    file: File,
    onProgress?: (progress: number, stage: 'compressing' | 'uploading' | 'done') => void
  ): Promise<{ src: string; fileName: string; name: string }> => {
    // 1. Client-side compression
    onProgress?.(20, 'compressing');
    
    const compressionOptions = {
      maxSizeMB: 0.25,
      maxWidthOrHeight: 1920,
      useWebWorker: true,
      fileType: file.type || 'image/jpeg',
    };

    let fileToUpload: File | Blob = file;
    try {
      fileToUpload = await imageCompression(file, compressionOptions);
      onProgress?.(45, 'uploading');
    } catch (compressionErr) {
      console.warn('Image compression skipped/fallback to original:', compressionErr);
      fileToUpload = file;
      onProgress?.(45, 'uploading');
    }

    // 2. Upload to Next.js API route connecting to Google Cloud Storage
    const formData = new FormData();
    formData.append('file', fileToUpload, file.name);

    onProgress?.(65, 'uploading');

    const res = await fetch('/api/images/upload', {
      method: 'POST',
      body: formData,
    });

    onProgress?.(90, 'uploading');

    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      throw new Error(errorData?.error || 'Échec du téléversement vers Google Cloud Storage');
    }

    const data = await res.json();
    onProgress?.(100, 'done');

    return {
      src: data.imageUrl,
      fileName: data.fileName,
      name: file.name,
    };
  },

  /**
   * Deletes an image from Google Cloud Storage by URL or fileName.
   */
  deleteImageFromGCS: async (imageUrl: string, fileName?: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/images/server-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl, fileName }),
      });
      return res.ok;
    } catch (err) {
      console.error('Failed to delete image from GCS:', err);
      return false;
    }
  },
};

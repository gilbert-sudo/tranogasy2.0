import { NextRequest, NextResponse } from 'next/server';
import { Storage } from '@google-cloud/storage';
import path from 'path';

export const runtime = 'nodejs';

// Initialize Google Cloud Storage with service account credentials
const storage = new Storage({
  keyFilename: path.join(process.cwd(), 'tranogasy-gcs-credentials.json'),
  projectId: 'tranogasy-gilbert-414910',
});

const BUCKET_NAME = 'tranogasy-images';
const bucket = storage.bucket(BUCKET_NAME);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'Aucun fichier fourni' },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Sanitize filename and create unique timestamped name
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const gcsFileName = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${sanitizedName}`;

    const gcsFile = bucket.file(gcsFileName);

    await gcsFile.save(buffer, {
      metadata: {
        contentType: file.type || 'image/jpeg',
      },
      resumable: false,
    });

    const imageUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${gcsFileName}`;

    return NextResponse.json({
      success: true,
      imageUrl,
      fileName: gcsFileName,
      size: file.size,
      mimeType: file.type,
    });
  } catch (error: any) {
    console.error('Error uploading image to GCS:', error);
    return NextResponse.json(
      { error: error.message || 'Erreur lors du téléversement sur Google Cloud Storage' },
      { status: 500 }
    );
  }
}


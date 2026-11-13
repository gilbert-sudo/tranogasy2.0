import { NextRequest, NextResponse } from 'next/server';
import { getGcsBucket, getGcsErrorMessage } from '@/lib/gcs';

export const runtime = 'nodejs';

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

    const { bucket, bucketName } = getGcsBucket();

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

    const imageUrl = `https://storage.googleapis.com/${bucketName}/${gcsFileName}`;

    return NextResponse.json({
      success: true,
      imageUrl,
      fileName: gcsFileName,
      size: file.size,
      mimeType: file.type,
    });
  } catch (error: unknown) {
    console.error('Error uploading image to GCS:', error);
    const message = getGcsErrorMessage(
      error,
      'Erreur lors du téléversement sur Google Cloud Storage'
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


import { NextRequest, NextResponse } from 'next/server';
import { getGcsBucket, getGcsErrorMessage } from '@/lib/gcs';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const imageUrl = body.imageUrl;
    let fileName = body.fileName;

    if (!fileName && imageUrl && typeof imageUrl === 'string') {
      const cleanUrl = imageUrl.split('?')[0];
      const rawName = cleanUrl.split('/').pop();
      if (rawName) {
        fileName = decodeURIComponent(rawName);
      }
    }

    if (!fileName) {
      return NextResponse.json(
        { error: 'Aucun nom ou URL de fichier valide fourni' },
        { status: 400 }
      );
    }

    const { bucket, bucketName } = getGcsBucket();

    console.log(`[GCS Delete] Attempting to delete object: ${fileName} from bucket: ${bucketName}`);
    const gcsFile = bucket.file(fileName);
    const [exists] = await gcsFile.exists();

    if (exists) {
      await gcsFile.delete();
      console.log(`[GCS Delete] Successfully deleted ${fileName}`);
    } else {
      console.log(`[GCS Delete] File ${fileName} does not exist in bucket, skipping delete.`);
    }

    return NextResponse.json({
      success: true,
      message: 'Image supprimée avec succès du cloud Google Cloud Storage',
      deletedFile: fileName,
    });
  } catch (error: unknown) {
    console.error('Error deleting image from GCS:', error);
    const message = getGcsErrorMessage(
      error,
      'Erreur lors de la suppression sur Google Cloud Storage'
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

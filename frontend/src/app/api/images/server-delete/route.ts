import { NextRequest, NextResponse } from 'next/server';
import { Storage } from '@google-cloud/storage';
import path from 'path';

export const runtime = 'nodejs';

const storage = new Storage({
  keyFilename: path.join(process.cwd(), 'tranogasy-gcs-credentials.json'),
  projectId: 'tranogasy-gilbert-414910',
});

const BUCKET_NAME = 'tranogasy-images';
const bucket = storage.bucket(BUCKET_NAME);

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

    console.log(`[GCS Delete] Attempting to delete object: ${fileName} from bucket: ${BUCKET_NAME}`);
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
  } catch (error: any) {
    console.error('Error deleting image from GCS:', error);
    return NextResponse.json(
      { error: error.message || 'Erreur lors de la suppression sur Google Cloud Storage' },
      { status: 500 }
    );
  }
}

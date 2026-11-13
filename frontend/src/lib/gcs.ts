import { Storage, Bucket } from '@google-cloud/storage';

interface ServiceAccountCredentials {
  type?: string;
  project_id?: string;
  private_key_id?: string;
  private_key: string;
  client_email: string;
  client_id?: string;
  auth_uri?: string;
  token_uri?: string;
  auth_provider_x509_cert_url?: string;
  client_x509_cert_url?: string;
  universe_domain?: string;
}

const DEFAULT_BUCKET_NAME = 'tranogasy-images';
const DEFAULT_PROJECT_ID = 'tranogasy-gilbert-414910';

interface CachedBucket {
  cacheKey: string;
  bucket: Bucket;
  bucketName: string;
}

let cached: CachedBucket | null = null;

function normalizeCredentials(parsed: unknown): ServiceAccountCredentials {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('GCS_SERVICE_ACCOUNT_JSON must be a JSON object.');
  }

  const record = parsed as Record<string, unknown>;
  const clientEmail = typeof record.client_email === 'string' ? record.client_email : '';
  const rawPrivateKey = typeof record.private_key === 'string' ? record.private_key : '';

  if (!clientEmail || !rawPrivateKey) {
    throw new Error(
      'GCS_SERVICE_ACCOUNT_JSON is missing required fields (client_email or private_key).'
    );
  }

  return {
    ...(record as Partial<ServiceAccountCredentials>),
    client_email: clientEmail,
    private_key: rawPrivateKey.replace(/\\n/g, '\n'),
  };
}

function parseServiceAccountJson(raw: string): ServiceAccountCredentials {
  let trimmed = raw.trim();

  // Strip accidental surrounding quotes if pasted directly from a .env file
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed === 'string') {
        trimmed = parsed;
      } else {
        return normalizeCredentials(parsed);
      }
    } catch {
      trimmed = trimmed.slice(1, -1);
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid JSON';
    throw new Error(`Invalid GCS_SERVICE_ACCOUNT_JSON: ${message}`);
  }

  return normalizeCredentials(parsed);
}

function resolveGcsCredentials(): ServiceAccountCredentials {
  const jsonEnv = process.env.GCS_SERVICE_ACCOUNT_JSON;
  if (jsonEnv && jsonEnv.trim().length > 0) {
    return parseServiceAccountJson(jsonEnv);
  }

  const clientEmail = process.env.GCS_CLIENT_EMAIL;
  const privateKey = process.env.GCS_PRIVATE_KEY;
  if (clientEmail && privateKey) {
    return {
      project_id: process.env.GCS_PROJECT_ID || DEFAULT_PROJECT_ID,
      client_email: clientEmail,
      private_key: privateKey.replace(/\\n/g, '\n'),
    };
  }

  throw new Error(
    'Identifiants Google Cloud Storage manquants. Veuillez configurer la variable d’environnement GCS_SERVICE_ACCOUNT_JSON.'
  );
}

/**
 * Returns a lazily initialized and cached Google Cloud Storage bucket
 * configured exclusively from environment variables.
 */
export function getGcsBucket(): { bucket: Bucket; bucketName: string } {
  const bucketName = process.env.GCS_BUCKET_NAME || DEFAULT_BUCKET_NAME;
  const cacheKey = [
    process.env.GCS_SERVICE_ACCOUNT_JSON || '',
    process.env.GCS_PROJECT_ID || '',
    process.env.GCS_CLIENT_EMAIL || '',
    process.env.GCS_PRIVATE_KEY || '',
    bucketName,
  ].join('|');

  if (cached && cached.cacheKey === cacheKey) {
    return { bucket: cached.bucket, bucketName: cached.bucketName };
  }

  const credentials = resolveGcsCredentials();
  const projectId =
    process.env.GCS_PROJECT_ID || credentials.project_id || DEFAULT_PROJECT_ID;

  const storage = new Storage({
    credentials,
    projectId,
  });

  const bucket = storage.bucket(bucketName);
  cached = { cacheKey, bucket, bucketName };

  return { bucket, bucketName };
}

/**
 * Formats GCS/auth errors with actionable context (such as local clock skew).
 */
export function getGcsErrorMessage(error: unknown, fallback: string): string {
  const rawMessage = error instanceof Error ? error.message : fallback;
  if (rawMessage.includes('Invalid JWT') || rawMessage.includes('iat and exp')) {
    return `${rawMessage} — L'horloge système de cette machine est désynchronisée par rapport à l'heure UTC réelle. Synchronisez l'heure Windows (Paramètres > Heure et langue > Date et heure > Synchroniser maintenant).`;
  }
  return rawMessage;
}


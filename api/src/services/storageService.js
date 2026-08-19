import { randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  BlobSASPermissions,
  BlobServiceClient,
  SASProtocol,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} from '@azure/storage-blob';
import { config, usingAzureStorage } from '../config.js';
import { recordSasIssued, recordStorageFailure, recordUpload } from './metrics.js';
import { HttpError } from '../utils/httpError.js';

const safeExtension = (originalName = '', contentType = '') => {
  const fromName = path.extname(originalName).toLowerCase();
  if (/^\.[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  if (contentType === 'video/webm') return '.webm';
  if (contentType === 'video/quicktime') return '.mov';
  return '.mp4';
};

export const buildBlobName = (ownerAccountId, originalName, contentType) =>
  `creator-${ownerAccountId}/${randomUUID()}${safeExtension(originalName, contentType)}`;

let cachedClient = null;
let cachedCredential = null;

const azureClient = () => {
  if (cachedClient) return cachedClient;

  if (config.storage.connectionString) {
    cachedClient = BlobServiceClient.fromConnectionString(config.storage.connectionString);
    if (cachedClient.credential instanceof StorageSharedKeyCredential) {
      cachedCredential = cachedClient.credential;
    }
  } else if (config.storage.accountName && config.storage.accountKey) {
    cachedCredential = new StorageSharedKeyCredential(
      config.storage.accountName,
      config.storage.accountKey,
    );
    cachedClient = new BlobServiceClient(
      `https://${config.storage.accountName}.blob.core.windows.net`,
      cachedCredential,
    );
  } else {
    throw new HttpError(
      500,
      'Blob Storage is not configured. Set STORAGE_CONNECTION_STRING, or STORAGE_ACCOUNT and STORAGE_KEY.',
    );
  }

  return cachedClient;
};

let containerReady = null;

const containerClient = async () => {
  const client = azureClient().getContainerClient(config.storage.container);

  if (!containerReady) {
    containerReady = client.createIfNotExists().catch((error) => {
      containerReady = null;
      throw error;
    });
  }
  await containerReady;

  return client;
};

const azureAdapter = {
  name: 'azure-blob',

  async upload({ blobName, buffer, contentType }) {
    try {
      const container = await containerClient();
      const blob = container.getBlockBlobClient(blobName);
      await blob.uploadData(buffer, {
        blobHTTPHeaders: {
          blobContentType: contentType,
          blobCacheControl: 'public, max-age=31536000, immutable',
        },
      });
      recordUpload(buffer.length);
      return { blobName, sizeBytes: buffer.length };
    } catch (error) {
      recordStorageFailure();
      throw error;
    }
  },

  async playbackUrl(blobName) {
    if (!cachedClient) azureClient();
    if (!cachedCredential) {
      throw new HttpError(
        500,
        'A storage account key is required to issue playback SAS tokens.',
      );
    }

    const expiresOn = new Date(Date.now() + config.storage.playbackSasMinutes * 60 * 1000);
    const sas = generateBlobSASQueryParameters(
      {
        containerName: config.storage.container,
        blobName,
        permissions: BlobSASPermissions.parse('r'),
        protocol: SASProtocol.Https,
        startsOn: new Date(Date.now() - 5 * 60 * 1000),
        expiresOn,
      },
      cachedCredential,
    ).toString();

    recordSasIssued();
    const account = cachedCredential.accountName;
    return {
      url: `https://${account}.blob.core.windows.net/${config.storage.container}/${blobName}?${sas}`,
      expiresOn: expiresOn.toISOString(),
    };
  },

  async remove(blobName) {
    const container = await containerClient();
    await container.getBlockBlobClient(blobName).deleteIfExists();
  },
};

export const localPath = (blobName) =>
  path.resolve(process.cwd(), config.storage.localRoot, config.storage.container, blobName);

const localAdapter = {
  name: 'local-disk',

  async upload({ blobName, buffer }) {
    const target = localPath(blobName);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, buffer);
    recordUpload(buffer.length);
    return { blobName, sizeBytes: buffer.length };
  },

  async playbackUrl(blobName) {
    recordSasIssued();
    return {
      url: `/api/media/${encodeURIComponent(blobName)}`,
      expiresOn: new Date(Date.now() + config.storage.playbackSasMinutes * 60 * 1000).toISOString(),
    };
  },

  async read(blobName) {
    const target = localPath(blobName);
    const info = await stat(target);
    return { buffer: await readFile(target), sizeBytes: info.size };
  },

  async remove() {
  },
};

export const storage = usingAzureStorage() ? azureAdapter : localAdapter;

export const storageInfo = () => ({
  configured: config.storageProvider,
  active: storage.name,
  container: config.storage.container,
  playbackSasMinutes: config.storage.playbackSasMinutes,
});

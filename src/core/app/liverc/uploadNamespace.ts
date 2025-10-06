export type UploadNamespaceMetadata = {
  fileName?: string;
  fileSizeBytes?: number;
  fileHash?: string;
  lastModifiedEpochMs?: number;
  uploadedAtEpochMs?: number;
  requestId?: string;
  explicitNamespace?: string;
};

const normaliseSegment = (value: unknown) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toString();
  }

  return undefined;
};

export const buildUploadNamespaceSeed = (
  metadata: UploadNamespaceMetadata | undefined,
): string | undefined => {
  if (!metadata) {
    return undefined;
  }

  if (metadata.explicitNamespace) {
    const explicit = metadata.explicitNamespace.trim();
    if (explicit.length > 0) {
      return explicit;
    }
  }

  const segments: string[] = [];

  const hashSegment = normaliseSegment(metadata.fileHash);
  if (hashSegment) {
    segments.push(hashSegment.toLowerCase());
  }

  const sizeSegment = normaliseSegment(metadata.fileSizeBytes);
  if (sizeSegment) {
    segments.push(`size-${sizeSegment}`);
  }

  const lastModifiedSegment = normaliseSegment(metadata.lastModifiedEpochMs);
  if (lastModifiedSegment) {
    segments.push(`modified-${lastModifiedSegment}`);
  }

  const uploadedAtSegment = normaliseSegment(metadata.uploadedAtEpochMs);
  if (uploadedAtSegment) {
    segments.push(`uploaded-${uploadedAtSegment}`);
  }

  const fileNameSegment = normaliseSegment(metadata.fileName);
  if (fileNameSegment) {
    segments.push(fileNameSegment.toLowerCase());
  }

  const requestIdSegment = normaliseSegment(metadata.requestId);
  if (requestIdSegment) {
    segments.push(`req-${requestIdSegment.toLowerCase()}`);
  }

  if (segments.length === 0) {
    return undefined;
  }

  return segments.join('-');
};

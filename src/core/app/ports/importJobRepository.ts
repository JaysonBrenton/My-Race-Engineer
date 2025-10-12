export type ImportJobMode = 'SUMMARY' | 'FULL';

export type ImportJobState = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';

export type ImportJobItemTargetType = 'EVENT' | 'SESSION';

export type ImportJobItemState = ImportJobState;

export type ImportJobItemRecord = {
  id: string;
  targetType: ImportJobItemTargetType;
  targetRef: string;
  state: ImportJobItemState;
  message?: string;
  counts?: unknown;
};

export type UpdateImportJobItemInput = {
  jobId: string;
  itemId: string;
  state?: ImportJobItemState;
  message?: string | null;
  counts?: unknown;
};

export type ImportJobRecord = {
  jobId: string;
  state: ImportJobState;
  progressPct: number;
  message?: string;
  items: ImportJobItemRecord[];
};

export type CreateImportJobItemInput = {
  targetType: ImportJobItemTargetType;
  targetRef: string;
  counts?: unknown;
};

export type CreateImportJobInput = {
  planId: string;
  planHash: string;
  mode: ImportJobMode;
  items: CreateImportJobItemInput[];
};

export interface ImportJobRepository {
  createJob(input: CreateImportJobInput): Promise<{ jobId: string }>;
  getJob(jobId: string): Promise<ImportJobRecord | null>;
  takeNextQueuedJob(): Promise<ImportJobRecord | null>;
  markJobSucceeded(jobId: string): Promise<void>;
  markJobFailed(jobId: string, message: string): Promise<void>;
  updateJobProgress(jobId: string, progressPct: number): Promise<void>;
  updateJobItem(input: UpdateImportJobItemInput): Promise<void>;
}

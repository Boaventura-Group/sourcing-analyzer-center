import type {
  CreateJobRequest,
  CreateJobResponse,
  JobResultsResponse,
  JobStatus,
  JobStatusResponse,
  SupplierItemInput,
} from './types';

type StoredJob = {
  jobId: string;
  status: JobStatus;
  items: SupplierItemInput[];
};

const jobs = new Map<string, StoredJob>();
let nextJobNumber = 1;

function createJobId(): string {
  const jobId = `job_${String(nextJobNumber).padStart(6, '0')}`;
  nextJobNumber += 1;
  return jobId;
}

// Temporary Phase 2 store. D1 persistence replaces this isolated module in Phase 3.
export function createInMemoryJob(request: CreateJobRequest): CreateJobResponse {
  const jobId = createJobId();
  const job: StoredJob = {
    jobId,
    status: 'QUEUED',
    items: request.items,
  };

  jobs.set(jobId, job);

  return {
    jobId,
    status: job.status,
    itemCount: job.items.length,
  };
}

export function getInMemoryJobStatus(jobId: string): JobStatusResponse | null {
  const job = jobs.get(jobId);

  if (!job) {
    return null;
  }

  return {
    jobId: job.jobId,
    status: job.status,
    itemCount: job.items.length,
  };
}

export function getInMemoryJobResults(jobId: string): JobResultsResponse | null {
  const job = jobs.get(jobId);

  if (!job) {
    return null;
  }

  return {
    jobId: job.jobId,
    status: job.status,
    results: [],
  };
}

import { getD1JobById, updateD1JobStatus } from './d1JobStore';
import type { JobStatus } from './types';
import type { JobQueueMessage } from './jobQueue';
import { logger } from '../utils/logger';

type ProcessJobQueueResult =
  | { action: 'ignored_missing_job' }
  | { action: 'ignored_terminal_or_active'; status: Exclude<JobStatus, 'CREATED' | 'QUEUED'> }
  | { action: 'ignored_unexpected_status'; status: 'CREATED' }
  | { action: 'started_processing' };

export async function processJobQueueMessage(
  db: D1Database,
  message: JobQueueMessage,
): Promise<ProcessJobQueueResult> {
  const job = await getD1JobById(db, message.jobId);

  if (!job) {
    logger.warn('Queue message references missing job', {
      jobId: message.jobId,
      schemaVersion: message.schemaVersion,
    });
    return { action: 'ignored_missing_job' };
  }

  if (job.status === 'QUEUED') {
    await updateD1JobStatus(db, job.jobId, 'PROCESSING', 'QUEUED');
    logger.info('Job processing started', {
      jobId: job.jobId,
      schemaVersion: message.schemaVersion,
    });
    return { action: 'started_processing' };
  }

  if (job.status === 'PROCESSING' || job.status === 'COMPLETED' || job.status === 'FAILED') {
    logger.info('Queue message ignored for active or terminal job', {
      jobId: job.jobId,
      status: job.status,
      schemaVersion: message.schemaVersion,
    });
    return { action: 'ignored_terminal_or_active', status: job.status };
  }

  logger.warn('Queue message ignored for unexpected job status', {
    jobId: job.jobId,
    status: job.status,
    schemaVersion: message.schemaVersion,
  });
  return { action: 'ignored_unexpected_status', status: job.status };
}

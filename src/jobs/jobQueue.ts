export const JOB_QUEUE_SCHEMA_VERSION = 1;

export type JobQueueMessage = {
  jobId: string;
  timestamp: string;
  schemaVersion: typeof JOB_QUEUE_SCHEMA_VERSION;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseJobQueueMessage(body: unknown): JobQueueMessage | null {
  if (!isRecord(body)) {
    return null;
  }

  const { jobId, timestamp, schemaVersion } = body;

  if (
    typeof jobId !== 'string' ||
    jobId.trim().length === 0 ||
    typeof timestamp !== 'string' ||
    timestamp.trim().length === 0 ||
    schemaVersion !== JOB_QUEUE_SCHEMA_VERSION
  ) {
    return null;
  }

  return {
    jobId,
    timestamp,
    schemaVersion,
  };
}

export function createJobQueueMessage(jobId: string, now = new Date()): JobQueueMessage {
  return {
    jobId,
    timestamp: now.toISOString(),
    schemaVersion: JOB_QUEUE_SCHEMA_VERSION,
  };
}

export async function enqueueJob(queue: Queue<JobQueueMessage>, jobId: string): Promise<void> {
  await queue.send(createJobQueueMessage(jobId));
}

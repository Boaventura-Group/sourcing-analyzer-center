export const JOB_QUEUE_SCHEMA_VERSION = 1;

export type JobQueueMessage = {
  jobId: string;
  timestamp: string;
  schemaVersion: typeof JOB_QUEUE_SCHEMA_VERSION;
};

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

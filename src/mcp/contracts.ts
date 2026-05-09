import type { z } from 'zod';
import {
  createJobRequestSchema,
  createJobResponseSchema,
  jobResultsResponseSchema,
  jobStatusResponseSchema,
} from '../jobs/types';

const jobLookupInputSchema = createJobResponseSchema.pick({ jobId: true });

type McpToolContract<Input extends z.ZodType, Output extends z.ZodType> = {
  name: string;
  description: string;
  inputSchema: Input;
  outputSchema: Output;
};

export const createSourcingJobContract = {
  name: 'create_sourcing_job',
  description:
    'Create a sourcing analysis job from up to 100 supplier items supplied by the Workspace agent.',
  inputSchema: createJobRequestSchema,
  outputSchema: createJobResponseSchema,
} satisfies McpToolContract<typeof createJobRequestSchema, typeof createJobResponseSchema>;

export const getSourcingJobStatusContract = {
  name: 'get_sourcing_job_status',
  description: 'Get the current status for a sourcing analysis job.',
  inputSchema: jobLookupInputSchema,
  outputSchema: jobStatusResponseSchema,
} satisfies McpToolContract<typeof jobLookupInputSchema, typeof jobStatusResponseSchema>;

export const getSourcingJobResultsContract = {
  name: 'get_sourcing_job_results',
  description: 'Get the current results envelope for a sourcing analysis job.',
  inputSchema: jobLookupInputSchema,
  outputSchema: jobResultsResponseSchema,
} satisfies McpToolContract<typeof jobLookupInputSchema, typeof jobResultsResponseSchema>;

export const mcpToolContracts = [
  createSourcingJobContract,
  getSourcingJobStatusContract,
  getSourcingJobResultsContract,
] as const;

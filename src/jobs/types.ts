import { z } from 'zod';

export const jobStatusSchema = z.enum(['queued', 'running', 'completed', 'failed']);

export const asinSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9]{10}$/));

export const supplierItemInputSchema = z.object({
  asin: asinSchema,
  ean: z.string().trim().min(1).optional(),
  supplierTitle: z.string().trim().min(1).optional(),
  supplierCost: z.number().positive(),
  spreadsheetSalesPrice: z.number().positive().optional(),
});

export const createJobRequestSchema = z.object({
  items: z.array(supplierItemInputSchema).min(1).max(100),
});

export const createJobResponseSchema = z.object({
  jobId: z.string().min(1),
  status: jobStatusSchema,
  itemCount: z.number().int().positive(),
});

export const jobStatusResponseSchema = createJobResponseSchema;

export const jobResultsResponseSchema = z.object({
  jobId: z.string().min(1),
  status: jobStatusSchema,
  results: z.array(z.record(z.string(), z.unknown())),
});

export type JobStatus = z.infer<typeof jobStatusSchema>;
export type SupplierItemInput = z.infer<typeof supplierItemInputSchema>;
export type CreateJobRequest = z.infer<typeof createJobRequestSchema>;
export type CreateJobResponse = z.infer<typeof createJobResponseSchema>;
export type JobStatusResponse = z.infer<typeof jobStatusResponseSchema>;
export type JobResultsResponse = z.infer<typeof jobResultsResponseSchema>;

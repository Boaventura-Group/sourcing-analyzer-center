import { z } from 'zod';

export const jobStatusSchema = z.enum([
  'CREATED',
  'QUEUED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
]);

export const jobItemStatusSchema = z.enum(['CREATED', 'PROCESSING', 'COMPLETED', 'FAILED']);

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

export const publicJobResultSchema = z.object({
  asin: asinSchema,
  ean: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  supplierCost: z.number().optional(),
  packQty: z.number().int().positive().optional(),
  adjustedCost: z.number().optional(),
  spreadsheetSalesPrice: z.number().optional(),
  amazonBuyBox: z.number().optional(),
  keepaBuyBox: z.number().optional(),
  validatedSalesPrice: z.number().optional(),
  amazonFeesEstimate: z.number().optional(),
  prepFee: z.number().optional(),
  netProfit: z.number().optional(),
  roiPercent: z.number().optional(),
  keepaRating: z.number().optional(),
  keepaReviewCount: z.number().int().optional(),
  keepaBsrCurrent: z.number().int().optional(),
  keepaAvgBsr30: z.number().int().optional(),
  keepaAvgBsr90: z.number().int().optional(),
  keepaSalesRankDrops30: z.number().int().optional(),
  keepaSalesRankDrops90: z.number().int().optional(),
  keepaOfferCount: z.number().int().optional(),
  keepaSellerCount: z.number().int().optional(),
  priceStatus: z.string().min(1).optional(),
  decisionStatus: z.string().min(1).optional(),
  notes: z.array(z.string()).optional(),
}).strict();

export const jobResultsResponseSchema = z.object({
  jobId: z.string().min(1),
  status: jobStatusSchema,
  results: z.array(publicJobResultSchema),
});

export type JobStatus = z.infer<typeof jobStatusSchema>;
export type JobItemStatus = z.infer<typeof jobItemStatusSchema>;
export type SupplierItemInput = z.infer<typeof supplierItemInputSchema>;
export type CreateJobRequest = z.infer<typeof createJobRequestSchema>;
export type CreateJobResponse = z.infer<typeof createJobResponseSchema>;
export type JobStatusResponse = z.infer<typeof jobStatusResponseSchema>;
export type PublicJobResult = z.infer<typeof publicJobResultSchema>;
export type JobResultsResponse = {
  jobId: string;
  status: JobStatus;
  results: PublicJobResult[];
};

import { describe, expect, it } from 'vitest';
import {
  createSourcingJobContract,
  getSourcingJobResultsContract,
  getSourcingJobStatusContract,
  mcpToolContracts,
} from './contracts';

describe('MCP conceptual contracts', () => {
  it('exports the three Workspace agent tools', () => {
    expect(mcpToolContracts.map((contract) => contract.name)).toEqual([
      'create_sourcing_job',
      'get_sourcing_job_status',
      'get_sourcing_job_results',
    ]);
  });

  it('validates create_sourcing_job input and output shapes', () => {
    const input = createSourcingJobContract.inputSchema.parse({
      items: [{ asin: 'b000test01', supplierCost: 10 }],
    });
    const output = createSourcingJobContract.outputSchema.parse({
      jobId: 'job_000001',
      status: 'QUEUED',
      itemCount: 1,
    });

    expect(input.items[0]?.asin).toBe('B000TEST01');
    expect(output.jobId).toBe('job_000001');
  });

  it('validates status and results lookup inputs', () => {
    expect(
      getSourcingJobStatusContract.inputSchema.parse({ jobId: 'job_000001' }),
    ).toEqual({ jobId: 'job_000001' });
    expect(
      getSourcingJobResultsContract.inputSchema.parse({ jobId: 'job_000001' }),
    ).toEqual({ jobId: 'job_000001' });
  });
});

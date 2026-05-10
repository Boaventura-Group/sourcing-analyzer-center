import {
  completeJobIfDone,
  getD1JobById,
  getPendingJobItems,
  markJobItemCompleted,
  markJobItemFailed,
  markJobItemProcessing,
  refreshJobCounters,
  saveItemResult,
  updateD1JobStatus,
  type D1JobItem,
  type SaveItemResultInput,
} from './d1JobStore';
import type { JobStatus } from './types';
import type { JobQueueMessage } from './jobQueue';
import { FakeSourcingDataError, getFakeSourcingData } from './fakeSourcingData';
import {
  comparePrices,
  selectValidatedPrice,
  type ComparePricesInput,
  type SelectValidatedPriceInput,
} from '../pricing';
import {
  calculateNetProfit,
  calculateRoi,
  detectPackQty,
  type CalculateNetProfitInput,
  type DetectPackQtyInput,
} from '../profit';
import {
  durationMsSince,
  emitLogEvent,
  emitMetric,
  getErrorCode,
  getErrorMessage,
  sanitizeError,
} from '../utils/observability';

type ProcessJobQueueResult =
  | { action: 'ignored_missing_job' }
  | { action: 'ignored_terminal_job'; status: Extract<JobStatus, 'COMPLETED' | 'FAILED'> }
  | { action: 'ignored_unexpected_status'; status: 'CREATED' }
  | { action: 'processed'; processedItems: number; failedItems: number };

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function createItemResultId(jobItemId: string): string {
  return `item_result_${jobItemId}`;
}

function buildRawAmazonPricing(item: D1JobItem, amazonTitle: string | undefined, amazonBuyBox: number | undefined) {
  return {
    source: 'fake',
    asin: item.asin,
    title: amazonTitle ?? null,
    buyBoxPrice: amazonBuyBox ?? null,
  };
}

function buildRawAmazonFeesEstimate(item: D1JobItem, amazonFeesEstimate: number | undefined) {
  return {
    source: 'fake',
    asin: item.asin,
    totalFeesEstimate: amazonFeesEstimate ?? null,
  };
}

function buildRawKeepa(item: D1JobItem, keepaBuyBox: number | undefined) {
  return {
    source: 'fake',
    asin: item.asin,
    buyBoxPrice: keepaBuyBox ?? null,
  };
}

function buildItemResult(item: D1JobItem): SaveItemResultInput {
  const fakeData = getFakeSourcingData(item);
  const title = fakeData.amazonTitle?.trim() || item.supplierTitle;
  const packInput: Extract<DetectPackQtyInput, object> = {};

  if (fakeData.amazonTitle !== undefined) {
    packInput.amazonTitle = fakeData.amazonTitle;
  }

  if (item.supplierTitle !== undefined) {
    packInput.supplierTitle = item.supplierTitle;
  }

  const packQty = detectPackQty(packInput);
  const adjustedCost = roundMoney(item.supplierCost * packQty);
  const selectedPriceInput: SelectValidatedPriceInput = {};

  if (fakeData.amazonBuyBox !== undefined) {
    selectedPriceInput.amazonBuyBox = fakeData.amazonBuyBox;
  }

  if (fakeData.keepaBuyBox !== undefined) {
    selectedPriceInput.keepaBuyBox = fakeData.keepaBuyBox;
  }

  const selectedPrice = selectValidatedPrice(selectedPriceInput);
  const priceComparisonInput: ComparePricesInput = {};

  if (item.spreadsheetSalesPrice !== undefined) {
    priceComparisonInput.spreadsheetSalesPrice = item.spreadsheetSalesPrice;
  }

  if (fakeData.amazonBuyBox !== undefined) {
    priceComparisonInput.amazonBuyBox = fakeData.amazonBuyBox;
  }

  if (fakeData.keepaBuyBox !== undefined) {
    priceComparisonInput.keepaBuyBox = fakeData.keepaBuyBox;
  }

  const priceComparison = comparePrices(priceComparisonInput);
  const profitInput: CalculateNetProfitInput = { adjustedCost };

  if (selectedPrice.validatedSalesPrice !== undefined) {
    profitInput.validatedSalesPrice = selectedPrice.validatedSalesPrice;
  }

  if (fakeData.amazonFeesEstimate !== undefined) {
    profitInput.amazonFeesEstimate = fakeData.amazonFeesEstimate;
  }

  const profit = calculateNetProfit(profitInput);
  const notes = [...selectedPrice.notes, ...priceComparison.notes, ...profit.notes];
  const result: SaveItemResultInput = {
    id: createItemResultId(item.id),
    jobId: item.jobId,
    jobItemId: item.id,
    asin: item.asin,
    packQty,
    supplierCost: item.supplierCost,
    adjustedCost,
    prepFee: profit.prepFee,
    priceStatus: selectedPrice.priceStatus,
    decisionStatus: profit.decisionStatus,
    notes,
    rawAmazonPricing: buildRawAmazonPricing(item, fakeData.amazonTitle, fakeData.amazonBuyBox),
    rawAmazonFeesEstimate: buildRawAmazonFeesEstimate(item, fakeData.amazonFeesEstimate),
    rawKeepa: buildRawKeepa(item, fakeData.keepaBuyBox),
  };

  if (item.ean !== undefined) {
    result.ean = item.ean;
  }

  if (title !== undefined) {
    result.title = title;
  }

  if (item.spreadsheetSalesPrice !== undefined) {
    result.spreadsheetSalesPrice = item.spreadsheetSalesPrice;
  }

  if (fakeData.amazonBuyBox !== undefined) {
    result.amazonBuyBox = fakeData.amazonBuyBox;
  }

  if (fakeData.keepaBuyBox !== undefined) {
    result.keepaBuyBox = fakeData.keepaBuyBox;
  }

  if (selectedPrice.validatedSalesPrice !== undefined) {
    result.validatedSalesPrice = selectedPrice.validatedSalesPrice;
  }

  if (fakeData.amazonFeesEstimate !== undefined) {
    result.amazonFeesEstimate = fakeData.amazonFeesEstimate;
  }

  if (profit.status === 'OK') {
    result.netProfit = profit.netProfit;
    const roi = calculateRoi({
      netProfit: profit.netProfit,
      adjustedCost,
    });

    notes.push(...roi.notes);

    if (roi.status === 'OK') {
      result.roiPercent = roi.roiPercent;
    }
  }

  if (fakeData.keepaRating !== undefined) {
    result.keepaRating = fakeData.keepaRating;
  }

  if (fakeData.keepaReviewCount !== undefined) {
    result.keepaReviewCount = fakeData.keepaReviewCount;
  }

  if (fakeData.keepaBsrCurrent !== undefined) {
    result.keepaBsrCurrent = fakeData.keepaBsrCurrent;
  }

  if (fakeData.keepaAvgBsr30 !== undefined) {
    result.keepaAvgBsr30 = fakeData.keepaAvgBsr30;
  }

  if (fakeData.keepaAvgBsr90 !== undefined) {
    result.keepaAvgBsr90 = fakeData.keepaAvgBsr90;
  }

  if (fakeData.keepaSalesRankDrops30 !== undefined) {
    result.keepaSalesRankDrops30 = fakeData.keepaSalesRankDrops30;
  }

  if (fakeData.keepaSalesRankDrops90 !== undefined) {
    result.keepaSalesRankDrops90 = fakeData.keepaSalesRankDrops90;
  }

  if (fakeData.keepaOfferCount !== undefined) {
    result.keepaOfferCount = fakeData.keepaOfferCount;
  }

  if (fakeData.keepaSellerCount !== undefined) {
    result.keepaSellerCount = fakeData.keepaSellerCount;
  }

  return result;
}

function getItemErrorMessage(error: unknown): string {
  if (error instanceof FakeSourcingDataError) {
    return error.message;
  }

  return 'Item processing failed';
}

export async function processJobQueueMessage(
  db: D1Database,
  message: JobQueueMessage,
): Promise<ProcessJobQueueResult> {
  const startedAtMs = Date.now();

  try {
    const job = await getD1JobById(db, message.jobId);

    if (!job) {
      emitLogEvent('job_processing_ignored', {
        stage: 'job_processing',
        jobId: message.jobId,
        schemaVersion: message.schemaVersion,
        reason: 'missing_job',
      });
      emitMetric({
        name: 'jobs_ignored',
        value: 1,
        dimensions: { reason: 'missing_job' },
        jobId: message.jobId,
      });
      return { action: 'ignored_missing_job' };
    }

    if (job.status === 'COMPLETED' || job.status === 'FAILED') {
      emitLogEvent('job_processing_ignored', {
        stage: 'job_processing',
        jobId: job.jobId,
        status: job.status,
        schemaVersion: message.schemaVersion,
        reason: 'terminal_job',
      });
      emitMetric({
        name: 'jobs_ignored',
        value: 1,
        dimensions: { reason: 'terminal_job', status: job.status },
        jobId: job.jobId,
      });
      return { action: 'ignored_terminal_job', status: job.status };
    }

    if (job.status === 'CREATED') {
      emitLogEvent('job_processing_ignored', {
        stage: 'job_processing',
        jobId: job.jobId,
        status: job.status,
        schemaVersion: message.schemaVersion,
        reason: 'unexpected_status',
      });
      emitMetric({
        name: 'jobs_ignored',
        value: 1,
        dimensions: { reason: 'unexpected_status', status: job.status },
        jobId: job.jobId,
      });
      return { action: 'ignored_unexpected_status', status: job.status };
    }

    if (job.status === 'QUEUED') {
      await updateD1JobStatus(db, job.jobId, 'PROCESSING', 'QUEUED');
    }

    emitLogEvent('job_processing_started', {
      stage: 'job_processing',
      jobId: job.jobId,
      status: 'PROCESSING',
      schemaVersion: message.schemaVersion,
    });

    const pendingItems = await getPendingJobItems(db, job.jobId);
    let processedItems = 0;
    let failedItems = 0;
    let profitableItems = 0;
    let priceMismatchReviewCount = 0;
    let noBuyboxCount = 0;
    let missingFeesCount = 0;

    for (const item of pendingItems) {
      await markJobItemProcessing(db, item.id);

      let result: SaveItemResultInput;

      try {
        result = buildItemResult(item);
      } catch (error) {
        const errorMessage = getItemErrorMessage(error);
        await markJobItemFailed(db, item.id, errorMessage);
        failedItems += 1;
        emitLogEvent('job_item_failed', {
          stage: 'job_processing',
          jobId: job.jobId,
          jobItemId: item.id,
          asin: item.asin,
          status: 'FAILED',
          errorCode: getErrorCode(error),
          errorMessage,
        }, 'warn');
        continue;
      }

      await saveItemResult(db, result);
      await markJobItemCompleted(db, item.id);
      processedItems += 1;
      if (result.decisionStatus === 'PROFIT_POSITIVE') {
        profitableItems += 1;
      }

      if (result.priceStatus === 'BUYBOX_MISMATCH_REVIEW') {
        priceMismatchReviewCount += 1;
      }

      if (result.decisionStatus === 'SKIPPED_NO_BUYBOX') {
        noBuyboxCount += 1;
      }

      if (result.decisionStatus === 'SKIPPED_NO_FEES') {
        missingFeesCount += 1;
      }

      emitLogEvent('job_item_processed', {
        stage: 'job_processing',
        jobId: job.jobId,
        jobItemId: item.id,
        asin: item.asin,
        status: result.decisionStatus,
        decisionStatus: result.decisionStatus,
        priceStatus: result.priceStatus,
      });
    }

    await refreshJobCounters(db, job.jobId);
    await completeJobIfDone(db, job.jobId);
    const durationMs = durationMsSince(startedAtMs);
    const finalizedItems = processedItems + failedItems;
    emitLogEvent('job_processing_completed', {
      stage: 'job_processing',
      jobId: job.jobId,
      status: 'COMPLETED',
      durationMs,
      processedItems: finalizedItems,
      profitableItems,
      errorItems: failedItems,
    });
    emitMetric({ name: 'jobs_completed', value: 1, jobId: job.jobId });
    emitMetric({ name: 'queue_messages_processed', value: 1, jobId: job.jobId });
    emitMetric({ name: 'items_processed', value: finalizedItems, jobId: job.jobId });
    emitMetric({ name: 'processing_duration_ms', value: durationMs, jobId: job.jobId });

    if (failedItems > 0) {
      emitMetric({ name: 'items_failed', value: failedItems, jobId: job.jobId });
    }

    if (profitableItems > 0) {
      emitMetric({ name: 'items_profitable', value: profitableItems, jobId: job.jobId });
    }

    if (priceMismatchReviewCount > 0) {
      emitMetric({
        name: 'price_mismatch_review_count',
        value: priceMismatchReviewCount,
        jobId: job.jobId,
      });
    }

    if (noBuyboxCount > 0) {
      emitMetric({ name: 'no_buybox_count', value: noBuyboxCount, jobId: job.jobId });
    }

    if (missingFeesCount > 0) {
      emitMetric({ name: 'missing_fees_count', value: missingFeesCount, jobId: job.jobId });
    }

    return { action: 'processed', processedItems, failedItems };
  } catch (error) {
    emitLogEvent('job_processing_retryable_error', {
      stage: 'job_processing',
      jobId: message.jobId,
      schemaVersion: message.schemaVersion,
      errorCode: getErrorCode(error),
      errorMessage: getErrorMessage(error),
      error: sanitizeError(error),
    }, 'error');
    emitMetric({
      name: 'queue_messages_retryable_error',
      value: 1,
      jobId: message.jobId,
    });
    throw error;
  }
}

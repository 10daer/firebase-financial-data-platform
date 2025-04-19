import axios, {AxiosRequestConfig, AxiosResponse} from "axios";
import {logger} from "./logger";

/**
 * Wrapper for axios API requests with retry logic
 *
 * @param config Axios request configuration
 * @param retries Number of retry attempts (default: 3)
 * @param retryDelay Delay between retries in ms (default: 1000)
 * @return Promise with axios response
 */
export async function apiRequest<T = any>(
  config: AxiosRequestConfig,
  retries = 3,
  retryDelay = 1000
): Promise<AxiosResponse<T>> {
  try {
    return await axios(config);
  } catch (error: any) {
    // Check if we should retry
    if (retries > 0 && shouldRetry(error)) {
      logger.warn(
        `API request failed, retrying (${retries} attempts left):`,
        error.message
      );

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, retryDelay));

      // Retry with one less retry attempt
      return apiRequest(config, retries - 1, retryDelay * 1.5);
    }

    // Log the error and rethrow
    logger.error("API request failed after retries:", error);
    throw error;
  }
}

/**
 * Determines whether to retry an API request based on the error
 *
 * @param error Error from axios request
 * @return Boolean indicating whether to retry
 */
function shouldRetry(error: any): boolean {
  // Retry on network errors
  if (!error.response) {
    return true;
  }

  // Retry on rate limiting (429) or server errors (500+)
  const status = error.response.status;
  return status === 429 || status >= 500;
}

/**
 * Batches API requests to avoid rate limiting
 *
 * @param requests Array of request configurations
 * @param batchSize Number of requests to make in parallel (default: 3)
 * @param delayBetweenBatches Delay between batches in ms (default: 1000)
 * @return Array of responses
 */
export async function batchRequests<T = any>(
  requests: AxiosRequestConfig[],
  batchSize = 3,
  delayBetweenBatches = 1000
): Promise<Array<AxiosResponse<T> | null>> {
  const results: Array<AxiosResponse<T> | null> = [];

  // Process requests in batches
  for (let i = 0; i < requests.length; i += batchSize) {
    const batch = requests.slice(i, i + batchSize);

    // Process this batch in parallel
    const batchResults = await Promise.all(
      batch.map((req) =>
        apiRequest<T>(req).catch((error) => {
          logger.error(
            `Error in batch request ${i + batch.indexOf(req) + 1}:`,
            error
          );
          return null;
        })
      )
    );

    results.push(...batchResults);

    // Wait before the next batch if there are more requests
    if (i + batchSize < requests.length) {
      await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches));
    }
  }

  return results;
}

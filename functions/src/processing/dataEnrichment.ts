import { logger } from "../utils/logger";

interface EnrichedStockData {
  symbol: string;
  price: number;
  change: number;
  changePercent: string;
  volume: number;
  averageVolume?: number;
  volumeRatio?: number;
  relativeStrength?: number;
  momentum?: number;
  recentNews?: Array<{
    title: string;
    sentiment: number;
    date: string;
  }>;
}

/**
 * Enhances raw stock data with calculated metrics
 *
 * @param stockData Raw stock quote data
 * @param historicalData Optional historical data for calculations
 * @return Enriched stock data with additional metrics
 */
export function enrichStockData(
  stockData: any,
  historicalData?: any[]
): EnrichedStockData {
  try {
    // Start with base stock data
    const enriched: EnrichedStockData = {
      symbol: stockData.symbol,
      price: stockData.price,
      change: stockData.change,
      changePercent: stockData.changePercent,
      volume: stockData.volume,
    };

    // Add volume ratio if we have average volume data
    if (historicalData && historicalData.length > 0) {
      // Calculate average volume from historical data
      const averageVolume =
        historicalData
          .map((day) => day.volume)
          .reduce((sum, vol) => sum + vol, 0) / historicalData.length;

      enriched.averageVolume = averageVolume;
      enriched.volumeRatio = stockData.volume / averageVolume;

      // Calculate relative strength (current price vs average price over period)
      const averagePrice =
        historicalData
          .map((day) => day.close)
          .reduce((sum, price) => sum + price, 0) / historicalData.length;

      enriched.relativeStrength = stockData.price / averagePrice;

      // Calculate momentum (rate of price change)
      if (historicalData.length >= 10) {
        const priceNow = stockData.price;
        const price10DaysAgo = historicalData[historicalData.length - 10].close;
        enriched.momentum = (priceNow - price10DaysAgo) / price10DaysAgo;
      }
    }

    return enriched;
  } catch (error) {
    logger.error("Error enriching stock data:", error);
    // Return original data on error
    return {
      symbol: stockData.symbol,
      price: stockData.price,
      change: stockData.change,
      changePercent: stockData.changePercent,
      volume: stockData.volume,
    };
  }
}

/**
 * Correlates news with market movements to identify potential causal relationships
 *
 * @param stockData Stock price data
 * @param newsData Recent news articles
 * @return Correlation indicators
 */
export function correlateNewsWithMarketMovements(
  stockData: any,
  newsData: any[]
): { newsImpact: number; significantArticles: any[] } {
  // This is a simplified placeholder - in a real system, this would be more sophisticated

  // Filter news to those related to this stock
  const relevantNews = newsData.filter(
    (article) =>
      (article.tickers && article.tickers.includes(stockData.symbol)) ||
      article.title.includes(stockData.symbol) ||
      (article.description && article.description.includes(stockData.symbol))
  );

  // Sort by date (newest first)
  relevantNews.sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  // For each article, check if it coincides with significant price moves
  const significantArticles = relevantNews.map((article) => {
    const articleSentiment = article.sentimentScore || 0;

    // Simple correlation metric between sentiment and price change
    // In a real system, you'd do time-series analysis
    const sentimentPriceAlignment =
      (articleSentiment > 0 && stockData.change > 0) ||
      (articleSentiment < 0 && stockData.change < 0);

    return {
      ...article,
      possibleImpact: sentimentPriceAlignment ? "aligned" : "contrary",
      impactScore: Math.abs(articleSentiment) * Math.abs(stockData.change),
    };
  });

  // Calculate overall news impact score
  const newsImpact =
    significantArticles.length > 0
      ? significantArticles.reduce(
          (sum, article) => sum + article.impactScore,
          0
        ) / significantArticles.length
      : 0;

  return {
    newsImpact,
    significantArticles: significantArticles.slice(0, 5), // Return top 5 most significant
  };
}

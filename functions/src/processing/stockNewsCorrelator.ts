import { logger } from "../utils/logger";

interface NewsArticle {
  title: string;
  description: string;
  url: string;
  publishedAt: string;
  source: {
    name: string;
  };
  sentimentScore?: number;
  [key: string]: any;
}

/**
 * Identifies stocks mentioned in news articles
 *
 * @param newsArticles Collection of news articles to analyze
 * @param stockSymbols List of stock symbols to search for
 * @return Articles with associated stock tickers
 */
export function identifyStocksInNews(
  newsArticles: NewsArticle[],
  stockSymbols: string[]
): NewsArticle[] {
  try {
    // Process each article to find stock mentions
    return newsArticles.map((article) => {
      const articleCopy = { ...article };
      const mentionedStocks: string[] = [];

      // Search for stock symbols in title and description
      const searchText =
        `${article.title} ${article.description}`.toUpperCase();

      stockSymbols.forEach((symbol) => {
        // Check for exact symbol match with word boundaries
        const symbolRegex = new RegExp(`\\b${symbol}\\b`, "g");
        if (symbolRegex.test(searchText)) {
          mentionedStocks.push(symbol);
        }
      });

      // Also look for common stock name mentions (would be expanded in production)
      const companyNames: { [key: string]: string } = {
        APPLE: "AAPL",
        MICROSOFT: "MSFT",
        AMAZON: "AMZN",
        GOOGLE: "GOOGL",
        ALPHABET: "GOOGL",
        FACEBOOK: "META",
        "META PLATFORMS": "META",
        TESLA: "TSLA",
        NVIDIA: "NVDA",
      };

      Object.entries(companyNames).forEach(([company, symbol]) => {
        if (searchText.includes(company) && !mentionedStocks.includes(symbol)) {
          mentionedStocks.push(symbol);
        }
      });

      // Add the tickers to the article
      if (mentionedStocks.length > 0) {
        articleCopy.tickers = mentionedStocks;
      }

      return articleCopy;
    });
  } catch (error) {
    logger.error("Error identifying stocks in news:", error);
    return newsArticles;
  }
}

/**
 * Groups news articles by mentioned stock ticker
 *
 * @param newsArticles Articles with identified stock tickers
 * @return Map of stock tickers to related articles
 */
export function groupNewsByStock(
  newsArticles: NewsArticle[]
): Record<string, NewsArticle[]> {
  const stockNewsMap: Record<string, NewsArticle[]> = {};

  // Process each article
  newsArticles.forEach((article) => {
    if (article.tickers && article.tickers.length > 0) {
      // Add article to each mentioned ticker's collection
      article.tickers.forEach((ticker: string) => {
        if (!stockNewsMap[ticker]) {
          stockNewsMap[ticker] = [];
        }
        stockNewsMap[ticker].push(article);
      });
    }
  });

  // Sort each stock's news by date (newest first)
  Object.keys(stockNewsMap).forEach((ticker) => {
    stockNewsMap[ticker].sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
  });

  return stockNewsMap;
}

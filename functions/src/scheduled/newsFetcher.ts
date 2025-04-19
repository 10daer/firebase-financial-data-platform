import axios from "axios";
import { onSchedule, ScheduledEvent } from "firebase-functions/scheduler";
import { processSentiment } from "../processing/sentimentAnalysis";
import { storeNewsData } from "../storage/firestoreOperations";
import { generateNewsJsonFile } from "../storage/jsonFileGenerator";
import { logger } from "../utils/logger";

// News API configuration
const NEWS_API_KEY = process.env.NEWS_API_KEY || "";
const NEWS_API_URL = "https://newsapi.org/v2/everything";

interface NewsArticle {
  source: {
    id: string | null;
    name: string;
  };
  author: string | null;
  title: string;
  description: string;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  content: string;
}

interface NewsApiResponse {
  status: string;
  totalResults: number;
  articles: NewsArticle[];
}

interface EnrichedNewsArticle extends NewsArticle {
  tickers?: string[];
  sentimentScore?: number;
  relevanceScore?: number;
}

/**
 * Fetches financial news from NewsAPI.org
 * Scheduled to run every hour
 */
export const fetchNewsScheduledFunction = onSchedule(
  "every 60 minutes",
  async (context: ScheduledEvent): Promise<void> => {
    try {
      logger.info("Starting scheduled news fetch");

      // List of financial keywords to search for
      const financialKeywords = [
        "stock market",
        "earnings",
        "financial results",
        "quarterly report",
        "investor",
        "trading",
        "shares",
      ];

      // Fetch news for each keyword
      const allNewsArticles: EnrichedNewsArticle[] = [];

      for (const keyword of financialKeywords) {
        logger.info(`Fetching news for keyword: ${keyword}`);

        const response = await axios.get<NewsApiResponse>(NEWS_API_URL, {
          params: {
            q: keyword,
            apiKey: NEWS_API_KEY,
            language: "en",
            sortBy: "publishedAt",
            pageSize: 20,
          },
        });

        if (response.data.status !== "ok") {
          logger.error(
            `News API error for keyword ${keyword}: ${response.data.status}`
          );
          continue;
        }

        // Add to collection, avoiding duplicates
        for (const article of response.data.articles) {
          if (
            !allNewsArticles.some(
              (existingArticle) => existingArticle.url === article.url
            )
          ) {
            allNewsArticles.push(article);
          }
        }
      }

      logger.info(`Fetched ${allNewsArticles.length} unique news articles`);

      // Process each article for sentiment and relevance
      const enrichedArticles = await Promise.all(
        allNewsArticles.map(async (article) => {
          // Perform sentiment analysis
          const sentimentScore = await processSentiment(
            article.title + " " + article.description
          );

          // Extract potential stock tickers - simple regex for demonstration
          const tickerRegex = /\$([A-Z]{1,5})\b/g;
          const content =
            article.title +
            " " +
            article.description +
            " " +
            (article.content || "");
          const tickers = [
            ...new Set(Array.from(content.matchAll(tickerRegex), (m) => m[1])),
          ];

          // Calculate simple relevance score (0-1)
          const relevanceScore =
            (article.title.toLowerCase().includes("stock") ? 0.3 : 0) +
            (article.title.toLowerCase().includes("market") ? 0.2 : 0) +
            (tickers.length > 0 ? 0.5 : 0);

          return {
            ...article,
            sentimentScore,
            tickers: tickers.length > 0 ? tickers : undefined,
            relevanceScore,
          };
        })
      );

      // Filter out low relevance articles
      const relevantArticles = enrichedArticles.filter(
        (article) =>
          (article.relevanceScore && article.relevanceScore >= 0.2) ||
          article.tickers
      );

      logger.info(
        `Processed ${relevantArticles.length} relevant financial news articles`
      );

      // Store in Firestore
      await storeNewsData(relevantArticles);

      // Generate static JSON files for Webflow
      await generateNewsJsonFile(relevantArticles);

      logger.info("Completed scheduled news fetch");
      return;
    } catch (error) {
      logger.error("Error in news fetch function:", error);
      throw error;
    }
  }
);

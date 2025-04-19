import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";
import {logger} from "../utils/logger";

// Initialize Firebase if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const storage = admin.storage();
const bucket = storage.bucket();

/**
 * Generates a static JSON file for news data
 *
 * @param newsArticles Processed news articles to store
 */
export async function generateNewsJsonFile(newsArticles: any[]): Promise<void> {
  try {
    // Prepare data for the JSON file
    const today = new Date().toISOString().split("T")[0];
    const jsonData = {
      generated: new Date().toISOString(),
      date: today,
      articles: newsArticles.map((article) => ({
        title: article.title,
        description: article.description,
        source: article.source.name,
        url: article.url,
        publishedAt: article.publishedAt,
        sentiment: article.sentimentScore || 0,
        tickers: article.tickers || [],
      })),
    };

    // Create a temporary local file
    const tempFilePath = path.join("/tmp", `news-${today}.json`);
    fs.writeFileSync(tempFilePath, JSON.stringify(jsonData, null, 2));

    // Upload to Firebase Storage
    await bucket.upload(tempFilePath, {
      destination: `json/news-${today}.json`,
      metadata: {
        contentType: "application/json",
        cacheControl: "public, max-age=3600", // Cache for 1 hour
      },
    });

    // Also update the "latest" file for easy access
    await bucket.upload(tempFilePath, {
      destination: "json/latest-news.json",
      metadata: {
        contentType: "application/json",
        cacheControl: "public, max-age=1800", // Cache for 30 minutes
      },
    });

    // Clean up temporary file
    fs.unlinkSync(tempFilePath);

    logger.info(`Generated and uploaded news JSON file for ${today}`);
  } catch (error) {
    logger.error("Error generating news JSON file:", error);
    throw error;
  }
}

/**
 * Generates a static JSON file for market data
 *
 * @param marketData Processed market data to store
 */
export async function generateMarketDataJsonFile(
  marketData: any[]
): Promise<void> {
  try {
    // Prepare data for the JSON file
    const today = new Date().toISOString().split("T")[0];
    const jsonData = {
      generated: new Date().toISOString(),
      date: today,
      stocks: marketData.map((quote) => ({
        symbol: quote.symbol,
        price: quote.price,
        change: quote.change,
        changePercent: quote.changePercent,
        volume: quote.volume,
        previousClose: quote.previousClose,
        latestTradingDay: quote.latestTradingDay,
      })),
    };

    // Create a temporary local file
    const tempFilePath = path.join("/tmp", `market-data-${today}.json`);
    fs.writeFileSync(tempFilePath, JSON.stringify(jsonData, null, 2));

    // Upload to Firebase Storage
    await bucket.upload(tempFilePath, {
      destination: `json/market-data-${today}.json`,
      metadata: {
        contentType: "application/json",
        cacheControl: "public, max-age=3600", // Cache for 1 hour
      },
    });

    // Also update the "latest" file for easy access
    await bucket.upload(tempFilePath, {
      destination: "json/latest-market-data.json",
      metadata: {
        contentType: "application/json",
        cacheControl: "public, max-age=1800", // Cache for 30 minutes
      },
    });

    // Clean up temporary file
    fs.unlinkSync(tempFilePath);

    logger.info(`Generated and uploaded market data JSON file for ${today}`);
  } catch (error) {
    logger.error("Error generating market data JSON file:", error);
    throw error;
  }
}

/**
 * Generates a static JSON file for options data
 *
 * @param optionsData Processed options data to store
 */
export async function generateOptionsDataJsonFile(
  optionsData: any[]
): Promise<void> {
  try {
    // Group options by underlying ticker
    const optionsByTicker: Record<string, any[]> = {};

    optionsData.forEach((contract) => {
      if (!optionsByTicker[contract.underlying]) {
        optionsByTicker[contract.underlying] = [];
      }
      optionsByTicker[contract.underlying].push(contract);
    });

    // Prepare data for the JSON file
    const today = new Date().toISOString().split("T")[0];
    const jsonData = {
      generated: new Date().toISOString(),
      date: today,
      underlyings: Object.keys(optionsByTicker).map((ticker) => ({
        symbol: ticker,
        expirations: [
          ...new Set(
            optionsByTicker[ticker].map((contract) => contract.expiration)
          ),
        ],
        contractCount: optionsByTicker[ticker].length,
      })),
    };

    // Create a temporary local file
    const tempFilePath = path.join("/tmp", `options-summary-${today}.json`);
    fs.writeFileSync(tempFilePath, JSON.stringify(jsonData, null, 2));

    // Upload to Firebase Storage
    await bucket.upload(tempFilePath, {
      destination: `json/options-summary-${today}.json`,
      metadata: {
        contentType: "application/json",
        cacheControl: "public, max-age=3600", // Cache for 1 hour
      },
    });

    // Also update the "latest" file for easy access
    await bucket.upload(tempFilePath, {
      destination: "json/latest-options-summary.json",
      metadata: {
        contentType: "application/json",
        cacheControl: "public, max-age=1800", // Cache for 30 minutes
      },
    });

    // Generate individual files for each ticker
    for (const [ticker, contracts] of Object.entries(optionsByTicker)) {
      // Group by expiration
      const contractsByExpiration: Record<string, any> = {};

      contracts.forEach((contract) => {
        if (!contractsByExpiration[contract.expiration]) {
          contractsByExpiration[contract.expiration] = {
            calls: [],
            puts: [],
          };
        }

        if (contract.type === "call") {
          contractsByExpiration[contract.expiration].calls.push(contract);
        } else {
          contractsByExpiration[contract.expiration].puts.push(contract);
        }
      });

      // Sort by strike price
      Object.values(contractsByExpiration).forEach(({calls, puts}) => {
        calls.sort((a: any, b: any) => a.strike - b.strike);
        puts.sort((a: any, b: any) => a.strike - b.strike);
      });

      const tickerData = {
        symbol: ticker,
        generated: new Date().toISOString(),
        expirations: contractsByExpiration,
      };

      // Create a temporary file for this ticker
      const tickerFilePath = path.join(
        "/tmp",
        `options-${ticker}-${today}.json`
      );
      fs.writeFileSync(tickerFilePath, JSON.stringify(tickerData, null, 2));

      // Upload to Firebase Storage
      await bucket.upload(tickerFilePath, {
        destination: `json/options-${ticker}-${today}.json`,
        metadata: {
          contentType: "application/json",
          cacheControl: "public, max-age=3600", // Cache for 1 hour
        },
      });

      // Also update the "latest" file for this ticker
      await bucket.upload(tickerFilePath, {
        destination: `json/latest-options-${ticker}.json`,
        metadata: {
          contentType: "application/json",
          cacheControl: "public, max-age=1800", // Cache for 30 minutes
        },
      });

      // Clean up temporary file
      fs.unlinkSync(tickerFilePath);
    }

    // Clean up summary temporary file
    fs.unlinkSync(tempFilePath);

    logger.info(
      `Generated and uploaded options data JSON files for ${
        Object.keys(optionsByTicker).length
      } tickers`
    );
  } catch (error) {
    logger.error("Error generating options data JSON file:", error);
    throw error;
  }
}

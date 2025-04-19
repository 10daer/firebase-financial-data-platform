import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "../utils/logger";

// Initialize Firebase if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const today = new Date().toISOString().split("T")[0];

/**
 * Stores news data in Firestore database
 *
 * @param newsArticles Processed news articles to store
 */
export async function generateNewsJsonFile(newsArticles: any[]): Promise<void> {
  try {
    const batch = db.batch();

    // Create a "news" collection with today's date document
    const newsRef = db.collection("news").doc(today);

    batch.set(newsRef, {
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
    });

    // Create a "latest-news" document for easy access
    const latestNewsRef = db.collection("news").doc("latest");
    batch.set(latestNewsRef, {
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
    });

    // Store articles by ticker for easier access
    const tickerArticles: Record<string, any[]> = {};

    newsArticles.forEach((article) => {
      if (article.tickers && article.tickers.length > 0) {
        article.tickers.forEach((ticker: string) => {
          if (!tickerArticles[ticker]) {
            tickerArticles[ticker] = [];
          }
          tickerArticles[ticker].push(article);
        });
      }
    });

    // Add ticker-specific news documents
    Object.keys(tickerArticles).forEach((ticker) => {
      const tickerNewsRef = db.collection("ticker-news").doc(ticker);
      batch.set(tickerNewsRef, {
        updated: new Date().toISOString(),
        ticker: ticker,
        articles: tickerArticles[ticker].map((article) => ({
          title: article.title,
          description: article.description,
          source: article.source.name,
          url: article.url,
          publishedAt: article.publishedAt,
          sentiment: article.sentimentScore || 0,
        })),
      });
    });

    await batch.commit();
    logger.info(`Stored news data in Firestore for ${today}`);
  } catch (error) {
    logger.error("Error storing news in Firestore:", error);
    throw error;
  }
}

/**
 * Stores market data in Firestore database
 *
 * @param marketData Processed market data to store
 */
export async function generateMarketDataJsonFile(
  marketData: any[]
): Promise<void> {
  try {
    const batch = db.batch();

    // Create "market-data" collection with today's date document
    const marketDataRef = db.collection("market-data").doc(today);

    batch.set(marketDataRef, {
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
    });

    // Create "latest-market-data" document for easy access
    const latestMarketDataRef = db.collection("market-data").doc("latest");
    batch.set(latestMarketDataRef, {
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
    });

    // Store individual stock data in separate documents
    marketData.forEach((quote) => {
      const stockRef = db.collection("stocks").doc(quote.symbol);
      batch.set(
        stockRef,
        {
          updated: new Date().toISOString(),
          symbol: quote.symbol,
          price: quote.price,
          change: quote.change,
          changePercent: quote.changePercent,
          volume: quote.volume,
          previousClose: quote.previousClose,
          latestTradingDay: quote.latestTradingDay,
          historicalData: FieldValue.arrayUnion({
            date: today,
            price: quote.price,
            volume: quote.volume,
          }),
        },
        { merge: true }
      );
    });

    await batch.commit();
    logger.info(`Stored market data in Firestore for ${today}`);
  } catch (error) {
    logger.error("Error storing market data in Firestore:", error);
    throw error;
  }
}

/**
 * Stores options data in Firestore database
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

    // Store options summary for all tickers
    const summaryRef = db.collection("options-summary").doc(today);
    await summaryRef.set({
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
    });

    // Also store latest options summary
    const latestSummaryRef = db.collection("options-summary").doc("latest");
    await latestSummaryRef.set({
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
    });

    // Store individual ticker option chains
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
      Object.values(contractsByExpiration).forEach(({ calls, puts }) => {
        calls.sort((a: any, b: any) => a.strike - b.strike);
        puts.sort((a: any, b: any) => a.strike - b.strike);
      });

      const tickerData = {
        symbol: ticker,
        generated: new Date().toISOString(),
        date: today,
        expirations: contractsByExpiration,
      };

      // Store in Firestore
      const optionsRef = db.collection("options").doc(ticker);
      await optionsRef.set(tickerData);

      // Also store a record in the historical options collection
      const historicalRef = db
        .collection("historical-options")
        .doc(`${ticker}-${today}`);
      await historicalRef.set(tickerData);
    }

    logger.info(
      `Stored options data in Firestore for ${
        Object.keys(optionsByTicker).length
      } tickers`
    );
  } catch (error) {
    logger.error("Error storing options data in Firestore:", error);
    throw error;
  }
}

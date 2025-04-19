import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { logger } from "../utils/logger";

// Initialize Firebase Admin if not already initialized
if (!(global as any).firebaseInitialized) {
  initializeApp();
  (global as any).firebaseInitialized = true;
}

const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

/**
 * Stores processed news articles in Firestore
 *
 * @param newsArticles Array of processed news articles
 */
export async function storeNewsData(newsArticles: any[]): Promise<void> {
  try {
    const batch = db.batch();
    const newsCollection = db.collection("news");

    // Group news by date for better retrieval
    const today = new Date().toISOString().split("T")[0];
    const newsDocRef = newsCollection.doc(today);

    // Store as a single document with an array of articles
    batch.set(
      newsDocRef,
      {
        date: today,
        articles: newsArticles,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // Also store by ticker for stock-specific queries
    const newsByTicker: Record<string, any[]> = {};

    newsArticles.forEach((article) => {
      if (article.tickers && article.tickers.length > 0) {
        article.tickers.forEach((ticker: string) => {
          if (!newsByTicker[ticker]) {
            newsByTicker[ticker] = [];
          }
          newsByTicker[ticker].push(article);
        });
      }
    });

    // Store ticker-specific news
    for (const [ticker, articles] of Object.entries(newsByTicker)) {
      const tickerNewsRef = db.collection("tickerNews").doc(ticker);
      batch.set(
        tickerNewsRef,
        {
          ticker,
          articles: articles.slice(0, 20), // Limit to 20 most recent articles
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    await batch.commit();
    logger.info(`Stored ${newsArticles.length} news articles in Firestore`);
  } catch (error) {
    logger.error("Error storing news data in Firestore:", error);
    throw error;
  }
}

/**
 * Stores market data for stocks in Firestore
 *
 * @param marketData Array of stock quotes
 */
export async function storeMarketData(marketData: any[]): Promise<void> {
  try {
    const batch = db.batch();

    // Store latest market data by ticker
    marketData.forEach((stockQuote) => {
      const tickerRef = db.collection("marketData").doc(stockQuote.symbol);

      batch.set(tickerRef, {
        ...stockQuote,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Also store in historical collection for time series
      const historyRef = tickerRef
        .collection("history")
        .doc(stockQuote.latestTradingDay);
      batch.set(historyRef, {
        ...stockQuote,
        date: stockQuote.latestTradingDay,
      });
    });

    // Create a summary document with all tickers
    const summaryRef = db.collection("marketData").doc("summary");
    batch.set(summaryRef, {
      lastUpdated: FieldValue.serverTimestamp(),
      tickers: marketData.map((quote) => ({
        symbol: quote.symbol,
        price: quote.price,
        change: quote.change,
        changePercent: quote.changePercent,
      })),
    });

    await batch.commit();
    logger.info(
      `Stored market data for ${marketData.length} stocks in Firestore`
    );
  } catch (error) {
    logger.error("Error storing market data in Firestore:", error);
    throw error;
  }
}

/**
 * Stores options chain data in Firestore
 *
 * @param optionsData Array of options contracts
 */
export async function storeOptionsData(optionsData: any[]): Promise<void> {
  try {
    const batch = db.batch();

    // Group options by underlying ticker and expiration
    const groupedOptions: Record<string, Record<string, any[]>> = {};

    optionsData.forEach((contract) => {
      if (!groupedOptions[contract.underlying]) {
        groupedOptions[contract.underlying] = {};
      }

      if (!groupedOptions[contract.underlying][contract.expiration]) {
        groupedOptions[contract.underlying][contract.expiration] = [];
      }

      groupedOptions[contract.underlying][contract.expiration].push(contract);
    });

    // Store options data organized by underlying and expiration
    for (const [ticker, expirations] of Object.entries(groupedOptions)) {
      // Create a collection for each ticker
      const tickerRef = db.collection("optionsData").doc(ticker);

      // Store summary of available expirations
      batch.set(tickerRef, {
        symbol: ticker,
        expirationDates: Object.keys(expirations),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Store each expiration's options chain
      for (const [expDate, contracts] of Object.entries(expirations)) {
        const expirationRef = tickerRef.collection("expirations").doc(expDate);

        // Separate calls and puts
        const calls = contracts.filter((contract) => contract.type === "call");
        const puts = contracts.filter((contract) => contract.type === "put");

        batch.set(expirationRef, {
          expiration: expDate,
          underlying: ticker,
          calls,
          puts,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    await batch.commit();
    logger.info(
      `Stored options data for ${
        Object.keys(groupedOptions).length
      } tickers in Firestore`
    );
  } catch (error) {
    logger.error("Error storing options data in Firestore:", error);
    throw error;
  }
}

/**
 * Updates user-specific data with relevant stocks and news
 *
 * @param userId User identifier
 * @param watchlist Array of stock tickers the user is watching
 */
export async function updateUserData(
  userId: string,
  watchlist: string[]
): Promise<void> {
  try {
    // Get latest market data for watchlist tickers
    const marketDataPromises = watchlist.map(async (ticker) => {
      const doc = await db.collection("marketData").doc(ticker).get();
      return doc.exists ? doc.data() : null;
    });

    const marketData = (await Promise.all(marketDataPromises)).filter(Boolean);

    // Get latest news for watchlist tickers
    const newsPromises = watchlist.map(async (ticker) => {
      const doc = await db.collection("tickerNews").doc(ticker).get();
      return doc.exists ? doc.data() : null;
    });

    const tickerNews = (await Promise.all(newsPromises)).filter(Boolean);

    // Combine news from all tickers and sort by date
    const allNews = tickerNews.flatMap((data) => data?.articles || []);
    allNews.sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );

    // Update user document
    await db
      .collection("users")
      .doc(userId)
      .set(
        {
          watchlist,
          watchlistData: marketData,
          relevantNews: allNews.slice(0, 20), // Limit to 20 most recent articles
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    logger.info(`Updated user data for user ${userId}`);
  } catch (error) {
    logger.error(`Error updating user data for ${userId}:`, error);
    throw error;
  }
}

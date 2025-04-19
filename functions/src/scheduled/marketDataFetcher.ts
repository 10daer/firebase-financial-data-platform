import axios from "axios";
import { onSchedule, ScheduledEvent } from "firebase-functions/scheduler";
import { storeMarketData } from "../storage/firestoreOperations";
import { generateMarketDataJsonFile } from "../storage/jsonFileGenerator";
import { logger } from "../utils/logger";

// Market API configuration
const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || "";
const ALPHA_VANTAGE_API_URL = "https://www.alphavantage.co/query";

interface StockQuote {
  symbol: string;
  open: number;
  high: number;
  low: number;
  price: number;
  volume: number;
  latestTradingDay: string;
  previousClose: number;
  change: number;
  changePercent: string;
}

/**
 * Fetches market data for a list of stock tickers
 * Scheduled to run at the end of each trading day
 */

export const fetchMarketDataScheduledFunction = onSchedule(
  "0 18 * * 1-5", // 6:00 PM every weekday
  async (context: ScheduledEvent): Promise<void> => {
    try {
      logger.info("Starting scheduled market data fetch");

      // List of tickers to track - in production, this would come from a config or database
      const stockTickers: string[] = [
        "AAPL",
        "MSFT",
        "GOOGL",
        "AMZN",
        "META",
        "TSLA",
        "NVDA",
        "JPM",
        "BAC",
        "V",
      ];

      const marketData: StockQuote[] = [];

      // Fetch data for each ticker
      for (const ticker of stockTickers) {
        try {
          // Add a small delay to avoid API rate limits
          await new Promise<void>((resolve) => setTimeout(resolve, 1500));

          logger.info(`Fetching market data for ${ticker}`);

          const response: { data: Record<string, any> } = await axios.get(
            ALPHA_VANTAGE_API_URL,
            {
              params: {
                function: "GLOBAL_QUOTE",
                symbol: ticker,
                apikey: ALPHA_VANTAGE_API_KEY,
              },
            }
          );

          const data: Record<string, any> = response.data["Global Quote"];

          if (!data) {
            logger.warn(`No data returned for ${ticker}`);
            continue;
          }

          // Parse the response data
          const stockQuote: StockQuote = {
            symbol: data["01. symbol"],
            open: parseFloat(data["02. open"]),
            high: parseFloat(data["03. high"]),
            low: parseFloat(data["04. low"]),
            price: parseFloat(data["05. price"]),
            volume: parseInt(data["06. volume"], 10),
            latestTradingDay: data["07. latest trading day"],
            previousClose: parseFloat(data["08. previous close"]),
            change: parseFloat(data["09. change"]),
            changePercent: data["10. change percent"],
          };

          marketData.push(stockQuote);
        } catch (error: unknown) {
          logger.error(`Error fetching data for ${ticker}:`, error);
          // Continue with other tickers even if one fails
        }
      }

      logger.info(`Fetched market data for ${marketData.length} stocks`);

      // Store in Firestore
      await storeMarketData(marketData);

      // Generate static JSON files
      await generateMarketDataJsonFile(marketData);

      logger.info("Completed scheduled market data fetch");
      return;
    } catch (error: unknown) {
      logger.error("Error in market data fetch function:", error);
      throw error;
    }
  }
);

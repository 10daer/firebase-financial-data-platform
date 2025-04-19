import axios from "axios";
import { onSchedule, ScheduledEvent } from "firebase-functions/scheduler";
import { storeOptionsData } from "../storage/firestoreOperations";
import { generateOptionsDataJsonFile } from "../storage/jsonFileGenerator";
import { logger } from "../utils/logger";

// Options API configuration
const POLYGON_API_KEY = process.env.POLYGON_API_KEY || "";
const POLYGON_API_URL = "https://api.polygon.io/v3/reference/options/contracts";

interface OptionsContract {
  ticker: string;
  underlying: string;
  expiration: string;
  strike: number;
  type: "call" | "put";
  openInterest?: number;
  impliedVolatility?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
}

/**
 * Fetches options chain data for select stocks
 * Scheduled to run daily after market close
 */
export const fetchOptionsChainScheduledFunction = onSchedule(
  "0 18 * * 1-5", // 6:00 PM every weekday
  async (context: ScheduledEvent): Promise<void> => {
    try {
      logger.info("Starting scheduled options chain fetch");

      // List of tickers to track options for - usually high volume stocks
      const optionsTickers = ["AAPL", "MSFT", "TSLA", "AMZN", "SPY"];

      const allOptionsData: OptionsContract[] = [];

      // Fetch data for each ticker
      for (const ticker of optionsTickers) {
        try {
          logger.info(`Fetching options chain for ${ticker}`);

          // Get nearest expiration dates (front-month and next-month)
          const response = await axios.get(POLYGON_API_URL, {
            params: {
              underlying_ticker: ticker,
              expired: false,
              limit: 1000,
              apiKey: POLYGON_API_KEY,
            },
          });

          if (!response.data.results || response.data.results.length === 0) {
            logger.warn(`No options data returned for ${ticker}`);
            continue;
          }

          // Group by expiration and get the two closest dates
          const contractsByExpiration: Record<string, any[]> = {};

          response.data.results.forEach((contract: any) => {
            if (!contractsByExpiration[contract.expiration_date]) {
              contractsByExpiration[contract.expiration_date] = [];
            }
            contractsByExpiration[contract.expiration_date].push(contract);
          });

          // Sort expiration dates and get the two closest
          const expirationDates = Object.keys(contractsByExpiration)
            .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
            .slice(0, 2);

          // Process the contracts for these expirations
          for (const expDate of expirationDates) {
            const contracts = contractsByExpiration[expDate];

            // Format the options data
            const formattedContracts: OptionsContract[] = contracts.map(
              (contract: any) => ({
                ticker: contract.ticker,
                underlying: ticker,
                expiration: contract.expiration_date,
                strike: parseFloat(contract.strike_price),
                type: contract.contract_type.toLowerCase() as "call" | "put",
              })
            );

            allOptionsData.push(...formattedContracts);
          }
        } catch (error) {
          logger.error(`Error fetching options data for ${ticker}:`, error);
          // Continue with other tickers even if one fails
        }
      }

      logger.info(
        `Fetched options data for ${allOptionsData.length} contracts`
      );

      // Store in Firestore
      await storeOptionsData(allOptionsData);

      // Generate static JSON files
      await generateOptionsDataJsonFile(allOptionsData);

      logger.info("Completed scheduled options chain fetch");
      return;
    } catch (error) {
      logger.error("Error in options chain fetch function:", error);
      throw error;
    }
  }
);

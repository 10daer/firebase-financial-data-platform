// import { onRequest } from "firebase-functions/v2/https";
// import { fetchMarketDataScheduledFunction } from "./scheduled/marketDataFetcher";
// // import { fetchNewsScheduledFunction } from "./scheduled/newsFetcher";
// // import { fetchOptionsChainScheduledFunction } from "./scheduled/optionsChainFetcher";

// // Export scheduled functions
// // export const fetchNewsHourly = fetchNewsScheduledFunction;
// export const fetchMarketDataDaily = fetchMarketDataScheduledFunction;
// // export const fetchOptionsChainDaily = fetchOptionsChainScheduledFunction;

// export const test = onRequest((request, response) => {
//   response.send("Test function is working!");
// });

console.log("Firebase functions initialization started");

import * as dotenv from "dotenv";
dotenv.config();

import * as logger from "firebase-functions/logger";
import { onRequest } from "firebase-functions/v2/https";

// First, export the HTTP function which is simplest
export const helloWorld = onRequest((request, response) => {
  logger.info("Hello logs!", { structuredData: true });
  response.send("Hello from Firebase!");
});

console.log("HTTP function defined");

// Import scheduled functions one by one
console.log("Importing scheduled functions...");

import { fetchMarketDataScheduledFunction } from "./scheduled/marketDataFetcher";
console.log("Market data fetcher imported");

import { fetchNewsScheduledFunction } from "./scheduled/newsFetcher";
console.log("News fetcher imported");

import { fetchOptionsChainScheduledFunction } from "./scheduled/optionsChainFetcher";
console.log("Options chain fetcher imported");

// Export scheduled functions
export const fetchNewsHourly = fetchNewsScheduledFunction;
export const fetchMarketDataDaily = fetchMarketDataScheduledFunction;
export const fetchOptionsChainDaily = fetchOptionsChainScheduledFunction;

console.log("All Firebase functions initialized successfully");

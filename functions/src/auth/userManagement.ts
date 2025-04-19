import * as admin from "firebase-admin";
import { initializeApp } from "firebase-admin/app";
import { FieldValue } from "firebase-admin/firestore";
import * as functions from "firebase-functions/v1";
import { logger } from "../utils/logger";

// Initialize Firebase Admin if not already initialized
if (!(global as any).firebaseInitialized) {
  initializeApp();
  (global as any).firebaseInitialized = true;
}

/**
 * Creates a new user profile in Firestore when a user signs up
 * Triggered by Firebase Authentication user creation
 */
interface UserPreferences {
  theme: string;
  emailNotifications: boolean;
  refreshInterval: number;
}

interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string;
  createdAt: FirebaseFirestore.FieldValue;
  watchlist: string[];
  preferences: UserPreferences;
}

export const createUserProfile = functions.auth
  .user()
  .onCreate(async (user: admin.auth.UserRecord): Promise<null> => {
    try {
      const userRef = admin.firestore().collection("users").doc(user.uid);

      // Create default user profile
      const userProfile: UserProfile = {
        uid: user.uid,
        email: user.email ?? null,
        displayName: user.displayName || "",
        createdAt: FieldValue.serverTimestamp(),
        watchlist: ["AAPL", "MSFT", "GOOGL", "AMZN"], // Default watchlist
        preferences: {
          theme: "light",
          emailNotifications: true,
          refreshInterval: 60, // seconds
        },
      };

      await userRef.set(userProfile);

      logger.info(`Created user profile for ${user.uid}`);
      return null;
    } catch (error) {
      logger.error(`Error creating user profile for ${user.uid}:`, error);
      throw error;
    }
  });

/**
 * Updates a user's watchlist and preferences
 *
 * @param {string} userId User identifier
 * @param {string[]} [watchlist] Array of stock tickers to watch
 * @param {any} preferences User preferences object
 */
export async function updateUserPreferences(
  userId: string,
  watchlist?: string[],
  preferences?: any
): Promise<void> {
  try {
    const userRef = admin.firestore().collection("users").doc(userId);
    const updateData: any = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    // Only update provided fields
    if (watchlist) {
      updateData.watchlist = watchlist;
    }

    if (preferences) {
      updateData.preferences = FieldValue.delete();
      updateData["preferences"] = preferences;
    }

    await userRef.update(updateData);
    logger.info(`Updated preferences for user ${userId}`);
  } catch (error) {
    logger.error(`Error updating preferences for user ${userId}:`, error);
    throw error;
  }
}

/**
 * HTTP function to manage user watchlist
 * Allows adding/removing stocks from a user's watchlist
 */
export const manageWatchlist = functions.https.onCall(async (data, context) => {
  // Ensure user is authenticated
  if (!context?.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to manage your watchlist"
    );
  }

  const userId = context.auth.uid;
  interface ManageWatchlistData {
    action: string;
    ticker: string;
  }

  const { action, ticker } = data as unknown as ManageWatchlistData;

  if (!action || !ticker) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Action and ticker are required"
    );
  }

  try {
    // Get current user data
    const userDoc = await admin
      .firestore()
      .collection("users")
      .doc(userId)
      .get();

    if (!userDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "User profile not found"
      );
    }

    const userData = userDoc.data() as any;
    const watchlist = userData.watchlist || [];

    // Update the watchlist based on the action
    if (action === "add" && !watchlist.includes(ticker)) {
      watchlist.push(ticker);
    } else if (action === "remove") {
      const index = watchlist.indexOf(ticker);
      if (index > -1) {
        watchlist.splice(index, 1);
      }
    } else {
      throw new functions.https.HttpsError(
        "invalid-argument",
        'Action must be either "add" or "remove"'
      );
    }

    // Update the user profile
    await admin.firestore().collection("users").doc(userId).update({
      watchlist,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Also update the user's data with latest market information
    await updateUserData(userId, watchlist);

    return { success: true, watchlist };
  } catch (error) {
    logger.error(`Error managing watchlist for user ${userId}:`, error);
    throw new functions.https.HttpsError(
      "internal",
      "Error managing watchlist"
    );
  }
});

/**
 * Updates the user's document with the latest market data for their watchlist.
 *
 * @param {string} userId - The ID of the user.
 * @param {string[]} watchlist - The list of stock tickers in the user's watchlist.
 * @return {Promise<void>} - A promise that resolves when the update is complete.
 */
async function updateUserData(
  userId: string,
  watchlist: string[]
): Promise<void> {
  try {
    // Fetch the latest market data for the stocks in the watchlist
    const marketData = await fetchMarketData(watchlist);

    // Update the user's document with the latest market data
    const userRef = admin.firestore().collection("users").doc(userId);
    await userRef.update({
      marketData,
      updatedAt: FieldValue.serverTimestamp(),
    });

    logger.info(`Updated market data for user ${userId}`);
  } catch (error) {
    logger.error(`Error updating market data for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Mock function to fetch market data for a list of stock tickers
 * Replace this with actual API calls to a stock market data provider
 *
 * @param {string[]} tickers - The list of stock tickers to fetch market data for.
 * @return {Promise<any>} - A promise that resolves with the market data.
 */
async function fetchMarketData(tickers: string[]): Promise<any> {
  // Simulate fetching market data
  const mockData = tickers.map((ticker) => ({
    ticker,
    price: Math.random() * 1000, // Random price for demonstration
    change: (Math.random() - 0.5) * 10, // Random price change
  }));

  return mockData;
}

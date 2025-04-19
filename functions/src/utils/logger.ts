import * as functions from "firebase-functions";

/**
 * Custom logger with consistent formatting and severity levels
 */
export const logger = {
  info: (message: string, data?: any) => {
    if (data) {
      functions.logger.info(message, {data});
    } else {
      functions.logger.info(message);
    }
  },

  warn: (message: string, data?: any) => {
    if (data) {
      functions.logger.warn(message, {data});
    } else {
      functions.logger.warn(message);
    }
  },

  error: (message: string, data?: any) => {
    if (data) {
      functions.logger.error(message, {data});
    } else {
      functions.logger.error(message);
    }
  },

  debug: (message: string, data?: any) => {
    if (process.env.DEBUG === "true") {
      if (data) {
        functions.logger.debug(message, {data});
      } else {
        functions.logger.debug(message);
      }
    }
  },
};

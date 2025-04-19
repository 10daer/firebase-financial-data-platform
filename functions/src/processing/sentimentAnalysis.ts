import * as natural from "natural";
import {logger} from "../utils/logger";

const tokenizer = new natural.WordTokenizer();
const analyzer = new natural.SentimentAnalyzer(
  "English",
  natural.PorterStemmer,
  "afinn"
);

/**
 * Performs sentiment analysis on financial news content
 *
 * @param text Text content to analyze for sentiment
 * @return Sentiment score normalized between -1 (negative) and 1 (positive)
 */
export async function processSentiment(text: string): Promise<number> {
  try {
    // Tokenize the text
    const tokens = tokenizer.tokenize(text.toLowerCase()) || [];

    // Get raw sentiment score
    const rawScore = analyzer.getSentiment(tokens);

    // Normalize between -1 and 1
    // AFINN lexicon typically produces scores in a small range, so we normalize
    const normalizedScore = Math.max(-1, Math.min(1, rawScore * 2));

    return normalizedScore;
  } catch (error) {
    logger.error("Error in sentiment analysis:", error);
    // Return neutral score on error
    return 0;
  }
}

/**
 * Categorizes sentiment score into a descriptive label
 *
 * @param score Sentiment score between -1 and 1
 * @return Descriptive sentiment category
 */
export function categorizeSentiment(
  score: number
): "very negative" | "negative" | "neutral" | "positive" | "very positive" {
  if (score <= -0.6) return "very negative";
  if (score <= -0.2) return "negative";
  if (score >= 0.6) return "very positive";
  if (score >= 0.2) return "positive";
  return "neutral";
}

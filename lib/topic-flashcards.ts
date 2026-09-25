import { z } from "zod";

const text = (max: number) => z.string().trim().min(1).max(max);
export const flashcardModelSchema = z.object({
  cards: z.array(z.object({ concept: text(100), question: text(350), answer: text(900) })).min(6).max(8),
});
export const flashcardDeckSchema = flashcardModelSchema.refine(deck => {
  const questions = deck.cards.map(card => card.question.toLowerCase().replace(/\s+/g, " "));
  return new Set(questions).size === questions.length;
}, "Each flashcard must ask a distinct question.");
export type FlashcardDeck = z.infer<typeof flashcardDeckSchema>;
export const flashcardResponseSchema = z.object({ topicId: z.string(), deck: flashcardDeckSchema });
const ratingSchema = z.enum(["new", "review", "known"]);
export type FlashcardRating = z.infer<typeof ratingSchema>;
export const flashcardSessionSchema = z.object({
  deck: flashcardDeckSchema,
  ratings: z.array(ratingSchema).min(6).max(8),
  order: z.array(z.number().int().min(0).max(7)).min(1).max(8),
  position: z.number().int().min(0).max(8),
}).refine(session => session.ratings.length === session.deck.cards.length
  && session.position <= session.order.length
  && new Set(session.order).size === session.order.length
  && session.order.every(index => index < session.deck.cards.length), "Invalid review progress.");
export type FlashcardSession = z.infer<typeof flashcardSessionSchema>;
export function newFlashcardSession(deck: FlashcardDeck): FlashcardSession {
  return { deck, ratings: deck.cards.map(() => "new"), order: deck.cards.map((_, index) => index), position: 0 };
}
export function rateFlashcard(session: FlashcardSession, rating: Exclude<FlashcardRating, "new">): FlashcardSession {
  if (session.position >= session.order.length) return session;
  const ratings = [...session.ratings];
  ratings[session.order[session.position]] = rating;
  return { ...session, ratings, position: session.position + 1 };
}
export function reviewFlashcards(session: FlashcardSession, missedOnly: boolean): FlashcardSession {
  if (!missedOnly) return newFlashcardSession(session.deck);
  const order = session.deck.cards.map((_, index) => index).filter(index => session.ratings[index] !== "known");
  return order.length ? { ...session, order, position: 0 } : session;
}
export function flashcardStorageKey(pathId: string, topicId: string) {
  return `infinity-flashcards-v1:${JSON.stringify([pathId, topicId])}`;
}
export function restoreFlashcards(raw: string | null, context: string): FlashcardSession | null {
  try {
    const saved = z.object({ version: z.literal(1), context: z.string(), session: flashcardSessionSchema }).parse(JSON.parse(raw || "null"));
    return saved.context === context ? saved.session : null;
  } catch { return null; }
}

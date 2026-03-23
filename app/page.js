import cardsPayload from "../data/cards.json";
import FlashcardsApp from "./flashcards-app";

export default function Page() {
  return <FlashcardsApp initialCards={cardsPayload.cards || []} initialStats={cardsPayload.stats || {}} />;
}

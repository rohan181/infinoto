"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Layers, LoaderCircle, RefreshCw, RotateCcw, X } from "lucide-react";
import type { LearningPath, Topic } from "@/app/data";
import { overviewContext } from "@/lib/topic-overview";
import { flashcardResponseSchema, flashcardStorageKey, newFlashcardSession, rateFlashcard, restoreFlashcards, reviewFlashcards, type FlashcardSession } from "@/lib/topic-flashcards";
import { useRemoteAction } from "./use-remote-action";

export default function TopicFlashcardsOption({ path, topic }: { path: LearningPath; topic: Topic }) {
  const [open, setOpen] = useState(false);
  return <><button className="overview-visualize" onClick={() => setOpen(true)}><Layers size={15}/>Flashcards<ArrowRight size={14}/></button>
    {open && <FlashcardDialog key={JSON.stringify([path.id, overviewContext(path.title, topic)])} path={path} topic={topic} onClose={() => setOpen(false)}/>}</>;
}

function FlashcardDialog({ path, topic, onClose }: { path: LearningPath; topic: Topic; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), cardButton = useRef<HTMLButtonElement>(null);
  const results = useRef<HTMLElement>(null);
  const titleId = useId();
  const [session, setSession] = useState<FlashcardSession | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [storageNote, setStorageNote] = useState("");
  const { run, reset, busy, error, cancel } = useRemoteAction();
  const context = overviewContext(path.title, topic), storageKey = flashcardStorageKey(path.id, topic.id);
  const body = JSON.stringify({ pathTitle: path.title, topic: { id: topic.id, title: topic.title, description: topic.description, difficulty: topic.difficulty, concepts: topic.concepts } });
  const save = useCallback((value: FlashcardSession) => {
    setSession(value); setFlipped(false);
    try { localStorage.setItem(storageKey, JSON.stringify({ version: 1, context, session: value })); setStorageNote(""); }
    catch { setStorageNote("Could not save your deck and progress. They remain available while this window is open."); }
  }, [context, storageKey]);
  const generate = useCallback(() => {
    const input = JSON.parse(body);
    void run("/api/topic-flashcards", input, raw => {
      const result = flashcardResponseSchema.parse(raw);
      if (result.topicId !== input.topic.id) throw new Error("These flashcards do not match the selected topic. Please retry.");
      save(newFlashcardSession(result.deck));
    });
  }, [body, run, save]);
  useEffect(() => {
    const element = dialog.current, previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    element?.showModal(); document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  useEffect(() => {
    let saved: FlashcardSession | null = null;
    try { saved = restoreFlashcards(localStorage.getItem(storageKey), context); }
    catch { setStorageNote("Browser storage is unavailable. Flashcards will not be saved between visits."); }
    setSession(saved);
    const timer = saved ? undefined : setTimeout(generate, 350);
    return () => { clearTimeout(timer); reset(); };
  }, [context, storageKey, generate, reset]);
  const cardIndex = session?.order[session.position];
  const card = session && cardIndex !== undefined ? session.deck.cards[cardIndex] : null;
  const known = session?.ratings.filter(rating => rating === "known").length || 0;
  const remaining = session ? session.deck.cards.length - known : 0;
  const move = (value: FlashcardSession) => { save(value); requestAnimationFrame(() => (cardButton.current || results.current)?.focus()); };

  return <dialog ref={dialog} className="visualization-dialog flashcard-dialog" aria-labelledby={titleId} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <header className="visualization-header"><div><span><Layers size={14}/>AI FLASHCARDS</span><h2 id={titleId}>{topic.title}</h2><p>{topic.difficulty} · Recall, reveal, repeat.</p></div><button className="icon-button" aria-label="Close flashcards" onClick={onClose} autoFocus><X size={21}/></button></header>
    {!session ? <div className="visualization-pending">{error ? <div role="alert"><p>{error}</p><button className="secondary-button" onClick={generate} disabled={busy}><RefreshCw size={14}/>Retry flashcards</button></div> : <div role="status"><LoaderCircle size={24} className="spin"/><p>Creating your topic flashcards…</p>{busy && <button className="secondary-button" onClick={cancel}>Stop generation</button>}</div>}</div>
      : <div className="flashcard-body">
        <div className="flashcard-progress" aria-live="polite"><span>{card ? `Card ${session.position + 1} of ${session.order.length}` : "Round complete"}</span><span>{known} of {session.deck.cards.length} learned</span></div>
        <progress className="flashcard-meter" max={session.deck.cards.length} value={known} aria-label="Cards learned"/>
        {card ? <>
          <button ref={cardButton} className={`flashcard-face ${flipped ? "is-answer" : ""}`} aria-label={flipped ? "Show question" : "Reveal answer"} aria-pressed={flipped} onClick={() => setFlipped(!flipped)}>
            <span className="flashcard-label">{flipped ? "ANSWER" : "QUESTION"} · {card.concept}</span>
            <span className="flashcard-text" aria-live="polite">{flipped ? card.answer : card.question}</span>
            <span className="flashcard-flip"><RotateCcw size={14}/>{flipped ? "Show question" : "Think of your answer, then click to reveal"}</span>
          </button>
          <div className="flashcard-rating"><button disabled={!flipped} onClick={() => move(rateFlashcard(session, "review"))}><RotateCcw size={15}/>Review again</button><button disabled={!flipped} onClick={() => move(rateFlashcard(session, "known"))}><Check size={15}/>Got it</button></div>
          <nav className="flashcard-nav" aria-label="Flashcard navigation"><button disabled={session.position === 0} onClick={() => move({ ...session, position: session.position - 1 })}><ArrowLeft size={15}/>Previous</button><span>{session.ratings[cardIndex!] === "known" ? "Learned" : session.ratings[cardIndex!] === "review" ? "Needs practice" : "Not reviewed"}</span><button onClick={() => move({ ...session, position: session.position + 1 })}>{session.position === session.order.length - 1 ? "Finish round" : "Next"}<ArrowRight size={15}/></button></nav>
        </> : <section ref={results} tabIndex={-1} className="flashcard-complete" aria-label="Flashcard results"><Check size={32}/><h3>{remaining ? "Keep building your recall" : "You’ve learned every card"}</h3><p>{remaining ? `${remaining} ${remaining === 1 ? "card needs" : "cards need"} more practice, including any you skipped.` : "Come back later for another round to strengthen your memory."}</p><div>{remaining > 0 && <button className="primary-button" onClick={() => move(reviewFlashcards(session, true))}><RotateCcw size={15}/>Review remaining ({remaining})</button>}<button className="secondary-button" onClick={() => move(reviewFlashcards(session, false))}>Practice all cards</button></div></section>}
        <p className="visualization-note">AI-generated study cards · {storageNote || "Deck and progress saved in this browser"}</p>
      </div>}
  </dialog>;
}

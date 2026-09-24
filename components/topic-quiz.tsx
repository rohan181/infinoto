"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ClipboardCheck, LoaderCircle, RotateCcw, Sparkles, X } from "lucide-react";
import type { LearningPath, Topic } from "@/app/data";
import { quizContext, quizResponseSchema, quizScore, quizStorageKey, restoreQuizAttempt, type QuizAttempt } from "@/lib/quiz";
import { useRemoteAction } from "./use-remote-action";

export default function TopicQuiz({ path, topic, completed, onComplete, onReview, onClose }: {
  path: LearningPath; topic: Topic; completed: boolean; onComplete: () => void; onReview: () => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState<number | null>(null);
  const [feedback, setFeedback] = useState(false);
  const [storageNote, setStorageNote] = useState("");
  const action = useRemoteAction();
  const context = quizContext(path.title, topic);
  const storageKey = quizStorageKey(path.id, topic.id);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    element?.showModal(); document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  useEffect(() => {
    try { setAttempt(restoreQuizAttempt(localStorage.getItem(storageKey), context)); }
    catch { setStorageNote("Browser storage is unavailable. This attempt will last until you close the quiz."); }
    setReady(true);
  }, [storageKey, context]);
  function save(next: QuizAttempt) {
    setAttempt(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setStorageNote(""); }
    catch { setStorageNote("This attempt could not be saved. Keep the quiz open to finish it."); }
  }
  function focusContent() {
    requestAnimationFrame(() => { content.current?.focus(); content.current?.scrollIntoView({ block: "nearest" }); });
  }
  function generate() {
    void action.run("/api/quiz", { pathTitle: path.title, topic: { id: topic.id, title: topic.title, description: topic.description, difficulty: topic.difficulty, concepts: topic.concepts } }, raw => {
      const result = quizResponseSchema.parse(raw);
      if (result.topicId !== topic.id) throw new Error("This quiz belongs to another topic. Please retry.");
      save({ version: 1, context, quiz: result.quiz, answers: [] }); setDraft(null); setFeedback(false); focusContent();
    });
  }
  const score = attempt ? quizScore(attempt.quiz, attempt.answers) : null;
  const finished = score?.finished && !feedback;
  const index = attempt ? attempt.answers.length - (feedback ? 1 : 0) : 0;
  const question = attempt?.quiz.questions[index];
  const choice = feedback ? attempt?.answers[index] : draft;
  return <dialog ref={dialog} className="quiz-dialog" aria-labelledby="quiz-title" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <header className="quiz-header"><div><span><ClipboardCheck size={15}/> QUICK QUIZ · {topic.difficulty.toUpperCase()}</span><h2 id="quiz-title">{topic.title}</h2><p>Three questions to check your understanding.</p></div><button className="icon-button" aria-label="Close quiz" onClick={onClose} autoFocus><X size={20}/></button></header>
    <div className="quiz-body" ref={content} tabIndex={-1}>
      {!ready ? <p role="status">Loading your quiz…</p> : !attempt ? <div className="quiz-intro"><ClipboardCheck size={32}/><h3>A quick check before your next step.</h3><p>Answer one question at a time, then review the explanation. Your latest attempt is saved in this browser.</p><div className="quiz-concepts">{topic.concepts.map((concept, i) => <span key={i}>{concept}</span>)}</div><button className="primary-button" disabled={action.busy} onClick={generate}><Sparkles size={15}/>Generate quick quiz</button></div> : finished && score ? <section className="quiz-results" aria-label="Quiz results"><span className="quiz-score">{score.correct}<small> / {score.total}</small></span><h3>{score.correct === score.total ? "All three correct." : "Keep building your understanding."}</h3><p>{score.review.length ? `Revisit: ${score.review.join(", ")}.` : "You answered these questions correctly. Review the whole topic before marking it complete."}</p>
        <div className="quiz-result-actions"><button className="secondary-button" onClick={onReview}>Review topic resources<ArrowRight size={14}/></button>{topic.id !== "0" && <button className="primary-button" disabled={completed} onClick={onComplete}><Check size={14}/>{completed ? "Topic marked complete" : "Mark topic complete"}</button>}</div>
        <h4>Answer review</h4>{attempt.quiz.questions.map((q, i) => <article className="quiz-review" key={i}><span className={attempt.answers[i] === q.correctIndex ? "quiz-correct" : "quiz-incorrect"}>{attempt.answers[i] === q.correctIndex ? "Correct" : "Review needed"} · {q.concept}</span><h4>{i + 1}. {q.prompt}</h4><p>Your answer: {q.options[attempt.answers[i]]}</p>{attempt.answers[i] !== q.correctIndex && <p>Correct answer: {q.options[q.correctIndex]}</p>}<p>{q.explanation}</p></article>)}
        <div className="quiz-retry-actions"><button className="secondary-button" disabled={action.busy} onClick={() => { save({ ...attempt, answers: [] }); setDraft(null); setFeedback(false); action.clearError(); focusContent(); }}><RotateCcw size={14}/>Retake quiz</button><button className="secondary-button" disabled={action.busy} onClick={generate}><Sparkles size={14}/>Generate new questions</button></div>
      </section> : question && attempt ? <section className="quiz-question" aria-label={`Question ${index + 1} of 3`}><div className="quiz-question-meta"><span>Question {index + 1} of 3</span><span>{question.concept}</span></div><progress max={3} value={attempt.answers.length} aria-label="Answered questions"/><fieldset disabled={feedback || action.busy}><legend>{question.prompt}</legend><div className="quiz-options">{question.options.map((option, i) => <label key={i} className={`${choice === i ? "chosen" : ""} ${feedback && i === question.correctIndex ? "correct" : ""} ${feedback && choice === i && i !== question.correctIndex ? "incorrect" : ""}`}><input type="radio" name={`quiz-question-${index}`} checked={choice === i} onChange={() => setDraft(i)}/><span className="quiz-option-letter">{String.fromCharCode(65 + i)}</span><span>{option}{feedback && i === question.correctIndex && <small>Correct answer</small>}{feedback && choice === i && i !== question.correctIndex && <small>Your answer</small>}</span></label>)}</div></fieldset>
        {feedback ? <><div className="quiz-feedback" role="status"><strong>{choice === question.correctIndex ? "Correct." : "Not quite."}</strong><p>{question.explanation}</p></div><button className="primary-button" onClick={() => { setFeedback(false); setDraft(null); focusContent(); }}>{score?.finished ? "See results" : "Next question"}<ArrowRight size={15}/></button></> : <button className="primary-button" disabled={draft === null} onClick={() => { if (draft !== null) { save({ ...attempt, answers: [...attempt.answers, draft] }); setFeedback(true); } }}>Check answer<Check size={15}/></button>}
      </section> : null}
      {action.busy && <div className="quiz-loading" role="status"><LoaderCircle size={17} className="spin"/><span>Creating questions for this topic…</span><button onClick={action.cancel}>Stop</button></div>}
      {action.error && <div className="quiz-error" role="alert"><p>{action.error}</p><button className="secondary-button" onClick={generate}>Retry generation</button></div>}
      {storageNote && <p className="quiz-note" role="status">{storageNote}</p>}
      <p className="quiz-note">AI-generated practice questions may contain mistakes. A quiz score is a self-check; topic completion stays your choice.</p>
    </div>
  </dialog>;
}

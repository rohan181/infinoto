"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check, Clock3, Compass, GitBranch } from "lucide-react";
import type { LearningPath } from "@/app/data";
import { DEFAULT_STUDY_MINUTES, formatStudyTime, parseStudyMinutes, recommendNextTopics } from "@/lib/next-learning";

const preferenceKey = "infinity-study-minutes";
export default function LearnNext({ path, completed, onSelect }: {
  path: LearningPath; completed: string[]; onSelect: (id: string) => void;
}) {
  const [time, setTime] = useState(String(DEFAULT_STUDY_MINUTES));
  useEffect(() => {
    try {
      const saved = parseStudyMinutes(localStorage.getItem(preferenceKey));
      if (saved !== null) setTime(String(saved));
    } catch { /* The planner works without browser storage. */ }
  }, []);
  function changeTime(value: string) {
    setTime(value);
    const minutes = parseStudyMinutes(value);
    if (minutes !== null) try { localStorage.setItem(preferenceKey, String(minutes)); } catch { /* Optional preference. */ }
  }
  const minutes = parseStudyMinutes(time);
  const result = minutes === null ? null : recommendNextTopics(path, completed, minutes);
  const pick = result?.suggestions[0];
  return <section className="learn-next" aria-labelledby="learn-next-title">
    <div className="learn-next-heading"><div><span className="learn-next-kicker"><Compass size={14}/> YOUR NEXT STEP</span><h2 id="learn-next-title">What should I learn next?</h2><p>A next step based on your progress, prerequisites and time.</p></div>
      <div className="study-time"><label htmlFor="study-minutes"><Clock3 size={14}/>Time available today</label><div className="study-time-input"><input id="study-minutes" type="number" min="5" max="480" step="1" value={time} aria-invalid={minutes === null} aria-describedby={minutes === null ? "study-time-error" : undefined} onChange={event => changeTime(event.target.value)}/><span>minutes</span></div><div className="study-time-presets" role="group" aria-label="Study time presets">{[15, 30, 60, 120].map(value => <button key={value} aria-pressed={minutes === value} onClick={() => changeTime(String(value))}>{formatStudyTime(value)}</button>)}</div></div>
    </div>
    {minutes === null && <p id="study-time-error" className="study-time-error" role="alert">Enter a whole number from 5 to 480 minutes.</p>}
    {result && <div aria-live="polite" aria-atomic="true">
      {pick ? <>
        <div className="next-topic-card"><div className="next-topic-summary"><span className="next-ready"><Check size={13}/>{pick.prerequisites.length ? "Prerequisites complete" : "Ready to start"}</span><h3>{pick.topic.title}</h3><div className="next-topic-meta"><span>{pick.topic.difficulty}</span><span><Clock3 size={13}/>{formatStudyTime(pick.sessionMinutes)} {pick.fits ? "topic estimate" : "session"}</span>{!pick.fits && <span>{pick.totalMinutes === null ? "Full topic estimate unavailable" : `${formatStudyTime(pick.totalMinutes)} total topic estimate`}</span>}</div>
          <p>{pick.prerequisites.length ? `Builds on ${pick.prerequisites.map(topic => topic.title).join(", ")}, which you’ve completed.` : "No unfinished prerequisites. This is an open starting point in your path."}</p>
          {!!pick.unlocks.length && <p className="next-unlocks"><GitBranch size={14}/>Completing this topic unlocks {pick.unlocks.length} {pick.unlocks.length === 1 ? "topic" : "topics"}: {pick.unlocks.map(topic => topic.title).join(", ")}.</p>}
          <button className="primary-button" onClick={() => onSelect(pick.topic.id)}>Open recommended topic<ArrowRight size={15}/></button>
        </div><div className="next-session"><h4>{pick.fits ? "Suggested study plan" : `Your ${formatStudyTime(pick.sessionMinutes)} starting plan`}</h4>{!pick.fits && <p>Start with <strong>{pick.focus}</strong>. {pick.totalMinutes === null ? "The full topic does not have a time estimate yet." : "The full topic takes more than this session."}</p>}<ol>{pick.steps.map((step, index) => <li key={index}><span>{step.minutes} min</span><p>{step.task}</p></li>)}</ol><small>Times are estimates. Open the topic to find resources; mark it complete when you’ve covered the whole topic.</small></div></div>
        {result.suggestions.length > 1 && <div className="next-alternatives"><span>Also ready</span>{result.suggestions.slice(1).map(item => <button key={item.topic.id} onClick={() => onSelect(item.topic.id)}><strong>{item.topic.title}</strong><small>{item.fits ? `${formatStudyTime(item.totalMinutes!)} topic estimate` : `${formatStudyTime(item.sessionMinutes)} start${item.totalMinutes === null ? "" : ` · ${formatStudyTime(item.totalMinutes)} total`}`}</small><ArrowRight size={14}/></button>)}</div>}
        <p className="next-method">{result.readyCount} ready · {result.remainingCount} unfinished. Prioritizes topics that fit your time, build on completed work, and unlock your next steps.</p>
      </> : <div className="next-empty"><Check size={24}/><div><h3>{result.status === "complete" ? "You’ve completed this path." : result.status === "empty" ? "Grow your path to get started." : "No topics are ready yet."}</h3><p>{result.status === "complete" ? "Generate more nodes from any topic to keep learning. New topics will appear here when their prerequisites are complete." : result.status === "empty" ? "Generate nodes from your learning goal to get your first recommendation." : "The remaining topics have unmet or missing prerequisites. Review the map before continuing."}</p></div></div>}
    </div>}
  </section>;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { GitBranch, X } from "lucide-react";
import type { LearningPath, Topic } from "@/app/data";
import { appendBranch, createTopicPath } from "@/lib/branches";
import TopicExpansion from "./topic-expansion";

export default function NodeActions({ path, topic, mode, onAdd, onCreatePath, onSelect, onClose }: {
  path: LearningPath; topic: Topic; mode: "nodes" | "path";
  onAdd: (parentId: string, topics: Topic[]) => void;
  onCreatePath: (path: LearningPath) => void; onSelect: (id: string) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [seed] = useState(() => createTopicPath(topic));
  const creating = mode === "path";
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    element?.showModal(); document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <dialog ref={dialog} className="node-action-dialog" aria-labelledby="node-action-title" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <header><div><span><GitBranch size={15}/> {creating ? "NEW LEARNING PATH" : "GROW YOUR MAP"}</span><h2 id="node-action-title">{topic.title}</h2><p>{creating ? "Follow this topic in its own learning path." : "Choose where this node should take you next."}</p></div><button className="icon-button" aria-label="Close node actions" onClick={onClose} autoFocus><X size={20}/></button></header>
    <TopicExpansion standalone creatingPath={creating} path={creating ? seed : path} topic={creating ? seed.topics[0] : topic}
      onAdd={(parentId, topics) => {
        if (creating) onCreatePath(appendBranch(seed, parentId, topics));
        else onAdd(parentId, topics);
        onClose();
      }} onSelect={id => { onSelect(id); onClose(); }}/>
  </dialog>;
}

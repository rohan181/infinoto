"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, ArrowUp, BookOpen, Bookmark, BrainCircuit, Check, ChevronRight, CircleHelp, Code2, Compass, GitBranch, Infinity as InfinityIcon, Layers3, MessageSquare, Plus, Search, Sparkles, Square, RotateCcw, X, Zap } from "lucide-react";
import { initialPath, type LearningPath, type Resource, type Topic } from "./data";
import { type ChatMessage, isLearningPath } from "@/lib/learning";
import LearningMap, { ResourceCard, type SavedResource } from "@/components/learning-map";

import { appendBranch, layoutLearningPath } from "@/lib/branches";
import { mergeResources } from "@/lib/resources";

type Workspace = { paths: LearningPath[]; activeId: string; completed: Record<string, string[]>; saved: SavedResource[]; messages: ChatMessage[]; suggestions: string[] };
const initial: Workspace = { paths: [layoutLearningPath({ ...initialPath, source: "example" })], activeId: initialPath.id, completed: {}, saved: [], messages: [], suggestions: [] };
const starters = [
  { title: "Build something", description: "Websites, apps, and ideas that work.", prompt: "I want to learn web development", icon: Code2, color: "blue" },
  { title: "Understand AI", description: "Go beyond the buzzwords.", prompt: "I want to learn artificial intelligence", icon: BrainCircuit, color: "purple" },
  { title: "Follow a curiosity", description: "There’s a whole world to explore.", prompt: "Help me find something interesting to learn", icon: Compass, color: "orange" },
];

function InfinityBackground() {
  return <div className="infinity-background" aria-hidden="true"><div className="ambient-glow" /><svg viewBox="0 0 900 400" fill="none"><defs><linearGradient id="infinity-gradient" x1="100" y1="70" x2="780" y2="320" gradientUnits="userSpaceOnUse"><stop stopColor="#6355fa" /><stop offset=".43" stopColor="#c099ff" /><stop offset=".65" stopColor="#8048e5" /><stop offset="1" stopColor="#454ecd" /></linearGradient><filter id="infinity-glow"><feGaussianBlur stdDeviation="7" /></filter></defs><path className="infinity-blur" d="M450 200 C355 68 244 38 163 115 C62 211 160 357 277 290 C331 259 390 156 450 200 C545 332 656 362 737 285 C838 189 740 43 623 110 C569 141 510 244 450 200" stroke="url(#infinity-gradient)" strokeWidth="13" filter="url(#infinity-glow)" />{Array.from({length:8},(_,i)=><path key={i} d="M450 200 C355 68 244 38 163 115 C62 211 160 357 277 290 C331 259 390 156 450 200 C545 332 656 362 737 285 C838 189 740 43 623 110 C569 141 510 244 450 200" stroke="url(#infinity-gradient)" strokeWidth={i===3?1.7:.75} opacity={.8-i*.07} transform={`translate(0 ${i*4-14})`} />)}</svg><span className="space-star star-one" /><span className="space-star star-two" /><span className="space-star star-three" /></div>;
}

export default function Home() {
  const [workspace, setWorkspace] = useState<Workspace>(initial);
  const [hydrated, setHydrated] = useState(false);
  const [page, setPage] = useState<"chat"|"paths"|"saved"|"explore"|"map">("chat");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [help, setHelp] = useState(false);
  const [menu, setMenu] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const conversationEnd = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const selectedPath = workspace.paths.find(p => p.id === workspace.activeId) || workspace.paths[0];

  useEffect(() => {
    try {
      const raw = localStorage.getItem("infinity-v1") || localStorage.getItem("rooted-v1");
      if (raw) {
        const saved = JSON.parse(raw);
        const paths = Array.isArray(saved.paths) ? saved.paths.filter(isLearningPath).flatMap((path: LearningPath) => { try { return [layoutLearningPath(path)]; } catch { return []; } }) : [];
        if (paths.length) setWorkspace({
          paths, activeId: paths.some((p: LearningPath) => p.id === saved.activeId) ? saved.activeId : paths[0].id,
          completed: saved.completed && typeof saved.completed === "object" ? Object.fromEntries(Object.entries(saved.completed).filter(([, value])=>Array.isArray(value) && value.every(id=>typeof id === "string"))) as Record<string,string[]> : {},
          saved: Array.isArray(saved.saved) ? saved.saved.filter((r: SavedResource) => r && typeof r.id === "string" && typeof r.title === "string" && typeof r.url === "string" && /^https:\/\//.test(r.url)) : [],
          messages: Array.isArray(saved.messages) ? saved.messages.filter((m: ChatMessage) => m && ["user","assistant"].includes(m.role) && typeof m.content === "string" && typeof m.id === "string").slice(-24) : [],
          suggestions: Array.isArray(saved.suggestions) ? saved.suggestions.filter((s: unknown) => typeof s === "string").slice(0,3) : [],
        });
      }
    } catch { /* Use a clean workspace when browser storage is unavailable. */ }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem("infinity-v1",JSON.stringify(workspace)); } catch { setToast("Browser storage is full. New changes are available for this session only."); }
  }, [workspace,hydrated]);
  useEffect(() => { if (!toast) return; const id=setTimeout(()=>setToast(""),4500); return ()=>clearTimeout(id); }, [toast]);
  useEffect(() => { if (page === "chat" && workspace.messages.length) conversationEnd.current?.scrollIntoView({behavior: "smooth",block:"end"}); }, [workspace.messages.length,busy,page]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!help) return;
    const previous = document.activeElement as HTMLElement;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const buttons = Array.from(dialog?.querySelectorAll<HTMLButtonElement>('button') || []);
    buttons[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHelp(false);
      if (event.key === "Tab" && event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons[buttons.length-1]?.focus(); }
      if (event.key === "Tab" && !event.shiftKey && document.activeElement === buttons[buttons.length-1]) { event.preventDefault(); buttons[0]?.focus(); }
    };
    document.addEventListener('keydown',key);
    return ()=>{document.removeEventListener('keydown',key); previous?.focus();};
  },[help]);

  function openPath(id: string) { setWorkspace(s=>({...s,activeId:id})); setPage("map"); setMenu(false); window.scrollTo({top:0,behavior:"instant"}); }
  function newChat() { if (lock.current) return; setWorkspace(s=>({...s,messages:[],suggestions:[]})); setInput(""); setError(""); setPage("chat"); setMenu(false); composer.current?.focus(); }
  async function send(content: string, retry = false) {
    const text = content.trim();
    if (lock.current || !hydrated || !text || text.length > 2400) return;
    lock.current = true; setBusy(true); setError(""); setPage("chat"); setMenu(false);
    const messages: ChatMessage[] = retry ? workspace.messages : [...workspace.messages, {id:crypto.randomUUID(),role:"user",content:text}];
    setWorkspace(s=>({...s,messages,suggestions:[]})); setInput("");
    const abort = new AbortController(); controller.current = abort;
    let timedOut = false;
    const timeout = setTimeout(()=>{ timedOut=true; abort.abort(); },118000);
    try {
      const response = await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:messages.slice(-16).map(({role,content})=>({role,content}))}),signal:abort.signal});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Infinity couldn’t respond. Please try again.");
      if (typeof result.reply !== "string" || (result.path && !isLearningPath(result.path))) throw new Error("The response was incomplete. Please retry your message.");
      setWorkspace(s=>({...s,
        messages:[...messages,{id:crypto.randomUUID(),role:"assistant",content:result.reply,pathId:result.path?.id}],
        suggestions:Array.isArray(result.suggestions)?result.suggestions.filter((s:unknown)=>typeof s === "string").slice(0,3):[],
        paths:result.path?[...s.paths,result.path]:s.paths,
        activeId:result.path?.id || s.activeId,
      }));
    } catch (failure) {
      setError(abort.signal.aborted ? (timedOut ? "Claude took too long to respond. Retry with a more focused learning goal." : "Response stopped. Retry whenever you’re ready.") : failure instanceof Error ? failure.message : "Couldn’t connect. Check your connection and retry.");
    } finally { clearTimeout(timeout); lock.current=false; controller.current=null; setBusy(false); }
  }
  function saveResource(resource: Resource, topicTitle: string) {
    if (!selectedPath) return;
    const id = `${selectedPath.id}:${resource.id}`;
    setWorkspace(s=>({...s,saved:s.saved.some(r=>r.id===id)?s.saved.filter(r=>r.id!==id):[...s.saved,{...resource,id,topicTitle,pathTitle:selectedPath.title}]}));
  }
  function addBranch(parentId: string, topics: Topic[]) {
    const pathId = selectedPath.id;
    setWorkspace(s => ({ ...s, paths: s.paths.map(path => path.id === pathId ? appendBranch(path, parentId, topics) : path) }));
  }
  function addResources(topicId: string, resources: Resource[]) {
    const pathId = selectedPath.id;
    setWorkspace(s => ({ ...s, paths: s.paths.map(path => path.id === pathId ? { ...path, topics: path.topics.map(topic => topic.id === topicId ? { ...topic, resources: mergeResources(topic.resources || [], resources) } : topic) } : path) }));
  }
  function complete(id:string) {
    if (!selectedPath) return;
    setWorkspace(s=>{const done=s.completed[selectedPath.id]||[];return {...s,completed:{...s.completed,[selectedPath.id]:done.includes(id)?done.filter(i=>i!==id):[...done,id]}};});
  }
  function refine() {
    if (!selectedPath) return;
    setPage("chat");
    setInput(`Refine my ${selectedPath.title} learning path. Current topics: ${selectedPath.topics.filter(t => t.id !== "0").map(t => t.title).join(", ")}. I would like to `);
    setTimeout(()=>composer.current?.focus(),0);
  }
  const hasMessages = workspace.messages.length > 0;
  const lastUser = [...workspace.messages].reverse().find(m=>m.role==="user")?.content || "";

  return <div className="app-shell">
    <aside className={`sidebar ${menu?"mobile-open":""}`}>
      <button className="brand" onClick={()=>{setPage("chat");setMenu(false);}} aria-label="Infinity home"><span><InfinityIcon size={31} strokeWidth={2.1} /></span>infinity<span className="brand-period">.</span></button>
      <button className="new-chat" onClick={newChat} disabled={busy}><Plus size={16} /> New conversation <span>↗</span></button>
      <span className="sidebar-label">YOUR WORKSPACE</span>
      <nav>{[{id:"chat",title:"Ask Infinity",icon:Sparkles},{id:"paths",title:"My learning paths",icon:GitBranch},{id:"saved",title:"Saved resources",icon:Bookmark},{id:"explore",title:"Discover",icon:Compass}].map(({id,title,icon:Icon})=><button key={id} aria-label={title} className={`nav-item ${page===id||(page==="map"&&id==="paths")?"active":""}`} onClick={()=>{setPage(id as typeof page);setSearch("");setMenu(false);}}><Icon size={17} /><span>{title}</span>{id==="paths"&&<small>{workspace.paths.length}</small>}{id==="chat"&&<span className="nav-spark">✦</span>}</button>)}</nav>
      <div className="recent-heading"><span className="sidebar-label">RECENT PATHS</span><GitBranch size={13} /></div><div className="recent-paths">{workspace.paths.slice(-6).reverse().map(path=><button key={path.id} onClick={()=>openPath(path.id)}><span className="recent-dot" /><span>{path.title}</span>{path.source==="claude"&&<Sparkles size={11} />}</button>)}</div>
      <div className="sidebar-bottom"><div className="side-note"><span className="side-note-icon"><InfinityIcon size={23} /></span><strong>There’s always more to know.</strong><p>One question can open up<br />a world of possibilities.</p><span className="side-note-stars">✦</span></div><button className="help-link" onClick={()=>setHelp(true)}><CircleHelp size={16} /><span>How Infinity works</span><ArrowUpRight size={13} /></button><div className="profile"><span className="avatar">Y</span><div><strong>Your workspace</strong><span>Personal · Saved locally</span></div><span className="profile-dot" /></div></div>
    </aside>
    {menu&&<button className="mobile-backdrop" aria-label="Close navigation" onClick={()=>setMenu(false)} />}
    <main className="main"><header className="topbar"><div><button className="mobile-menu icon-button" aria-label="Toggle navigation" onClick={()=>setMenu(v=>!v)}><Layers3 size={19} /></button><span className="breadcrumb-icon">{page==="chat"?<MessageSquare size={15}/>:page==="saved"?<Bookmark size={15}/>:<GitBranch size={15}/>}</span><span>{page==="chat"?"Your learning companion":page==="saved"?"Saved resources":page==="explore"?"Discover something new":"My learning paths"}</span>{page==="map"&&<><ChevronRight size={13}/><strong>{selectedPath?.title}</strong></>}</div><div className="topbar-actions"><span className="powered-by"><span className="claude-star">✳</span>Powered by Claude</span><button className="icon-button" aria-label="Help" onClick={()=>setHelp(true)}><CircleHelp size={18}/></button><span className="avatar small">Y</span></div></header>
      {page==="chat"?<div className={`chat-page ${hasMessages?"has-conversation":""}`}><InfinityBackground />
        {!hasMessages?<div className="welcome"><div className="welcome-pill"><span>✦</span> YOUR CURIOSITY, WITHOUT LIMITS</div><h1>Big curiosity.<br/><span>Infinite possibilities.</span></h1><p>What do you want to learn?<br/><span>Let’s turn your next “what if” into a path that’s yours.</span></p></div>:<div className="conversation-heading"><span className="chat-orb"><InfinityIcon size={24}/></span><div><h1>A question is just the beginning.</h1><p>Your next chapter, shaped around you.</p></div><button className="icon-button" aria-label="Start new conversation" disabled={busy} onClick={newChat}><Plus size={20}/></button></div>}
        <div className="chat-content">
          {hasMessages&&<div className="messages" role="log" aria-label="Conversation with Infinity">{workspace.messages.map(message=><div className={`message ${message.role}`} key={message.id}><span className={`message-avatar ${message.role}`}>{message.role==="assistant"?<InfinityIcon size={19}/>:"Y"}</span><div className="message-body"><span className="message-author">{message.role==="assistant"?"Infinity":"You"}{message.role==="assistant"&&<small>CLAUDE</small>}</span><p>{message.content}</p>{message.pathId&&(()=>{const path=workspace.paths.find(p=>p.id===message.pathId);return path?<button className="generated-path" onClick={()=>openPath(path.id)}><span className="generated-path-icon"><GitBranch size={24}/></span><div><span><Check size={11}/> YOUR PATH IS READY</span><strong>{path.title}</strong><small>{path.topics.length-1} topics · Foundations to advanced</small></div><ArrowUpRight size={22}/></button>:null;})()}</div></div>)}{busy&&<div className="message assistant"><span className="message-avatar assistant"><InfinityIcon size={19}/></span><div className="message-body"><span className="message-author">Infinity <small>CLAUDE</small></span><div className="thinking" role="status"><span/><span/><span/><p>{workspace.messages.filter(m=>m.role==="user").length>1?"Connecting the dots for your learning path…":"Thinking about your next chapter…"}</p></div><small className="thinking-hint">Detailed roadmaps can take up to two minutes.</small></div></div>}</div>}
          {error&&<div className="chat-error" role="alert"><div><span className="error-indicator">!</span><p>{error}</p></div><button onClick={()=>send(lastUser,true)} disabled={busy}><RotateCcw size={14}/>Retry message</button></div>}
          {!busy&&workspace.suggestions.length>0&&<div className="reply-suggestions">{workspace.suggestions.map(suggestion=><button key={suggestion} onClick={()=>send(suggestion)}>{suggestion}<ArrowUpRight size={13}/></button>)}</div>}
          <form className="composer" onSubmit={e=>{e.preventDefault();void send(input);}}><label className="sr-only" htmlFor="chat-input">What do you want to learn?</label><textarea ref={composer} id="chat-input" value={input} onChange={e=>setInput(e.target.value)} placeholder={hasMessages?"Tell Infinity a little more…":"I’ve always wanted to learn…"} rows={2} maxLength={2400} disabled={busy||!hydrated} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send(input);}}}/><div className="composer-bottom"><span className="composer-model"><span className="claude-star">✳</span>Claude <span className="model-separator"/>Your personal learning guide</span>{busy?<button type="button" className="send-button stop" aria-label="Stop response" onClick={()=>controller.current?.abort()}><Square size={15} fill="currentColor"/></button>:<button type="submit" className="send-button" aria-label="Send message" disabled={!input.trim()||!hydrated}><ArrowUp size={20}/></button>}</div></form>
          <div className="composer-caption"><span><Sparkles size={12}/>{hasMessages?"Ask follow-up questions or reshape your learning path.":"A conversation. A custom roadmap. Your next possibility."}</span><span>Enter to send <span>↵</span></span></div>
          {!hasMessages&&<><div className="starter-heading"><span>NEED A LITTLE INSPIRATION?</span><span className="line"/></div><div className="starter-cards">{starters.map(({title,description,prompt,icon:Icon,color})=><button key={title} onClick={()=>send(prompt)} disabled={!hydrated} className={`starter-card ${color}`}><div><span><Icon size={20}/></span><ArrowUpRight size={15}/></div><strong>{title}</strong><p>{description}</p></button>)}</div><div className="quick-topics"><span>Or explore</span>{["Photography","Psychology","Personal finance"].map(topic=><button key={topic} onClick={()=>{setInput(`I want to learn ${topic.toLowerCase()}`);composer.current?.focus();}}>{topic}<ArrowUpRight size={11}/></button>)}</div></>}
          <div ref={conversationEnd}/>
        </div><footer className="chat-footer"><span><InfinityIcon size={14}/>Built for a mind that never stops wondering.</span><span>Learn something. Become more.</span></footer>
      </div>:page==="map"&&selectedPath?<LearningMap key={selectedPath.id} path={selectedPath} completed={workspace.completed[selectedPath.id]||[]} saved={workspace.saved} onComplete={complete} onSave={saveResource} onBack={()=>setPage("paths")} onRefine={refine} onAddBranch={addBranch} onResources={addResources}/>:page==="paths"?<section className="collection-page"><div className="collection-heading"><div><span className="eyebrow">YOUR NEXT CHAPTERS</span><h1>A world of possibility.<br/><span>Mapped out for you.</span></h1><p>Pick up where you left off, or let curiosity lead somewhere new.</p></div><button className="primary-button" onClick={newChat} disabled={busy}><Plus size={16}/>Create a path</button></div><label className="search-box collection-search"><Search size={16}/><input aria-label="Search learning paths" placeholder="Search your learning paths" value={search} onChange={e=>setSearch(e.target.value)}/></label><div className="path-cards">{workspace.paths.filter(path=>path.title.toLowerCase().includes(search.toLowerCase())).map(path=>{const done=workspace.completed[path.id]?.length||0;return <button className="path-card" key={path.id} onClick={()=>openPath(path.id)}><div className="path-card-art"><GitBranch size={43} strokeWidth={1.1}/><span className="card-orbit one"/><span className="card-orbit two"/><span className="art-spark">✦</span><span className="path-source">{path.source==="claude"?"MADE WITH CLAUDE":"EXAMPLE PATH"}</span></div><div className="path-card-body"><h2>{path.title}</h2><p>{path.description}</p><div className="path-card-meta"><span>{path.topics.length-1} topics</span><span>{done} completed</span></div><div className="progress-track"><span style={{width:`${done/(path.topics.length-1)*100}%`}}/></div><div className="path-card-link">Explore learning path<ArrowUpRight size={17}/></div></div></button>;})}</div>{!workspace.paths.some(path=>path.title.toLowerCase().includes(search.toLowerCase()))&&<div className="empty-state"><Search size={32}/><h2>No paths found</h2><p>Try another topic or create a new learning path.</p></div>}</section>:page==="saved"?<section className="collection-page"><div className="collection-heading"><div><span className="eyebrow">WORTH COMING BACK TO</span><h1>Your collection of<br/><span>lightbulb moments.</span></h1><p>Resources saved from your learning paths, all in one place.</p></div><span className="count-badge">{workspace.saved.length} saved</span></div><label className="search-box collection-search"><Search size={16}/><input aria-label="Search saved resources" placeholder="Search your collection" value={search} onChange={e=>setSearch(e.target.value)}/></label>{!workspace.saved.length?<div className="empty-state"><Bookmark size={36} strokeWidth={1.2}/><h2>Good finds belong here.</h2><p>Bookmark any resource in your learning map.<br/>We’ll keep it ready for your next deep dive.</p><button className="secondary-button" onClick={()=>setPage("paths")}>Explore your paths<ArrowRight size={15}/></button></div>:<div className="saved-grid">{workspace.saved.filter(r=>`${r.title} ${r.topicTitle} ${r.pathTitle}`.toLowerCase().includes(search.toLowerCase())).map(resource=><div key={resource.id}><div className="saved-context"><GitBranch size={12}/>{resource.pathTitle}<ChevronRight size={11}/>{resource.topicTitle}</div><ResourceCard resource={resource} saved onSave={()=>setWorkspace(s=>({...s,saved:s.saved.filter(r=>r.id!==resource.id)}))}/></div>)}{!workspace.saved.some(r=>`${r.title} ${r.topicTitle} ${r.pathTitle}`.toLowerCase().includes(search.toLowerCase()))&&<p className="muted">No resources match that search.</p>}</div>}</section>:<section className="collection-page discover-page"><div className="collection-heading"><div><span className="eyebrow">TAKE THE FIRST STEP</span><h1>What’s your next<br/><span>rabbit hole?</span></h1><p>Start a conversation about anything that sparks your curiosity.</p></div><Compass size={46} strokeWidth={1}/></div><div className="discover-grid">{[{title:"Technology & AI",icon:BrainCircuit,topics:["Machine learning","Web development","Cybersecurity"]},{title:"Create & express",icon:Sparkles,topics:["Photography","Music production","Creative writing"]},{title:"Understand the world",icon:Compass,topics:["Psychology","Astronomy","Climate science"]},{title:"Build your future",icon:Zap,topics:["Entrepreneurship","Personal finance","Public speaking"]}].map(({title,icon:Icon,topics})=><div className="discover-card" key={title}><span><Icon size={25}/></span><h2>{title}</h2>{topics.map(topic=><button key={topic} disabled={busy} onClick={()=>{setWorkspace(s=>({...s,messages:[],suggestions:[]}));setInput(`I want to learn ${topic.toLowerCase()}`);setError("");setPage("chat");}}>{topic}<ArrowUpRight size={15}/></button>)}</div>)}</div></section>}
    </main>
    {help&&<div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)setHelp(false);}}><section className="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title"><button className="icon-button modal-close" aria-label="Close help" onClick={()=>setHelp(false)}><X size={20}/></button><span className="modal-orb"><InfinityIcon size={35}/></span><span className="eyebrow">A LITTLE DIRECTION. INFINITE POSSIBILITY.</span><h2 id="help-title">Your curiosity has a companion.</h2><div className="help-steps">{[{icon:MessageSquare,title:"Start with a conversation",body:"Tell Infinity what you want to learn. Claude asks about your experience and goal, then creates a personalized roadmap."},{icon:GitBranch,title:"See how everything connects",body:"Explore branches, prerequisites, and deeper topics. Filter by difficulty and work through the path at your pace."},{icon:BookOpen,title:"Find your kind of learning",body:"Find real YouTube videos, blog articles, books, papers, and courses with live web search. Filter by difficulty, open direct sources, or generate deeper branches for any topic."},{icon:Bookmark,title:"Make it yours",body:"Save resources and mark topics complete. Your conversations and progress stay in this browser. Chat messages are sent to Anthropic to generate replies."}].map(({icon:Icon,title,body})=><div key={title}><span><Icon size={19}/></span><div><strong>{title}</strong><p>{body}</p></div></div>)}</div><button className="primary-button" onClick={()=>setHelp(false)}>Let’s explore<ArrowRight size={15}/></button></section></div>}
    {toast&&<div className="toast" role="status"><Check size={16}/>{toast}<button className="icon-button" aria-label="Dismiss notification" onClick={()=>setToast("")}><X size={15}/></button></div>}
  </div>;
}

import { useEffect, useState, type FormEvent } from "react";

type LandingPageProps = { onLaunch: (prompt?: string) => void };

const capabilities = [
  { icon: "◎", title: "Record the real task", text: "Show WhistleCode the steps on a website you choose. Your captured actions become an editable draft.", steps: ["Capture", "Edit", "Reuse"] },
  { icon: "⌘", title: "Make it repeatable", text: "Turn the steps you already do into a workflow you can return to and run again.", steps: ["Do it once", "Save steps", "Run again"] },
  { icon: "◈", title: "Set a clear scope", text: "Review the websites and action types a workflow is allowed to use before it runs.", steps: ["Choose site", "Set actions", "Review"] },
  { icon: "✓", title: "Keep the final say", text: "Sensitive actions pause for your approval, and each run leaves a visible activity trail.", steps: ["Review plan", "Approve step", "See history"] },
];
const integrations = [
  { icon: "◎", name: "Browser", status: "Available now", detail: "Record tasks on the websites you already use, then review the saved workflow before running it.", state: "available" },
  { icon: "▤", name: "Google Docs", status: "Record in browser", detail: "Teach document tasks in your browser and reuse them as scoped, reviewable workflows.", state: "available" },
  { icon: "▥", name: "PowerPoint", status: "Record in browser", detail: "Capture presentation tasks in your browser and review every step before reuse.", state: "available" },
  { icon: "✉", name: "Gmail & Calendar", status: "Connector coming soon", detail: "Dedicated account connections are planned. They are not active in this workspace yet.", state: "planned" },
  { icon: "▣", name: "Desktop", status: "Coming soon", detail: "Desktop recording is on the roadmap; browser-based recording is available today.", state: "planned" },
];
const signalPaths = [
  "M 490 -8 V 142 C 490 252 404 316 22 366",
  "M 548 -8 V 177 C 548 273 484 320 174 366",
  "M 602 -8 V 205 C 602 292 556 330 328 366",
  "M 657 -8 V 226 C 657 300 646 338 574 366",
  "M 720 -8 V 366",
  "M 783 -8 V 226 C 783 300 794 338 866 366",
  "M 838 -8 V 205 C 838 292 884 330 1112 366",
  "M 892 -8 V 177 C 892 273 956 320 1266 366",
  "M 950 -8 V 142 C 950 252 1036 316 1418 366",
];

export function LandingPage({ onLaunch }: LandingPageProps) {
  const [prompt, setPrompt] = useState("");
  useEffect(() => {
    const cards = document.querySelectorAll<HTMLElement>(
      ".landing-page .capability-card, .landing-page .insight-card, .landing-page .showcase-card, .landing-page .landing-integration-card",
    );
    if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      cards.forEach((card) => card.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.18 });
    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, []);
  const submitPrompt = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onLaunch(prompt.trim());
  };
  return (
    <div className="landing-page">
      <header className="landing-nav">
        <a className="brand-lockup" href="#top" aria-label="WhistleCode home"><img src="/whistlecode-mark.svg" alt="" /><span>whistle<span>code</span></span></a>
        <nav aria-label="Main navigation" className="landing-links"><a href="#product">Product</a><a href="#integrations">Integrations</a><a href="#how-it-works">How it works</a><a href="#trust">Trust</a></nav>
        <button className="nav-cta" onClick={() => onLaunch()}>Open workspace <span>↗</span></button>
      </header>

      <main id="top">
        <section className="landing-hero">
          <div className="hero-light-curtain" aria-hidden="true">{Array.from({ length: 16 }, (_, index) => <span className={`curtain-column curtain-column-${index % 5}`} key={index} />)}</div>
          <svg className="signal-field" viewBox="0 0 1440 390" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <filter id="signal-glow" x="-300%" y="-300%" width="700%" height="700%"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
              <linearGradient id="signal-stroke" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d7b36a" stopOpacity=".05" /><stop offset=".5" stopColor="#d7b36a" stopOpacity=".3" /><stop offset="1" stopColor="#f0d18a" stopOpacity=".7" /></linearGradient>
            </defs>
            {signalPaths.map((path, index) => <g key={path}>
              <path id={`signal-track-${index}`} className="signal-track" d={path} />
              <circle className="signal-pulse" r={index % 3 === 0 ? 2.4 : 1.8} filter="url(#signal-glow)">
                <animateMotion dur={`${4.2 + (index % 4) * 1.1}s`} begin={`${(index % 5) * -0.83}s`} repeatCount="indefinite"><mpath href={`#signal-track-${index}`} /></animateMotion>
              </circle>
              {index % 2 === 0 && <circle className="signal-pulse signal-pulse-soft" r="1.35" filter="url(#signal-glow)"><animateMotion dur={`${6.4 + index * 0.24}s`} begin={`${-index * 0.61}s`} repeatCount="indefinite"><mpath href={`#signal-track-${index}`} /></animateMotion></circle>}
            </g>)}
          </svg>
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-dot" /> AUTOMATION, WITH YOU IN CONTROL</div>
            <h1>Make busywork<br /><em>blow away.</em></h1>
            <p className="hero-description">Teach WhistleCode the tasks you repeat. Build reliable workflows, approve the important steps, and see exactly what happened.</p>
            <div className="hero-actions"><button className="primary-cta" onClick={() => onLaunch()}>Get started free <span>→</span></button><a className="text-cta" href="#how-it-works">See how it works <span>↗</span></a></div>
            <div className="hero-proof"><div className="proof-avatars"><span>W</span><span>✓</span><span>·</span></div><span>Human-approved by design</span></div>
          </div>

          <div className="hero-art" aria-label="Start a conversation with WhistleCode">
            <div className="orbit orbit-one" /><div className="orbit orbit-two" />
            <section className="landing-prompt-card" aria-label="Ask WhistleCode">
              <div className="landing-prompt-top"><span className="landing-prompt-mark"><img src="/whistlecode-mark.svg" alt="" /></span><span><strong>Ask WhistleCode</strong><small>Your workspace starts with a conversation</small></span><i className="landing-live-dot" />
              </div>
              <div className="landing-prompt-greeting"><span>WORKSPACE · READY WHEN YOU ARE</span><h2>What can I help you with?</h2><p>Describe a task, ask a question, or start a workflow draft. You’ll review every action before it runs.</p></div>
              <form className="landing-prompt-form" onSubmit={submitPrompt}>
                <label className="landing-prompt-sr-only" htmlFor="landing-prompt">Message WhistleCode</label>
                <textarea id="landing-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Ask anything or describe a task to automate…" rows={3} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
                <div className="landing-prompt-form-foot"><span>↵ to send · ⇧↵ for a new line</span><button type="submit" aria-label="Start with this prompt">↑</button></div>
              </form>
              <div className="landing-prompt-suggestions"><span>TRY ASKING</span><button type="button" onClick={() => setPrompt("Help me plan a task I repeat in my browser")}>Plan a browser task <b>↗</b></button><button type="button" onClick={() => setPrompt("Explain how approvals work before a workflow runs")}>Understand approvals <b>↗</b></button></div>
              <div className="landing-prompt-trust"><span>✓</span> Nothing runs until you review and approve the plan</div>
            </section>
          </div>
        </section>

        <section className="customer-row"><span>DESIGNED AROUND CLEAR, USER-APPROVED AUTOMATION</span><div><b>✓</b> Review every step</div><div><b>◉</b> Keep tasks in scope</div><div><b>⌘</b> Run locally</div><div><b>◈</b> Inspect the activity</div></section>

        <section className="feature-section" id="product">
          <div className="section-intro"><div className="eyebrow"><span className="eyebrow-dot" /> MADE FOR THE WORK YOU REPEAT</div><h2>A routine you<br />can trust.</h2><p>Start with a task you already know. Keep the plan and every decision in view.</p></div>
          <div className="capability-grid">{capabilities.map((item, index) => <article className={`capability-card capability-${index + 1}`} key={item.title}><div className="capability-icon" aria-hidden="true">0{index + 1}</div><span className="capability-number">WORKFLOW STEP</span><h3>{item.title}</h3><p>{item.text}</p><div className="capability-steps" aria-label={`${item.title}: ${item.steps.join(", then ")}`}>{item.steps.map((step, stepIndex) => <span className="capability-step" key={step}><i aria-hidden="true">{stepIndex + 1}</i>{step}</span>)}</div></article>)}</div>
        </section>

        <section className="landing-integrations-section" id="integrations" aria-labelledby="landing-integrations-title">
          <div className="showcase-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> WORK WITH THE TOOLS YOU USE</div><h2 id="landing-integrations-title">Your tools,<br /><em>one clear workflow.</em></h2></div><p>Record supported tasks in your browser today. Dedicated account connections will appear here when they are ready to use.</p></div>
          <div className="landing-integrations-grid">
            {integrations.map((item) => <article className={`landing-integration-card ${item.state}`} key={item.name}>
              <div className="landing-integration-top"><span className="landing-integration-icon" aria-hidden="true">{item.icon}</span><span className={`landing-integration-status ${item.state}`}><i />{item.status}</span></div>
              <h3>{item.name}</h3><p>{item.detail}</p>
            </article>)}
          </div>
          <div className="landing-integration-note"><span aria-hidden="true">✳</span>Every recorded workflow stays limited to its approved website scope. Gmail and Calendar account access is not enabled yet.</div>
        </section>

        <section className="insight-section" id="trust"><div className="section-intro centered"><div className="eyebrow"><span className="eyebrow-dot" /> NOTHING HAPPENS IN THE DARK</div><h2>Every action.<br /><em>In plain sight.</em></h2><p>Know what your workflow can do before it runs, and what it did when it finishes.</p></div>
          <div className="insight-grid"><article className="insight-card"><div className="insight-copy"><h3>A plan you can understand</h3><p>Review a readable step-by-step plan, with clear permissions and sensitive actions called out.</p></div><div className="plan-preview"><div className="plan-preview-head"><span>Support inbox triage</span><small>4 steps · review required</small></div><div><i>✓</i><span>Open the support inbox</span><b>LOW RISK</b></div><div><i>✓</i><span>Sort new messages by topic</span><b>LOW RISK</b></div><div className="plan-sensitive"><i>!</i><span>Send a reply to the customer</span><b>APPROVAL</b></div></div></article><article className="insight-card green-card"><div className="insight-copy"><h3>A trail you can trust</h3><p>Follow the run as it happens. Come back to a complete history of actions and approvals.</p></div><div className="activity-preview"><span className="activity-heading">LIVE ACTIVITY <b>● RUNNING</b></span><div><i>✓</i><span><b>Opened customer portal</b><small>Step 1 · completed</small></span><time>9:41:02</time></div><div><i>✓</i><span><b>Found 3 new requests</b><small>Step 2 · completed</small></span><time>9:41:04</time></div><div className="activity-wait"><i>Ⅱ</i><span><b>Waiting for your approval</b><small>Send customer reply</small></span><time>NOW</time></div></div></article></div>
        </section>

        <section className="showcase-section how-showcase-section" id="how-it-works" aria-labelledby="showcase-title">
          <div className="showcase-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> HOW IT WORKS · FROM TASK TO WORKFLOW</div><h2 id="showcase-title">Teach it. Review it.<br /><em>Run it with confidence.</em></h2></div><p>Show WhistleCode a real task, review the exact plan, then follow the run. Sensitive actions wait for your approval.</p></div>
          <div className="showcase-grid">
            <article className="showcase-card showcase-editor" aria-label="Step 1: teach WhistleCode by recording a real task">
              <div className="showcase-caption"><span>01 / TEACH A TASK</span><b>Recorded</b></div>
              <div className="showcase-window">
                <div className="showcase-windowbar"><span><i /><i /><i /></span><b>Recorded website task</b><small className="recording-count"><i /> 4 ACTIONS</small></div>
                <div className="showcase-editor-body"><div className="showcase-step-list"><div className="showcase-mini-step done"><i>✓</i><span><b>Open support inbox</b><small>Navigate · Captured</small></span></div><div className="showcase-mini-step done"><i>✓</i><span><b>Filter new requests</b><small>Click · Captured</small></span></div><div className="showcase-mini-step done"><i>✓</i><span><b>Open a customer record</b><small>Click · Captured</small></span></div><div className="showcase-mini-step needs-review"><i>!</i><span><b>Send customer reply</b><small>Submit · Review needed</small></span></div></div><div className="showcase-inspector"><small>WORKFLOW DRAFT</small><b>Support inbox triage</b><span>Recorded on<strong>support.example.com</strong></span><span>Steps captured<strong>4 actions</strong></span><span>Needs your review<strong className="showcase-risk">Sending a reply</strong></span></div></div>
              </div>
              <p>Do the task once on your chosen site. The captured steps become an editable draft.</p>
            </article>
            <article className="showcase-card showcase-approval" aria-label="Step 2: review the workflow and approve its scope">
              <div className="showcase-caption"><span>02 / REVIEW THE PLAN</span><b>Your decision</b></div>
              <div className="showcase-window approval-window">
                <div className="approval-mark">✓</div><div className="approval-kicker">READY FOR YOUR REVIEW</div><h3>Approve this workflow?</h3><p>Review what it will do and where it can act.</p>
                <div className="approval-summary"><span>WORKFLOW<strong>Support inbox triage</strong></span><span>ALLOWED WEBSITE<strong>support.example.com</strong></span><span>ACTION NEEDING APPROVAL<strong className="showcase-risk">Send customer reply</strong></span></div>
                <div className="approval-scope-tags"><span>● Read inbox</span><span>● Draft response</span><span>! Send reply</span></div><div className="approval-window-actions"><b>Edit plan</b><strong>Approve this version&nbsp; →</strong></div>
              </div>
              <p>Check every action, target, and allowed website. Approval applies to this plan version.</p>
            </article>
            <article className="showcase-card showcase-activity" aria-label="Step 3: follow the run and review its activity">
              <div className="showcase-caption"><span>03 / FOLLOW THE RUN</span><b>In view</b></div>
              <div className="showcase-window activity-window">
                <div className="activity-window-head"><span><small>WORKFLOW RUN</small><b>Support inbox triage</b></span><i>● IN PROGRESS</i></div>
                <div className="showcase-timeline"><div className="timeline-row complete"><i>✓</i><span><b>Opened support inbox</b><small>support.example.com</small></span><time>9:41:02</time></div><div className="timeline-row complete"><i>✓</i><span><b>Found 3 new requests</b><small>3 items ready to review</small></span><time>9:41:04</time></div><div className="timeline-row waiting"><i>Ⅱ</i><span><b>Waiting for your approval</b><small>Send a reply to Jordan</small></span><time>NOW</time></div></div>
                <div className="activity-safe-note">The workflow is paused until you decide.</div>
              </div>
              <p>Follow each step as it happens. Sensitive actions pause until you approve them.</p>
            </article>
          </div>
        </section>

        <section className="closing-cta"><div className="closing-mark"><img src="/whistlecode-mark.svg" alt="" /></div><div><h2>Ready to clear<br />the busywork?</h2><p>Start with one task. Keep every decision yours.</p><button className="primary-cta" onClick={() => onLaunch()}>Open WhistleCode <span>→</span></button></div></section>
      </main>
      <footer className="landing-footer"><a className="brand-lockup footer-brand" href="#top"><img src="/whistlecode-mark.svg" alt="" /><span>whistle<span>code</span></span></a><span>Thoughtful automation, at your pace.</span><span>© 2026 WhistleCode</span></footer>
    </div>
  );
}

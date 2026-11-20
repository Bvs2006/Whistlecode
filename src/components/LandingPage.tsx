import { useEffect, useState, type FormEvent } from "react";

type LandingPageProps = { onLaunch: (prompt?: string) => void };

const capabilities = [
  { icon: "◎", title: "Record the real task", text: "Show WhistleCode the steps on a website you choose. Your captured actions become an editable draft." },
  { icon: "⌘", title: "Make it repeatable", text: "Turn the steps you already do into a workflow you can return to and run again." },
  { icon: "◈", title: "Set a clear scope", text: "Review the websites and action types a workflow is allowed to use before it runs." },
  { icon: "✓", title: "Keep the final say", text: "Sensitive actions pause for your approval, and each run leaves a visible activity trail." },
];
const integrations = [
  { icon: "◎", name: "Browser", status: "Available now", detail: "Record tasks on the websites you already use, then review the saved workflow before running it.", state: "available" },
  { icon: "▤", name: "Google Docs", status: "Record in browser", detail: "Teach document tasks in your browser and reuse them as scoped, reviewable workflows.", state: "available" },
  { icon: "▥", name: "PowerPoint", status: "Record in browser", detail: "Capture presentation tasks in your browser and review every step before reuse.", state: "available" },
  { icon: "✉", name: "Gmail & Calendar", status: "Connector coming soon", detail: "Dedicated account connections are planned. They are not active in this workspace yet.", state: "planned" },
  { icon: "▣", name: "Desktop", status: "Coming soon", detail: "Desktop recording is on the roadmap; browser-based recording is available today.", state: "planned" },
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
    <div className="landing-page landing-v0-layout">
      <aside className="landing-sidebar" aria-label="WhistleCode navigation">
        <a className="brand-lockup" href="#top" aria-label="WhistleCode home"><img src="/whistlecode-mark.svg" alt="" /><span>whistle<span>code</span></span></a>
        <button className="landing-sidebar-new" type="button" onClick={() => onLaunch()}>New chat <span className="landing-chevron" aria-hidden="true" /></button>
        <nav aria-label="Explore WhistleCode" className="landing-sidebar-nav">
          <span className="landing-sidebar-label">EXPLORE</span>
          <a href="#product"><span aria-hidden="true"><svg viewBox="0 0 20 20"><rect x="3" y="3" width="5" height="5" rx="1" /><rect x="12" y="3" width="5" height="5" rx="1" /><rect x="3" y="12" width="5" height="5" rx="1" /><rect x="12" y="12" width="5" height="5" rx="1" /></svg></span> Product</a>
          <a href="#how-it-works"><span aria-hidden="true"><svg viewBox="0 0 20 20"><path d="M6 4h11M6 10h11M6 16h11" /><circle cx="3" cy="4" r=".7" /><circle cx="3" cy="10" r=".7" /><circle cx="3" cy="16" r=".7" /></svg></span> How it works</a>
          <a href="#integrations"><span aria-hidden="true"><svg viewBox="0 0 20 20"><circle cx="10" cy="4" r="2" /><circle cx="4" cy="15" r="2" /><circle cx="16" cy="15" r="2" /><path d="m9 6-4 7m6-7 4 7M6 15h8" /></svg></span> Integrations</a>
          <a href="#trust"><span aria-hidden="true"><svg viewBox="0 0 20 20"><path d="M10 2.5 16 5v4.3c0 4.1-2.5 6.7-6 8.2-3.5-1.5-6-4.1-6-8.2V5z" /><path d="m7.5 9.8 1.7 1.7 3.5-3.6" /></svg></span> Trust &amp; control</a>
        </nav>
        <div className="landing-sidebar-bottom">
          <div className="landing-sidebar-note-icon" aria-hidden="true">✓</div>
          <div><strong>You stay in control</strong><span>Review actions before workflows run.</span></div>
        </div>
      </aside>

      <div className="landing-content">
        <main id="top">
          <section className="landing-hero landing-hero-v0">
            <div className="landing-hero-center">
              <div className="landing-intro-pill"><img src="/whistlecode-mark.svg" alt="" /> A calmer way to automate</div>
              <h1>What would you like<br /><span>to get done?</span></h1>
              <p className="hero-description">Tell WhistleCode about a task you repeat. Turn it into a workflow you can review, approve, and run with confidence.</p>
              <section className="landing-prompt-card" aria-label="Ask WhistleCode">
                <form className="landing-prompt-form" onSubmit={submitPrompt}>
                  <label className="landing-prompt-sr-only" htmlFor="landing-prompt">Describe a task for WhistleCode</label>
                  <textarea id="landing-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe a task you repeat or a workflow you want to create…" rows={3} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
                  <div className="landing-prompt-form-foot"><span>Press Enter to start · Shift + Enter for a new line</span><button type="submit" aria-label="Start with this prompt">↑</button></div>
                </form>
                <div className="landing-prompt-suggestions"><span>GET STARTED</span><button type="button" onClick={() => setPrompt("Help me plan a task I repeat in my browser")}>Plan a browser task <b>↗</b></button><button type="button" onClick={() => setPrompt("Explain how approvals work before a workflow runs")}>Learn about approvals <b>↗</b></button></div>
              </section>
              <div className="landing-prompt-trust"><span>✓</span> Nothing runs until you review and approve the plan</div>
              <a className="landing-hero-secondary" href="#how-it-works">See how it works <span aria-hidden="true">↓</span></a>
            </div>
          </section>

          <section className="customer-row"><span>BUILT AROUND YOUR CONTROL</span><div><b>✓</b> Review every step</div><div><b>◉</b> Keep tasks in scope</div><div><b>⌘</b> Work in your browser</div><div><b>◈</b> Inspect the activity</div></section>

        <section className="feature-section" id="product">
          <div className="section-intro"><div className="eyebrow"><span className="eyebrow-dot" /> MADE FOR THE WORK YOU REPEAT</div><h2>A routine you<br />can trust.</h2><p>Start with a task you already know. Keep the plan and every decision in view.</p></div>
          <div className="capability-grid">{capabilities.map((item, index) => <article className={`capability-card capability-${index + 1}`} key={item.title}><div className="capability-icon">{item.icon}</div><h3>{item.title}</h3><p>{item.text}</p>{index === 0 && <div className="tool-dots"><span>◎</span><span>◉</span><span>▣</span><span>⌘</span><span>✳</span><span>↗</span></div>}{index === 3 && <div className="approval-mini"><span>Review plan</span><span>✓ Approved by you</span><b>3 of 3 steps reviewed</b></div>}</article>)}</div>
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
    </div>
  );
}

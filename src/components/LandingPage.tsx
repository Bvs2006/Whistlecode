type LandingPageProps = { onLaunch: () => void };

const capabilities = [
  { icon: "◎", title: "Record a real task", text: "Use a separate browser window to capture the steps on the website you choose, then turn them into an editable workflow." },
  { icon: "⌘", title: "Works with your tools", text: "Bring your everyday browser tasks together in one clear, repeatable flow." },
  { icon: "◈", title: "Privacy by design", text: "Your workflows stay transparent, scoped, and reviewable at every step." },
  { icon: "✓", title: "You stay in control", text: "Sensitive actions pause for your approval. Nothing runs behind your back." },
];
const steps = [
  { number: "01", title: "Teach a task", text: "Record your steps in the separate browser window on the website you choose." },
  { number: "02", title: "Review the plan", text: "See each action, check the details, and choose what is allowed." },
  { number: "03", title: "Run with confidence", text: "Watch the workflow go, approve sensitive steps, and review its history." },
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
  return (
    <div className="landing-page">
      <header className="landing-nav">
        <a className="brand-lockup" href="#top" aria-label="WhistleCode home"><img src="/whistlecode-mark.svg" alt="" /><span>whistle<span>code</span></span></a>
        <nav aria-label="Main navigation" className="landing-links"><a href="#product">Product</a><a href="#how-it-works">How it works</a><a href="#trust">Trust</a><a href="#stories">About</a></nav>
        <button className="nav-cta" onClick={onLaunch}>Open workspace <span>↗</span></button>
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
            <div className="hero-actions"><button className="primary-cta" onClick={onLaunch}>Get started free <span>→</span></button><a className="text-cta" href="#how-it-works">See how it works <span>↗</span></a></div>
            <div className="hero-proof"><div className="proof-avatars"><span>W</span><span>✓</span><span>·</span></div><span>Human-approved by design</span></div>
          </div>

          <div className="hero-art" aria-label="Preview of the WhistleCode workflow workspace">
            <div className="orbit orbit-one" /><div className="orbit orbit-two" />
            <div className="workspace-card">
              <div className="mock-topbar"><div className="mock-brand"><img src="/whistlecode-mark.svg" alt="" /> whistlecode <span className="mock-workspace-tag">WORKSPACE</span></div><div className="mock-controls"><i /><i /><i /></div></div>
              <div className="mock-body">
                <aside className="mock-sidebar"><div className="mock-avatar">W</div><span className="mock-side-label">PREVIEW</span><div className="mock-side-active">◫ &nbsp; Overview</div><div className="mock-side-item">◉ &nbsp; Teach a task</div><div className="mock-side-item">▤ &nbsp; My workflows</div><div className="mock-side-item">◷ &nbsp; Activity</div><div className="mock-side-bottom">● &nbsp; Review before running</div></aside>
                <div className="mock-content"><div className="mock-greeting">YOUR WORKSPACE / MONDAY, 9:41 AM</div><div className="mock-title">Good morning, Alex <span>✳</span></div><p className="mock-subtitle">What would you like to take off your plate?</p>
                  <div className="mock-prompt"><span>✳</span><span>Describe a task to automate...</span><b>↑</b></div>
                  <div className="mock-section-head"><b>Recent workflows</b><span>See all →</span></div>
                  <div className="mock-workflow workflow-inbox"><div className="workflow-icon orange">✉</div><div><b>Sort the support inbox</b><small>Last run · Today at 9:12 AM</small></div><span className="workflow-status">● Ready</span></div>
                  <div className="mock-workflow workflow-report"><div className="workflow-icon green">▧</div><div><b>Prepare weekly report</b><small>Last run · Yesterday</small></div><span className="workflow-status">● Ready</span></div>
                  <div className="mock-metrics">
                    <article className="mock-metric-card"><div><span>READY</span><i>↗</i></div><b>03</b><small>workflows</small><div className="metric-bars"><i /><i /><i /><i /><i /><i /></div></article>
                    <article className="mock-metric-card metric-review"><div><span>NEEDS REVIEW</span><i>!</i></div><b>01</b><small>approval requested</small><div className="metric-progress"><i /></div></article>
                    <article className="mock-metric-card metric-steps"><div><span>STEPS THIS WEEK</span><i>✓</i></div><b>18</b><small>completed with you</small><div className="metric-bars"><i /><i /><i /><i /><i /><i /></div></article>
                  </div>
                  <div className="mock-mini-footer"><span>◉ &nbsp;Sensitive actions require approval</span><span>View activity →</span></div>
                </div>
              </div>
            </div>
            <div className="floating-note"><span className="note-check">✓</span><span><b>Approval requested</b><small>Review this step before it runs</small></span></div>
            <div className="floating-count"><span>✳</span><span><b>Every step is visible</b><small>Clear plans. No surprises.</small></span></div>
          </div>
        </section>

        <section className="customer-row"><span>DESIGNED AROUND CLEAR, USER-APPROVED AUTOMATION</span><div><b>✓</b> Review every step</div><div><b>◉</b> Keep tasks in scope</div><div><b>⌘</b> Run locally</div><div><b>◈</b> Inspect the activity</div></section>

        <section className="feature-section" id="product">
          <div className="section-intro"><div className="eyebrow"><span className="eyebrow-dot" /> A CLEARER WAY TO WORK</div><h2>Set up in<br />a few steps.</h2><p>Automation should feel simple, understandable, and yours from the very beginning.</p></div>
          <div className="capability-grid">{capabilities.map((item, index) => <article className={`capability-card capability-${index + 1}`} key={item.title}><div className="capability-icon">{item.icon}</div><h3>{item.title}</h3><p>{item.text}</p>{index === 0 && <div className="tool-dots"><span>◎</span><span>◉</span><span>▣</span><span>⌘</span><span>✳</span><span>↗</span></div>}{index === 3 && <div className="approval-mini"><span>Review plan</span><span>✓ Approved by you</span><b>3 of 3 steps reviewed</b></div>}</article>)}</div>
        </section>

        <section className="insight-section" id="trust"><div className="section-intro centered"><div className="eyebrow"><span className="eyebrow-dot" /> NOTHING HAPPENS IN THE DARK</div><h2>Every action.<br /><em>In plain sight.</em></h2><p>Know what your workflow can do before it runs, and what it did when it finishes.</p></div>
          <div className="insight-grid"><article className="insight-card"><div className="insight-copy"><h3>A plan you can understand</h3><p>Review a readable step-by-step plan, with clear permissions and sensitive actions called out.</p></div><div className="plan-preview"><div className="plan-preview-head"><span>Support inbox triage</span><small>4 steps · review required</small></div><div><i>✓</i><span>Open the support inbox</span><b>LOW RISK</b></div><div><i>✓</i><span>Sort new messages by topic</span><b>LOW RISK</b></div><div className="plan-sensitive"><i>!</i><span>Send a reply to the customer</span><b>APPROVAL</b></div></div></article><article className="insight-card green-card"><div className="insight-copy"><h3>A trail you can trust</h3><p>Follow the run as it happens. Come back to a complete history of actions and approvals.</p></div><div className="activity-preview"><span className="activity-heading">LIVE ACTIVITY <b>● RUNNING</b></span><div><i>✓</i><span><b>Opened customer portal</b><small>Step 1 · completed</small></span><time>9:41:02</time></div><div><i>✓</i><span><b>Found 3 new requests</b><small>Step 2 · completed</small></span><time>9:41:04</time></div><div className="activity-wait"><i>Ⅱ</i><span><b>Waiting for your approval</b><small>Send customer reply</small></span><time>NOW</time></div></div></article></div>
        </section>

        <section className="showcase-section" aria-labelledby="showcase-title">
          <div className="showcase-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> A CLEAR VIEW AT EVERY STEP</div><h2 id="showcase-title">The whole workflow,<br /><em>right in front of you.</em></h2></div><p>Build a plan, approve its exact scope, then follow every action as it happens.</p></div>
          <div className="showcase-grid">
            <article className="showcase-card showcase-editor">
              <div className="showcase-caption"><span>01 / WORKFLOW STUDIO</span><b>Build</b></div>
              <div className="showcase-window">
                <div className="showcase-windowbar"><span><i /><i /><i /></span><b>My workflows</b><small>VERSION 4</small></div>
                <div className="showcase-editor-body"><div className="showcase-step-list"><div className="showcase-mini-step done"><i>✓</i><span><b>Open support inbox</b><small>Navigate · Low risk</small></span></div><div className="showcase-mini-step done"><i>✓</i><span><b>Filter new requests</b><small>Click · Low risk</small></span></div><div className="showcase-mini-step needs-review"><i>!</i><span><b>Send customer reply</b><small>Submit · Approval needed</small></span></div><div className="showcase-add-step">＋ Add workflow step</div></div><div className="showcase-inspector"><small>STEP DETAILS</small><b>Send customer reply</b><span>Action type <strong>Submit form</strong></span><span>Website <strong>support.example.com</strong></span><span>Risk <strong className="showcase-risk">Review required</strong></span></div></div>
              </div>
              <p>Arrange the steps and check the target, website, and risk.</p>
            </article>
            <article className="showcase-card showcase-approval">
              <div className="showcase-caption"><span>02 / PERMISSIONS</span><b>Review</b></div>
              <div className="showcase-window approval-window">
                <div className="approval-mark">✓</div><div className="approval-kicker">READY FOR YOUR REVIEW</div><h3>Approve this workflow?</h3><p>Review what it will do and where it can act.</p>
                <div className="approval-summary"><span>WORKFLOW<strong>Support inbox triage</strong></span><span>ALLOWED WEBSITE<strong>support.example.com</strong></span><span>ACTION NEEDING APPROVAL<strong className="showcase-risk">Send customer reply</strong></span></div>
                <div className="approval-scope-tags"><span>● Read inbox</span><span>● Draft response</span><span>! Send reply</span></div><div className="approval-window-actions"><b>Edit plan</b><strong>Approve this version&nbsp; →</strong></div>
              </div>
              <p>Approvals stay tied to the version and website you reviewed.</p>
            </article>
            <article className="showcase-card showcase-activity">
              <div className="showcase-caption"><span>03 / RUN ACTIVITY</span><b>Follow</b></div>
              <div className="showcase-window activity-window">
                <div className="activity-window-head"><span><small>WORKFLOW RUN</small><b>Support inbox triage</b></span><i>● IN PROGRESS</i></div>
                <div className="showcase-timeline"><div className="timeline-row complete"><i>✓</i><span><b>Opened support inbox</b><small>support.example.com</small></span><time>9:41:02</time></div><div className="timeline-row complete"><i>✓</i><span><b>Found 3 new requests</b><small>3 items ready to review</small></span><time>9:41:04</time></div><div className="timeline-row waiting"><i>Ⅱ</i><span><b>Waiting for your approval</b><small>Send a reply to Jordan</small></span><time>NOW</time></div></div>
                <div className="activity-safe-note">The workflow is paused until you decide.</div>
              </div>
              <p>Watch progress and see exactly where a decision is needed.</p>
            </article>
          </div>
        </section>

        <section className="how-section" id="how-it-works"><div className="section-intro centered"><div className="eyebrow"><span className="eyebrow-dot" /> A SIMPLE WORKFLOW</div><h2>From repeat task<br />to done.</h2><p>Record a real website task, review the workflow it creates, then run it with your approval.</p></div><div className="feature-list">{steps.map((step) => <article className="feature-item" key={step.number}><span>{step.number}</span><div><h3>{step.title}</h3><p>{step.text}</p></div><b>↗</b></article>)}</div></section>

        <section className="stories-section" id="stories"><div className="section-intro centered"><div className="eyebrow"><span className="eyebrow-dot" /> YOUR WORK, YOUR RULES</div><h2>Make room for<br /><em>better work.</em></h2><p>Let the routine take care of itself, while you focus on what needs your judgment.</p></div><div className="quote-grid"><article><span>01</span><p>Start with a real browser task and capture the actions you want to repeat.</p><b>Teach</b><small>Turn your recorded steps into an editable plan.</small></article><article><span>02</span><p>Check the targets, arguments, allowed sites, and risk before execution.</p><b>Review</b><small>Approvals apply to the exact plan and scope.</small></article><article><span>03</span><p>Watch the run, pause for sensitive actions, and inspect its history.</p><b>Stay in control</b><small>Every important action stays visible and reviewable.</small></article></div></section>

        <section className="closing-cta"><div className="closing-mark"><img src="/whistlecode-mark.svg" alt="" /></div><div><h2>Ready to clear<br />the busywork?</h2><p>Start with one task. Keep every decision yours.</p><button className="primary-cta" onClick={onLaunch}>Open WhistleCode <span>→</span></button></div></section>
      </main>
      <footer className="landing-footer"><a className="brand-lockup footer-brand" href="#top"><img src="/whistlecode-mark.svg" alt="" /><span>whistle<span>code</span></span></a><span>Thoughtful automation, at your pace.</span><span>© 2026 WhistleCode</span></footer>
    </div>
  );
}

# WhistleCode 🚀

**WhistleCode** is a privacy-first, human-in-the-loop AI desktop and web automation platform. It allows users to teach tasks by demonstration or prompt, converts them into transparent and editable structured workflows, enforces strict permission and domain boundaries, requires cryptographic plan approval, and safely executes steps with verifiable post-conditions.

---

## 📑 Table of Contents

- [Overview & Philosophy](#-overview--philosophy)
- [Key Features](#-key-features)
- [Architecture & Tech Stack](#-architecture--tech-stack)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Environment Setup](#environment-setup)
  - [Backend Setup (FastAPI)](#backend-setup-fastapi)
  - [Frontend Setup (React + Vite)](#frontend-setup-react--vite)
- [Workflow Lifecycle](#-workflow-lifecycle)
- [AI Providers & Integrations](#-ai-providers--integrations)
- [Security, Governance & Policy Engine](#-security-governance--policy-engine)
- [Testing & Quality Assurance](#-testing--quality-assurance)
- [Configuration Reference](#-configuration-reference)

---

## 💡 Overview & Philosophy

Modern AI workflow automation often runs as an opaque black box with unvetted permissions and unpredictable outcomes. **WhistleCode** is built on the principle of **verifiable agency and human oversight**:

1. **No Silent Actions**: Every automated action must be part of an approved, inspectable plan.
2. **Explicit Domain & Tool Scoping**: Workflows declare their allowed origins, tools, and parameters up-front.
3. **Cryptographic Approval**: Plans are hashed and signed before execution; tampering or parameter drifts invalidate the run.
4. **Resilient Step-by-Step Execution**: Actions execute through an explicit finite state machine with pre-checks, post-condition validation, human confirmation gates, and safe emergency stops.

---

## ✨ Key Features

### 1. 🤖 Ask AI (Conversational Agent)
- Natural language interface to plan, draft, and iterate on complex workflows.
- Real-time streaming responses with tool-use visualization, clarification prompts, and progressive draft refinement.
- Context-aware assistance backed by persistent memory and skills.

### 2. 🎥 Teach a Task (Recording Studio)
- Record browser actions or desktop interactions in real time.
- Capture mouse clicks, navigation events, inputs, and DOM observations.
- Synthesize captured interaction traces into clean, parameterized workflow drafts.

### 3. 🛠️ Workflow Builder & Pre-built Templates
- Visual workflow editor with step re-ordering, parameter binding, and pre/post-condition checks.
- Ready-to-use workflow templates for common web, document, and research tasks.
- Content hashing and version management for full reproducibility.

### 4. 🛡️ Governance, Permissions & Plan Approval
- Visual risk assessment of plans (low, medium, high risk).
- Strict origin/website whitelisting (e.g. only access designated URLs).
- Cryptographic plan signing with HMAC keys (`approval_signing.key`) to guarantee plan integrity before execution.

### 5. ⚡ Live Run Monitor & State Machine
- Step-by-step executor with granular state tracking (`IDLE`, `PRECHECK`, `EXECUTING_STEP`, `PENDING_CONFIRMATION`, `COMPLETED`, `STOPPED`, `FAILED`).
- Interactive pause, step-confirmation, and one-click safe-stop capabilities.
- Live DOM verification and assertion testing after step execution.

### 6. 🧠 AI Agent Studio, Skills & Long-Term Memory
- Define specialized AI agents with assigned roles, system instructions, and pinned workflows.
- Extensible skill library with categorized abilities (data extraction, document parsing, web search).
- Categorized persistent memory (user preferences, facts, past operational learnings).

### 7. ⏱️ Automations & Triggers
- Schedule periodic task executions or trigger runs based on event conditions.
- Automated background evaluation with active status monitoring.

### 8. 📜 Activity Center & Tamper-Evident Audit Trail
- Comprehensive timeline of all system events, plan modifications, approvals, and run logs.
- SQLite-backed event persistence with detailed JSON payloads for post-hoc analysis.

### 9. 🧪 Safe Sandboxes
- Built-in sandboxed environments (such as the Paper Organizer Sandbox) to safely test and verify document and web manipulation routines without affecting production files or external services.

---

## 🏗️ Architecture & Tech Stack

```
   ┌──────────────────────────────────────────────────────────────┐
   │                   Frontend (React 19 + Vite)                 │
   │  TypeScript • Custom CSS Design System • SSE Event Streams   │
   └──────────────────────────────┬───────────────────────────────┘
                                  │ Proxy: /api -> :8000
                                  ▼
   ┌──────────────────────────────────────────────────────────────┐
   │                   Backend (FastAPI + Python)                 │
   │                                                              │
   │   • AI Router (Gemini, Groq, OpenRouter, Ollama)             │
   │   • Recorder & Desktop Observer (Playwright, PSUtil)         │
   │   • Synthesizer & Goal Planner                               │
   │   • Policy Engine & Approval Service (HMAC signing)          │
   │   • State Machine Executor & Step Verifiers                  │
   │   • Agents, Skills, Memory & Automations Repositories        │
   │   • Audit Logger & SQLite Persistence                        │
   └──────────────────────────────┬───────────────────────────────┘
                                  ▼
   ┌──────────────────────────────────────────────────────────────┐
   │                   Database (SQLite)                          │
   │   Workflows • Runs • Approvals • Audit • Agents • Skills     │
   └──────────────────────────────────────────────────────────────┘
```

- **Frontend**: React 19, TypeScript, Vite, custom responsive design system with Light and Dark themes.
- **Backend**: Python 3.10+, FastAPI, Uvicorn, Pydantic, HTTPX, Playwright, Pandas, PyYAML.
- **Database**: SQLite (`backend/whistlecode.db`).
- **AI Integrations**: Google Gemini (`google-genai` / REST), Groq, OpenRouter, and local Ollama.

---

## 📂 Project Structure

```text
WhistleCode/
├── backend/
│   ├── app/
│   │   ├── ag_ui/           # Agent UI streaming, log recorder & assistants
│   │   ├── agents/          # Agent definition, builder & repository
│   │   ├── approval/        # Cryptographic signing & approval verification
│   │   ├── audit/           # Tamper-evident audit logging engine
│   │   ├── automations/     # Trigger engine & automation scheduler
│   │   ├── credentials/     # Secure credential management & storage
│   │   ├── db/              # SQLite connection & schema migrations
│   │   ├── documents/       # Artifact and document management
│   │   ├── executor/        # Step-by-step state machine runner
│   │   ├── generation/      # Workflow synthesizer, prompt & AI providers
│   │   ├── integrations/    # External connectors (Gemini, Groq, OpenRouter, GitHub)
│   │   ├── memory/          # Agent long-term memory store
│   │   ├── models/          # Pydantic data schemas
│   │   ├── planning/        # Goal breakdown & task planner
│   │   ├── plugins/         # Extensible plugin system
│   │   ├── policy/          # Safety policies & origin rules
│   │   ├── recording/       # Browser recorder & desktop observer
│   │   ├── sandbox/         # Isolated test environments & paper organizer
│   │   ├── skills/          # Reusable skill registry
│   │   ├── tools/           # Sandboxed execution tools
│   │   ├── verifier/        # Postcondition & DOM verification logic
│   │   └── main.py          # FastAPI application entrypoint & API routes
│   └── tests/               # Backend pytest test suite
├── src/
│   ├── api/                 # Frontend API client
│   ├── components/
│   │   ├── activity/        # Unified Activity Center & Run History
│   │   ├── agents/          # Agent Studio view & editor
│   │   ├── ag_ui/           # Chronicle Command Center & streaming logs
│   │   ├── approval/        # Approval modal & review dialogs
│   │   ├── audit/           # Audit trail viewer & inspector
│   │   ├── automations/     # Automations and triggers manager
│   │   ├── dashboard/       # Metric cards & overview stats
│   │   ├── editor/          # Step editor & workflow parameter panels
│   │   ├── execution/       # Live run controls & state visualizer
│   │   ├── integrations/    # Integrations Hub & API key manager
│   │   ├── recording/       # Recording Studio & clarification modal
│   │   ├── sandbox/         # Paper Organizer sandbox viewer
│   │   ├── skills/          # Skills & Memory management view
│   │   ├── templates/       # Workflow templates catalog
│   │   └── views/           # Primary views (AskAI, Teach, Permissions, etc.)
│   ├── services/            # Client-side API service bridges
│   ├── App.tsx              # Root React component & navigation state
│   ├── main.tsx             # Vite React entry point
│   ├── styles.css           # Core styling and typography
│   ├── ui-polish.css        # Visual styling refinements
│   └── workspace.css        # Workspace layout styles
├── .env.example             # Example environment configuration
├── package.json             # Frontend dependencies & npm scripts
├── vite.config.ts           # Vite configuration with API reverse proxy
└── README.md                # Project documentation
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v18 or higher (v20+ recommended)
- **Python**: v3.10 or higher (v3.11 / v3.12 / v3.14 compatible)
- **Package Manager**: npm or pnpm

---

### Environment Setup

Create your `.env` file by copying the template:

```bash
cp .env.example .env
```

Configure your API keys in `.env` (keys can also be configured directly via the UI in **Integrations**):

```ini
# AI Provider Keys (choose any or all)
GEMINI_API_KEY=your_gemini_api_key
GROQ_API_KEY=your_groq_api_key
OPENROUTER_API_KEY=your_openrouter_api_key

# GitHub Integration (optional)
GITHUB_TOKEN=your_github_personal_access_token

# CORS & Server Origins
WHISTLECODE_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173
```

---

### Backend Setup (FastAPI)

1. Create and activate a Python virtual environment:

   ```bash
   # Windows (PowerShell)
   python -m venv venv
   .\venv\Scripts\Activate.ps1

   # macOS / Linux
   python3 -m venv venv
   source venv/bin/activate
   ```

2. Install Python dependencies:

   ```bash
   pip install fastapi uvicorn pydantic httpx playwright psutil pyyaml pandas pytest
   playwright install chromium
   ```

3. Launch the FastAPI server:

   ```bash
   python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload
   ```

   The backend will be running at `http://127.0.0.1:8000`.
   - Interactive Swagger API docs: `http://127.0.0.1:8000/docs`
   - Redoc alternative docs: `http://127.0.0.1:8000/redoc`

---

### Frontend Setup (React + Vite)

1. Install frontend dependencies:

   ```bash
   npm install
   ```

2. Start the Vite development server:

   ```bash
   npm run dev
   ```

3. Open your browser at `http://localhost:5173` to start using WhistleCode.

---

## 🔄 Workflow Lifecycle

Every automation in WhistleCode traverses a transparent lifecycle:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  1. Prompt   │ ──► │ 2. Synthesize│ ──► │  3. Review   │
│  or Teach    │     │  AI Draft    │     │   & Edit     │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                 │
┌──────────────┐     ┌──────────────┐     ┌──────▼───────┐
│  6. Audit    │ ◄── │  5. Execute  │ ◄── │  4. Scope &  │
│  & Verify    │     │ State Machine│     │    Approve   │
└──────────────┘     └──────────────┘     └──────────────┘
```

1. **Prompt or Teach**: Describe your goal in **Ask AI** or demonstrate actions in the **Recording Studio**.
2. **Synthesize**: The AI generates a structured, step-by-step workflow with actions (`NAVIGATE`, `CLICK`, `TYPE`, `EXTRACT`, `ASSERT`).
3. **Review & Edit**: Customize parameters, reorder steps, or adjust validation criteria in the **Workflow Builder**.
4. **Scope & Approve**: Restrict target web origins and approve the cryptographic plan fingerprint under **Permissions & Governance**.
5. **Execute**: The state machine executes steps one-by-one, pausing for sensitive confirmations if required.
6. **Audit & Verify**: All actions, observations, and policy checks are permanently recorded in the **Activity & Audit Trail**.

---

## 🌐 AI Providers & Integrations

WhistleCode features an intelligent provider router (`ai_router`) that supports multiple LLM backends:

| Provider | Supported Models | Primary Use Case |
|---|---|---|
| **Google Gemini** | `gemini-2.5-flash`, `gemini-1.5-pro` | High-speed workflow generation, multi-modal reasoning |
| **Groq** | `llama-3.3-70b-versatile`, `mixtral-8x7b` | Ultra-low latency plan synthesis |
| **OpenRouter** | Any OpenRouter-supported model | Broad model flexibility & fallback routing |
| **Ollama** | `llama3`, `mistral`, `qwen2.5` | 100% local, offline, and private execution |

Configure provider keys in `.env` or through the **Integrations Hub** tab in the application.

---

## 🔒 Security, Governance & Policy Engine

WhistleCode is engineered for enterprise-grade control and safety:

- **Origin Scoping**: Restricts browser navigation strictly to pre-approved domain origins.
- **Cryptographic Plan Signing**: Each plan generates a SHA-256 hash signed with an HMAC key (`approval_signing.key`). Any modification to steps or parameters requires re-approval.
- **Sensitive Action Gates**: Critical operations (e.g. form submission, data deletion, credential usage) trigger a `PENDING_CONFIRMATION` pause in execution.
- **Isolated Sandboxing**: Sample document workflows and local file parsers execute inside protected directories (`backend/data/.whistlecode-sandbox`).

---

## 🧪 Testing & Quality Assurance

### Run Backend Tests

WhistleCode includes extensive test coverage across generation, approval, policy, verification, and state machine execution:

```bash
# Run all backend tests
pytest backend/tests/ -v

# Run specific test modules
pytest backend/tests/test_policy.py -v
pytest backend/tests/test_permissions_and_approval.py -v
pytest backend/tests/test_ai_workflow_generation.py -v
```

### Build & Type-Check Frontend

```bash
# TypeScript compilation & Vite production build
npm run build
```

---

## ⚙️ Configuration Reference

| Environment Variable | Description | Default |
|---|---|---|
| `GEMINI_API_KEY` | API Key for Google Gemini | None |
| `GROQ_API_KEY` | API Key for Groq Cloud | None |
| `OPENROUTER_API_KEY` | API Key for OpenRouter | None |
| `GITHUB_TOKEN` | GitHub Personal Access Token | None |
| `WHISTLECODE_ALLOWED_ORIGINS` | Permitted frontend origins for CORS | `http://localhost:5173,...` |
| `WHISTLECODE_API_TARGET` | Frontend proxy target for backend API | `http://localhost:8000` |

---

## 📄 License

This project is licensed under the terms defined in the repository license.

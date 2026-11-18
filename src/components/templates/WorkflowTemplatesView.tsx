import React, { useState } from "react";
import type { WorkflowDefinition, AppSection } from "../../types";
import {
  Sparkles,
  Play,
  Video,
  Copy,
  CheckCircle2,
  ExternalLink,
  Layers,
  ArrowRight,
  Zap,
  Globe,
  Mail,
  Folder,
  Search,
  Filter,
} from "../icons/Icons";

export interface WorkflowTemplate {
  id: string;
  title: string;
  badge: string;
  category: "Finance" | "Sales & CRM" | "DevOps & IT" | "Operations" | "Research";
  description: string;
  timeSaved: string;
  requiredIntegrations: string[];
  workflow: WorkflowDefinition;
  demoUrl?: string;
}

const CADDI_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "tmpl_invoice_extractor",
    title: "Unattended Invoice & Receipt Extraction",
    badge: "Most Popular",
    category: "Finance",
    description: "Monitors incoming mail or downloads folder for vendor PDF invoices, parses line items and amounts, and stores them in your accounting directory without human intervention.",
    timeSaved: "5 hrs / week",
    requiredIntegrations: ["Gmail", "Local Desktop", "Browser"],
    demoUrl: "https://accounting.internal.corp/invoices",
    workflow: {
      workflow_id: "wf_template_invoice",
      title: "Unattended Invoice & Receipt Extraction",
      intent: "Identify, extract and categorize vendor invoices automatically",
      allowed_origins: ["https://accounting.internal.corp", "https://gmail.googleapis.com"],
      parameters: [
        { name: "target_folder", type: "string", default_value: "C:/Invoices/2026", description: "Target storage directory", required: false },
        { name: "min_amount_threshold", type: "number", default_value: 50, description: "Filter receipts under amount", required: false }
      ],
      steps: [
        {
          id: "step_1",
          name: "Open Invoice Portal",
          action: "navigate",
          target: { css_fallback: "body" },
          args: { url: "https://accounting.internal.corp/invoices" },
          risk: "low",
          requires_confirmation: false,
          idempotent: true,
          enabled: true,
          preconditions: [],
          postconditions: []
        },
        {
          id: "step_2",
          name: "Extract Pending Invoices Table",
          action: "extract",
          target: { css_fallback: "table.invoice-list tr" },
          args: {},
          risk: "low",
          requires_confirmation: false,
          idempotent: true,
          enabled: true,
          preconditions: [],
          postconditions: []
        },
        {
          id: "step_3",
          name: "Confirm and File Export",
          action: "click",
          target: { css_fallback: "button#export-all-verified" },
          args: {},
          risk: "medium",
          requires_confirmation: true,
          idempotent: false,
          enabled: true,
          preconditions: [],
          postconditions: []
        }
      ],
      final_postconditions: [],
      version: 1,
      content_hash: "hash_invoice_template",
      change_summary: "Caddi-style standard template"
    }
  },
  {
    id: "tmpl_lead_enricher",
    title: "Lead Web Enrichment & CRM Sync",
    badge: "Autonomous",
    category: "Sales & CRM",
    description: "Takes new prospective customer domains from spreadsheets, navigates company websites, extracts company size and executive contact info, and syncs into CRM.",
    timeSaved: "8 hrs / week",
    requiredIntegrations: ["Browser", "Google Drive", "Local Desktop"],
    demoUrl: "https://crm.internal.corp/leads",
    workflow: {
      workflow_id: "wf_template_leads",
      title: "Lead Web Enrichment & CRM Sync",
      intent: "Scrape company metadata and populate CRM contact records",
      allowed_origins: ["https://crm.internal.corp", "https://linkedin.com"],
      parameters: [
        { name: "batch_size", type: "number", default_value: 20, description: "Number of leads to process per run", required: false }
      ],
      steps: [
        {
          id: "step_1",
          name: "Navigate to Unverified Leads",
          action: "navigate",
          target: { css_fallback: "body" },
          args: { url: "https://crm.internal.corp/leads/unverified" },
          risk: "low",
          requires_confirmation: false,
          idempotent: true,
          enabled: true,
          preconditions: [],
          postconditions: []
        },
        {
          id: "step_2",
          name: "Extract Company Name & Domain",
          action: "extract",
          target: { css_fallback: ".lead-card-domain" },
          args: {},
          risk: "low",
          requires_confirmation: false,
          idempotent: true,
          enabled: true,
          preconditions: [],
          postconditions: []
        },
        {
          id: "step_3",
          name: "Submit Enriched Record",
          action: "click",
          target: { css_fallback: "button.save-lead-enrichment" },
          args: {},
          risk: "low",
          requires_confirmation: false,
          idempotent: true,
          enabled: true,
          preconditions: [],
          postconditions: []
        }
      ],
      final_postconditions: [],
      version: 1,
      content_hash: "hash_lead_template",
      change_summary: "Caddi-style standard template"
    }
  },
  {
    id: "tmpl_support_triage",
    title: "Customer Support Ticket Auto-Triage",
    badge: "Real-Time",
    category: "Operations",
    description: "Reads incoming support inquiries, uses AI classification to detect urgency and sentiment, assigns team tags, and generates suggested solution drafts.",
    timeSaved: "6 hrs / week",
    requiredIntegrations: ["Gmail", "GitHub", "Browser"],
    demoUrl: "https://support.internal.corp/queue",
    workflow: {
      workflow_id: "wf_template_support",
      title: "Customer Support Ticket Auto-Triage",
      intent: "Categorize, tag, and prepare draft resolutions for support tickets",
      allowed_origins: ["https://support.internal.corp"],
      parameters: [],
      steps: [
        {
          id: "step_1",
          name: "Load Support Queue",
          action: "navigate",
          target: { css_fallback: "body" },
          args: { url: "https://support.internal.corp/queue" },
          risk: "low",
          requires_confirmation: false,
          idempotent: true,
          enabled: true,
          preconditions: [],
          postconditions: []
        },
        {
          id: "step_2",
          name: "Assign Priority Tag",
          action: "click",
          target: { css_fallback: "button.auto-tag-urgent" },
          args: {},
          risk: "low",
          requires_confirmation: false,
          idempotent: true,
          enabled: true,
          preconditions: [],
          postconditions: []
        }
      ],
      final_postconditions: [],
      version: 1,
      content_hash: "hash_support_template",
      change_summary: "Caddi-style standard template"
    }
  },
  {
    id: "tmpl_weekly_report",
    title: "Cross-System Executive Report Generator",
    badge: "Scheduled",
    category: "Operations",
    description: "Logs into internal metrics dashboard, downloads weekly revenue and usage CSVs, compiles summary charts, and prepares a formatted executive briefing.",
    timeSaved: "4 hrs / week",
    requiredIntegrations: ["Browser", "Local Desktop"],
    demoUrl: "https://analytics.internal.corp/overview",
    workflow: {
      workflow_id: "wf_template_report",
      title: "Cross-System Executive Report Generator",
      intent: "Scrape analytics KPIs and build formatted executive summary",
      allowed_origins: ["https://analytics.internal.corp"],
      parameters: [],
      steps: [
        {
          id: "step_1",
          name: "Open Analytics Dashboard",
          action: "navigate",
          target: { css_fallback: "body" },
          args: { url: "https://analytics.internal.corp/overview" },
          risk: "low",
          requires_confirmation: false,
          idempotent: true,
          enabled: true,
          preconditions: [],
          postconditions: []
        },
        {
          id: "step_2",
          name: "Export Weekly Summary CSV",
          action: "click",
          target: { css_fallback: "button#download-weekly-csv" },
          args: {},
          risk: "low",
          requires_confirmation: false,
          idempotent: true,
          enabled: true,
          preconditions: [],
          postconditions: []
        }
      ],
      final_postconditions: [],
      version: 1,
      content_hash: "hash_report_template",
      change_summary: "Caddi-style standard template"
    }
  },
  {
    id: "tmpl_multi_tab_migration",
    title: "Multi-App Form Data Migration",
    badge: "Zero Copy-Paste",
    category: "Operations",
    description: "Eliminates manual rekeying. Reads records from legacy web portal A and accurately fills input fields in modern platform B.",
    timeSaved: "10 hrs / week",
    requiredIntegrations: ["Browser", "Local Desktop"],
    demoUrl: "https://legacy-records.corp/items",
    workflow: {
      workflow_id: "wf_template_migration",
      title: "Multi-App Form Data Migration",
      intent: "Migrate legacy records to destination system automatically",
      allowed_origins: ["https://legacy-records.corp", "https://new-cloud-portal.corp"],
      parameters: [],
      steps: [
        {
          id: "step_1",
          name: "Load Legacy Record",
          action: "navigate",
          target: { css_fallback: "body" },
          args: { url: "https://legacy-records.corp/items" },
          risk: "low",
          requires_confirmation: false,
          idempotent: true,
          enabled: true,
          preconditions: [],
          postconditions: []
        },
        {
          id: "step_2",
          name: "Extract Record ID and Values",
          action: "extract",
          target: { css_fallback: ".record-details" },
          args: {},
          risk: "low",
          requires_confirmation: false,
          idempotent: true,
          enabled: true,
          preconditions: [],
          postconditions: []
        }
      ],
      final_postconditions: [],
      version: 1,
      content_hash: "hash_migration_template",
      change_summary: "Caddi-style standard template"
    }
  },
  {
    id: "tmpl_competitor_tracker",
    title: "Competitor Catalog & Price Watcher",
    badge: "Web Monitor",
    category: "Research",
    description: "Periodically visits competitor pricing or catalog pages, captures changes, and notifies your team whenever prices fluctuate.",
    timeSaved: "3 hrs / week",
    requiredIntegrations: ["Browser", "Local Desktop"],
    demoUrl: "https://store.competitor.com/catalog",
    workflow: {
      workflow_id: "wf_template_competitor",
      title: "Competitor Catalog & Price Watcher",
      intent: "Monitor external pricing changes and capture snapshots",
      allowed_origins: ["https://store.competitor.com"],
      parameters: [],
      steps: [
        {
          id: "step_1",
          name: "Check Competitor Catalog",
          action: "navigate",
          target: { css_fallback: "body" },
          args: { url: "https://store.competitor.com/catalog" },
          risk: "low",
          requires_confirmation: false,
          idempotent: true,
          enabled: true,
          preconditions: [],
          postconditions: []
        },
        {
          id: "step_2",
          name: "Extract Price Points",
          action: "extract",
          target: { css_fallback: ".product-price" },
          args: {},
          risk: "low",
          requires_confirmation: false,
          idempotent: true,
          enabled: true,
          preconditions: [],
          postconditions: []
        }
      ],
      final_postconditions: [],
      version: 1,
      content_hash: "hash_competitor_template",
      change_summary: "Caddi-style standard template"
    }
  }
];

interface Props {
  onUseTemplate: (wf: WorkflowDefinition) => void;
  onRecordDemonstration: (preset: { url: string; description: string }) => void;
  onNavigateSection: (section: AppSection) => void;
}

export const WorkflowTemplatesView: React.FC<Props> = ({
  onUseTemplate,
  onRecordDemonstration,
  onNavigateSection,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTemplate, setActiveTemplate] = useState<WorkflowTemplate | null>(CADDI_TEMPLATES[0]);

  const filtered = CADDI_TEMPLATES.filter((t) => {
    const matchCat = selectedCategory === "ALL" || t.category === selectedCategory;
    const matchSearch =
      !searchQuery ||
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className="feature-page template-page h-full flex flex-col overflow-y-auto">
      <header className="feature-page-header template-header">
        <div className="feature-page-heading">
          <div className="feature-page-icon"><Sparkles /></div>
          <div>
            <span className="feature-eyebrow">WORKFLOW LIBRARY</span>
            <h1>Templates</h1>
            <p>Choose a reviewed starting point, then customize it in the workflow editor.</p>
          </div>
        </div>
        <button type="button" onClick={() => onNavigateSection("Teach")} className="feature-primary-action">
          <Video /> Record a custom task
        </button>
      </header>

      <div className="template-toolbar">
        <div className="template-search">
          <Search />
          <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search templates" aria-label="Search templates" />
        </div>
        <div className="template-categories" aria-label="Template categories">
          {["ALL", "Finance", "Sales & CRM", "Operations", "Research", "DevOps & IT"].map((cat) => (
            <button key={cat} type="button" className={selectedCategory === cat ? "active" : ""} onClick={() => setSelectedCategory(cat)}>
              {cat === "ALL" ? "All templates" : cat}
            </button>
          ))}
        </div>
      </div>

      <div className="template-layout">
        <div className="template-grid">
        {filtered.map((tmpl) => (
          <article key={tmpl.id} className={`template-card ${activeTemplate?.id === tmpl.id ? "active" : ""}`} onClick={() => setActiveTemplate(tmpl)}>
            <div className="template-card-top">
              <span className="template-category">{tmpl.category}</span>
              <span className="template-time">{tmpl.timeSaved}</span>
            </div>
            <h3>{tmpl.title}</h3>
            <p>{tmpl.description}</p>
            <div className="template-integrations">
              {tmpl.requiredIntegrations.map((integ) => <span key={integ}>{integ}</span>)}
            </div>
            <div className="template-card-actions">
              <button type="button" onClick={(event) => { event.stopPropagation(); onUseTemplate(tmpl.workflow); }}>
                <Zap /> Use template
              </button>
              {tmpl.demoUrl && (
                <button type="button" className="template-record-button" title="Record this task" onClick={(event) => {
                  event.stopPropagation();
                  onRecordDemonstration({ url: tmpl.demoUrl!, description: `Demonstrate workflow for: ${tmpl.title}` });
                }}>
                  <Video />
                </button>
              )}
            </div>
          </article>
        ))}
        </div>

        {activeTemplate && (
          <aside className="template-preview">
            <span className="template-preview-kicker">SELECTED TEMPLATE</span>
            <h2>{activeTemplate.title}</h2>
            <p>{activeTemplate.description}</p>
            <div className="template-preview-meta">
              <div><span>Category</span><strong>{activeTemplate.category}</strong></div>
              <div><span>Estimated savings</span><strong>{activeTemplate.timeSaved}</strong></div>
              <div><span>Steps</span><strong>{activeTemplate.workflow.steps.length}</strong></div>
            </div>
            <div className="template-step-preview">
              {activeTemplate.workflow.steps.slice(0, 4).map((step, index) => (
                <div key={step.id}><span>{index + 1}</span><div><strong>{step.name}</strong><small>{step.action}</small></div></div>
              ))}
            </div>
            <button type="button" className="feature-primary-action" onClick={() => onUseTemplate(activeTemplate.workflow)}>
              Open in workflow editor <ArrowRight />
            </button>
          </aside>
        )}
      </div>
    </div>
  );
};

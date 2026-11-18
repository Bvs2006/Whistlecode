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
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-y-auto">
      {/* Top Banner (Caddi + Lindy hybrid styling) */}
      <div className="border-b border-slate-800 bg-slate-900/60 px-8 py-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Workflow templates
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Start with a reviewed recipe, or record a custom demonstration for your own workspace.
              </p>
            </div>
          </div>

          <button
            onClick={() => onNavigateSection("Teach")}
            className="flex items-center gap-2 px-4 py-2 text-white rounded-xl text-xs font-bold transition-all self-start md:self-auto"
          >
            <Video className="w-4 h-4 text-rose-300 fill-current" />
            Record Custom Workflow Demonstration
          </button>
        </div>

        {/* Categories Bar */}
        <div className="flex flex-wrap items-center gap-2 mt-6">
          {["ALL", "Finance", "Sales & CRM", "Operations", "Research", "DevOps & IT"].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                selectedCategory === cat
                  ? "bg-purple-600 text-white shadow-sm"
                  : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid Layout */}
      <div className="p-8 max-w-7xl mx-auto w-full flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((tmpl) => (
          <div
            key={tmpl.id}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-purple-500/40 transition-all flex flex-col justify-between space-y-4 group"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-purple-400">
                  {tmpl.category}
                </span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 font-semibold border border-emerald-500/20">
                  {tmpl.timeSaved}
                </span>
              </div>

              <h3 className="font-bold text-base text-white group-hover:text-purple-300 transition-colors">
                {tmpl.title}
              </h3>
              <p className="text-xs text-slate-400 mt-2 line-clamp-3 leading-relaxed">
                {tmpl.description}
              </p>

              {/* Integrations Chips */}
              <div className="mt-4 pt-3 border-t border-slate-800/80">
                <div className="text-[11px] text-slate-500 font-medium mb-1.5">Required Integrations:</div>
                <div className="flex flex-wrap gap-1.5">
                  {tmpl.requiredIntegrations.map((integ) => (
                    <span
                      key={integ}
                      className="text-[10px] bg-slate-800/90 text-slate-300 px-2 py-0.5 rounded border border-slate-700/60"
                    >
                      {integ}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
              <button
                onClick={() => onUseTemplate(tmpl.workflow)}
                className="flex-1 py-2 px-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-md shadow-purple-600/20"
              >
                <Zap className="w-3.5 h-3.5 fill-current" />
                Use Template
              </button>

              {tmpl.demoUrl && (
                <button
                  onClick={() =>
                    onRecordDemonstration({
                      url: tmpl.demoUrl!,
                      description: `Demonstrate workflow for: ${tmpl.title}`,
                    })
                  }
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors"
                  title="Teach task via live screen demonstration"
                >
                  <Video className="w-4 h-4 text-rose-400" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

import React, { useState, useEffect } from "react";
import {
  fetchSkills,
  validateSkill,
  testSkill,
  deleteSkill,
  createSkill,
  SkillDefinition,
} from "../../services/skillsService";
import {
  fetchMemories,
  createMemory,
  updateMemory,
  deleteMemory,
  AgentMemoryItem,
  MemoryCategory,
} from "../../services/memoryService";
import {
  Cpu,
  Brain,
  ShieldCheck,
  ShieldAlert,
  Play,
  Trash2,
  Edit2,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  ExternalLink,
  Layers,
  Sparkles,
  Zap,
} from "../icons/Icons";

export const SkillsAndMemoryView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"skills" | "memory">("skills");

  // Skills state
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [skillSearch, setSkillSearch] = useState("");
  const [isLoadingSkills, setIsLoadingSkills] = useState(false);
  const [testingSkillId, setTestingSkillId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<any | null>(null);
  const [showNewSkillModal, setShowNewSkillModal] = useState(false);
  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillDesc, setNewSkillDesc] = useState("");
  const [newSkillCat, setNewSkillCat] = useState("general");
  const [newSkillTools, setNewSkillTools] = useState("read_file, write_file");

  // Memory state
  const [memories, setMemories] = useState<AgentMemoryItem[]>([]);
  const [selectedMemoryCategory, setSelectedMemoryCategory] = useState<string>("ALL");
  const [memorySearch, setMemorySearch] = useState("");
  const [isLoadingMemories, setIsLoadingMemories] = useState(false);
  const [showNewMemoryModal, setShowNewMemoryModal] = useState(false);
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const [newMemKey, setNewMemKey] = useState("");
  const [newMemVal, setNewMemVal] = useState("");
  const [newMemCat, setNewMemCat] = useState<MemoryCategory>("user_preferences");
  const [newMemAgent, setNewMemAgent] = useState("");

  const loadSkills = async () => {
    setIsLoadingSkills(true);
    try {
      const data = await fetchSkills();
      setSkills(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingSkills(false);
    }
  };

  const loadMemories = async () => {
    setIsLoadingMemories(true);
    try {
      const data = await fetchMemories();
      setMemories(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingMemories(false);
    }
  };

  useEffect(() => {
    loadSkills();
    loadMemories();
  }, []);

  const handleValidate = async (id: string, approve: boolean) => {
    try {
      const updated = await validateSkill(id, approve);
      setSkills((prev) => prev.map((s) => (s.id === id ? updated : s)));
    } catch (e) {
      alert("Failed to update skill validation status");
    }
  };

  const handleTest = async (id: string) => {
    setTestingSkillId(id);
    setTestResult(null);
    try {
      const res = await testSkill(id);
      setTestResult(res);
      loadSkills(); // Refresh counts
    } catch (e) {
      alert("Skill test failed");
    } finally {
      setTestingSkillId(null);
    }
  };

  const handleDeleteSkill = async (id: string) => {
    if (!confirm("Are you sure you want to delete this skill?")) return;
    try {
      await deleteSkill(id);
      setSkills((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      alert("Failed to delete skill");
    }
  };

  const handleCreateSkill = async () => {
    if (!newSkillName.trim()) return;
    try {
      const tools = newSkillTools.split(",").map((t) => t.trim()).filter(Boolean);
      const created = await createSkill({
        name: newSkillName.trim(),
        description: newSkillDesc.trim(),
        category: newSkillCat,
        required_tools: tools,
        permission_requirements: tools.map((t) => `${t}_perm`),
        is_trusted: false,
      });
      setSkills((prev) => [created, ...prev]);
      setShowNewSkillModal(false);
      setNewSkillName("");
      setNewSkillDesc("");
    } catch (e) {
      alert("Failed to create skill");
    }
  };

  const handleSaveMemory = async () => {
    if (!newMemKey.trim() || !newMemVal.trim()) return;
    try {
      const item = await createMemory({
        key: newMemKey.trim(),
        value: newMemVal.trim(),
        category: newMemCat,
        agent_id: newMemAgent.trim() || null,
        provenance: "user_entry",
      });
      setMemories((prev) => [item, ...prev]);
      setShowNewMemoryModal(false);
      setNewMemKey("");
      setNewMemVal("");
    } catch (e) {
      alert("Failed to save memory");
    }
  };

  const handleUpdateMemoryValue = async (id: string) => {
    try {
      const updated = await updateMemory(id, { value: editValue });
      setMemories((prev) => prev.map((m) => (m.id === id ? updated : m)));
      setEditingMemoryId(null);
    } catch (e) {
      alert("Failed to update memory");
    }
  };

  const handleDeleteMemoryItem = async (id: string) => {
    try {
      await deleteMemory(id);
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch (e) {
      alert("Failed to delete memory");
    }
  };

  // Filter skills
  const filteredSkills = skills.filter((s) => {
    const matchCat = selectedCategory === "ALL" || s.category.toUpperCase() === selectedCategory;
    const matchQuery =
      !skillSearch ||
      s.name.toLowerCase().includes(skillSearch.toLowerCase()) ||
      s.description.toLowerCase().includes(skillSearch.toLowerCase());
    return matchCat && matchQuery;
  });

  // Filter memories
  const filteredMemories = memories.filter((m) => {
    const matchCat =
      selectedMemoryCategory === "ALL" ||
      m.category.toUpperCase() === selectedMemoryCategory;
    const matchQuery =
      !memorySearch ||
      m.key.toLowerCase().includes(memorySearch.toLowerCase()) ||
      m.value.toLowerCase().includes(memorySearch.toLowerCase());
    return matchCat && matchQuery;
  });

  return (
    <div className="feature-page skills-page h-full flex flex-col bg-slate-950 text-slate-100 overflow-y-auto">
      {/* Top Banner */}
      <div className="border-b border-slate-800 bg-slate-900/60 px-8 py-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
                {activeTab === "skills" ? <Cpu className="w-6 h-6" /> : <Brain className="w-6 h-6" />}
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                  Skills & Agent Memory
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-medium border border-purple-500/30">
                    Lindy-Grade Architecture
                  </span>
                </h1>
                <p className="text-sm text-slate-400 mt-1">
                  Reusable agent capabilities, human-verified demonstration workflows, and 5-tier persistent memory.
                </p>
              </div>
            </div>
          </div>

          {/* Tab Switcher */}
          <div className="flex items-center bg-slate-900 p-1.5 rounded-xl border border-slate-800 self-start md:self-auto">
            <button
              onClick={() => setActiveTab("skills")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === "skills"
                  ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Cpu className="w-4 h-4" />
              Skills Library ({skills.length})
            </button>
            <button
              onClick={() => setActiveTab("memory")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === "memory"
                  ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Brain className="w-4 h-4" />
              Persistent Memory ({memories.length})
            </button>
          </div>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="p-8 max-w-7xl mx-auto w-full flex-1">
        {/* SKILLS TAB */}
        {activeTab === "skills" && (
          <div className="space-y-6">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-80">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                  <input
                    type="text"
                    value={skillSearch}
                    onChange={(e) => setSkillSearch(e.target.value)}
                    placeholder="Search skills, tools, schemas..."
                    className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-lg">
                  {["ALL", "EMAIL", "DOCUMENTS", "WEB", "DEVOPS", "ANALYSIS"].map((c) => (
                    <button
                      key={c}
                      onClick={() => setSelectedCategory(c)}
                      className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                        selectedCategory === c
                          ? "bg-purple-600 text-white"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setShowNewSkillModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Define Custom Skill
              </button>
            </div>

            {/* Test Drawer Feedback */}
            {testResult && (
              <div className="p-4 rounded-xl bg-purple-950/40 border border-purple-500/40 text-purple-200 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 font-semibold text-purple-100">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    Skill Test Succeeded: {testResult.name}
                  </div>
                  <p className="text-xs text-purple-300 mt-1">{testResult.simulated_output?.result}</p>
                  <div className="flex items-center gap-3 text-xs text-slate-400 mt-2">
                    <span>Latency: {testResult.simulated_output?.metrics?.duration_ms}ms</span>
                    <span>Tools invoked: {testResult.simulated_output?.metrics?.tools_invoked?.join(", ")}</span>
                  </div>
                </div>
                <button
                  onClick={() => setTestResult(null)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Skills Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredSkills.map((skill) => (
                <div
                  key={skill.id}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold tracking-wider">
                          {skill.category}
                        </span>
                        <span className="text-xs text-slate-500">v{skill.version}</span>
                      </div>
                      {skill.is_trusted ? (
                        <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Trusted
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-amber-400 font-medium bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                          <ShieldAlert className="w-3.5 h-3.5" />
                          Unvalidated
                        </span>
                      )}
                    </div>

                    <h3 className="font-semibold text-base text-white">{skill.name}</h3>
                    <p className="text-xs text-slate-400 mt-1.5 line-clamp-3 leading-relaxed">
                      {skill.description}
                    </p>

                    {/* Tools badges */}
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {skill.required_tools.map((t) => (
                        <span
                          key={t}
                          className="text-[11px] bg-slate-800/80 text-purple-300 px-2 py-0.5 rounded border border-purple-500/10 font-mono"
                        >
                          {t}
                        </span>
                      ))}
                    </div>

                    {/* Metrics */}
                    <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                      <span>Executions: {skill.execution_count}</span>
                      <span className="text-emerald-400 font-medium">
                        Success: {skill.execution_count > 0 ? Math.round((skill.success_count / skill.execution_count) * 100) : 100}%
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                    {!skill.is_trusted ? (
                      <button
                        onClick={() => handleValidate(skill.id, true)}
                        className="flex-1 py-1.5 px-3 bg-amber-600/30 hover:bg-amber-600/50 text-amber-200 border border-amber-500/40 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Validate & Trust
                      </button>
                    ) : (
                      <button
                        onClick={() => handleTest(skill.id)}
                        disabled={testingSkillId === skill.id}
                        className="flex-1 py-1.5 px-3 bg-purple-600/20 hover:bg-purple-600/40 text-purple-200 border border-purple-500/30 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        {testingSkillId === skill.id ? "Testing..." : "Test Skill"}
                      </button>
                    )}

                    <button
                      onClick={() => handleDeleteSkill(skill.id)}
                      className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors rounded-lg hover:bg-slate-800"
                      title="Delete Skill"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MEMORY TAB */}
        {activeTab === "memory" && (
          <div className="space-y-6">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-80">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                  <input
                    type="text"
                    value={memorySearch}
                    onChange={(e) => setMemorySearch(e.target.value)}
                    placeholder="Search memories, keys, facts..."
                    className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-lg">
                  {[
                    "ALL",
                    "USER_PREFERENCES",
                    "TASK_CONTEXT",
                    "EXECUTION_SUMMARY",
                    "LEARNED_WORKFLOW",
                    "FREQUENTLY_USED_PARAMETERS",
                  ].map((c) => (
                    <button
                      key={c}
                      onClick={() => setSelectedMemoryCategory(c)}
                      className={`px-2 py-1 text-[11px] rounded font-medium transition-colors ${
                        selectedMemoryCategory === c
                          ? "bg-purple-600 text-white"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {c.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setShowNewMemoryModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Add Persistent Fact
              </button>
            </div>

            {/* Explainer card */}
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-300 text-xs flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Brain className="w-5 h-5 text-purple-400 shrink-0" />
                <span>
                  ChronicleAI organizes agent memory into 5 distinct categories. Memories are queried selectively at runtime to prevent context-window pollution and ensure verified user preferences take priority.
                </span>
              </div>
            </div>

            {/* Memory List */}
            <div className="space-y-3">
              {filteredMemories.map((mem) => (
                <div
                  key={mem.id}
                  className="p-4 bg-slate-900 border border-slate-800 rounded-xl hover:border-slate-700 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/40 font-semibold uppercase">
                        {mem.category.replace("_", " ")}
                      </span>
                      {mem.agent_id ? (
                        <span className="text-[11px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                          Agent: {mem.agent_id}
                        </span>
                      ) : (
                        <span className="text-[11px] bg-emerald-950/40 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800/30">
                          Global System Preference
                        </span>
                      )}
                      <span className="text-[11px] text-slate-500">
                        Provenance: {mem.provenance}
                      </span>
                    </div>

                    <div className="font-semibold text-sm text-slate-100 flex items-center gap-2">
                      <span className="text-purple-400">{mem.key}</span>
                    </div>

                    {editingMemoryId === mem.id ? (
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="flex-1 px-3 py-1 bg-slate-950 border border-purple-500 rounded text-xs text-white"
                        />
                        <button
                          onClick={() => handleUpdateMemoryValue(mem.id)}
                          className="px-3 py-1 bg-purple-600 text-white rounded text-xs font-semibold"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingMemoryId(null)}
                          className="px-2 py-1 text-slate-400 text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">{mem.value}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-end md:self-center">
                    <button
                      onClick={() => {
                        setEditingMemoryId(mem.id);
                        setEditValue(mem.value);
                      }}
                      className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
                      title="Edit Memory Value"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteMemoryItem(mem.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 transition-colors"
                      title="Delete Memory"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* MODAL: Define Custom Skill */}
      {showNewSkillModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-400" />
              Define New Agent Skill
            </h3>
            <p className="text-xs text-slate-400">
              Skills wrap tool calls, workflows, and strict schemas so agents can reuse them predictably.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">Skill Name</label>
                <input
                  type="text"
                  value={newSkillName}
                  onChange={(e) => setNewSkillName(e.target.value)}
                  placeholder="e.g. Daily Tax Reconciliation"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Description</label>
                <textarea
                  value={newSkillDesc}
                  onChange={(e) => setNewSkillDesc(e.target.value)}
                  placeholder="Explains what this capability executes..."
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Category</label>
                <select
                  value={newSkillCat}
                  onChange={(e) => setNewSkillCat(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-purple-500"
                >
                  <option value="general">General</option>
                  <option value="email">Email</option>
                  <option value="documents">Documents</option>
                  <option value="web">Web</option>
                  <option value="devops">DevOps</option>
                  <option value="analysis">Analysis</option>
                </select>
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Required Tools (comma separated)</label>
                <input
                  type="text"
                  value={newSkillTools}
                  onChange={(e) => setNewSkillTools(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                onClick={() => setShowNewSkillModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSkill}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-purple-600/30"
              >
                Create Skill Candidate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Add Memory Fact */}
      {showNewMemoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-400" />
              Store Persistent Memory Fact
            </h3>
            <p className="text-xs text-slate-400">
              Persist crucial operational parameters, preferences, or learned layout quirks across all sessions.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">Memory Category</label>
                <select
                  value={newMemCat}
                  onChange={(e) => setNewMemCat(e.target.value as MemoryCategory)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-purple-500"
                >
                  <option value="user_preferences">User Preferences</option>
                  <option value="task_context">Task Context</option>
                  <option value="execution_summary">Execution Summary</option>
                  <option value="learned_workflow">Learned Workflow Information</option>
                  <option value="frequently_used_parameters">Frequently Used Parameters</option>
                </select>
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Memory Key</label>
                <input
                  type="text"
                  value={newMemKey}
                  onChange={(e) => setNewMemKey(e.target.value)}
                  placeholder="e.g. default_output_directory"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Value / Fact</label>
                <textarea
                  value={newMemVal}
                  onChange={(e) => setNewMemVal(e.target.value)}
                  placeholder="e.g. Always write processed PDFs to D:/Archive/Invoices"
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Agent ID (optional, leave blank for global)</label>
                <input
                  type="text"
                  value={newMemAgent}
                  onChange={(e) => setNewMemAgent(e.target.value)}
                  placeholder="e.g. agent_invoice_organizer"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                onClick={() => setShowNewMemoryModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveMemory}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-purple-600/30"
              >
                Save to Persistent Memory
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

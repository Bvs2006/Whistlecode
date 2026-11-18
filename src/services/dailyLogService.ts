export interface DailyLogSummary {
  date: string;
  count: number;
  total_completed: number;
  latest_created: string;
}

export interface DailyLogDetail {
  date: string;
  has_log: boolean;
  raw_text: string;
  markdown: string;
  entries_count: number;
  entries: Array<{
    id: string;
    run_id: string;
    workflow_title: string;
    summary_text: string;
    markdown_text: string;
    status: string;
    tasks_completed: number;
    total_tasks: number;
    created_at: string;
  }>;
  file_path?: string;
}

export const dailyLogService = {
  async listLogs(): Promise<DailyLogSummary[]> {
    try {
      const res = await fetch("/api/daily-logs");
      if (!res.ok) return [];
      const data = await res.json();
      return data.logs || [];
    } catch (e) {
      console.error("Failed to fetch daily logs list", e);
      return [];
    }
  },

  async getLogForDate(dateStr: string): Promise<DailyLogDetail> {
    try {
      const res = await fetch(`/api/daily-logs/${dateStr}`);
      if (!res.ok) throw new Error("Log not found");
      return await res.json();
    } catch (e) {
      return {
        date: dateStr,
        has_log: false,
        raw_text: "No log recorded for this date.",
        markdown: "*No log recorded for this date.*",
        entries_count: 0,
        entries: [],
      };
    }
  },

  getDownloadUrl(dateStr: string): string {
    return `/api/daily-logs/${dateStr}/download`;
  },

  async getCrossSessionMemory(days = 3): Promise<string> {
    try {
      const res = await fetch(`/api/ag-ui/memory?days=${days}`);
      if (!res.ok) return "";
      const data = await res.json();
      return data.context || "";
    } catch {
      return "";
    }
  },
};

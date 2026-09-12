import { webConnector, type WebSnapshotResult } from '@/connectors/web';
import type { BriefMode } from './types';

export const DEFAULT_BRIEF_COST_CAP = 0.05; // $0.05 per brief ceiling (FR8.3)
export const COST_PER_WEB_QUERY = 0.01;

export interface ToolRouterContext {
  workspaceId: string;
  briefId?: string;
  mode: BriefMode;
  currentCost: number;
  costCap?: number;
}

export interface WebSearchToolResult {
  snapshots: WebSnapshotResult[];
  costIncurred: number;
  circuitBroken: boolean;
  explanation?: string;
}

export class ToolRouter {
  /**
   * Executes web search tool with strict mode guards and per-brief cost cap (FR3.4, FR8.3, NFR1.6).
   */
  async executeWebSearch(
    queryText: string,
    context: ToolRouterContext
  ): Promise<WebSearchToolResult> {
    const { workspaceId, mode, currentCost, costCap = DEFAULT_BRIEF_COST_CAP } = context;

    // 1. Home mode hard gate (FR3.4, NFR1.6)
    // Tool router raises if web is invoked in Home mode, even if writer requested it.
    if (mode === 'home') {
      throw new Error(
        'TOOL ROUTER VIOLATION: Web search tool is strictly forbidden in Home mode (FR3.4, NFR1.6)'
      );
    }

    // 2. Cost ceiling check (FR8.3)
    if (currentCost + COST_PER_WEB_QUERY > costCap) {
      return {
        snapshots: [],
        costIncurred: 0,
        circuitBroken: true,
        explanation: `Stopped extra web search because per-brief cost ceiling ($${costCap.toFixed(2)}) was reached (FR8.3).`,
      };
    }

    // 3. Execute search and snapshot storage
    const snapshots = await webConnector.searchAndSnapshot({
      workspaceId,
      query: queryText,
      maxResults: 3,
    });

    return {
      snapshots,
      costIncurred: COST_PER_WEB_QUERY,
      circuitBroken: false,
    };
  }
}

export const toolRouter = new ToolRouter();

// Mock of what the platform learns from an MCP server when it connects / syncs: the server's
// own name + version and the tools it exposes. No backend here, so results are derived from the
// URL — deterministic, so "Sync" keeps returning the same list.
import type { CustomConnector } from "./customConnectorStore";

export type McpToolPermission = "auto" | "ask";
export interface McpTool { name: string; description: string; permission: McpToolPermission }
export interface McpDiscovery { server: { name: string; version: string }; tools: McpTool[] }

/** Read-only tools default to Auto; anything that writes or sends defaults to Ask. */
export function defaultPermission(name: string): McpToolPermission {
  return /(submit|create|update|delete|remove|send|post|write|set|add|cancel)/i.test(name) ? "ask" : "auto";
}

const tool = (name: string, description: string): McpTool => ({ name, description, permission: defaultPermission(name) });

export function discoverMcp(url: string): McpDiscovery {
  let host = url;
  try { host = new URL(url).hostname; } catch { /* keep raw */ }
  if (/langchain/i.test(host)) {
    return {
      server: { name: "Docs by LangChain", version: "1.0.0" },
      tools: [
        tool("query_docs_filesystem_docs_by_lang_chain", "Run a read-only shell-like query against a virtualized, in-memory filesystem rooted at `/` that contains ONLY the Docs by LangChain documentation pages and OpenAPI specs. This is NOT a shell on any real machine — nothing you run here can touch real files or the network."),
        tool("Search documentation", "Search across the Docs by LangChain knowledge base to find relevant information, code examples, API references, and guides. Use this tool when you need to answer questions about Docs by LangChain, find specific documentation, or look up how a feature works."),
        tool("Submit documentation feedback", "Report a problem with this documentation site so the docs team can fix it. Use when a documentation page is incorrect, outdated, confusing, incomplete, or has a broken example. This is for feedback about the documentation itself, not about the product."),
      ],
    };
  }
  const base = host.replace(/^(www|mcp|api)\./, "").split(".")[0] || "server";
  const title = base.charAt(0).toUpperCase() + base.slice(1);
  return {
    server: { name: `${title} MCP`, version: "1.0.0" },
    tools: [
      tool(`search_${base}`, `Search ${title} records by keyword and return the best matches with their ids and a short summary.`),
      tool(`get_${base}_item`, `Fetch one ${title} record by id, including all of its fields.`),
      tool(`create_${base}_item`, `Create a new ${title} record from the given fields and return it.`),
    ],
  };
}

/** OAuth servers only reveal their tools after someone authorises the connection. */
export function needsAuthorization(c: CustomConnector): boolean {
  return c.authType === "oauth_auto" || c.authType === "oauth_manual";
}

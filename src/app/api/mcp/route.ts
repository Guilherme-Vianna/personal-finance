import { createMcpHandler } from "mcp-handler";
import { financeTools } from "@/lib/agent/tools";

export const maxDuration = 60;

// Read-only MCP server with the same analysis tools the in-app assistant uses.
const handler = createMcpHandler(
  (server) => {
    for (const tool of financeTools) {
      server.registerTool(tool.name, { title: tool.title, description: tool.description, inputSchema: tool.schema }, async (input: Record<string, unknown>) => ({
        content: [{ type: "text", text: JSON.stringify(await tool.run(input)) }],
      }));
    }
  },
  {
    serverInfo: { name: "grana-na-vida", version: "1.0.0" },
    instructions: "Ferramentas somente leitura sobre as finanças pessoais (valores em reais, datas YYYY-MM-DD, meses YYYY-MM).",
  },
);

export { handler as GET, handler as POST };

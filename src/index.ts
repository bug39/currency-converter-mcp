import express from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { register as registerConvert } from "./tools/convert.js";
import { register as registerExchangeRates } from "./tools/exchange-rates.js";
import { register as registerHistoricalRates } from "./tools/historical-rates.js";
import { register as registerCurrencies } from "./tools/currencies.js";

function createServer(): McpServer {
  const server = new McpServer({
    name: "currency-converter",
    version: "1.0.0",
  });
  registerConvert(server);
  registerExchangeRates(server);
  registerHistoricalRates(server);
  registerCurrencies(server);
  return server;
}

const app = express();
app.use(cors({ origin: "*", exposedHeaders: ["Mcp-Session-Id"] }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", name: "currency-converter", version: "1.0.0" });
});

app.all("/mcp", async (req, res) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
  await transport.close();
  await server.close();
});

const PORT = parseInt(process.env.PORT || "3000", 10);
app.listen(PORT, () => {
  console.log(`currency-converter MCP server running on port ${PORT}`);
});

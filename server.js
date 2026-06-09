const express = require('express');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');

const app = express();
app.use(express.json());

function createServer() {
  const server = new McpServer({
    name: 'salesforce-mcp-demo',
    version: '1.0.0',
  });

  server.registerTool(
    'searchBooks',
    {
      title: 'Search Books',
      description: 'Search Open Library for books by title or topic.',
      inputSchema: {
        title: z.string().min(1).describe('Book title or topic to search for'),
      },
    },
    async ({ title }) => {
      const response = await fetch(
        `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}`
      );

      if (!response.ok) {
        throw new Error(`Open Library request failed: ${response.status}`);
      }

      const data = await response.json();
      const results = data.docs.slice(0, 5).map((book) => ({
        title: book.title,
        author: book.author_name?.[0] || 'Unknown author',
        firstPublishYear: book.first_publish_year || null,
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ results }, null, 2),
          },
        ],
        structuredContent: { results },
      };
    }
  );

  server.registerTool(
    'getExchangeRate',
    {
      title: 'Get Exchange Rate',
      description: 'Get the latest exchange rate between two currencies.',
      inputSchema: {
        from: z.string().length(3).describe('Source currency code, for example USD'),
        to: z.string().length(3).describe('Target currency code, for example INR'),
      },
    },
    async ({ from, to }) => {
      const fromCurrency = from.toUpperCase();
      const toCurrency = to.toUpperCase();
      const response = await fetch(
        `https://open.er-api.com/v6/latest/${encodeURIComponent(fromCurrency)}`
      );

      if (!response.ok) {
        throw new Error(`Exchange rate request failed: ${response.status}`);
      }

      const data = await response.json();
      const rate = data.rates?.[toCurrency];

      if (!rate) {
        throw new Error(`No exchange rate found for ${fromCurrency} to ${toCurrency}`);
      }

      const result = {
        from: fromCurrency,
        to: toCurrency,
        rate,
        provider: 'open.er-api.com',
        lastUpdated: data.time_last_update_utc,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
        structuredContent: result,
      };
    }
  );

  return server;
}

app.get('/', (req, res) => {
  res.json({
    name: 'salesforce-mcp-demo',
    status: 'ok',
    mcpEndpoint: '/mcp',
    tools: ['searchBooks', 'getExchangeRate'],
  });
});

app.post('/mcp', async (req, res) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on('close', () => {
    transport.close();
    server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get('/mcp', async (req, res) => {
  res.status(405).json({ error: 'Use POST /mcp for MCP JSON-RPC requests.' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`MCP server running at http://localhost:${port}`);
  console.log(`MCP endpoint: http://localhost:${port}/mcp`);
});

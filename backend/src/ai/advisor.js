const axios = require('axios');
const { MCP_TOOLS, buildToolUsageRules } = require('./tools');

const fmt = (n) => Number(n || 0).toFixed(2);

/** Build full system prompt with all business context */
function buildSystemPrompt(context) {
  const biz = context.business;

  const lowStockLine = context.lowStock?.length
    ? context.lowStock.map((p) => p.name).join(', ')
    : 'None';

  const debtorsLine = context.topDebtors?.length
    ? context.topDebtors.map((d) => `${d.customers?.name} GHS${fmt(d.amount)}`).join(', ')
    : 'None';

  const revenueStr = context.topByRevenue?.length
    ? context.topByRevenue.map((p) => `${p.name}=GHS${p.revenue}`).join(', ')
    : 'No data';

  const volumeStr = context.topByVolume?.length
    ? context.topByVolume.map((p) => `${p.name}=${p.units}u`).join(', ')
    : 'No data';

  const peakSlow = context.peak && context.slow
    ? `Peak: ${context.peak.day} avg GHS${context.peak.avg}; Slow: ${context.slow.day} avg GHS${context.slow.avg}`
    : 'No data';

  const retLine = context.retention
    ? `${context.retention.retained}/${context.retention.lastWeek} returning (${context.retention.thisWeek} buyers this week)`
    : 'No data';

  const customerLine = context.customers?.length
    ? context.customers.map((customer) => customer.name).join(', ')
    : 'None';

  const productLine = context.products?.length
    ? context.products.map((product) => {
      const stock = product.stock_qty != null ? ` stock:${product.stock_qty}` : '';
      return `${product.name}${stock}`;
    }).join(', ')
    : 'None';

  return `You are the AI advisor for ${biz?.name}, a ${biz?.sector} business in Ghana.

DATA:
Today: GHS${fmt(context.today?.total)} sales, GHS${fmt(context.today?.collected)} collected, ${context.today?.txCount || 0} txns
Week: GHS${fmt(context.week?.total)}; Credit owed today: GHS${fmt(context.today?.credit)}
Low stock: ${lowStockLine}
Top debtors: ${debtorsLine}
Top products (revenue): ${revenueStr}
Top products (volume): ${volumeStr}
Sales pattern: ${peakSlow}
Retention: ${retLine}
Known customers: ${customerLine}
Known products: ${productLine}

${buildToolUsageRules()}

Style: Be concise — max 3 sentences unless analysis is asked. Use GHS. Be specific with numbers.`;
}

/** Slim system prompt for greetings/insights — no tools, less data */
function buildSlimPrompt(context) {
  const biz = context.business;
  const lowLine = context.lowStock?.length
    ? context.lowStock.map((p) => p.name).join(', ')
    : 'none';

  return `You are the AI advisor for ${biz?.name} (${biz?.sector}, Ghana).
Today: GHS${fmt(context.today?.total)} in ${context.today?.txCount || 0} sales, GHS${fmt(context.today?.collected)} collected.
Low stock: ${lowLine}.
Write 2-3 short plain sentences for a dashboard card. No markdown, hashtags, asterisks, or bullet symbols. Use GHS only (never £ or $).`;
}

/**
 * Full advisor — for /ask endpoint.
 * Sends tools + full context. History capped at 10 messages.
 */
async function runAdvisor(message, context, history) {
  const trimmedHistory = (history || []).slice(-10);

  const response = await axios.post('https://api.anthropic.com/v1/messages', {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: buildSystemPrompt(context),
    tools: MCP_TOOLS,
    messages: [
      ...trimmedHistory,
      { role: 'user', content: message },
    ],
  }, {
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    timeout: 55000,
  });

  const content = response.data.content || [];
  const textBlock = content.find((b) => b.type === 'text');
  const toolCalls = content.filter((b) => b.type === 'tool_use');

  return {
    message: textBlock?.text || (toolCalls.length
      ? 'I prepared the action(s) below. Review each one and tap Allow to confirm.'
      : ''),
    tool_calls: toolCalls.map((t) => ({ id: t.id, name: t.name, input: t.input })),
    stop_reason: response.data.stop_reason,
  };
}

/**
 * Insights-only call — for /insights endpoint.
 */
async function runInsights(context) {
  const response = await axios.post('https://api.anthropic.com/v1/messages', {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 150,
    system: buildSlimPrompt(context),
    messages: [{ role: 'user', content: 'Give a brief plain-text business update for today (no markdown).' }],
  }, {
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    timeout: 30000,
  });

  const content = response.data.content || [];
  const textBlock = content.find((b) => b.type === 'text');
  return { message: textBlock?.text || '', tool_calls: [] };
}

module.exports = { runAdvisor, runInsights };

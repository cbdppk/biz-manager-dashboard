const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticate, requireRole } = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');
const { getBusinessContext, getSlimContext } = require('../ai/contextBuilder');
const { runAdvisor, runInsights } = require('../ai/advisor');
const { executeAiTool } = require('../ai/executeTool');
const { canExecuteAiTool } = require('../ai/tools');

router.use(authenticate, tenantScope);
const requireOwnerOrManager = requireRole('owner', 'manager');

// POST /api/ai/ask — main AI advisor endpoint
router.post('/ask', requireOwnerOrManager, async (req, res) => {
  const { message, conversation_history = [] } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required.' });

  try {
    const context = await getBusinessContext(req.businessId);
    const response = await runAdvisor(message, context, conversation_history);
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ai/insights — lightweight greeting / daily snapshot
// Uses slim context + no tools to keep token cost minimal.
// For deep sales analysis, use /ask instead.
router.get('/insights', requireOwnerOrManager, async (req, res) => {
  try {
    const slimCtx = await getSlimContext(req.businessId);
    const response = await runInsights(slimCtx);
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/execute-tool — execute an AI-suggested tool action.
// Mutations must be triggered only after explicit user confirmation in the AI Advisor UI.
router.post('/execute-tool', requireOwnerOrManager, async (req, res) => {
  const { tool_name, tool_input } = req.body;
  if (!tool_name || !tool_input) {
    return res.status(400).json({ success: false, error: 'tool_name and tool_input required.' });
  }
  if (!canExecuteAiTool(req.user, tool_name)) {
    return res.status(403).json({
      success: false,
      error: 'Your role cannot run this action. Ask an owner or manager, or use POS to record sales.',
    });
  }

  try {
    const result = await executeAiTool({
      supabase,
      businessId: req.businessId,
      userId: req.user.id,
      toolName: tool_name,
      toolInput: tool_input,
    });

    if (result.success === false) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Tool execution failed.' });
  }
});

module.exports = router;

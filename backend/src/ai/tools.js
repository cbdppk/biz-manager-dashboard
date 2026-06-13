/** AI advisor tool catalog, permissions, and shared normalizers */

const MCP_TOOLS = [
  {
    name: 'send_debt_reminder',
    description: 'Send an SMS debt reminder to a customer who owes money',
    input_schema: {
      type: 'object',
      properties: {
        customer_name: { type: 'string' },
        customer_id: { type: 'string' },
      },
      required: ['customer_name'],
    },
  },
  {
    name: 'flag_low_stock',
    description: 'Mark a product as needing restock',
    input_schema: {
      type: 'object',
      properties: {
        product_name: { type: 'string' },
        product_id: { type: 'string' },
      },
      required: ['product_name'],
    },
  },
  {
    name: 'create_customer',
    description: 'Create a new customer',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        phone: { type: 'string' },
        email: { type: 'string' },
        address: { type: 'string' },
        credit_limit: { type: 'number' },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_customer',
    description: 'Update an existing customer phone, email, address, or credit limit',
    input_schema: {
      type: 'object',
      properties: {
        customer_id: { type: 'string' },
        customer_name: { type: 'string' },
        phone: { type: 'string' },
        email: { type: 'string' },
        address: { type: 'string' },
        credit_limit: { type: 'number' },
      },
    },
  },
  {
    name: 'create_product',
    description: 'Create a new product with selling price and opening stock',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        sku: { type: 'string' },
        category: { type: 'string' },
        price: { type: 'number' },
        cost_price: { type: 'number' },
        stock_qty: { type: 'number' },
        reorder_level: { type: 'number' },
        unit: { type: 'string' },
      },
      required: ['name', 'price'],
    },
  },
  {
    name: 'update_product',
    description: 'Update product price, stock level, SKU, category, or active status',
    input_schema: {
      type: 'object',
      properties: {
        product_id: { type: 'string' },
        product_name: { type: 'string' },
        price: { type: 'number' },
        cost_price: { type: 'number' },
        stock_qty: { type: 'number' },
        reorder_level: { type: 'number' },
        category: { type: 'string' },
        sku: { type: 'string' },
        is_active: { type: 'boolean' },
      },
    },
  },
  {
    name: 'restock_product',
    description: 'Increase stock for an existing product',
    input_schema: {
      type: 'object',
      properties: {
        product_id: { type: 'string' },
        product_name: { type: 'string' },
        quantity: { type: 'number' },
        note: { type: 'string' },
      },
      required: ['quantity'],
    },
  },
  {
    name: 'draft_invoice',
    description: 'Create a draft invoice for a customer, with optional line items',
    input_schema: {
      type: 'object',
      properties: {
        customer_id: { type: 'string' },
        customer_name: { type: 'string' },
        due_date: { type: 'string' },
        note: { type: 'string' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              product_id: { type: 'string' },
              product_name: { type: 'string' },
              qty: { type: 'number' },
              unit_price: { type: 'number' },
            },
          },
        },
      },
      required: ['customer_name'],
    },
  },
  {
    name: 'record_sale',
    description: 'Record a completed sale with line items and payment method',
    input_schema: {
      type: 'object',
      properties: {
        customer_id: { type: 'string' },
        customer_name: { type: 'string' },
        payment_method: { type: 'string', description: 'cash, momo, card, or credit' },
        amount_paid: { type: 'number' },
        note: { type: 'string' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              product_id: { type: 'string' },
              product_name: { type: 'string' },
              qty: { type: 'number' },
              unit_price: { type: 'number' },
              discount: { type: 'number' },
            },
            required: ['product_name', 'qty'],
          },
        },
      },
      required: ['items', 'payment_method'],
    },
  },
  {
    name: 'record_credit_payment',
    description: 'Record a payment from a customer against their outstanding credit balance',
    input_schema: {
      type: 'object',
      properties: {
        customer_id: { type: 'string' },
        customer_name: { type: 'string' },
        amount: { type: 'number' },
        method: { type: 'string' },
        note: { type: 'string' },
      },
      required: ['amount'],
    },
  },
  {
    name: 'send_whatsapp_message',
    description: 'Send a WhatsApp message to a customer',
    input_schema: {
      type: 'object',
      properties: {
        customer_id: { type: 'string' },
        customer_name: { type: 'string' },
        phone: { type: 'string' },
        message: { type: 'string' },
      },
      required: ['message'],
    },
  },
];

const CASHIER_ALLOWED_TOOLS = new Set([
  'record_sale',
  'record_credit_payment',
]);

const OWNER_MANAGER_ONLY = new Set([
  'create_product',
  'update_product',
  'restock_product',
  'flag_low_stock',
  'create_customer',
  'update_customer',
  'draft_invoice',
  'send_debt_reminder',
  'send_whatsapp_message',
]);

function canExecuteAiTool(user, toolName) {
  if (['owner', 'manager'].includes(user.role)) return true;
  if (user.role === 'cashier' && CASHIER_ALLOWED_TOOLS.has(toolName)) return true;
  if (OWNER_MANAGER_ONLY.has(toolName)) return false;
  return false;
}

function normalizePaymentMethod(paymentMethod) {
  const raw = String(paymentMethod || 'cash').toLowerCase().trim();
  if (['momo', 'mobile money', 'mobile_money', 'mtn', 'telecel cash', 'vodafone cash'].includes(raw)) {
    return 'momo';
  }
  if (['card', 'debit', 'visa', 'mastercard'].includes(raw)) {
    return 'card';
  }
  if (['credit', 'on credit', 'owe', 'deferred'].includes(raw)) {
    return 'credit';
  }
  if (['cash', 'momo', 'card', 'credit'].includes(raw)) {
    return raw;
  }
  return 'cash';
}

function buildToolUsageRules() {
  return `ACTION RULES:
- Use tools only when the user wants you to CHANGE data (create sale, customer, product, invoice, payment, restock, SMS/WhatsApp).
- For questions about sales, stock, or debt, answer from DATA — do not call a tool unless an action is requested.
- Use exact product and customer names from Known products / Known customers. Never guess names.
- payment_method must be one of: cash, momo, card, credit.
- record_sale requires at least one item with product_name and qty; use selling prices from context when user omits price.
- draft_invoice needs customer_name; items are optional.
- record_credit_payment needs customer and a positive amount.
- Prefer one focused tool call per request.`;
}

module.exports = {
  MCP_TOOLS,
  CASHIER_ALLOWED_TOOLS,
  canExecuteAiTool,
  normalizePaymentMethod,
  buildToolUsageRules,
};

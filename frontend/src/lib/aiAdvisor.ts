export interface AiToolCall {
  id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  description?: string;
  dismissed?: boolean;
  approved?: boolean;
}

export function mapApiToolCalls(
  raw: Array<{ id?: string; name?: string; tool_name?: string; input?: unknown; tool_input?: unknown; description?: string }> | undefined,
  baseTs = Date.now()
): AiToolCall[] {
  return (raw || []).map((tc, i) => ({
    id: tc.id || `tc-${baseTs}-${i}`,
    tool_name: tc.name || tc.tool_name || 'action',
    tool_input: (tc.input || tc.tool_input || {}) as Record<string, unknown>,
    description: tc.description,
  }));
}

export function describeToolCall(tc: AiToolCall): string {
  const input = tc.tool_input || {};
  if (tc.description) return tc.description;

  switch (tc.tool_name) {
    case 'record_sale': {
      const items = Array.isArray(input.items) ? input.items : [];
      const lines = items.map((item: Record<string, unknown>) => {
        const qty = item.qty ?? item.quantity ?? 1;
        const name = item.product_name || item.name || 'item';
        const price = item.unit_price ?? item.price;
        return price != null ? `${qty}× ${name} @ GHS ${price}` : `${qty}× ${name}`;
      });
      const pay = input.payment_method ? String(input.payment_method) : 'cash';
      return lines.length ? `Record sale: ${lines.join(', ')} · ${pay}` : 'Record a sale with the items shown.';
    }
    case 'create_customer':
      return `Create customer: ${input.name || 'new customer'}`;
    case 'update_customer':
      return `Update customer: ${input.customer_name || input.name || 'customer'}`;
    case 'create_product':
      return `Create product: ${input.name} @ GHS ${input.price ?? '?'}`;
    case 'update_product':
      return `Update product: ${input.product_name || input.name || 'product'}`;
    case 'restock_product':
      return `Restock ${input.product_name || 'product'} by ${input.quantity ?? '?'}`;
    case 'draft_invoice': {
      const items = Array.isArray(input.items) ? input.items : [];
      const base = `Draft invoice for ${input.customer_name || 'customer'}`;
      return items.length ? `${base} (${items.length} line${items.length === 1 ? '' : 's'})` : base;
    }
    case 'record_credit_payment':
      return `Record GHS ${input.amount ?? '?'} credit payment from ${input.customer_name || 'customer'}`;
    case 'send_debt_reminder':
      return `SMS debt reminder to ${input.customer_name || 'customer'}`;
    case 'send_whatsapp_message':
      return `WhatsApp to ${input.customer_name || input.phone || 'customer'}`;
    case 'flag_low_stock':
      return `Flag ${input.product_name || 'product'} for restock`;
    default:
      return `Run ${tc.tool_name.replace(/_/g, ' ')}`;
  }
}

export function toolBusyLabel(toolName: string): string {
  const labels: Record<string, string> = {
    record_sale: 'Recording sale…',
    record_credit_payment: 'Recording payment…',
    create_customer: 'Creating customer…',
    update_customer: 'Updating customer…',
    create_product: 'Creating product…',
    update_product: 'Updating product…',
    restock_product: 'Restocking…',
    draft_invoice: 'Creating invoice…',
    send_debt_reminder: 'Sending SMS…',
    send_whatsapp_message: 'Sending message…',
    flag_low_stock: 'Updating stock flag…',
  };
  return labels[toolName] || 'Working…';
}

export function formatToolSuccess(toolName: string, result: unknown): string {
  if (typeof result === 'string') return result;
  if (result && typeof result === 'object') {
    const r = result as { message?: string; sale_id?: string };
    if (r.message) return r.message;
    if (toolName === 'record_sale' && r.sale_id) {
      return `Sale recorded (ref ${String(r.sale_id).slice(-6).toUpperCase()}).`;
    }
  }
  return `"${toolName.replace(/_/g, ' ')}" completed successfully.`;
}

export function extractApiError(err: unknown): string {
  const axiosErr = err as { response?: { data?: { error?: string } }; message?: string };
  return axiosErr.response?.data?.error || axiosErr.message || 'Something went wrong. Please try again.';
}

export function notifyDataChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('bizmanager-data-changed'));
  }
}

export function getPendingToolCalls(
  messages: Array<{ role: string; tool_calls?: AiToolCall[] }>
): AiToolCall[] {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg.role === 'assistant' && msg.tool_calls?.length) {
      return msg.tool_calls.filter((tc) => !tc.approved && !tc.dismissed);
    }
  }
  return [];
}

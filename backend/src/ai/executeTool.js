const { v4: uuidv4 } = require('uuid');
const { createSale } = require('../services/sales');
const { sendSMS } = require('../helpers/arkesel');
const { sendWhatsAppMessage } = require('../helpers/whatsapp');
const { normalizePaymentMethod } = require('./tools');
const { invalidateBusinessContext } = require('./contextCache');

async function logAiTool(supabase, businessId, toolName, toolInput, result) {
  await supabase.from('ai_tool_log').insert({
    business_id: businessId,
    tool_name: toolName,
    input: toolInput,
    result,
  }).catch(() => {});
}

async function findCustomer({ supabase, businessId, customer_id, customer_name }) {
  if (customer_id) {
    const { data } = await supabase
      .from('customers')
      .select('id, name, phone, email')
      .eq('id', customer_id)
      .eq('business_id', businessId)
      .single();
    return data || null;
  }

  if (!customer_name) return null;

  const { data } = await supabase
    .from('customers')
    .select('id, name, phone, email')
    .eq('business_id', businessId)
    .ilike('name', `%${String(customer_name).trim()}%`)
    .order('name')
    .limit(1);

  return data?.[0] || null;
}

async function findProduct({ supabase, businessId, product_id, product_name }) {
  if (product_id) {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('id', product_id)
      .eq('business_id', businessId)
      .eq('is_active', true)
      .single();
    return data || null;
  }

  if (!product_name) return null;

  const query = String(product_name).trim();
  const baseQuery = () => supabase
    .from('products')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_active', true);

  const { data: exactMatches, error: exactError } = await baseQuery()
    .ilike('name', query)
    .order('name')
    .limit(1);
  if (exactError) throw new Error(exactError.message);
  if (exactMatches?.[0]) return exactMatches[0];

  const { data: nameMatches, error: nameError } = await baseQuery().ilike('name', `%${query}%`).order('name').limit(1);
  if (nameError) throw new Error(nameError.message);
  if (nameMatches?.[0]) return nameMatches[0];

  const { data: skuMatches, error: skuError } = await baseQuery().ilike('sku', `%${query}%`).order('name').limit(1);
  if (skuError) throw new Error(skuError.message);

  return skuMatches?.[0] || null;
}

async function getNextInvoiceNumber(supabase, businessId) {
  const { data, error } = await supabase.rpc('next_invoice_number', {
    p_business_id: businessId,
  });

  if (error || !data) {
    throw new Error(error?.message || 'Could not generate invoice number.');
  }

  return data;
}

async function applyPaymentToOutstandingDebt({ supabase, customerId, businessId, amount }) {
  let remaining = Number(amount);
  if (!customerId || remaining <= 0) return;

  const { data: debts, error } = await supabase
    .from('credit_ledger')
    .select('id, amount')
    .eq('customer_id', customerId)
    .eq('business_id', businessId)
    .eq('type', 'debt')
    .eq('settled', false)
    .order('created_at', { ascending: true });

  if (error || !debts?.length) return;

  for (const debt of debts) {
    if (remaining <= 0) break;
    const debtAmount = Number(debt.amount || 0);
    if (remaining >= debtAmount) {
      remaining -= debtAmount;
      await supabase.from('credit_ledger')
        .update({ settled: true })
        .eq('id', debt.id)
        .eq('business_id', businessId);
      continue;
    }
    await supabase.from('credit_ledger')
      .update({ amount: debtAmount - remaining })
      .eq('id', debt.id)
      .eq('business_id', businessId);
    remaining = 0;
  }
}

async function insertPaymentRecord(supabase, payload) {
  let result = await supabase.from('payments').insert(payload).select().single();
  if (!result.error) return result;

  const missingOptionalColumn = ['customer_id', 'note'].some((column) => result.error.message?.includes(column));
  if (!missingOptionalColumn) return result;

  const fallbackPayload = { ...payload };
  delete fallbackPayload.customer_id;
  delete fallbackPayload.note;
  return supabase.from('payments').insert(fallbackPayload).select().single();
}

function buildInvoiceItemRows(items, invoiceId) {
  return (items || []).map((item) => ({
    invoice_id: invoiceId,
    product_id: item.product_id || null,
    product_name: item.product_name || item.name || null,
    qty: Number(item.qty || item.quantity || 1),
    unit_price: Number(item.unit_price || item.price || 0),
    subtotal: Number(item.qty || item.quantity || 1) * Number(item.unit_price || item.price || 0),
  }));
}

async function executeAiTool({ supabase, businessId, userId, toolName, toolInput }) {
  let result;

  try {
    if (toolName === 'send_debt_reminder') {
      const customer = await findCustomer({
        supabase,
        businessId,
        customer_id: toolInput.customer_id,
        customer_name: toolInput.customer_name,
      });

      if (!customer) throw new Error('Customer not found.');
      if (!customer.phone) throw new Error('Customer has no phone number.');

      const { data: debts } = await supabase
        .from('credit_ledger')
        .select('amount')
        .eq('business_id', businessId)
        .eq('customer_id', customer.id)
        .eq('type', 'debt')
        .eq('settled', false);

      const totalDebt = (debts || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const message = `Hi ${customer.name}, this is a reminder that you have GHS ${totalDebt.toFixed(2)} outstanding with us. Please settle at your earliest convenience. Thank you!`;
      await sendSMS(customer.phone, message);
      result = `Debt reminder SMS sent to ${customer.name} (${customer.phone}).`;

    } else if (toolName === 'flag_low_stock') {
      const product = await findProduct({
        supabase,
        businessId,
        product_id: toolInput.product_id,
        product_name: toolInput.product_name,
      });

      if (!product) throw new Error('Product not found.');
      const { error } = await supabase
        .from('products')
        .update({ needs_restock: true })
        .eq('id', product.id)
        .eq('business_id', businessId);

      if (error && !error.message?.includes('needs_restock')) {
        throw new Error(error.message);
      }

      result = `Marked ${product.name} for restocking.`;

    } else if (toolName === 'create_customer') {
      const payload = {
        business_id: businessId,
        name: String(toolInput.name || '').trim(),
        phone: toolInput.phone ? String(toolInput.phone).trim() : null,
        email: toolInput.email ? String(toolInput.email).trim().toLowerCase() : null,
      };

      if (!payload.name) throw new Error('Customer name is required.');

      const { data, error } = await supabase.from('customers').insert(payload).select().single();
      if (error) throw new Error(error.message);

      result = {
        message: `Customer ${data.name} created successfully.`,
        customer_id: data.id,
      };

    } else if (toolName === 'update_customer') {
      const customer = await findCustomer({
        supabase,
        businessId,
        customer_id: toolInput.customer_id,
        customer_name: toolInput.customer_name,
      });

      if (!customer) throw new Error('Customer not found.');

      const payload = {};
      if (toolInput.name != null) payload.name = String(toolInput.name).trim();
      if (toolInput.phone != null) payload.phone = toolInput.phone ? String(toolInput.phone).trim() : null;
      if (toolInput.email != null) {
        payload.email = toolInput.email ? String(toolInput.email).trim().toLowerCase() : null;
      }
      if (toolInput.address != null) payload.address = toolInput.address ? String(toolInput.address).trim() : null;
      if (toolInput.credit_limit != null) payload.credit_limit = Number(toolInput.credit_limit);

      if (Object.keys(payload).length === 0) {
        throw new Error('Nothing to update — provide phone, email, address, or credit_limit.');
      }

      let updateResult = await supabase
        .from('customers')
        .update(payload)
        .eq('id', customer.id)
        .eq('business_id', businessId)
        .select()
        .single();

      if (updateResult.error) {
        const fallback = { ...payload };
        delete fallback.address;
        delete fallback.credit_limit;
        updateResult = await supabase
          .from('customers')
          .update(fallback)
          .eq('id', customer.id)
          .eq('business_id', businessId)
          .select()
          .single();
      }

      if (updateResult.error) throw new Error(updateResult.error.message);

      result = {
        message: `Customer ${updateResult.data.name} updated.`,
        customer_id: updateResult.data.id,
      };

    } else if (toolName === 'create_product') {
      const payload = {
        business_id: businessId,
        name: String(toolInput.name || '').trim(),
        sku: toolInput.sku ? String(toolInput.sku).trim() : null,
        category: toolInput.category ? String(toolInput.category).trim() : null,
        selling_price: Number(toolInput.price || 0),
        cost_price: toolInput.cost_price != null ? Number(toolInput.cost_price) : null,
        stock_qty: Number(toolInput.stock_qty || 0),
        reorder_level: Number(toolInput.reorder_level ?? 5),
        unit: toolInput.unit ? String(toolInput.unit).trim() : 'piece',
        needs_restock: Number(toolInput.stock_qty || 0) <= Number(toolInput.reorder_level ?? 5),
        is_active: true,
      };

      if (!payload.name) throw new Error('Product name is required.');
      if (!Number.isFinite(payload.selling_price) || payload.selling_price <= 0) {
        throw new Error('A valid selling price is required.');
      }

      const { data, error } = await supabase.from('products').insert(payload).select().single();
      if (error) throw new Error(error.message);

      if (Number(payload.stock_qty) > 0) {
        const { error: movementError } = await supabase.from('stock_movements').insert({
          business_id: businessId,
          product_id: data.id,
          movement_type: 'initial',
          quantity_change: Number(payload.stock_qty),
          quantity_before: 0,
          quantity_after: Number(payload.stock_qty),
          note: 'Opening stock',
          reference_type: 'product',
          reference_id: data.id,
          actor_user_id: userId,
          metadata: { source: 'ai_create_product' },
        });

        if (movementError && !movementError.message?.toLowerCase().includes('stock_movements')) {
          throw movementError;
        }
      }

      result = {
        message: `Product ${data.name} created successfully.`,
        product_id: data.id,
      };

    } else if (toolName === 'update_product') {
      const product = await findProduct({
        supabase,
        businessId,
        product_id: toolInput.product_id,
        product_name: toolInput.product_name,
      });

      if (!product) throw new Error('Product not found.');

      const payload = {};
      if (toolInput.name != null) payload.name = String(toolInput.name).trim();
      if (toolInput.sku != null) payload.sku = toolInput.sku ? String(toolInput.sku).trim() : null;
      if (toolInput.category != null) payload.category = toolInput.category ? String(toolInput.category).trim() : null;
      if (toolInput.price != null) payload.selling_price = Number(toolInput.price);
      if (toolInput.cost_price != null) payload.cost_price = Number(toolInput.cost_price);
      if (toolInput.stock_qty != null) {
        payload.stock_qty = Number(toolInput.stock_qty);
        payload.needs_restock = payload.stock_qty <= Number(product.reorder_level || 5);
      }
      if (toolInput.reorder_level != null) payload.reorder_level = Number(toolInput.reorder_level);
      if (toolInput.is_active != null) payload.is_active = Boolean(toolInput.is_active);

      if (Object.keys(payload).length === 0) {
        throw new Error('Nothing to update — provide price, stock_qty, category, or other fields.');
      }

      const { data, error } = await supabase
        .from('products')
        .update(payload)
        .eq('id', product.id)
        .eq('business_id', businessId)
        .select()
        .single();

      if (error) throw new Error(error.message);

      result = {
        message: `Product ${data.name} updated.`,
        product_id: data.id,
      };

    } else if (toolName === 'restock_product') {
      const product = await findProduct({
        supabase,
        businessId,
        product_id: toolInput.product_id,
        product_name: toolInput.product_name,
      });

      if (!product) throw new Error('Product not found.');

      const quantity = Number(toolInput.quantity || 0);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error('A positive restock quantity is required.');
      }

      const before = Number(product.stock_qty || 0);
      const after = before + quantity;
      const reorderLevel = Number(product.reorder_level || 5);

      const { error } = await supabase
        .from('products')
        .update({
          stock_qty: after,
          needs_restock: after <= reorderLevel,
        })
        .eq('id', product.id)
        .eq('business_id', businessId);

      if (error) throw new Error(error.message);

      const { error: movementError } = await supabase.from('stock_movements').insert({
        business_id: businessId,
        product_id: product.id,
        movement_type: 'restock',
        quantity_change: quantity,
        quantity_before: before,
        quantity_after: after,
        note: toolInput.note ? String(toolInput.note).trim() : 'Restocked from AI assistant',
        reference_type: 'product',
        reference_id: product.id,
        actor_user_id: userId,
        metadata: { source: 'ai_restock_product' },
      });

      if (movementError && !movementError.message?.toLowerCase().includes('stock_movements')) {
        throw movementError;
      }

      result = {
        message: `${product.name} restocked by ${quantity}.`,
        product_id: product.id,
        quantity_after: after,
      };

    } else if (toolName === 'draft_invoice') {
      const customer = await findCustomer({
        supabase,
        businessId,
        customer_id: toolInput.customer_id,
        customer_name: toolInput.customer_name,
      });

      if (!customer) throw new Error('Customer not found.');

      const invoiceNumber = await getNextInvoiceNumber(supabase, businessId);
      const invoiceId = uuidv4();
      const resolvedItems = [];

      for (const item of toolInput.items || []) {
        const product = await findProduct({
          supabase,
          businessId,
          product_id: item.product_id,
          product_name: item.product_name || item.name,
        });

        if (!product) {
          throw new Error(`Could not find product "${item.product_name || item.name || item.product_id}".`);
        }

        resolvedItems.push({
          product_id: product.id,
          product_name: product.name,
          qty: Number(item.qty || item.quantity || 1),
          unit_price: Number(item.unit_price ?? item.price ?? product.selling_price ?? 0),
        });
      }

      const total = resolvedItems.reduce((sum, item) => sum + (item.qty * item.unit_price), 0);
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          id: invoiceId,
          business_id: businessId,
          customer_id: customer.id,
          invoice_number: invoiceNumber,
          total_amount: total,
          due_date: toolInput.due_date || null,
          note: toolInput.note ? String(toolInput.note).trim() : null,
          status: 'draft',
        })
        .select()
        .single();

      if (invoiceError) throw new Error(invoiceError.message);

      if (resolvedItems.length > 0) {
        const itemRows = buildInvoiceItemRows(resolvedItems, invoiceId);
        const { error: itemsError } = await supabase.from('invoice_items').insert(itemRows);
        if (itemsError) throw new Error(itemsError.message);
      }

      result = {
        message: `Draft invoice ${invoiceNumber} created for ${customer.name}.`,
        invoice_id: invoice.id,
      };

    } else if (toolName === 'record_sale') {
      const customer = await findCustomer({
        supabase,
        businessId,
        customer_id: toolInput.customer_id,
        customer_name: toolInput.customer_name,
      });

      const resolvedItems = [];
      for (const item of toolInput.items || []) {
        const product = await findProduct({
          supabase,
          businessId,
          product_id: item.product_id,
          product_name: item.product_name || item.name,
        });

        if (!product) {
          throw new Error(`Could not find product "${item.product_name || item.name || item.product_id}".`);
        }

        resolvedItems.push({
          product_id: product.id,
          qty: Number(item.qty || item.quantity || 1),
          unit_price: Number(item.unit_price ?? item.price ?? product.selling_price ?? 0),
          discount: Number(item.discount || 0),
        });
      }

      if (resolvedItems.length === 0) {
        throw new Error('At least one sale item is required.');
      }

      const paymentMethod = normalizePaymentMethod(toolInput.payment_method);
      const computedTotal = resolvedItems.reduce((sum, item) => sum + (item.qty * item.unit_price) - (item.discount || 0), 0);
      let amountPaid = toolInput.amount_paid != null ? Number(toolInput.amount_paid) : computedTotal;
      if (paymentMethod === 'credit') {
        amountPaid = Math.min(amountPaid, computedTotal);
      } else if (amountPaid < computedTotal) {
        amountPaid = computedTotal;
      }

      const { saleId, total } = await createSale({
        supabase,
        businessId,
        userId,
        customerId: customer?.id || null,
        items: resolvedItems,
        paymentMethod,
        amountPaid,
        note: toolInput.note ? String(toolInput.note).trim() : 'Recorded by AI assistant',
      });

      result = {
        message: `Sale ${saleId.slice(-6).toUpperCase()} recorded for GHS ${Number(total).toFixed(2)} (${paymentMethod}).`,
        sale_id: saleId,
        total,
      };

    } else if (toolName === 'record_credit_payment') {
      const customer = await findCustomer({
        supabase,
        businessId,
        customer_id: toolInput.customer_id,
        customer_name: toolInput.customer_name,
      });

      if (!customer) throw new Error('Customer not found.');

      const amount = Number(toolInput.amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('A positive payment amount is required.');
      }

      const method = normalizePaymentMethod(toolInput.method || toolInput.payment_method || 'cash');
      const { data: payment, error: paymentError } = await insertPaymentRecord(supabase, {
        business_id: businessId,
        customer_id: customer.id,
        sale_id: null,
        amount,
        method,
        status: 'completed',
        note: toolInput.note ? String(toolInput.note).trim() : 'Credit payment via AI assistant',
      });

      if (paymentError) throw new Error(paymentError.message);

      await applyPaymentToOutstandingDebt({
        supabase,
        customerId: customer.id,
        businessId,
        amount,
      });

      await supabase.from('credit_ledger').insert({
        business_id: businessId,
        customer_id: customer.id,
        amount,
        type: 'payment',
        settled: true,
        due_date: null,
      }).catch(() => {});

      result = {
        message: `Recorded GHS ${amount.toFixed(2)} payment from ${customer.name} (${method}).`,
        payment_id: payment?.id,
      };

    } else if (toolName === 'send_whatsapp_message') {
      const customer = await findCustomer({
        supabase,
        businessId,
        customer_id: toolInput.customer_id,
        customer_name: toolInput.customer_name,
      });

      const to = toolInput.phone ? String(toolInput.phone).trim() : customer?.phone;
      const message = String(toolInput.message || '').trim();

      if (!to) throw new Error('A customer phone number is required.');
      if (!message) throw new Error('Message text is required.');

      await sendWhatsAppMessage(to, message);
      result = `WhatsApp message sent to ${customer?.name || to}.`;

    } else {
      throw new Error(`Unknown tool: ${toolName}`);
    }
  } catch (err) {
    await logAiTool(supabase, businessId, toolName, toolInput, `ERROR: ${err.message}`);
    return { success: false, error: err.message };
  }

  invalidateBusinessContext(businessId);

  const logResult = typeof result === 'string' ? result : JSON.stringify(result);
  await logAiTool(supabase, businessId, toolName, toolInput, logResult);
  return { success: true, result };
}

module.exports = {
  executeAiTool,
};

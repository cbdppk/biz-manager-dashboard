import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('production helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('builds a stable PDF buffer for business reports', async () => {
    const reportModule = await import('../src/helpers/businessReportPdf.js');
    const { buildBusinessReportPdfBuffer } = reportModule;

    const pdfBuffer = await buildBusinessReportPdfBuffer({
      business: { name: 'Demo Shop', phone: '0000000000' },
      summary: {
        from: '2026-05-01T00:00:00.000Z',
        to: '2026-05-22T00:00:00.000Z',
        revenue: 1000,
        cash_collected: 900,
        credit_outstanding: 100,
        cost_of_goods_sold: 600,
        gross_profit: 400,
        gross_margin: 40,
        expenses: 150,
        net_profit: 250,
        net_margin: 25,
        stock_value: 500,
        top_products: [{ name: 'Soap', qty: 5, revenue: 200 }],
        low_stock: [{ name: 'Sugar', stock_qty: 2 }],
      },
      loanReadiness: {
        score: 72,
        grade: 'Good',
        estimated_safe_monthly_repayment: 62.5,
        disclaimer: 'This is an estimate based on your records. It is not a bank decision.',
      },
    });

    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.slice(0, 4).toString()).toBe('%PDF');
  });

  it('builds a stable PDF buffer for invoices', async () => {
    const invoicesModule = await import('../src/helpers/invoices.js');
    const { buildInvoicePdfBuffer } = invoicesModule;

    const pdfBuffer = await buildInvoicePdfBuffer({
      business: { name: 'BizManager Demo', phone: '0000000000' },
      invoice: {
        invoice_number: 'INV-0001',
        status: 'draft',
        created_at: '2026-04-09T00:00:00.000Z',
        due_date: '2026-04-20T00:00:00.000Z',
        customer_name: 'Ama',
        customer_phone: '0000000000',
        customer_email: 'demo@example.com',
        total: 40,
        note: 'Thanks',
        items: [
          { name: 'Soap', quantity: 2, price: 20, subtotal: 40 },
        ],
      },
    });

    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.slice(0, 4).toString()).toBe('%PDF');
  });

  it('fails safely when invoice email delivery is not configured', async () => {
    vi.resetModules();
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;

    const invoicesModule = await import('../src/helpers/invoices.js');
    const { sendInvoiceEmail } = invoicesModule;

    await expect(sendInvoiceEmail({
      invoice: {
        invoice_number: 'INV-0001',
        customer_email: 'demo@example.com',
        total: 40,
        due_date: '2026-04-20T00:00:00.000Z',
      },
      pdfBuffer: Buffer.from('test'),
    })).rejects.toMatchObject({
      code: 'EMAIL_CONFIG',
    });
  });

  it('fails safely when MoMo credentials are missing', async () => {
    vi.resetModules();
    delete process.env.MOMO_BASE_URL;
    delete process.env.MOMO_BASE_URL_SANDBOX;
    delete process.env.MOMO_BASE_URL_PRODUCTION;
    delete process.env.MOMO_SUBSCRIPTION_KEY;
    delete process.env.MOMO_API_USER;
    delete process.env.MOMO_API_KEY;

    const momoModule = await import('../src/helpers/momo.js');
    const { initiateMoMoPayment } = momoModule;

    await expect(initiateMoMoPayment('0000000000', 50, 'BizManager payment')).rejects.toMatchObject({
      code: 'MOMO_CONFIG',
    });
  });

  it('extracts readable provider error messages from upstream responses', async () => {
    const providerErrorsModule = await import('../src/helpers/providerErrors.js');
    const { buildProviderError, pickProviderMessage } = providerErrorsModule;

    expect(pickProviderMessage({ message: 'Invalid API key' })).toBe('Invalid API key');
    expect(pickProviderMessage({ error_description: 'Unauthorized client' })).toBe('Unauthorized client');

    const err = buildProviderError('MoMo token request failed', {
      response: { data: { message: 'Invalid subscription key' } },
    });

    expect(err.message).toBe('MoMo token request failed: Invalid subscription key');
    expect(err.status).toBe(502);
  });
});

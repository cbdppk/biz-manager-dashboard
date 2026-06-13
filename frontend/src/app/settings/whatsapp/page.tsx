'use client';

import { useRouter } from 'next/navigation';

export default function WhatsAppSettingsPage() {
  const router = useRouter();

  return (
    <main className="page page-content">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => router.back()} className="text-muted text-2xl leading-none">←</button>
        <h1 className="text-lg font-semibold text-primary">WhatsApp Bot</h1>
      </div>

      <div className="card p-6 flex flex-col items-center text-center mt-8">
        <div className="w-16 h-16 bg-[#10b981]/20 rounded-full flex items-center justify-center mb-4">
          <span className="text-3xl">💬</span>
        </div>
        <h2 className="text-lg font-semibold text-primary mb-2">WhatsApp Business API</h2>
        <p className="text-[13px] text-secondary mb-8 px-2">
          Connect your business WhatsApp number to receive offline sales from staff and send automatic receipts to your customers.
        </p>

        <button disabled className="btn w-full p-4 rounded-[10px] bg-[#334155] text-muted font-bold tracking-wide mb-4">
          Verification Required
        </button>

        <p className="text-[11px] text-muted max-w-[250px]">
          Requires an active Meta Business Developer app setup. Please see the Owner Manual for verification instructions.
        </p>
      </div>
    </main>
  );
}
/**
 * Script to create recurring subscription plans on Mercado Pago.
 *
 * Run after setting MP_ACCESS_TOKEN in your environment:
 *   MP_ACCESS_TOKEN=YOUR_TOKEN npx tsx scripts/setup-mercadopago-plans.ts
 */

const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

if (!ACCESS_TOKEN) {
  console.error('❌  MP_ACCESS_TOKEN env var is required.');
  process.exit(1);
}

interface PlanInput {
  key: string;
  reason: string;
  amountBRL: number;
  envVar: string;
}

const PLANS: PlanInput[] = [
  {
    key: 'essencial',
    reason: 'DoctorChatBot — Plano Essencial',
    amountBRL: 397,
    envVar: 'MP_PLAN_ID_ESSENCIAL',
  },
  {
    key: 'profissional',
    reason: 'DoctorChatBot — Plano Profissional',
    amountBRL: 597,
    envVar: 'MP_PLAN_ID_PROFISSIONAL',
  },
  {
    key: 'clinic_pro',
    reason: 'DoctorChatBot — Plano Clinic Pro',
    amountBRL: 997,
    envVar: 'MP_PLAN_ID_CLINIC_PRO',
  },
];

async function createPlan(plan: PlanInput): Promise<string> {
  const body = {
    reason: plan.reason,
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: plan.amountBRL,
      currency_id: 'BRL',
    },
    payment_methods_allowed: {
      payment_types: [{ id: 'credit_card' }],
    },
    back_url: 'https://doctorchatbot.com.br/billing',
  };

  const res = await fetch('https://api.mercadopago.com/preapproval_plan', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json() as { id?: string; message?: string; error?: string };

  if (!res.ok || !data.id) {
    throw new Error(`MP API error for plan "${plan.key}": ${data.message ?? data.error ?? res.status}`);
  }

  return data.id;
}

async function main() {
  console.log('🚀  Creating Mercado Pago PreApproval Plans...\n');

  const results: { envVar: string; planId: string }[] = [];

  for (const plan of PLANS) {
    process.stdout.write(`  ⏳  ${plan.reason} (R$${plan.amountBRL}/mês) ...`);
    try {
      const id = await createPlan(plan);
      results.push({ envVar: plan.envVar, planId: id });
      console.log(` ✅  ${id}`);
    } catch (err) {
      console.log(' ❌');
      console.error(`     ${(err as Error).message}`);
      process.exit(1);
    }
  }

  console.log('\n✅  All plans created! Add these to your .env.local:\n');
  for (const { envVar, planId } of results) {
    console.log(`${envVar}=${planId}`);
  }
  console.log('\nThen redeploy so the new env vars take effect.');
}

main();

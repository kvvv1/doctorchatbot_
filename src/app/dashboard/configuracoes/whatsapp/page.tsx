import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import WhatsAppConfigPageClient from './WhatsAppConfigPageClient';

export const metadata = {
  title: 'Configurações do WhatsApp | Doctor Chat Bot',
  description: 'Configure e conecte sua instância do WhatsApp',
};

export default async function WhatsAppConfigPage() {
  // Verificar autenticação
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return <WhatsAppConfigPageClient />;
}

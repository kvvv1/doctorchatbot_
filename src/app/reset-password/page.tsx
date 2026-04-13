import { Metadata } from 'next'
import ResetPasswordForm from './ui/ResetPasswordForm'

export const metadata: Metadata = {
  title: 'Redefinir senha',
  description: 'Crie uma nova senha para sua conta',
}

export default function ResetPasswordPage() {
  return <ResetPasswordForm />
}

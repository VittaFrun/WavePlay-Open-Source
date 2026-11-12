export function validateAccountCredentials(email: string, password: string) {
  const address = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) throw new Error('Escribe un correo electrónico válido.');
  if (password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.');
  return {email: address, password};
}

export function accountAccessMessage(reason: unknown) {
  const code = reason && typeof reason === 'object' && 'code' in reason ? String(reason.code) : '';
  if (code === 'invalid_credentials') return 'El correo o la contraseña no coinciden. Revisa los datos e inténtalo de nuevo.';
  if (code === 'email_not_confirmed') return 'Abre el enlace de confirmación que enviamos a tu correo para continuar.';
  if (code === 'user_already_exists') return 'Ya hay una cuenta con ese correo. Elige Iniciar sesión.';
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit') return 'Espera un momento antes de volver a intentarlo.';
  if (reason instanceof Error && /network|fetch|timeout/i.test(reason.message)) return 'No pudimos conectarnos. Revisa tu conexión e inténtalo de nuevo.';
  return reason instanceof Error ? reason.message : 'No se pudo completar el acceso. Inténtalo de nuevo.';
}

export type ErrorCategory = 'validation' | 'unauthenticated' | 'unavailable' | 'network' | 'unexpected';

export class BackendError extends Error {
  constructor(public readonly category: ErrorCategory, message: string, public readonly needsReview = false) {
    super(message);
  }
}

// Only fixed categories/operations are logged: never raw SDK errors, URLs or payloads.
export function backendError(cause: unknown, operation: 'auth' | 'list' | 'create' | 'update' | 'remove', status?: number): BackendError {
  const source = typeof cause === 'object' && cause !== null ? cause as Record<string, unknown> : {};
  const code = typeof source.code === 'string' ? source.code : '';
  const httpStatus = status ?? (typeof source.status === 'number' ? source.status : 0);
  const message = typeof source.message === 'string' ? source.message : '';
  let category: ErrorCategory = 'unexpected';
  let text = 'Сервис временно недоступен. Повторите попытку позже.';
  if (code === 'invalid_credentials') { category = 'validation'; text = 'Неверный email или пароль.'; }
  else if (code === 'email_not_confirmed') { category = 'validation'; text = 'Подтвердите email по ссылке из письма, затем войдите.'; }
  else if (httpStatus === 429 || code === 'over_email_send_rate_limit') { text = 'Слишком много попыток. Подождите и повторите позже.'; }
  else if (httpStatus === 401 || source.name === 'AuthSessionMissingError' || ['PGRST301', 'PGRST302', 'PGRST303', 'refresh_token_not_found', 'refresh_token_already_used', 'session_not_found', 'bad_jwt', 'user_not_found'].includes(code)) {
    category = 'unauthenticated'; text = 'Сессия завершена. Войдите снова.';
  }
  else if (httpStatus === 403 || code === '42501' || code === 'PGRST116') { category = 'unavailable'; text = 'Книга недоступна. Закройте форму и обновите список.'; }
  else if (['23502', '23514', '22P02', '23503', 'weak_password', 'validation_failed', 'email_address_invalid', 'user_already_exists'].includes(code)) {
    category = 'validation'; text = operation === 'auth' ? 'Проверьте email и пароль. Если аккаунт уже создан, попробуйте войти.' : 'Проверьте обязательные поля, длину текста, статус и оценку.';
  }
  else if (cause instanceof TypeError || /fetch|network|load failed|timeout/i.test(message)) { category = 'network'; text = 'Нет связи с сервером. Проверьте подключение к интернету.'; }
  const needsReview = operation !== 'auth' && operation !== 'list' && (category === 'network' || category === 'unexpected');
  if (needsReview) text = 'Не удалось подтвердить сохранение. Закройте форму и обновите список перед новой попыткой; запрос мог выполниться.';
  console.warn('[BookTrack]', { operation, category });
  return new BackendError(category, text, needsReview);
}

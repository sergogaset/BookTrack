const authParameters = [
  'code', 'error', 'error_code', 'error_description', 'error_uri',
  'access_token', 'refresh_token', 'provider_token', 'provider_refresh_token',
  'expires_in', 'expires_at', 'token_type', 'type',
];

export const oauthFailureMessage = 'Не удалось завершить вход через GitHub. Попробуйте снова или войдите по email.';

export function readOAuthCallback() {
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.slice(1));
  const parameters = new URLSearchParams(url.search);
  hash.forEach((value, name) => parameters.set(name, value));
  const hasError = ['error', 'error_code', 'error_description'].some(name => parameters.has(name));
  return {
    hasCode: parameters.has('code'),
    isCallback: hasError || parameters.has('code') || parameters.has('access_token'),
    errorMessage: hasError
      ? parameters.get('error') === 'access_denied' || parameters.get('error_code') === 'access_denied'
        ? 'Вход через GitHub отменён. Вы можете попробовать снова или войти по email.'
        : oauthFailureMessage
      : null,
  };
}

export function clearOAuthCallbackUrl() {
  const url = new URL(window.location.href);
  for (const name of authParameters) url.searchParams.delete(name);
  const hash = new URLSearchParams(url.hash.slice(1));
  if (authParameters.some(name => hash.has(name))) {
    for (const name of authParameters) hash.delete(name);
    url.hash = hash.toString();
  }
  window.history.replaceState(window.history.state, '', url.toString());
}

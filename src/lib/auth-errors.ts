import { t } from "@/i18n";

/**
 * Supabase Auth hata kodlarını kullanıcı dostu Türkçe mesajlara çevirir.
 * Ham hata mesajları (iç ayrıntı sızdırabilecekleri için) kullanıcıya gösterilmez.
 */
export function authErrorMessage(error: { code?: string; status?: number; message?: string } | null): string {
  if (!error) return t.common.unexpectedError;
  switch (error.code) {
    case "invalid_credentials":
      return t.auth.invalidCredentials;
    case "email_not_confirmed":
      return t.auth.emailNotConfirmed;
    case "user_already_exists":
    case "email_exists":
      return t.auth.userExists;
    case "weak_password":
      return t.auth.weakPassword;
    case "email_address_not_authorized":
      // Supabase'in yerleşik e-posta servisi yalnızca ekip adreslerine gönderir; özel SMTP gerekir (docs/SETUP.md §3)
      return t.auth.emailUnavailable;
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return t.auth.rateLimited;
  }
  if (error.status === 429) return t.auth.rateLimited;
  return t.common.unexpectedError;
}

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

/**
 * Google kimlik belirteciyle girişte (supabase.auth.signInWithIdToken) dönen hatalar.
 * Supabase aynı doğrulanmış e-postalı hesapları kendiliğinden bağlar; bağlayamazsa (ör. hesap doğrulanmamış
 * e-posta/şifreyle açılmış) "farklı yöntemle açılmış hesap" mesajı gösterilir.
 */
export function googleIdTokenErrorMessage(error: { code?: string; status?: number; message?: string } | null): string {
  switch (error?.code) {
    case "provider_disabled":
      return t.auth.googleDisabled;
    case "email_exists":
    case "user_already_exists":
    case "identity_already_exists":
      return t.auth.googleAccountConflict;
    case "bad_jwt":
    case "invalid_credentials":
    case "validation_failed":
      return t.auth.googleTokenRejected;
    case "signup_disabled":
      return t.auth.googleSignupDisabled;
  }
  if (error?.status === 429 || error?.code?.startsWith("over_")) return t.auth.rateLimited;
  return t.auth.googleFailed;
}

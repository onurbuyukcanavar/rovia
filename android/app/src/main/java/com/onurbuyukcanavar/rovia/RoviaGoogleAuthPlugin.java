package com.onurbuyukcanavar.rovia;

import android.net.Uri;
import android.os.CancellationSignal;
import android.webkit.WebView;
import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.GetCredentialInterruptedException;
import androidx.credentials.exceptions.NoCredentialException;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;
import java.util.regex.Pattern;

/**
 * Yerel "Google ile giriş" (Credential Manager + Sign in with Google). Google, WebView içinde OAuth'a izin
 * vermediği için eski sürümler Custom Tab açıyordu; bu eklenti Android'in kendi hesap seçicisini gösterir ve
 * Google kimlik belirtecini (ID token) web katmanına döndürür. Web katmanı belirteci Supabase signInWithIdToken'a
 * ham nonce ile verir (src/lib/native/google-sign-in-form.tsx).
 *
 * - serverClientId: Google Cloud'daki WEB istemci kimliği (NEXT_PUBLIC_GOOGLE_CLIENT_ID); belirtecin kitlesi (aud) budur.
 *   Android istemcisi (paket adı + imza SHA-1) yalnızca Google tarafında kayıtlı olmalıdır; kodda kullanılmaz.
 * - nonce: ham nonce'un SHA-256 onaltılık özeti; belirtecin "nonce" alanına yazılır.
 * - Yalnızca ROVIA sitesinden (MainActivity.APP_HOSTS) yüklenmiş sayfa çağırabilir.
 * - Ret kodları: canceled · no_credential · interrupted · forbidden_origin · invalid_argument · busy · unexpected_credential · failed
 */
@CapacitorPlugin(name = "RoviaGoogleAuth")
public class RoviaGoogleAuthPlugin extends Plugin {

    private static final Pattern CLIENT_ID = Pattern.compile("^[0-9]+-[a-z0-9]+\\.apps\\.googleusercontent\\.com$");
    private static final Pattern NONCE = Pattern.compile("^[0-9a-f]{64}$");

    private volatile boolean busy;

    @PluginMethod
    public void signIn(PluginCall call) {
        final String serverClientId = call.getString("serverClientId");
        final String nonce = call.getString("nonce");
        if (serverClientId == null || !CLIENT_ID.matcher(serverClientId).matches() || nonce == null || !NONCE.matcher(nonce).matches()) {
            reject(call, "invalid_argument");
            return;
        }
        // WebView.getUrl() yalnızca ana iş parçacığında: köken denetimi ve istek orada başlatılır
        getActivity().runOnUiThread(() -> {
            WebView webView = getBridge().getWebView();
            String current = webView == null ? null : webView.getUrl();
            String host = current == null ? null : Uri.parse(current).getHost();
            if (host == null || !MainActivity.APP_HOSTS.contains(host)) {
                reject(call, "forbidden_origin");
                return;
            }
            if (busy) {
                reject(call, "busy");
                return;
            }
            busy = true;
            start(call, serverClientId, nonce);
        });
    }

    private void start(PluginCall call, String serverClientId, String nonce) {
        GetSignInWithGoogleOption option = new GetSignInWithGoogleOption.Builder(serverClientId)
            .setNonce(nonce)
            .build();
        GetCredentialRequest request = new GetCredentialRequest.Builder()
            .addCredentialOption(option)
            .build();
        CredentialManager manager = CredentialManager.create(getContext());
        try {
            manager.getCredentialAsync(
                getActivity(),
                request,
                new CancellationSignal(),
                ContextCompat.getMainExecutor(getContext()),
                new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                    @Override
                    public void onResult(GetCredentialResponse result) {
                        busy = false;
                        handle(call, result.getCredential());
                    }

                    @Override
                    public void onError(@NonNull GetCredentialException e) {
                        busy = false;
                        if (e instanceof GetCredentialCancellationException) {
                            reject(call, "canceled");
                        } else if (e instanceof NoCredentialException) {
                            reject(call, "no_credential");
                        } else if (e instanceof GetCredentialInterruptedException) {
                            reject(call, "interrupted");
                        } else {
                            reject(call, "failed");
                        }
                    }
                });
        } catch (RuntimeException e) {
            busy = false;
            reject(call, "failed");
        }
    }

    private void handle(PluginCall call, Credential credential) {
        if (credential instanceof CustomCredential
            && GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())) {
            try {
                GoogleIdTokenCredential google = GoogleIdTokenCredential.createFrom(credential.getData());
                JSObject r = new JSObject();
                r.put("idToken", google.getIdToken());
                call.resolve(r);
                return;
            } catch (Exception e) {
                // GoogleIdTokenParsingException dâhil
                reject(call, "failed");
                return;
            }
        }
        reject(call, "unexpected_credential");
    }

    /** İleti ve kod aynı: JS tarafı (nativeErrorCode) ikisinden birini okur. Kişisel veri/ayrıntı döndürülmez. */
    private static void reject(PluginCall call, String code) {
        call.reject(code, code);
    }
}

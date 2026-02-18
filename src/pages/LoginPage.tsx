import { A, useNavigate } from "@solidjs/router";
import { FirebaseError } from "firebase/app";
import { signInWithEmailAndPassword } from "firebase/auth";
import { Component, createSignal, onCleanup } from "solid-js";
import { auth } from "../firebase";

const LoginPage: Component = () => {
  const navigate = useNavigate();
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [status, setStatus] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [isSubmitting, setIsSubmitting] = createSignal(false);
  let redirectTimer: number | null = null;
  const toUserLabel = (displayName: string | null | undefined, email: string | null | undefined) => {
    const name = displayName?.trim();
    if (name) return name;
    if (!email) return "användare";
    const [localPart] = email.split("@");
    return localPart || email;
  };

  const toFriendlyMessage = (err: unknown) => {
    if (err instanceof FirebaseError) {
      switch (err.code) {
        case "auth/invalid-credential":
        case "auth/wrong-password":
        case "auth/user-not-found":
          return "Fel e-post eller lösenord.";
        case "auth/invalid-email":
          return "Ogiltig e-postadress.";
        case "auth/too-many-requests":
          return "För många försök. Vänta en stund och försök igen.";
        default:
          return "Kunde inte logga in just nu.";
      }
    }
    return "Kunde inte logga in just nu.";
  };

  const handleSubmit = async (event: Event) => {
    event.preventDefault();
    setStatus(null);
    setError(null);

    if (!email().trim() || !password()) {
      setError("Fyll i både e-post och lösenord.");
      return;
    }

    try {
      setIsSubmitting(true);
      const credential = await signInWithEmailAndPassword(auth, email().trim(), password());
      const userLabel = toUserLabel(credential.user.displayName, credential.user.email);
      setStatus(`Inloggad som ${userLabel}. Omdirigerar...`);
      setPassword("");
      if (redirectTimer) clearTimeout(redirectTimer);
      redirectTimer = window.setTimeout(() => navigate("/"), 1200);
    } catch (err) {
      console.error("Kunde inte logga in", err);
      setError(toFriendlyMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  onCleanup(() => {
    if (redirectTimer) {
      clearTimeout(redirectTimer);
    }
  });

  return (
    <main class="page auth-page">
      <h1>Logga in</h1>
      <p class="auth-lead">Ange e-post och lösenord för att komma igång.</p>

      <form class="auth-form" onSubmit={handleSubmit}>
        <label>
          <span>E-post</span>
          <input
            type="email"
            value={email()}
            onInput={(e) => setEmail(e.currentTarget.value)}
            placeholder="namn@example.com"
            autocomplete="email"
            required
          />
        </label>

        <label>
          <span>Lösenord</span>
          <input
            type="password"
            value={password()}
            onInput={(e) => setPassword(e.currentTarget.value)}
            placeholder="Ditt lösenord"
            autocomplete="current-password"
            required
          />
        </label>

        <div class="auth-actions">
          <button class="primary-button" type="submit" disabled={isSubmitting()}>
            {isSubmitting() ? "Loggar in..." : "Logga in"}
          </button>
          <A href="/skapa-konto" class="link-button">
            Skapa konto
          </A>
        </div>

        {status() && <div class="form-status success">{status()}</div>}
        {error() && <div class="form-status error">{error()}</div>}
      </form>
    </main>
  );
};

export default LoginPage;

import { Component, createSignal } from "solid-js";
import { FirebaseError } from "firebase/app";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth } from "../firebase";

const RegisterUserPage: Component = () => {
  const [username, setUsername] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [confirmPassword, setConfirmPassword] = createSignal("");
  const [status, setStatus] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [isSubmitting, setIsSubmitting] = createSignal(false);

  const toFriendlyMessage = (err: unknown) => {
    if (err instanceof FirebaseError) {
      switch (err.code) {
        case "auth/email-already-in-use":
          return "E-postadressen används redan.";
        case "auth/invalid-email":
          return "Ogiltig e-postadress.";
        case "auth/weak-password":
          return "Välj ett starkare lösenord (minst 6 tecken).";
        default:
          return "Kunde inte skapa konto just nu.";
      }
    }
    return "Kunde inte skapa konto just nu.";
  };

  const normalizeUsername = (value: string) => value.trim().replace(/\s+/g, " ");

  const handleSubmit = async (event: Event) => {
    event.preventDefault();
    setStatus(null);
    setError(null);

    const nextUsername = normalizeUsername(username());
    if (!nextUsername || !email().trim() || !password() || !confirmPassword()) {
      setError("Fyll i användarnamn, e-post och lösenord.");
      return;
    }

    if (nextUsername.length < 3 || nextUsername.length > 24) {
      setError("Användarnamn måste vara 3-24 tecken.");
      return;
    }

    if (password() !== confirmPassword()) {
      setError("Lösenorden matchar inte.");
      return;
    }

    try {
      setIsSubmitting(true);
      const credential = await createUserWithEmailAndPassword(auth, email().trim(), password());
      let couldSaveUserName = true;
      try {
        await updateProfile(credential.user, { displayName: nextUsername });
      } catch (nameErr) {
        console.warn("Kunde inte spara användarnamn vid registrering", nameErr);
        couldSaveUserName = false;
        setStatus("Konto skapat, men användarnamnet kunde inte sparas. Sätt det på profilsidan.");
      }
      if (couldSaveUserName) {
        setStatus(`Konto skapat för ${nextUsername}!`);
      }
      setUsername("");
      setEmail("");
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      console.error("Kunde inte skapa användare", err);
      setError(toFriendlyMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main class="page auth-page">
      <h1>Skapa konto</h1>
      <p class="auth-lead">Registrera dig med användarnamn, e-post och lösenord.</p>

      <form class="auth-form" onSubmit={handleSubmit}>
        <label>
          <span>Användarnamn</span>
          <input
            type="text"
            placeholder="T.ex. Fiskemaster"
            value={username()}
            onInput={(e) => setUsername(e.currentTarget.value)}
            autocomplete="username"
            minLength={3}
            maxLength={24}
            required
          />
        </label>

        <label>
          <span>E-post</span>
          <input
            type="email"
            placeholder="namn@example.com"
            value={email()}
            onInput={(e) => setEmail(e.currentTarget.value)}
            autocomplete="email"
            required
          />
        </label>

        <label>
          <span>Lösenord</span>
          <input
            type="password"
            placeholder="Minst 6 tecken"
            value={password()}
            onInput={(e) => setPassword(e.currentTarget.value)}
            autocomplete="new-password"
            minLength={6}
            required
          />
        </label>

        <label>
          <span>Bekräfta lösenord</span>
          <input
            type="password"
            placeholder="Upprepa lösenordet"
            value={confirmPassword()}
            onInput={(e) => setConfirmPassword(e.currentTarget.value)}
            autocomplete="new-password"
            minLength={6}
            required
          />
        </label>

        <button class="primary-button" type="submit" disabled={isSubmitting()}>
          {isSubmitting() ? "Skapar konto..." : "Skapa konto"}
        </button>

        {status() && <div class="form-status success">{status()}</div>}
        {error() && <div class="form-status error">{error()}</div>}
      </form>
    </main>
  );
};

export default RegisterUserPage;

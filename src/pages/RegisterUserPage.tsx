import { Component, Show, createSignal } from "solid-js";
import { FirebaseError } from "firebase/app";
import { createUserWithEmailAndPassword, deleteUser, sendEmailVerification, signOut, updateProfile } from "firebase/auth";
import { auth } from "../firebase";
import {
  claimUniqueUsername,
  isFunctionsUnauthenticatedError,
  isUsernameTakenError,
  normalizeUsername,
} from "../utils/username";
import {
  PASSWORD_MIN_LENGTH,
  evaluatePasswordPolicy,
  isPasswordPolicySatisfied,
} from "../utils/passwordPolicy";

const RegisterUserPage: Component = () => {
  const [username, setUsername] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [confirmPassword, setConfirmPassword] = createSignal("");
  const [status, setStatus] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [isSubmitting, setIsSubmitting] = createSignal(false);
  const normalizedUsername = () => normalizeUsername(username());
  const usernameHasValue = () => normalizedUsername().length > 0;
  const passwordPolicy = () => evaluatePasswordPolicy(password());
  const passwordHasValue = () => password().length > 0;

  const waitForSignedInUser = async (uid: string, timeoutMs = 4000) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (auth.currentUser?.uid === uid) return;
      await new Promise((resolve) => window.setTimeout(resolve, 120));
    }
  };

  const claimUsernameWithRetries = async (
    uid: string,
    nextDisplayName: string,
    idToken: string
  ): Promise<"ok" | "auth_race"> => {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await claimUniqueUsername({
          uid,
          nextDisplayName,
          idToken,
        });
        return "ok";
      } catch (err) {
        lastError = err;
        if (isUsernameTakenError(err)) throw err;
        if (!isFunctionsUnauthenticatedError(err)) throw err;
        await waitForSignedInUser(uid, 1200);
        await new Promise((resolve) => window.setTimeout(resolve, 150 * (attempt + 1)));
      }
    }

    if (lastError && isFunctionsUnauthenticatedError(lastError)) {
      return "auth_race";
    }
    throw lastError;
  };

  const toFriendlyMessage = (err: unknown) => {
    if (err instanceof FirebaseError) {
      switch (err.code) {
        case "auth/email-already-in-use":
          return "E-postadressen används redan.";
        case "auth/invalid-email":
          return "Ogiltig e-postadress.";
        case "auth/weak-password":
          return "Lösenordet måste vara minst 8 tecken och innehålla stor bokstav + siffra.";
        default:
          return "Kunde inte skapa konto just nu.";
      }
    }
    return "Kunde inte skapa konto just nu.";
  };

  const handleSubmit = async (event: Event) => {
    event.preventDefault();
    setStatus(null);
    setError(null);

    const nextUsername = normalizedUsername();
    if (!nextUsername || !email().trim() || !password() || !confirmPassword()) {
      setError("Fyll i användarnamn, e-post och lösenord.");
      return;
    }

    if (nextUsername.length < 3 || nextUsername.length > 24) {
      setError("Användarnamn måste vara 3-24 tecken.");
      return;
    }

    if (!isPasswordPolicySatisfied(password())) {
      setError(`Lösenordet måste vara minst ${PASSWORD_MIN_LENGTH} tecken och innehålla stor bokstav + siffra.`);
      return;
    }

    if (password() !== confirmPassword()) {
      setError("Lösenorden matchar inte.");
      return;
    }

    try {
      setIsSubmitting(true);
      const credential = await createUserWithEmailAndPassword(auth, email().trim(), password());
      let usernameClaimResult: "ok" | "auth_race" = "ok";
      try {
        // Säkerställ att auth-token finns innan callable-funktionen körs.
        const idToken = await credential.user.getIdToken(true);
        usernameClaimResult = await claimUsernameWithRetries(credential.user.uid, nextUsername, idToken);
        await credential.user.reload();
      } catch (setupErr) {
        if (isFunctionsUnauthenticatedError(setupErr)) {
          usernameClaimResult = "auth_race";
        } else {
          await deleteUser(credential.user).catch((deleteErr) => {
            console.warn("Kunde inte ta bort delvis skapat konto", deleteErr);
          });
          throw setupErr;
        }
      }

      if (usernameClaimResult === "auth_race") {
        await updateProfile(credential.user, { displayName: nextUsername }).catch((profileErr) => {
          console.warn("Kunde inte sätta temporärt displayName", profileErr);
        });
      }

      try {
        await credential.user.reload();
      } catch (reloadErr) {
        console.warn("Kunde inte uppdatera användarsession efter registrering", reloadErr);
      }

      let verificationSent = false;
      try {
        await sendEmailVerification(credential.user, {
          url: `${window.location.origin}/logga-in`,
        });
        verificationSent = true;
      } catch (verificationErr) {
        console.warn("Kunde inte skicka verifieringsmail", verificationErr);
      }
      await signOut(auth).catch((signOutErr) => {
        console.warn("Kunde inte logga ut efter registrering", signOutErr);
      });

      if (usernameClaimResult === "auth_race") {
        setStatus(
          verificationSent
            ? `Konto skapat för ${nextUsername}. Verifiera e-post och logga in igen så slutför vi användarnamnet.`
            : `Konto skapat för ${nextUsername}, men verifieringsmail kunde inte skickas just nu.`
        );
      } else {
        setStatus(
          verificationSent
            ? `Konto skapat för ${nextUsername}. Verifiera din e-post innan inloggning.`
            : `Konto skapat för ${nextUsername}, men verifieringsmail kunde inte skickas just nu.`
        );
      }
      setUsername("");
      setEmail("");
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      if (isUsernameTakenError(err)) {
        setError("Användarnamnet används redan.");
        return;
      }
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
            placeholder="Bertil"
            value={username()}
            onInput={(e) => setUsername(e.currentTarget.value)}
            autocomplete="username"
            minLength={3}
            maxLength={24}
            required
          />
          <Show when={usernameHasValue() && normalizedUsername().length < 3}>
            <div class="field-validation is-invalid">Minst 3 tecken</div>
          </Show>
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
            placeholder="Minst 8 tecken, 1 stor bokstav, 1 siffra"
            value={password()}
            onInput={(e) => setPassword(e.currentTarget.value)}
            autocomplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            required
          />
          <ul class={`password-checklist ${passwordHasValue() ? "is-visible" : ""}`}>
            <li class={`password-checklist__item ${passwordPolicy().minLength ? "is-valid" : ""}`}>
              Minst 8 tecken
            </li>
            <li class={`password-checklist__item ${passwordPolicy().hasUppercase ? "is-valid" : ""}`}>
              Minst en stor bokstav
            </li>
            <li class={`password-checklist__item ${passwordPolicy().hasDigit ? "is-valid" : ""}`}>
              Minst en siffra
            </li>
          </ul>
        </label>

        <label>
          <span>Bekräfta lösenord</span>
          <input
            type="password"
            placeholder="Upprepa lösenordet"
            value={confirmPassword()}
            onInput={(e) => setConfirmPassword(e.currentTarget.value)}
            autocomplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
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

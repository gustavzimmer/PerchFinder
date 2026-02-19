import { A } from "@solidjs/router";
import { FirebaseError } from "firebase/app";
import {
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendEmailVerification,
  updatePassword,
  updateProfile,
  type User,
} from "firebase/auth";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { Component, For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { auth, storage } from "../firebase";
import useGetUserCatches from "../hooks/useGetUserCatches";
import useGetWaters from "../hooks/useGetWaters";
import { ensureSocialProfile } from "../utils/socialProfile";
import { claimUniqueUsername, isUsernameTakenError, normalizeUsername } from "../utils/username";
import {
  PASSWORD_MIN_LENGTH,
  evaluatePasswordPolicy,
  isPasswordPolicySatisfied,
} from "../utils/passwordPolicy";

const toUserLabel = (name: string | null | undefined, email: string | null | undefined) => {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  if (!email) return "Användare";
  const [localPart] = email.split("@");
  return localPart || email;
};

const ChevronLeftIcon: Component = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="m14.5 6.5-5 5.5 5 5.5" />
  </svg>
);

const ChevronRightIcon: Component = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="m9.5 6.5 5 5.5-5 5.5" />
  </svg>
);

const ProfilePage: Component = () => {
  const [currentUser, setCurrentUser] = createSignal<User | null>(auth.currentUser, {
    equals: false,
  });
  const [avatarUrl, setAvatarUrl] = createSignal<string | null>(auth.currentUser?.photoURL ?? null);
  const [selectedWaterId, setSelectedWaterId] = createSignal<string | null>(null);
  const [isSavingAvatar, setIsSavingAvatar] = createSignal(false);
  const [avatarError, setAvatarError] = createSignal<string | null>(null);
  const [avatarStatus, setAvatarStatus] = createSignal<string | null>(null);
  const [displayNameInput, setDisplayNameInput] = createSignal(
    normalizeUsername(auth.currentUser?.displayName ?? "")
  );
  const [isSavingDisplayName, setIsSavingDisplayName] = createSignal(false);
  const [displayNameError, setDisplayNameError] = createSignal<string | null>(null);
  const [displayNameStatus, setDisplayNameStatus] = createSignal<string | null>(null);
  const [isSendingVerificationEmail, setIsSendingVerificationEmail] = createSignal(false);
  const [verificationEmailError, setVerificationEmailError] = createSignal<string | null>(null);
  const [verificationEmailStatus, setVerificationEmailStatus] = createSignal<string | null>(null);
  const [currentPassword, setCurrentPassword] = createSignal("");
  const [newPassword, setNewPassword] = createSignal("");
  const [confirmNewPassword, setConfirmNewPassword] = createSignal("");
  const [isChangingPassword, setIsChangingPassword] = createSignal(false);
  const [changePasswordError, setChangePasswordError] = createSignal<string | null>(null);
  const [changePasswordStatus, setChangePasswordStatus] = createSignal<string | null>(null);
  const normalizedDisplayName = () => normalizeUsername(displayNameInput());
  const displayNameHasValue = () => normalizedDisplayName().length > 0;
  const displayNameIsValid = () =>
    normalizedDisplayName().length >= 3 && normalizedDisplayName().length <= 24;
  const newPasswordPolicy = () => evaluatePasswordPolicy(newPassword());
  const newPasswordHasValue = () => newPassword().length > 0;

  const userCatches = useGetUserCatches(() => currentUser()?.uid ?? null);
  const waters = useGetWaters();

  onMount(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAvatarUrl(user?.photoURL ?? null);
      setDisplayNameInput(normalizeUsername(user?.displayName ?? ""));
    });
    onCleanup(() => unsub());
  });

  const watersById = createMemo(() => {
    const list = waters.data() ?? [];
    const map = new Map<string, string>();
    list.forEach((water) => {
      if (water._id) {
        map.set(water._id, water.name);
      }
    });
    return map;
  });

  const sortedUserCatches = createMemo(() => {
    const list = userCatches.data() ?? [];
    return [...list].sort((a, b) => {
      const aTime = new Date(a.caughtAt).getTime();
      const bTime = new Date(b.caughtAt).getTime();
      return bTime - aTime;
    });
  });

  const catchesByWater = createMemo(() => {
    const grouped = new Map<string, ReturnType<typeof sortedUserCatches>>();
    sortedUserCatches().forEach((item) => {
      const list = grouped.get(item.waterId) ?? [];
      list.push(item);
      grouped.set(item.waterId, list);
    });
    return grouped;
  });

  const waterSummaries = createMemo(() => {
    const grouped = catchesByWater();
    const summaries = Array.from(grouped.entries()).map(([waterId, list]) => {
      const name = watersById().get(waterId) ?? "Okänt vatten";
      const lastCaughtAt = list[0]?.caughtAt ?? null;
      return {
        waterId,
        name,
        count: list.length,
        lastCaughtAt,
      };
    });
    return summaries.sort((a, b) => {
      const aTime = a.lastCaughtAt ? new Date(a.lastCaughtAt).getTime() : 0;
      const bTime = b.lastCaughtAt ? new Date(b.lastCaughtAt).getTime() : 0;
      return bTime - aTime;
    });
  });

  const selectedCatches = createMemo(() => {
    const id = selectedWaterId();
    if (!id) return [];
    return catchesByWater().get(id) ?? [];
  });

  const deletePreviousProfilePhoto = async (url: string | null | undefined) => {
    if (!url) return;
    if (!url.includes("/profile-photos%2F")) return;
    try {
      const oldRef = ref(storage, url);
      await deleteObject(oldRef);
    } catch (err) {
      console.warn("Kunde inte ta bort tidigare profilbild", err);
    }
  };

  const uploadProfilePhoto = async (file: File) => {
    const user = auth.currentUser;
    if (!user) {
      setAvatarError("Du måste vara inloggad.");
      return;
    }

    setAvatarError(null);
    setAvatarStatus(null);
    setIsSavingAvatar(true);

    try {
      if (!file.type.startsWith("image/")) {
        setAvatarError("Endast bildfiler tillåtna.");
        return;
      }

      const ext = file.name.split(".").pop() || "jpg";
      const safeExt = ext.replace(/[^a-zA-Z0-9]/g, "") || "jpg";
      const fileRef = ref(storage, `profile-photos/${user.uid}/avatar-${Date.now()}.${safeExt}`);
      await uploadBytes(fileRef, file, { contentType: file.type });
      const downloadUrl = await getDownloadURL(fileRef);

      const previousPhoto = user.photoURL;
      await updateProfile(user, { photoURL: downloadUrl });
      try {
        await ensureSocialProfile(user);
      } catch (socialErr) {
        console.warn("Kunde inte synka social profil efter bilduppdatering", socialErr);
      }
      setAvatarUrl(downloadUrl);
      await user.reload();
      setCurrentUser(auth.currentUser);
      setAvatarStatus("Profilbild uppdaterad.");
      await deletePreviousProfilePhoto(previousPhoto);
    } catch (err) {
      console.error("Kunde inte uppdatera profilbild", err);
      setAvatarError("Kunde inte spara profilbild just nu.");
    } finally {
      setIsSavingAvatar(false);
    }
  };

  const removeProfilePhoto = async () => {
    const user = auth.currentUser;
    if (!user) {
      setAvatarError("Du måste vara inloggad.");
      return;
    }

    setAvatarError(null);
    setAvatarStatus(null);
    setIsSavingAvatar(true);

    try {
      const previousPhoto = user.photoURL;
      await updateProfile(user, { photoURL: null });
      try {
        await ensureSocialProfile(user);
      } catch (socialErr) {
        console.warn("Kunde inte synka social profil efter borttagning av bild", socialErr);
      }
      setAvatarUrl(null);
      await user.reload();
      setCurrentUser(auth.currentUser);
      setAvatarStatus("Profilbild borttagen.");
      await deletePreviousProfilePhoto(previousPhoto);
    } catch (err) {
      console.error("Kunde inte ta bort profilbild", err);
      setAvatarError("Kunde inte ta bort profilbilden just nu.");
    } finally {
      setIsSavingAvatar(false);
    }
  };

  const saveDisplayName = async (event: Event) => {
    event.preventDefault();
    setDisplayNameError(null);
    setDisplayNameStatus(null);

    const user = auth.currentUser;
    if (!user) {
      setDisplayNameError("Du måste vara inloggad.");
      return;
    }

    const nextName = normalizedDisplayName();
    if (nextName.length < 3 || nextName.length > 24) {
      setDisplayNameError("Användarnamn måste vara 3-24 tecken.");
      return;
    }

    if (nextName === normalizeUsername(user.displayName ?? "")) {
      setDisplayNameStatus("Användarnamnet är redan sparat.");
      return;
    }

    setIsSavingDisplayName(true);
    try {
      await claimUniqueUsername({
        uid: user.uid,
        nextDisplayName: nextName,
        previousDisplayName: user.displayName,
      });
      await updateProfile(user, { displayName: nextName });
      try {
        await ensureSocialProfile(user, nextName);
      } catch (socialErr) {
        console.warn("Kunde inte synka social profil efter namnbyte", socialErr);
      }
      await user.reload();
      setCurrentUser(auth.currentUser);
      setDisplayNameInput(nextName);
      setDisplayNameStatus("Användarnamn uppdaterat.");
    } catch (err) {
      if (isUsernameTakenError(err)) {
        setDisplayNameError("Användarnamnet är upptaget. Välj ett annat.");
        return;
      }
      if (err instanceof FirebaseError && err.code === "permission-denied") {
        setDisplayNameError("Saknar behörighet att byta användarnamn just nu.");
        return;
      }
      console.error("Kunde inte uppdatera användarnamn", err);
      setDisplayNameError("Kunde inte spara användarnamn just nu.");
    } finally {
      setIsSavingDisplayName(false);
    }
  };

  const resendVerificationEmail = async () => {
    setVerificationEmailError(null);
    setVerificationEmailStatus(null);
    const user = auth.currentUser;
    if (!user) {
      setVerificationEmailError("Du måste vara inloggad.");
      return;
    }
    if (user.emailVerified) {
      setVerificationEmailStatus("Din e-post är redan verifierad.");
      return;
    }

    setIsSendingVerificationEmail(true);
    try {
      await sendEmailVerification(user, {
        url: `${window.location.origin}/logga-in`,
      });
      setVerificationEmailStatus("Verifieringsmail skickat. Kontrollera inkorgen.");
    } catch (err) {
      console.error("Kunde inte skicka verifieringsmail", err);
      setVerificationEmailError("Kunde inte skicka verifieringsmail just nu.");
    } finally {
      setIsSendingVerificationEmail(false);
    }
  };

  const handleChangePassword = async (event: Event) => {
    event.preventDefault();
    setChangePasswordError(null);
    setChangePasswordStatus(null);

    const user = auth.currentUser;
    if (!user || !user.email) {
      setChangePasswordError("Du måste vara inloggad med e-post/lösenord.");
      return;
    }

    if (!currentPassword() || !newPassword() || !confirmNewPassword()) {
      setChangePasswordError("Fyll i alla lösenordsfält.");
      return;
    }

    if (!isPasswordPolicySatisfied(newPassword())) {
      setChangePasswordError(
        `Nytt lösenord måste vara minst ${PASSWORD_MIN_LENGTH} tecken och innehålla stor bokstav + siffra.`
      );
      return;
    }

    if (newPassword() !== confirmNewPassword()) {
      setChangePasswordError("Nya lösenorden matchar inte.");
      return;
    }

    if (currentPassword() === newPassword()) {
      setChangePasswordError("Nytt lösenord måste skilja sig från nuvarande.");
      return;
    }

    setIsChangingPassword(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword());
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword());
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setChangePasswordStatus("Lösenord uppdaterat.");
    } catch (err) {
      if (err instanceof FirebaseError) {
        switch (err.code) {
          case "auth/wrong-password":
          case "auth/invalid-credential":
            setChangePasswordError("Nuvarande lösenord är fel.");
            return;
          case "auth/weak-password":
            setChangePasswordError("Nytt lösenord är för svagt.");
            return;
          case "auth/too-many-requests":
            setChangePasswordError("För många försök. Vänta en stund och försök igen.");
            return;
          default:
            break;
        }
      }
      console.error("Kunde inte uppdatera lösenord", err);
      setChangePasswordError("Kunde inte uppdatera lösenord just nu.");
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <main class="page">
      <h1>Profil</h1>

      <Show when={currentUser()} fallback={<div>Du måste vara inloggad för att se din profil.</div>}>
        <section class="profile-card">
          <div class="profile-avatar-block">
            <div class="profile-avatar">
              <Show
                when={avatarUrl()}
                fallback={
                  <span>
                    {toUserLabel(currentUser()?.displayName, currentUser()?.email).charAt(0).toUpperCase()}
                  </span>
                }
              >
                <img
                  src={avatarUrl() ?? ""}
                  alt="Profilbild"
                  onError={() => {
                    setAvatarUrl(null);
                    setAvatarError("Kunde inte visa profilbilden. Kontrollera Storage-regler och försök igen.");
                  }}
                />
              </Show>
            </div>
            <div class="card-actions">
              <label class="primary-button profile-upload-btn">
                {isSavingAvatar() ? "Sparar..." : "Ladda upp profilbild"}
                <input
                  type="file"
                  accept="image/*"
                  disabled={isSavingAvatar()}
                  onChange={(e) => {
                    const file = e.currentTarget.files?.[0];
                    if (!file) return;
                    void uploadProfilePhoto(file);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
              <button
                type="button"
                class="danger-button"
                onClick={() => void removeProfilePhoto()}
                disabled={isSavingAvatar() || !avatarUrl()}
              >
                Ta bort bild
              </button>
            </div>
          </div>

          <div>
            <strong>{toUserLabel(currentUser()?.displayName, currentUser()?.email)}</strong>
          </div>
          <div class="muted">{currentUser()?.email}</div>
          <div class="profile-email-verify-row">
            <span class={`profile-verify-pill ${currentUser()?.emailVerified ? "is-verified" : "is-unverified"}`}>
              {currentUser()?.emailVerified ? "E-post verifierad" : "E-post ej verifierad"}
            </span>
            <Show when={!currentUser()?.emailVerified}>
              <button
                type="button"
                class="secondary-button profile-verify-button"
                onClick={() => void resendVerificationEmail()}
                disabled={isSendingVerificationEmail()}
              >
                {isSendingVerificationEmail() ? "Skickar..." : "Skicka verifieringsmail"}
              </button>
            </Show>
          </div>
          <div class="muted">Din användarprofil och dina fångster.</div>
          <form class="profile-name-form" onSubmit={saveDisplayName}>
            <label>
              <span>Användarnamn</span>
              <input
                type="text"
                value={displayNameInput()}
                onInput={(e) => setDisplayNameInput(e.currentTarget.value)}
                minLength={3}
                maxLength={24}
                autocomplete="username"
                required
                disabled={isSavingDisplayName()}
              />
              <div
                class={`field-validation ${
                  displayNameHasValue() ? (displayNameIsValid() ? "is-valid" : "is-invalid") : ""
                }`}
              >
                Minst 3 tecken
              </div>
            </label>
            <button type="submit" class="primary-button" disabled={isSavingDisplayName()}>
              {isSavingDisplayName() ? "Sparar..." : "Spara användarnamn"}
            </button>
          </form>
          <Show when={displayNameStatus()}>
            <div class="form-status success">{displayNameStatus()}</div>
          </Show>
          <Show when={displayNameError()}>
            <div class="form-status error">{displayNameError()}</div>
          </Show>
          <Show when={avatarStatus()}>
            <div class="form-status success">{avatarStatus()}</div>
          </Show>
          <Show when={avatarError()}>
            <div class="form-status error">{avatarError()}</div>
          </Show>
          <Show when={verificationEmailStatus()}>
            <div class="form-status success">{verificationEmailStatus()}</div>
          </Show>
          <Show when={verificationEmailError()}>
            <div class="form-status error">{verificationEmailError()}</div>
          </Show>

          <form class="profile-password-form" onSubmit={handleChangePassword}>
            <h3>Byt lösenord</h3>
            <label>
              <span>Nuvarande lösenord</span>
              <input
                type="password"
                value={currentPassword()}
                onInput={(e) => setCurrentPassword(e.currentTarget.value)}
                autocomplete="current-password"
                required
                disabled={isChangingPassword()}
              />
            </label>
            <label>
              <span>Nytt lösenord</span>
              <input
                type="password"
                value={newPassword()}
                onInput={(e) => setNewPassword(e.currentTarget.value)}
                autocomplete="new-password"
                minLength={PASSWORD_MIN_LENGTH}
                required
                disabled={isChangingPassword()}
              />
              <ul class={`password-checklist ${newPasswordHasValue() ? "is-visible" : ""}`}>
                <li class={`password-checklist__item ${newPasswordPolicy().minLength ? "is-valid" : ""}`}>
                  Minst 8 tecken
                </li>
                <li class={`password-checklist__item ${newPasswordPolicy().hasUppercase ? "is-valid" : ""}`}>
                  Minst en stor bokstav
                </li>
                <li class={`password-checklist__item ${newPasswordPolicy().hasDigit ? "is-valid" : ""}`}>
                  Minst en siffra
                </li>
              </ul>
            </label>
            <label>
              <span>Bekräfta nytt lösenord</span>
              <input
                type="password"
                value={confirmNewPassword()}
                onInput={(e) => setConfirmNewPassword(e.currentTarget.value)}
                autocomplete="new-password"
                minLength={PASSWORD_MIN_LENGTH}
                required
                disabled={isChangingPassword()}
              />
            </label>
            <button type="submit" class="primary-button" disabled={isChangingPassword()}>
              {isChangingPassword() ? "Sparar..." : "Uppdatera lösenord"}
            </button>
          </form>
          <Show when={changePasswordStatus()}>
            <div class="form-status success">{changePasswordStatus()}</div>
          </Show>
          <Show when={changePasswordError()}>
            <div class="form-status error">{changePasswordError()}</div>
          </Show>
        </section>

        <section>
          <h2>Dina vatten</h2>

          <Show
            when={userCatches.isLoading()}
            fallback={
              <>
                <Show when={userCatches.error()}>
                  <div class="form-status error">{userCatches.error()}</div>
                </Show>
                <Show when={waterSummaries().length > 0} fallback={<div>Inga fångster registrerade ännu.</div>}>
                  <ul class="catch-list">
                    <For each={waterSummaries()}>
                      {(water) => (
                    <li class="catch-card">
                      <div class="catch-meta">
                        <strong>{water.name}</strong>
                        <div class="catch-time">Antal fångster: {water.count}</div>
                        {water.lastCaughtAt && (
                          <div class="catch-time">
                            Senast: {new Date(water.lastCaughtAt).toLocaleString("sv-SE")}
                          </div>
                        )}
                        <div class="card-actions">
                          <button
                            type="button"
                            class="primary-button"
                            onClick={() => setSelectedWaterId(water.waterId)}
                          >
                            Visa mina fångster
                          </button>
                          <A class="link-button" href={`/vatten/${water.waterId}`}>
                            Visa vatten
                          </A>
                        </div>
                      </div>
                    </li>
                  )}
                </For>
              </ul>
                </Show>
              </>
            }
          >
            <div>Laddar dina fångster...</div>
          </Show>
        </section>

        <Show when={selectedWaterId()}>
          <section>
            <div class="profile-section-header">
              <h2>
                Mina fångster i {watersById().get(selectedWaterId()!) ?? "Okänt vatten"}
              </h2>
              <button type="button" class="link-button" onClick={() => setSelectedWaterId(null)}>
                Visa alla vatten
              </button>
            </div>

            <Show when={selectedCatches().length > 0} fallback={<div>Inga fångster för detta vatten.</div>}>
              <ul class="catch-list">
                <For each={selectedCatches()}>
                  {(item) => {
                    const photos = () =>
                      item.photoUrls && item.photoUrls.length > 0
                        ? item.photoUrls
                        : item.photoUrl
                          ? [item.photoUrl]
                          : [];
                    const [photoIndex, setPhotoIndex] = createSignal(0);
                    const photoCount = () => photos().length;

                    const goPrev = () => {
                      const count = photoCount();
                      if (count <= 1) return;
                      setPhotoIndex((index) => (index - 1 + count) % count);
                    };

                    const goNext = () => {
                      const count = photoCount();
                      if (count <= 1) return;
                      setPhotoIndex((index) => (index + 1) % count);
                    };

                    return (
                      <li class="catch-card">
                        <div class="catch-meta">
                          <Show when={photoCount() > 0}>
                            <div class="catch-slider">
                              <div
                                class="catch-slider__track"
                                style={{ transform: `translateX(-${photoIndex() * 100}%)` }}
                              >
                                <For each={photos()}>
                                  {(src) => (
                                    <div class="catch-slide">
                                      <img src={src} alt="Fångstbild" loading="lazy" />
                                    </div>
                                  )}
                                </For>
                              </div>
                              <Show when={photoCount() > 1}>
                                <button
                                  type="button"
                                  class="slider-btn prev"
                                  onClick={goPrev}
                                  aria-label="Föregående bild"
                                >
                                  <ChevronLeftIcon />
                                </button>
                                <button
                                  type="button"
                                  class="slider-btn next"
                                  onClick={goNext}
                                  aria-label="Nästa bild"
                                >
                                  <ChevronRightIcon />
                                </button>
                                <div class="slider-dots" role="tablist" aria-label="Bildval">
                                  <For each={photos()}>
                                    {(_, index) => (
                                      <button
                                        type="button"
                                        class={`slider-dot ${index() === photoIndex() ? "is-active" : ""}`}
                                        onClick={() => setPhotoIndex(index())}
                                        aria-label={`Bild ${index() + 1}`}
                                      />
                                    )}
                                  </For>
                                </div>
                              </Show>
                            </div>
                          </Show>

                          <div>
                            <strong>{item.weightG ? `${item.weightG} g` : "Okänd vikt"}</strong>{" "}
                            {item.lengthCm ? ` | ${item.lengthCm} cm` : null}
                          </div>
                          <div class="catch-time">{new Date(item.caughtAt).toLocaleString("sv-SE")}</div>
                          <Show when={item.lure || item.method}>
                            <div>
                              <h3>Bete</h3>
                                <p>
                                  {item.lure
                                  ? `${item.lure.brand} ${item.lure.name} ${item.lure.size} ${item.lure.color}`
                                  : "Inget bete tillagt"}
                                </p>
                              <Show when={item.lure?.category}>
                                <p>Kategori: {item.lure?.category}</p>
                              </Show>
                              <Show when={item.method}>
                                <p>Metod: {item.method}</p>
                              </Show>
                            </div>
                          </Show>
                          {item.notes && (
                            <div>
                              <h3>Kommentar</h3>
                              <p class="catch-notes">{item.notes}</p>
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  }}
                </For>
              </ul>
            </Show>
          </section>
        </Show>
      </Show>
    </main>
  );
};

export default ProfilePage;

import { A } from "@solidjs/router";
import { FirebaseError } from "firebase/app";
import { onAuthStateChanged, updateProfile, type User } from "firebase/auth";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { Component, For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { auth, storage } from "../firebase";
import useGetUserCatches from "../hooks/useGetUserCatches";
import useGetWaters from "../hooks/useGetWaters";
import { ensureSocialProfile } from "../utils/socialProfile";
import { claimUniqueUsername, isUsernameTakenError, normalizeUsername } from "../utils/username";

const toUserLabel = (name: string | null | undefined, email: string | null | undefined) => {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  if (!email) return "Användare";
  const [localPart] = email.split("@");
  return localPart || email;
};

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

    const nextName = normalizeUsername(displayNameInput());
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
                                  {"<"}
                                </button>
                                <button
                                  type="button"
                                  class="slider-btn next"
                                  onClick={goNext}
                                  aria-label="Nästa bild"
                                >
                                  {">"}
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

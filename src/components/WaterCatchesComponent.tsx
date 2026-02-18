import { For, Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import useGetCatches from "../hooks/useGetCatches";
import { useParams } from "@solidjs/router";
import { auth, catchCol } from "../firebase";
import { deleteDoc, doc } from "firebase/firestore";
import { onAuthStateChanged, type User } from "firebase/auth";

const toUserLabel = (name: string | null | undefined, email: string | null | undefined) => {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  if (!email) return "Anonym";
  const [localPart] = email.split("@");
  return localPart || email;
};

const WaterCatchesComponent = () => {
  const params = useParams();
  const waterId = () => params.id;

  const catches = useGetCatches(() => waterId() ?? "");
  const [currentUser, setCurrentUser] = createSignal<User | null>(auth.currentUser);
  const [deletingId, setDeletingId] = createSignal<string | null>(null);
  const [deleteError, setDeleteError] = createSignal<string | null>(null);

  onMount(() => {
    const unsub = onAuthStateChanged(auth, (user) => setCurrentUser(user));
    onCleanup(() => unsub());
  });

  const handleDelete = async (catchId: string) => {
    setDeleteError(null);
    setDeletingId(catchId);
    try {
      await deleteDoc(doc(catchCol, catchId));
    } catch (err) {
      console.error("Kunde inte radera fångst", err);
      setDeleteError("Kunde inte radera fångsten. Försök igen.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section class="water-catches">
        
      <h2>Fångster</h2>
      <Show when={deleteError()}>
        <div class="form-status error">{deleteError()}</div>
      </Show>

      <Show when={!catches.isLoading()} fallback={<div>Laddar fångster...</div>}>
        <Show when={catches.data() && catches.data()!.length > 0} fallback={<div>Inga fångster registrerade ännu.</div>}>
          <ul class="catch-list">
            <For each={catches.data()}>
              {(item) => {
                const photos = () =>
                  item.photoUrls && item.photoUrls.length > 0
                    ? item.photoUrls
                    : item.photoUrl
                      ? [item.photoUrl]
                      : [];
                const [photoIndex, setPhotoIndex] = createSignal(0);
                const photoCount = () => photos().length;

                createEffect(() => {
                  if (photoIndex() >= photoCount()) {
                    setPhotoIndex(0);
                  }
                });

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
                  <li class="catch-card" data-id={item._id}>
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

                      <div class="catch-time">
                        {new Date(item.caughtAt).toLocaleString("sv-SE")}
                      </div>
                      <div class="catch-time">
                        Fångad av: {toUserLabel(item.userName, item.userEmail)}
                      </div>

                      <div>
                        <h3>Bete</h3>
                        <p>{item.lure ? `${item.lure.brand} ${item.lure.name} ${item.lure.size} ${item.lure.type} ${item.lure.color}` : "Inget bete tillagt"}</p>
                        <Show when={item.lure?.category}>
                          <p>Kategori: {item.lure?.category}</p>
                        </Show>
                        <Show when={item.method}>
                          <p>Metod: {item.method}</p>
                        </Show>
                      </div>

                      {item.notes && (
                        <div>
                          <h3>Kommentar</h3>
                          <p class="catch-notes">{item.notes}</p>
                        </div>
                      )}

                      <div>
                        <p> { item.weatherSummary } </p>
                        <p> { item.pressureHpa } </p>
                      </div>

                      <Show when={currentUser() && item.userId === currentUser()?.uid && item._id}>
                        <button
                          type="button"
                          class="danger-button"
                          onClick={() => handleDelete(item._id!)}
                          disabled={deletingId() === item._id}
                        >
                          {deletingId() === item._id ? "Raderar..." : "Radera"}
                        </button>
                      </Show>

                    </div>

                  </li>
                );
              }}
            </For>
          </ul>
        </Show>
      </Show>
    </section>
  );
};

export default WaterCatchesComponent;

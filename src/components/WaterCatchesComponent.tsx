import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import useGetCatches from "../hooks/useGetCatches";
import { useParams } from "@solidjs/router";
import { auth, catchCol } from "../firebase";
import { deleteDoc, doc } from "firebase/firestore";
import { onAuthStateChanged, type User } from "firebase/auth";

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
              {(item) => (
                <li class="catch-card" data-id={item._id}>
                  <div class="catch-meta">

                    {item.photoUrl && (

                        <div class="catch-photo">
                            <img src={item.photoUrl} alt="Fångstbild" loading="lazy" />
                        </div>

                    )}

                    <div>
                      <strong>{item.weightG ? `${item.weightG} g` : "Okänd vikt"}</strong>{" "}
                      {item.lengthCm ? ` | ${item.lengthCm} cm` : null}
                    </div>

                    <div class="catch-time">
                      {new Date(item.caughtAt).toLocaleString("sv-SE")}
                    </div>
                    <Show when={item.userEmail}>
                      <div class="catch-time">Registrerad av {item.userEmail}</div>
                    </Show>

                    <div>
                        <h3>Bete</h3>
                        <p>{item.lure ? `${item.lure.brand} ${item.lure.name} ${item.lure.size} ${item.lure.type} ${item.lure.color}` : "Inget bete tillagt"}</p>
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
                        class="link-button"
                        onClick={() => handleDelete(item._id!)}
                        disabled={deletingId() === item._id}
                      >
                        {deletingId() === item._id ? "Raderar..." : "Radera"}
                      </button>
                    </Show>

                  </div>

                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </section>
  );
};

export default WaterCatchesComponent;

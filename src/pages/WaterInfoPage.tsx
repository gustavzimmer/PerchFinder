
import { Component, Show, createSignal, onCleanup, onMount } from "solid-js";
import { useParams } from "@solidjs/router";
import CatchFormModal from "../components/CatchFormComponent";
import WaterCatchesComponent from "../components/WaterCatchesComponent";
import useGetSingleWater from "../hooks/useGetSingleWater";
import WaterRecommendationsComponent from "../components/WaterRecommendationsComponent";
import { A } from "@solidjs/router";
import { auth } from "../firebase";
import { onAuthStateChanged, type User } from "firebase/auth";

const WaterInfoPage: Component = () => {
  const params = useParams();
  const waterId = () => params.id;
  const waterData = useGetSingleWater(waterId() ?? "");

  const [showForm, setShowForm] = createSignal(false);
  const [status, setStatus] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [currentUser, setCurrentUser] = createSignal<User | null>(auth.currentUser);

  onMount(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    onCleanup(() => unsub());
  });

  return (
    <main class="page">
      <Show when={!waterData.isLoading()} fallback={<h1>Laddar vatten...</h1>}>
        <h1>{waterData.data()?.name ?? "Vatteninformation"}</h1>
        <Show when={waterData.error()}>
          <div class="form-status error">{waterData.error()}</div>
        </Show>
      </Show>
      <button
        class="primary-button"
        onClick={() => currentUser() && setShowForm(true)}
        disabled={!currentUser()}
      >
        Registrera fångst
      </button>
      {!currentUser() && (
        <div class="form-status error">
          Du måste vara inloggad för att registrera en fångst.{" "}
          <A href="/logga-in" class="link-button">
            Logga in
          </A>
          {" eller "}
          <A href="/skapa-konto" class="link-button">
            skapa konto
          </A>
          .
        </div>
      )}
      {status() && <div class="form-status success">{status()}</div>}
      {error() && <div class="form-status error">{error()}</div>}

      {showForm() && currentUser() && (
        <CatchFormModal
          waterId={waterId()}
          waterLocation={waterData.data()?.location}
          onClose={() => setShowForm(false)}
          onStatus={setStatus}
          onError={setError}
        />
      )}

      <WaterRecommendationsComponent
        waterId={waterId() ?? ""}
        waterName={waterData.data()?.name ?? ""}
        waterLocation={waterData.data()?.location}
      />
      
      <WaterCatchesComponent />

    </main>
  );
};

export default WaterInfoPage;

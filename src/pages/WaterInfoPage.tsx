
import { Component, Show, createSignal } from "solid-js";
import { useParams } from "@solidjs/router";
import CatchFormModal from "../components/CatchFormComponent";
import WaterCatchesComponent from "../components/WaterCatchesComponent";
import useGetSingleWater from "../hooks/useGetSingleWater";

const WaterInfoPage: Component = () => {
  const params = useParams();
  const waterId = () => params.id;
  const waterData = useGetSingleWater(waterId() ?? "");

  const [showForm, setShowForm] = createSignal(false);
  const [status, setStatus] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  return (
    <main class="page">
      <Show when={!waterData.isLoading()} fallback={<h1>Laddar vatten...</h1>}>
        <h1>{waterData.data()?.name ?? "Vatteninformation"}</h1>
        <Show when={waterData.error()}>
          <div class="form-status error">{waterData.error()}</div>
        </Show>
      </Show>
      <button class="primary-button" onClick={() => setShowForm(true)}>
        Registrera fångst
      </button>
      {status() && <div class="form-status success">{status()}</div>}
      {error() && <div class="form-status error">{error()}</div>}

      {showForm() && (
        <CatchFormModal
          waterId={waterId()}
          waterLocation={waterData.data()?.location}
          onClose={() => setShowForm(false)}
          onStatus={setStatus}
          onError={setError}
        />
      )}

      <WaterCatchesComponent />
    </main>
  );
};

export default WaterInfoPage;

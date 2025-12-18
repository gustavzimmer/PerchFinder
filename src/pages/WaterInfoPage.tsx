
import { Component, createSignal } from "solid-js";
import { useParams } from "@solidjs/router";
import CatchFormModal from "../components/CatchFormModal";

const WaterInfoPage: Component = () => {
  const params = useParams();
  const waterId = () => params.id;

  const [showForm, setShowForm] = createSignal(false);
  const [status, setStatus] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  return (
    <main class="page">
      <h1>Vatteninformation</h1>
      <button class="primary-button" onClick={() => setShowForm(true)}>
        Registrera fångst
      </button>
      {status() && <div class="form-status success">{status()}</div>}
      {error() && <div class="form-status error">{error()}</div>}

      {showForm() && (
      <CatchFormModal
        waterId={waterId()}
        onClose={() => setShowForm(false)}
        onStatus={setStatus}
        onError={setError}
      />
      ) } 
    </main>
  );
};

export default WaterInfoPage;

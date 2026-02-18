import { Component, createSignal, onCleanup, onMount } from "solid-js";
import { addDoc, serverTimestamp } from "firebase/firestore";
import { auth, waterRequestCol } from "../firebase";
import { useMapUi } from "../context/MapUiContext";

const toUserName = (displayName: string | null | undefined, email: string | null | undefined) => {
  const trimmed = displayName?.trim();
  if (trimmed) return trimmed;
  if (!email) return null;
  const [localPart] = email.split("@");
  return localPart || email;
};

const RegisterWaterPage: Component = () => {
  const [name, setName] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [isSaving, setIsSaving] = createSignal(false);
  const [status, setStatus] = createSignal<string | null>(null);
  const { selectedLocation, setSelectedLocation, setMode } = useMapUi();

  const handleSubmit = async (event: Event) => {
    event.preventDefault();
    setStatus(null);
    setError(null);

    if (!name().trim() || !selectedLocation()) {
      setStatus("Fyll i namn och markera en plats på kartan.");
      return;
    }

    try {
      setIsSaving(true);
      const user = auth.currentUser;
      const loc = selectedLocation()!;
      await addDoc(waterRequestCol, {
        name: name().trim(),
        location: loc,
        requestedAt: serverTimestamp(),
        requestedBy: user?.uid ?? null,
        requestedByEmail: user?.email ?? null,
        requestedByName: toUserName(user?.displayName, user?.email),
      });
      setStatus(`Förfrågan för "${name().trim()}" skickades!`);
      setName("");
      setSelectedLocation(null);
    } catch (err) {
      console.error("Kunde inte spara vatten", err);
      setError("Det gick inte att skicka förfrågan just nu. Försök igen.");
    } finally {
      setIsSaving(false);
    }
  };

  onMount(() => {
    setMode("select");
  });

  onCleanup(() => {
    setSelectedLocation(null);
    setMode("hidden");
  });

  return (
    <main class="page">
      <h1>Registrera fiskevatten</h1>
      <p class="lead">Skicka in en förfrågan. En admin behöver godkänna innan vattnet syns.</p>

      <form class="register-form" onSubmit={handleSubmit}>
        <label>
          <span>Vattnets namn</span>
          <input
            type="text"
            placeholder="Ex. Brunnsviken"
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
            required
          />
        </label>

        <div class="field-help">
          Klicka på kartan för att sätta en position. Koordinater:
          {selectedLocation() ? (
            <strong>
              {" "}
              {selectedLocation()!.lat.toFixed(5)}, {selectedLocation()!.lng.toFixed(5)}
            </strong>
          ) : (
            <em> inte vald ännu</em>
          )}
        </div>

        <button type="submit" class="primary-button" disabled={isSaving()}>
          {isSaving() ? "Skickar..." : "Skicka förfrågan"}
        </button>
        {status() && <div class="form-status">{status()}</div>}
        {error() && <div class="map-error">{error()}</div>}
      </form>
    </main>
  );
};

export default RegisterWaterPage;

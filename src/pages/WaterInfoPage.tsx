
import { Component, Show, createSignal } from "solid-js";
import { useParams } from "@solidjs/router";
import { addDoc, serverTimestamp } from "firebase/firestore";
import { catchCol } from "../firebase";
import { CatchInput } from "../types/Catch.types";

const WaterInfoPage: Component = () => {
  const params = useParams();
  const waterId = () => params.id;

  const [showForm, setShowForm] = createSignal(false);
  const [weight, setWeight] = createSignal("");
  const [length, setLength] = createSignal("");
  const nowLocalInput = () => new Date().toISOString().slice(0, 16);
  const [caughtAt, setCaughtAt] = createSignal(nowLocalInput());
  const [notes, setNotes] = createSignal("");
  const [isSaving, setIsSaving] = createSignal(false);
  const [status, setStatus] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  const resetForm = () => {
    setWeight("");
    setLength("");
    setNotes("");
    setCaughtAt(nowLocalInput());
  };

  const parseNumber = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const num = Number(trimmed.replace(",", "."));
    return Number.isNaN(num) ? null : num;
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setStatus(null);
    setError(null);

    const id = waterId();
    if (!id) {
      setError("Saknar vatten-id i URL:en.");
      return;
    }

    const weightG = parseNumber(weight());
    const lengthCm = parseNumber(length());

    if (weight().trim() && weightG === null) {
      setError("Ogiltig vikt. Använd siffror, t.ex. 700");
      return;
    }
    if (length().trim() && lengthCm === null) {
      setError("Ogiltig längd. Använd siffror, t.ex. 35");
      return;
    }

    const caughtAtIso = caughtAt() ? new Date(caughtAt()).toISOString() : new Date().toISOString();

    const payload: CatchInput = {
      waterId: id,
      weightG,
      lengthCm,
      notes: notes().trim() || null,
      caughtAt: caughtAtIso,
      userId: null,
    };

    try {
      setIsSaving(true);
      await addDoc(catchCol, {
        ...payload,
        createdAt: serverTimestamp(),
      });
      setStatus("Fångst sparad!");
      setShowForm(false);
      resetForm();
    } catch (err) {
      console.error("Kunde inte spara fångsten", err);
      setError("Det gick inte att spara fångsten just nu. Försök igen.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main class="page">
      <h1>Vatteninformation</h1>
      <button class="primary-button" onClick={() => setShowForm(true)}>
        Registrera fångst
      </button>
      {status() && <div class="form-status success">{status()}</div>}
      {error() && <div class="form-status error">{error()}</div>}

      <Show when={showForm()}>
        <div class="catch-overlay" onClick={() => setShowForm(false)}>
          <div class="catch-modal" onClick={(e) => e.stopPropagation()}>
            <header class="catch-modal__header">
              <h2>Registrera fångst</h2>
              <button type="button" class="link-button" onClick={() => setShowForm(false)}>
                Stäng
              </button>
            </header>
            <form class="catch-form" onSubmit={handleSubmit}>

              <label>
                <span>Vikt (Gram)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="t.ex. 1.2"
                  value={weight()}
                  onInput={(e) => setWeight(e.currentTarget.value)}
                />
              </label>

              <label>
                <span>Längd (cm)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="t.ex. 35"
                  value={length()}
                  onInput={(e) => setLength(e.currentTarget.value)}
                />
              </label>

              <label>
                <span>Tidpunkt</span>
                <input
                  type="datetime-local"
                  value={caughtAt()}
                  onInput={(e) => setCaughtAt(e.currentTarget.value)}
                />
              </label>

              <label>
                <span>Beskrivning</span>
                <textarea
                  rows={3}
                  value={notes()}
                  onInput={(e) => setNotes(e.currentTarget.value)}
                  placeholder="Valfritt"
                />
              </label>

              <div class="catch-form__actions">
                <button type="button" onClick={() => setShowForm(false)}>
                  Avbryt
                </button>
                <button type="submit" class="primary-button" disabled={isSaving()}>
                  {isSaving() ? "Sparar..." : "Spara"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Show>
    </main>
  );
};

export default WaterInfoPage;

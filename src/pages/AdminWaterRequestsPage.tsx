import { Component, For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { onAuthStateChanged, type User } from "firebase/auth";
import { addDoc, deleteDoc, doc, getDocs, getDocsFromServer, orderBy, query, serverTimestamp } from "firebase/firestore";
import { auth, waterCol, waterRequestCol } from "../firebase";
import type { WaterRequest } from "../types/Map.types";

const parseAdminEmails = () => {
  const raw = import.meta.env.VITE_ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
};

const AdminWaterRequestsPage: Component = () => {
  const [currentUser, setCurrentUser] = createSignal<User | null>(auth.currentUser);
  const [requests, setRequests] = createSignal<(WaterRequest & { _id: string })[]>([]);
  const [isLoading, setIsLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [approvingId, setApprovingId] = createSignal<string | null>(null);
  const [rejectingId, setRejectingId] = createSignal<string | null>(null);
  const adminEmails = parseAdminEmails();

  const isAdmin = createMemo(() => {
    const email = currentUser()?.email?.toLowerCase();
    return !!email && adminEmails.includes(email);
  });

  const loadRequests = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const queryRef = query(waterRequestCol, orderBy("requestedAt", "desc"));
      let snapshot;
      try {
        snapshot = await getDocsFromServer(queryRef);
      } catch {
        snapshot = await getDocs(queryRef);
      }
      const next = snapshot.docs.map((docSnap) => ({
        ...(docSnap.data() as WaterRequest),
        _id: docSnap.id,
      }));
      setRequests(next);
    } catch (err) {
      console.error("Kunde inte hämta förfrågningar", err);
      setError("Kunde inte hämta förfrågningar just nu.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async (request: WaterRequest & { _id: string }) => {
    const user = currentUser();
    if (!user) {
      setError("Du måste vara inloggad för att godkänna.");
      return;
    }
    setError(null);
    setApprovingId(request._id);
    try {
      await addDoc(waterCol, {
        name: request.name,
        location: request.location,
        createdAt: serverTimestamp(),
        requestedAt: request.requestedAt ?? null,
        requestedBy: request.requestedBy ?? null,
        requestedByEmail: request.requestedByEmail ?? null,
        approvedAt: serverTimestamp(),
        approvedBy: user.uid,
        approvedByEmail: user.email ?? null,
      });
      await deleteDoc(doc(waterRequestCol, request._id));
      setRequests((prev) => prev.filter((item) => item._id !== request._id));
    } catch (err) {
      console.error("Kunde inte godkänna vatten", err);
      setError("Kunde inte godkänna förfrågan. Försök igen.");
    } finally {
      setApprovingId(null);
    }
  };

  const handleReject = async (request: WaterRequest & { _id: string }) => {
    setError(null);
    setRejectingId(request._id);
    try {
      await deleteDoc(doc(waterRequestCol, request._id));
      setRequests((prev) => prev.filter((item) => item._id !== request._id));
    } catch (err) {
      console.error("Kunde inte avslå vatten", err);
      setError("Kunde inte avslå förfrågan. Försök igen.");
    } finally {
      setRejectingId(null);
    }
  };

  onMount(() => {
    const unsub = onAuthStateChanged(auth, (user) => setCurrentUser(user));
    onCleanup(() => unsub());
    void loadRequests();
  });

  return (
    <main class="page">
      <h1>Godkänn vatten</h1>

      <Show when={adminEmails.length === 0}>
        <div class="form-status error">
          Inga admin‑konton är konfigurerade. Sätt `VITE_ADMIN_EMAILS` i `.env`.
        </div>
      </Show>

      <Show when={currentUser()} fallback={<div>Du måste vara inloggad.</div>}>
        <Show when={isAdmin()} fallback={<div>Du saknar behörighet för denna vy.</div>}>
          <button type="button" class="primary-button" onClick={loadRequests} disabled={isLoading()}>
            {isLoading() ? "Laddar..." : "Uppdatera"}
          </button>

          {error() && <div class="form-status error">{error()}</div>}

          <Show when={!isLoading()} fallback={<div>Laddar förfrågningar...</div>}>
            <Show
              when={requests().length > 0}
              fallback={<div>Inga väntande förfrågningar.</div>}
            >
              <ul class="catch-list">
                <For each={requests()}>
                  {(request) => (
                    <li class="catch-card">
                      <div class="catch-meta">
                        <div>
                          <strong>{request.name}</strong>
                        </div>
                        <div class="catch-time">
                          {request.location.lat.toFixed(5)}, {request.location.lng.toFixed(5)}
                        </div>
                        <Show when={request.requestedByEmail}>
                          <div>Av: {request.requestedByEmail}</div>
                        </Show>

                        <div class="catch-form__actions">
                          <button
                            type="button"
                            class="primary-button"
                            onClick={() => handleApprove(request)}
                            disabled={approvingId() === request._id || rejectingId() === request._id}
                          >
                            {approvingId() === request._id ? "Godkänner..." : "Godkänn"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReject(request)}
                            disabled={approvingId() === request._id || rejectingId() === request._id}
                          >
                            {rejectingId() === request._id ? "Avslår..." : "Avslå"}
                          </button>
                        </div>
                      </div>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </Show>
        </Show>
      </Show>
    </main>
  );
};

export default AdminWaterRequestsPage;

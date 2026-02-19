import { Component, For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  getDocsFromServer,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { adminsCol, auth, catchCol, db, lureCol, waterCol, waterRequestCol } from "../firebase";
import type { WaterLocation, WaterRequest } from "../types/Map.types";
import type { LureOption } from "../types/Catch.types";

const toUserLabel = (name: string | null | undefined, email: string | null | undefined) => {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  if (!email) return "Okänd användare";
  const [localPart] = email.split("@");
  return localPart || email;
};

const sortLures = (list: (LureOption & { _id: string })[]) =>
  [...list].sort((a, b) => {
    const aLabel = `${a.brand ?? ""} ${a.name ?? ""}`.trim();
    const bLabel = `${b.brand ?? ""} ${b.name ?? ""}`.trim();
    return aLabel.localeCompare(bLabel, "sv");
  });

const LURE_CATEGORIES = [
  "jigg",
  "jerkbait",
  "crankbait",
  "spinnare",
  "vibrationsbete",
  "spinnerbait/chatterbait",
  "ytbete",
] as const;

const LURES_PAGE_SIZE = 20;

const AdminWaterRequestsPage: Component = () => {
  const [currentUser, setCurrentUser] = createSignal<User | null>(auth.currentUser);
  const [isAdminUser, setIsAdminUser] = createSignal(false);
  const [requests, setRequests] = createSignal<(WaterRequest & { _id: string })[]>([]);
  const [waters, setWaters] = createSignal<(WaterLocation & { _id: string })[]>([]);
  const [lures, setLures] = createSignal<(LureOption & { _id: string })[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = createSignal(true);
  const [isLoadingWaters, setIsLoadingWaters] = createSignal(true);
  const [isLoadingLures, setIsLoadingLures] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [approvingId, setApprovingId] = createSignal<string | null>(null);
  const [rejectingId, setRejectingId] = createSignal<string | null>(null);
  const [deletingWaterId, setDeletingWaterId] = createSignal<string | null>(null);
  const [savingWaterId, setSavingWaterId] = createSignal<string | null>(null);
  const [editingWaterId, setEditingWaterId] = createSignal<string | null>(null);
  const [editName, setEditName] = createSignal("");
  const [editLat, setEditLat] = createSignal("");
  const [editLng, setEditLng] = createSignal("");
  const [deletingLureId, setDeletingLureId] = createSignal<string | null>(null);
  const [newLureName, setNewLureName] = createSignal("");
  const [newLureBrand, setNewLureBrand] = createSignal("");
  const [newLureSize, setNewLureSize] = createSignal("");
  const [newLureColor, setNewLureColor] = createSignal("");
  const [newLureCategory, setNewLureCategory] = createSignal("");
  const [isSavingLure, setIsSavingLure] = createSignal(false);
  const [lureFormError, setLureFormError] = createSignal<string | null>(null);
  const [lureFormStatus, setLureFormStatus] = createSignal<string | null>(null);
  const [isLureSectionOpen, setIsLureSectionOpen] = createSignal(false);
  const [lureSearchQuery, setLureSearchQuery] = createSignal("");
  const [lurePage, setLurePage] = createSignal(1);
  const filteredLures = createMemo(() => {
    const queryText = lureSearchQuery().trim().toLowerCase();
    if (!queryText) return lures();
    return lures().filter((lure) =>
      [lure.brand, lure.name, lure.size, lure.color, lure.category ?? ""].some((field) =>
        String(field ?? "").toLowerCase().includes(queryText)
      )
    );
  });

  const lurePageCount = createMemo(() =>
    Math.max(1, Math.ceil(filteredLures().length / LURES_PAGE_SIZE))
  );

  const paginatedLures = createMemo(() => {
    const page = Math.min(Math.max(lurePage(), 1), lurePageCount());
    const start = (page - 1) * LURES_PAGE_SIZE;
    return filteredLures().slice(start, start + LURES_PAGE_SIZE);
  });

  createEffect(() => {
    const user = currentUser();
    if (!user) {
      setIsAdminUser(false);
      return;
    }

    const adminRef = doc(adminsCol, user.uid);
    const unsub = onSnapshot(
      adminRef,
      (snap) => {
        setIsAdminUser(snap.exists());
      },
      (err) => {
        console.error("Kunde inte läsa admin-status", err);
        setIsAdminUser(false);
      }
    );

    onCleanup(() => unsub());
  });

  createEffect(() => {
    lureSearchQuery();
    setLurePage(1);
  });

  createEffect(() => {
    const maxPage = lurePageCount();
    if (lurePage() > maxPage) {
      setLurePage(maxPage);
    }
  });

  const loadRequests = async () => {
    setIsLoadingRequests(true);
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
      setIsLoadingRequests(false);
    }
  };

  const loadLures = async () => {
    setIsLoadingLures(true);
    setError(null);
    try {
      let snapshot;
      try {
        snapshot = await getDocsFromServer(lureCol);
      } catch {
        snapshot = await getDocs(lureCol);
      }
      const next = snapshot.docs.map((docSnap) => ({
        ...(docSnap.data() as LureOption),
        _id: docSnap.id,
      }));
      setLures(sortLures(next));
    } catch (err) {
      console.error("Kunde inte hämta beten", err);
      setError("Kunde inte hämta beten just nu.");
    } finally {
      setIsLoadingLures(false);
    }
  };

  const loadWaters = async () => {
    setIsLoadingWaters(true);
    setError(null);
    try {
      const queryRef = query(waterCol, orderBy("name", "asc"));
      let snapshot;
      try {
        snapshot = await getDocsFromServer(queryRef);
      } catch {
        snapshot = await getDocs(queryRef);
      }
      const next = snapshot.docs.map((docSnap) => ({
        ...(docSnap.data() as WaterLocation),
        _id: docSnap.id,
      }));
      setWaters(next);
    } catch (err) {
      console.error("Kunde inte hämta vatten", err);
      setError("Kunde inte hämta vattenlistan just nu.");
    } finally {
      setIsLoadingWaters(false);
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
        requestedByName: request.requestedByName ?? null,
        approvedAt: serverTimestamp(),
        approvedBy: user.uid,
        approvedByEmail: user.email ?? null,
        approvedByName: toUserLabel(user.displayName, user.email),
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

  const startEdit = (water: WaterLocation & { _id: string }) => {
    setEditingWaterId(water._id);
    setEditName(water.name);
    setEditLat(String(water.location.lat));
    setEditLng(String(water.location.lng));
  };

  const cancelEdit = () => {
    setEditingWaterId(null);
    setEditName("");
    setEditLat("");
    setEditLng("");
  };

  const handleSaveWater = async (waterId: string) => {
    const name = editName().trim();
    const lat = Number(editLat().replace(",", "."));
    const lng = Number(editLng().replace(",", "."));

    if (!name) {
      setError("Vattnets namn kan inte vara tomt.");
      return;
    }

    if (Number.isNaN(lat) || lat < -90 || lat > 90) {
      setError("Latitud måste vara ett tal mellan -90 och 90.");
      return;
    }

    if (Number.isNaN(lng) || lng < -180 || lng > 180) {
      setError("Longitud måste vara ett tal mellan -180 och 180.");
      return;
    }

    setSavingWaterId(waterId);
    setError(null);
    try {
      await updateDoc(doc(waterCol, waterId), {
        name,
        location: {
          lat,
          lng,
        },
      });

      setWaters((prev) =>
        prev.map((water) =>
          water._id === waterId
            ? {
                ...water,
                name,
                location: { lat, lng },
              }
            : water
        )
      );
      cancelEdit();
    } catch (err) {
      console.error("Kunde inte uppdatera vatten", err);
      setError("Kunde inte spara ändringar just nu.");
    } finally {
      setSavingWaterId(null);
    }
  };

  const handleDeleteWater = async (water: WaterLocation & { _id: string }) => {
    const ok = window.confirm(`Ta bort "${water.name}"?`);
    if (!ok) return;

    const shouldDeleteCatches = window.confirm(
      `Vill du också ta bort alla fångster för "${water.name}"?\n\n` +
      "OK = ta bort både vatten och fångster.\n" +
      "Avbryt = ta bara bort vattnet."
    );

    const deleteCatchesForWater = async (waterId: string) => {
      const catchesQuery = query(catchCol, where("waterId", "==", waterId));
      let snapshot;
      try {
        snapshot = await getDocsFromServer(catchesQuery);
      } catch {
        snapshot = await getDocs(catchesQuery);
      }

      if (snapshot.empty) return;

      const chunkSize = 450;
      for (let i = 0; i < snapshot.docs.length; i += chunkSize) {
        const batch = writeBatch(db);
        const chunk = snapshot.docs.slice(i, i + chunkSize);
        chunk.forEach((catchDoc) => batch.delete(catchDoc.ref));
        await batch.commit();
      }
    };

    setDeletingWaterId(water._id);
    setError(null);
    try {
      if (shouldDeleteCatches) {
        await deleteCatchesForWater(water._id);
      }

      await deleteDoc(doc(waterCol, water._id));
      setWaters((prev) => prev.filter((item) => item._id !== water._id));
      if (editingWaterId() === water._id) {
        cancelEdit();
      }
    } catch (err) {
      console.error("Kunde inte ta bort vatten", err);
      setError(
        shouldDeleteCatches
          ? "Kunde inte ta bort vatten och tillhörande fångster just nu."
          : "Kunde inte ta bort vatten just nu."
      );
    } finally {
      setDeletingWaterId(null);
    }
  };

  const clearLureForm = () => {
    setNewLureName("");
    setNewLureBrand("");
    setNewLureSize("");
    setNewLureColor("");
    setNewLureCategory("");
  };

  const handleCreateLure = async (event: Event) => {
    event.preventDefault();
    setLureFormError(null);
    setLureFormStatus(null);

    const name = newLureName().trim();
    const brand = newLureBrand().trim();
    const size = newLureSize().trim();
    const color = newLureColor().trim();
    const category = newLureCategory().trim();

    if (!name || !brand || !size || !color || !category) {
      setLureFormError("Fyll i namn, märke, storlek, färg och kategori.");
      return;
    }
    if (!LURE_CATEGORIES.includes(category as (typeof LURE_CATEGORIES)[number])) {
      setLureFormError("Välj en giltig kategori från listan.");
      return;
    }

    setIsSavingLure(true);
    try {
      const lureRef = doc(lureCol);
      await setDoc(lureRef, {
        id: lureRef.id,
        name,
        brand,
        size,
        color,
        category,
        updatedAt: serverTimestamp(),
      });
      setLures((prev) =>
        sortLures([
          ...prev,
          {
            _id: lureRef.id,
            id: lureRef.id,
            name,
            brand,
            size,
            color,
            category,
          },
        ])
      );
      setLureFormStatus(`Betet "${brand} ${name}" lades till.`);
      clearLureForm();
    } catch (err) {
      console.error("Kunde inte lägga till bete", err);
      setLureFormError("Kunde inte spara betet just nu.");
    } finally {
      setIsSavingLure(false);
    }
  };

  const handleDeleteLure = async (lure: LureOption & { _id: string }) => {
    const ok = window.confirm(`Ta bort betet "${lure.brand} ${lure.name}"?`);
    if (!ok) return;

    setLureFormError(null);
    setLureFormStatus(null);
    setDeletingLureId(lure._id);
    try {
      await deleteDoc(doc(lureCol, lure._id));
      setLures((prev) => prev.filter((item) => item._id !== lure._id));
      setLureFormStatus(`Betet "${lure.brand} ${lure.name}" togs bort.`);
    } catch (err) {
      console.error("Kunde inte ta bort bete", err);
      setLureFormError("Kunde inte ta bort betet just nu.");
    } finally {
      setDeletingLureId(null);
    }
  };

  onMount(() => {
    const unsub = onAuthStateChanged(auth, (user) => setCurrentUser(user));
    onCleanup(() => unsub());
  });

  createEffect(() => {
    if (!isAdminUser()) return;
    void loadRequests();
    void loadWaters();
    void loadLures();
  });

  return (
    <main class="page">
      <h1>Godkänn vatten</h1>

      <Show when={currentUser()} fallback={<div>Du måste vara inloggad.</div>}>
        <Show when={isAdminUser()} fallback={<div>Du saknar behörighet för denna vy.</div>}>
          <div class="card-actions">
            <button
              type="button"
              class="primary-button"
              onClick={() => {
                void loadRequests();
                void loadWaters();
                void loadLures();
              }}
              disabled={isLoadingRequests() || isLoadingWaters() || isLoadingLures()}
            >
              {isLoadingRequests() || isLoadingWaters() || isLoadingLures()
                ? "Laddar..."
                : "Uppdatera allt"}
            </button>
          </div>

          {error() && <div class="form-status error">{error()}</div>}

          <section class="admin-section">
            <div class="admin-section__header">
              <h2>Betehantering</h2>
              <button
                type="button"
                class="secondary-button"
                onClick={() => setIsLureSectionOpen((open) => !open)}
              >
                {isLureSectionOpen() ? "Dölj" : `Visa (${lures().length})`}
              </button>
            </div>

            <Show when={isLureSectionOpen()}>
              <form class="register-form admin-lure-form" onSubmit={(event) => void handleCreateLure(event)}>
                <label>
                  <span>Namn</span>
                  <input
                    type="text"
                    value={newLureName()}
                    onInput={(e) => setNewLureName(e.currentTarget.value)}
                    placeholder="t.ex. Pig Shad Jr"
                  />
                </label>
                <label>
                  <span>Märke</span>
                  <input
                    type="text"
                    value={newLureBrand()}
                    onInput={(e) => setNewLureBrand(e.currentTarget.value)}
                    placeholder="t.ex. CWC"
                  />
                </label>
                <label>
                  <span>Storlek</span>
                  <input
                    type="text"
                    value={newLureSize()}
                    onInput={(e) => setNewLureSize(e.currentTarget.value)}
                    placeholder="t.ex. 10 cm"
                  />
                </label>
                <label>
                  <span>Färg</span>
                  <input
                    type="text"
                    value={newLureColor()}
                    onInput={(e) => setNewLureColor(e.currentTarget.value)}
                    placeholder="t.ex. Motoroil"
                  />
                </label>
                <label>
                  <span>Kategori</span>
                  <select
                    value={newLureCategory()}
                    onInput={(e) => setNewLureCategory(e.currentTarget.value)}
                  >
                    <option value="">Välj kategori</option>
                    <For each={LURE_CATEGORIES}>
                      {(category) => <option value={category}>{category}</option>}
                    </For>
                  </select>
                </label>

                <div class="card-actions">
                  <button type="submit" class="primary-button" disabled={isSavingLure()}>
                    {isSavingLure() ? "Sparar bete..." : "Lägg till bete"}
                  </button>
                  <button
                    type="button"
                    class="secondary-button"
                    onClick={clearLureForm}
                    disabled={isSavingLure()}
                  >
                    Rensa
                  </button>
                </div>

                <Show when={lureFormError()}>
                  <div class="form-status error">{lureFormError()}</div>
                </Show>
                <Show when={lureFormStatus()}>
                  <div class="form-status success">{lureFormStatus()}</div>
                </Show>
              </form>

              <div class="admin-lure-toolbar">
                <input
                  type="search"
                  placeholder="Sök på märke, namn, storlek, färg eller kategori"
                  value={lureSearchQuery()}
                  onInput={(e) => setLureSearchQuery(e.currentTarget.value)}
                />
                <span class="muted">{filteredLures().length} träffar</span>
              </div>

              <Show when={!isLoadingLures()} fallback={<div>Laddar beten...</div>}>
                <Show when={filteredLures().length > 0} fallback={<div>Inga beten hittades.</div>}>
                  <ul class="admin-lure-list">
                    <For each={paginatedLures()}>
                      {(lure) => (
                        <li class="admin-lure-item">
                          <div class="admin-lure-item__meta">
                            <strong>
                              {lure.brand} {lure.name}
                            </strong>
                            <small>
                              {lure.size || "Okänd storlek"} • {lure.color || "Okänd färg"} •{" "}
                              {lure.category || "Saknar kategori"}
                            </small>
                          </div>
                          <button
                            type="button"
                            class="danger-button"
                            onClick={() => void handleDeleteLure(lure)}
                            disabled={deletingLureId() === lure._id}
                          >
                            {deletingLureId() === lure._id ? "Tar bort..." : "Ta bort"}
                          </button>
                        </li>
                      )}
                    </For>
                  </ul>

                  <Show when={lurePageCount() > 1}>
                    <div class="admin-pagination">
                      <button
                        type="button"
                        class="secondary-button"
                        onClick={() => setLurePage((page) => Math.max(1, page - 1))}
                        disabled={lurePage() <= 1}
                      >
                        Föregående
                      </button>
                      <span>
                        Sida {lurePage()} av {lurePageCount()}
                      </span>
                      <button
                        type="button"
                        class="secondary-button"
                        onClick={() => setLurePage((page) => Math.min(lurePageCount(), page + 1))}
                        disabled={lurePage() >= lurePageCount()}
                      >
                        Nästa
                      </button>
                    </div>
                  </Show>
                </Show>
              </Show>
            </Show>
          </section>

          <h2>Väntande förfrågningar</h2>
          <Show when={!isLoadingRequests()} fallback={<div>Laddar förfrågningar...</div>}>
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
                        <Show when={request.requestedByEmail || request.requestedByName}>
                          <div>
                            Av: {toUserLabel(request.requestedByName, request.requestedByEmail)}
                            <Show when={request.requestedByEmail}>
                              {` (${request.requestedByEmail})`}
                            </Show>
                          </div>
                        </Show>

                        <div class="card-actions">
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
                            class="danger-button"
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

          <h2>Befintliga vatten</h2>
          <Show when={!isLoadingWaters()} fallback={<div>Laddar vatten...</div>}>
            <Show
              when={waters().length > 0}
              fallback={<div>Inga vatten hittades.</div>}
            >
              <ul class="catch-list">
                <For each={waters()}>
                  {(water) => (
                    <li class="catch-card">
                      <div class="catch-meta">
                        <Show
                          when={editingWaterId() === water._id}
                          fallback={
                            <>
                              <div>
                                <strong>{water.name}</strong>
                              </div>
                              <div class="catch-time">
                                {water.location.lat.toFixed(5)}, {water.location.lng.toFixed(5)}
                              </div>
                            </>
                          }
                        >
                          <label>
                            <span>Namn</span>
                            <input
                              type="text"
                              value={editName()}
                              onInput={(e) => setEditName(e.currentTarget.value)}
                            />
                          </label>
                          <label>
                            <span>Latitud</span>
                            <input
                              type="text"
                              value={editLat()}
                              onInput={(e) => setEditLat(e.currentTarget.value)}
                            />
                          </label>
                          <label>
                            <span>Longitud</span>
                            <input
                              type="text"
                              value={editLng()}
                              onInput={(e) => setEditLng(e.currentTarget.value)}
                            />
                          </label>
                        </Show>

                        <div class="card-actions">
                          <Show
                            when={editingWaterId() === water._id}
                            fallback={
                              <button type="button" class="primary-button" onClick={() => startEdit(water)}>
                                Redigera
                              </button>
                            }
                          >
                            <button
                              type="button"
                              class="primary-button"
                              onClick={() => void handleSaveWater(water._id)}
                              disabled={savingWaterId() === water._id}
                            >
                              {savingWaterId() === water._id ? "Sparar..." : "Spara"}
                            </button>
                            <button
                              type="button"
                              class="secondary-button"
                              onClick={cancelEdit}
                              disabled={savingWaterId() === water._id}
                            >
                              Avbryt
                            </button>
                          </Show>

                          <button
                            type="button"
                            class="danger-button"
                            onClick={() => void handleDeleteWater(water)}
                            disabled={deletingWaterId() === water._id || savingWaterId() === water._id}
                          >
                            {deletingWaterId() === water._id ? "Tar bort..." : "Ta bort"}
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

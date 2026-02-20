import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  type Accessor,
  type Component,
} from "solid-js";
import useGetCatches from "../hooks/useGetCatches";
import { useParams } from "@solidjs/router";
import { auth, catchCol, db } from "../firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { onAuthStateChanged, type User } from "firebase/auth";
import type { Catch } from "../types/Catch.types";

const toUserLabel = (name: string | null | undefined, email: string | null | undefined) => {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  if (!email) return "Anonym";
  const [localPart] = email.split("@");
  return localPart || email;
};

const toPersistedUserName = (displayName: string | null | undefined) => {
  const trimmed = displayName?.trim();
  return trimmed && trimmed.length >= 3 && trimmed.length <= 24 ? trimmed : null;
};

const formatCatchTime = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("sv-SE", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const parseOptionalNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const next = Number(trimmed.replace(",", "."));
  return Number.isFinite(next) ? next : NaN;
};

type CatchItem = Catch & { _id: string };

type CatchLike = {
  _id: string;
  uid: string;
  userName?: string | null;
  createdAtMs?: number;
};

type CatchComment = {
  _id: string;
  uid: string;
  userName?: string | null;
  text: string;
  createdAtMs: number;
};

const HeartIcon: Component = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 20.4 4.9 13.8a4.8 4.8 0 0 1 0-6.9 4.9 4.9 0 0 1 7 0l.1.2.1-.2a4.9 4.9 0 0 1 7 0 4.8 4.8 0 0 1 0 6.9Z" />
  </svg>
);

const CommentIcon: Component = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 6.8c0-1 .8-1.8 1.8-1.8h12.4c1 0 1.8.8 1.8 1.8v8.4c0 1-.8 1.8-1.8 1.8H10l-4.4 3v-3H5.8c-1 0-1.8-.8-1.8-1.8Z" />
  </svg>
);

const SendIcon: Component = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="m21 3-9.6 18-1.7-6.8L3 12.5z" />
  </svg>
);

const ChevronLeftIcon: Component = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="m14.5 6.5-5 5.5 5 5.5" />
  </svg>
);

const ChevronRightIcon: Component = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="m9.5 6.5 5 5.5-5 5.5" />
  </svg>
);

const MoreIcon: Component = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="5.5" cy="12" r="1.7" />
    <circle cx="12" cy="12" r="1.7" />
    <circle cx="18.5" cy="12" r="1.7" />
  </svg>
);

const LOADING_PLACEHOLDERS = [1, 2, 3];

const CatchFeedItem: Component<{
  catchItem: CatchItem;
  currentUser: Accessor<User | null>;
  deletingId: Accessor<string | null>;
  onDelete: (catchId: string) => void;
}> = (props) => {
  const [likes, setLikes] = createSignal<CatchLike[]>([]);
  const [comments, setComments] = createSignal<CatchComment[]>([]);
  const [commentText, setCommentText] = createSignal("");
  const [isCommentsOpen, setIsCommentsOpen] = createSignal(false);
  const [isComposerOpen, setIsComposerOpen] = createSignal(false);
  const [isSavingComment, setIsSavingComment] = createSignal(false);
  const [isTogglingLike, setIsTogglingLike] = createSignal(false);
  const [isMenuOpen, setIsMenuOpen] = createSignal(false);
  const [isEditing, setIsEditing] = createSignal(false);
  const [isSavingEdit, setIsSavingEdit] = createSignal(false);
  const [editWeight, setEditWeight] = createSignal("");
  const [editLength, setEditLength] = createSignal("");
  const [editNotes, setEditNotes] = createSignal("");
  const [actionStatus, setActionStatus] = createSignal<string | null>(null);
  const [actionError, setActionError] = createSignal<string | null>(null);
  const [photoIndex, setPhotoIndex] = createSignal(0);
  let menuRef: HTMLDivElement | undefined;

  const photos = createMemo(() =>
    props.catchItem.photoUrls && props.catchItem.photoUrls.length > 0
      ? props.catchItem.photoUrls
      : props.catchItem.photoUrl
        ? [props.catchItem.photoUrl]
        : []
  );
  const photoCount = createMemo(() => photos().length);
  const likesCount = createMemo(() => likes().length);
  const commentsCount = createMemo(() => comments().length);
  const isOwnCatch = createMemo(() => props.currentUser()?.uid === props.catchItem.userId);

  const likedByMe = createMemo(() => {
    const uid = props.currentUser()?.uid;
    if (!uid) return false;
    return likes().some((item) => item.uid === uid);
  });

  const visibleComments = createMemo(() => {
    if (isCommentsOpen()) return comments();
    const all = comments();
    return all.slice(Math.max(0, all.length - 2));
  });

  createEffect(() => {
    if (photoIndex() >= photoCount()) {
      setPhotoIndex(0);
    }
  });

  createEffect(() => {
    if (isEditing()) return;
    setEditWeight(props.catchItem.weightG != null ? String(props.catchItem.weightG) : "");
    setEditLength(props.catchItem.lengthCm != null ? String(props.catchItem.lengthCm) : "");
    setEditNotes(props.catchItem.notes ?? "");
  });

  createEffect(() => {
    if (!isMenuOpen()) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!menuRef) return;
      const target = event.target;
      if (target instanceof Node && !menuRef.contains(target)) {
        setIsMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", closeOnOutside);
    onCleanup(() => window.removeEventListener("pointerdown", closeOnOutside));
  });

  createEffect(() => {
    const catchId = props.catchItem._id;
    const likesRef = collection(db, "Fangster", catchId, "Likes");
    const commentsRef = collection(db, "Fangster", catchId, "Comments");
    const commentsQuery = query(commentsRef, orderBy("createdAtMs", "asc"), limit(60));

    const unsubLikes = onSnapshot(
      likesRef,
      (snapshot) => {
        const next = snapshot.docs.map((item) => {
          const data = item.data() as CatchLike;
          return {
            _id: item.id,
            uid: data.uid,
            userName: data.userName ?? null,
            createdAtMs: data.createdAtMs,
          };
        });
        setLikes(next);
      },
      (err) => {
        console.error("Kunde inte läsa likes", err);
      }
    );

    const unsubComments = onSnapshot(
      commentsQuery,
      (snapshot) => {
        const next = snapshot.docs.map((item) => {
          const data = item.data() as CatchComment;
          return {
            _id: item.id,
            uid: data.uid,
            userName: data.userName ?? null,
            text: data.text,
            createdAtMs: data.createdAtMs,
          };
        });
        setComments(next);
      },
      (err) => {
        console.error("Kunde inte läsa kommentarer", err);
      }
    );

    onCleanup(() => {
      unsubLikes();
      unsubComments();
    });
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

  const toggleLike = async () => {
    setActionStatus(null);
    setActionError(null);
    const user = props.currentUser();
    if (!user) {
      setActionError("Logga in för att kunna gilla.");
      return;
    }
    const persistedUserName = toPersistedUserName(user.displayName);
    if (!persistedUserName) {
      setActionError("Saknar användarnamn. Uppdatera din profil först.");
      return;
    }

    const likeRef = doc(db, "Fangster", props.catchItem._id, "Likes", user.uid);
    setIsTogglingLike(true);
    try {
      if (likedByMe()) {
        await deleteDoc(likeRef);
      } else {
        await setDoc(likeRef, {
          uid: user.uid,
          userName: persistedUserName,
          createdAtMs: Date.now(),
          createdAt: serverTimestamp(),
        });
      }
    } catch (err) {
      console.error("Kunde inte uppdatera like", err);
      setActionError("Kunde inte uppdatera like.");
    } finally {
      setIsTogglingLike(false);
    }
  };

  const submitComment = async (event: Event) => {
    event.preventDefault();
    setActionStatus(null);
    setActionError(null);
    const user = props.currentUser();
    const text = commentText().trim();
    if (!user) {
      setActionError("Logga in för att kunna kommentera.");
      return;
    }
    const persistedUserName = toPersistedUserName(user.displayName);
    if (!persistedUserName) {
      setActionError("Saknar användarnamn. Uppdatera din profil först.");
      return;
    }
    if (!text) return;
    if (text.length > 280) {
      setActionError("Kommentaren får vara max 280 tecken.");
      return;
    }

    setIsSavingComment(true);
    try {
      await addDoc(collection(db, "Fangster", props.catchItem._id, "Comments"), {
        uid: user.uid,
        userName: persistedUserName,
        text,
        createdAtMs: Date.now(),
        createdAt: serverTimestamp(),
      });
      setCommentText("");
      setIsCommentsOpen(true);
    } catch (err) {
      console.error("Kunde inte skicka kommentar", err);
      setActionError("Kunde inte skicka kommentaren.");
    } finally {
      setIsSavingComment(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    setActionStatus(null);
    setActionError(null);
    try {
      await deleteDoc(doc(db, "Fangster", props.catchItem._id, "Comments", commentId));
    } catch (err) {
      console.error("Kunde inte radera kommentar", err);
      setActionError("Kunde inte radera kommentaren.");
    }
  };

  const openCommentComposer = () => {
    setIsCommentsOpen(true);
    setIsComposerOpen(true);
  };

  const openEdit = () => {
    setActionStatus(null);
    setActionError(null);
    setIsMenuOpen(false);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditWeight(props.catchItem.weightG != null ? String(props.catchItem.weightG) : "");
    setEditLength(props.catchItem.lengthCm != null ? String(props.catchItem.lengthCm) : "");
    setEditNotes(props.catchItem.notes ?? "");
  };

  const saveEdit = async (event: Event) => {
    event.preventDefault();
    setActionStatus(null);
    setActionError(null);

    if (!isOwnCatch()) {
      setActionError("Du kan bara redigera dina egna fångster.");
      return;
    }

    const nextWeight = parseOptionalNumber(editWeight());
    const nextLength = parseOptionalNumber(editLength());

    if (Number.isNaN(nextWeight) || Number.isNaN(nextLength)) {
      setActionError("Vikt/längd måste vara siffror.");
      return;
    }
    if (nextWeight !== null && (nextWeight < 0 || nextWeight > 30000)) {
      setActionError("Vikt måste vara mellan 0 och 30000 gram.");
      return;
    }
    if (nextLength !== null && (nextLength < 0 || nextLength > 200)) {
      setActionError("Längd måste vara mellan 0 och 200 cm.");
      return;
    }
    if (nextWeight === null && nextLength === null) {
      setActionError("Ange minst vikt eller längd.");
      return;
    }

    const nextNotes = editNotes().trim();

    setIsSavingEdit(true);
    try {
      await updateDoc(doc(catchCol, props.catchItem._id), {
        weightG: nextWeight,
        lengthCm: nextLength,
        notes: nextNotes ? nextNotes : null,
      });
      setIsEditing(false);
      setActionStatus("Fångsten uppdaterades.");
    } catch (err) {
      console.error("Kunde inte uppdatera fångst", err);
      setActionError("Kunde inte uppdatera fångsten.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  return (
    <li class="catch-card catch-post" data-id={props.catchItem._id}>
      <header class="catch-post__header">
        <span class="catch-post__avatar">
          {toUserLabel(props.catchItem.userName, props.catchItem.userEmail).slice(0, 1).toUpperCase()}
        </span>
        <div class="catch-post__header-meta">
          <strong>{toUserLabel(props.catchItem.userName, props.catchItem.userEmail)}</strong>
          <span>{formatCatchTime(props.catchItem.caughtAt)}</span>
        </div>
        <Show when={isOwnCatch()}>
          <div class={`catch-post__menu ${isMenuOpen() ? "is-open" : ""}`} ref={menuRef}>
            <button
              type="button"
              class="catch-post__menu-trigger"
              aria-label="Fler val"
              aria-expanded={isMenuOpen()}
              onClick={() => setIsMenuOpen((open) => !open)}
            >
              <MoreIcon />
            </button>
            <Show when={isMenuOpen()}>
              <div class="catch-post__menu-panel">
                <button type="button" class="catch-post__menu-item" onClick={openEdit}>
                  Redigera
                </button>
                <button
                  type="button"
                  class="catch-post__menu-item is-danger"
                  onClick={() => {
                    setIsMenuOpen(false);
                    props.onDelete(props.catchItem._id);
                  }}
                  disabled={props.deletingId() === props.catchItem._id}
                >
                  {props.deletingId() === props.catchItem._id ? "Raderar..." : "Radera"}
                </button>
              </div>
            </Show>
          </div>
        </Show>
      </header>

      <Show when={photoCount() > 0}>
        <div class="catch-slider">
          <div class="catch-slider__track" style={{ transform: `translateX(-${photoIndex() * 100}%)` }}>
            <For each={photos()}>
              {(src) => (
                <div class="catch-slide">
                  <img src={src} alt="Fångstbild" loading="lazy" />
                </div>
              )}
            </For>
          </div>
          <Show when={photoCount() > 1}>
            <button type="button" class="slider-btn prev" onClick={goPrev} aria-label="Föregående bild">
              <ChevronLeftIcon />
            </button>
            <button type="button" class="slider-btn next" onClick={goNext} aria-label="Nästa bild">
              <ChevronRightIcon />
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

      <div class="catch-post__body">
        <div class="catch-post__result">
          <strong>{props.catchItem.lengthCm ? `${props.catchItem.lengthCm} cm` : "Längd saknas"}</strong>
          <span>{props.catchItem.weightG ? `${props.catchItem.weightG} g` : "Vikt saknas"}</span>
        </div>

        <div class="catch-weather">
          <Show when={props.catchItem.weatherSummary}>
            <span class="catch-weather-chip">{props.catchItem.weatherSummary}</span>
          </Show>
          <Show when={props.catchItem.temperatureC != null}>
            <span class="catch-weather-chip">Temperatur {props.catchItem.temperatureC}°C</span>
          </Show>
          <Show when={props.catchItem.pressureHpa != null}>
            <span class="catch-weather-chip">Lufttryck {Math.round(props.catchItem.pressureHpa!)} hPa</span>
          </Show>
        </div>

        <Show when={props.catchItem.lure}>
          <p class="catch-post__lure">
            Bete: {props.catchItem.lure!.brand} {props.catchItem.lure!.name} {props.catchItem.lure!.size}{" "}
            {props.catchItem.lure!.color}
            <Show when={props.catchItem.method}>
              {" "}• Metod: {props.catchItem.method}
            </Show>
          </p>
        </Show>

        <Show when={props.catchItem.notes}>
          <p class="catch-post__caption">
            <strong>{toUserLabel(props.catchItem.userName, props.catchItem.userEmail)}</strong> {props.catchItem.notes}
          </p>
        </Show>

        <Show when={isEditing()}>
          <form class="catch-edit-form" onSubmit={(event) => void saveEdit(event)}>
            <div class="catch-edit-grid">
              <label>
                <span>Vikt (g)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={editWeight()}
                  onInput={(event) => setEditWeight(event.currentTarget.value)}
                  placeholder="t.ex. 780"
                />
              </label>
              <label>
                <span>Längd (cm)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={editLength()}
                  onInput={(event) => setEditLength(event.currentTarget.value)}
                  placeholder="t.ex. 38"
                />
              </label>
            </div>
            <label>
              <span>Notering</span>
              <input
                type="text"
                value={editNotes()}
                maxLength={1000}
                onInput={(event) => setEditNotes(event.currentTarget.value)}
                placeholder="Valfritt"
              />
            </label>
            <div class="catch-edit-actions">
              <button type="button" class="secondary-button" onClick={cancelEdit} disabled={isSavingEdit()}>
                Avbryt
              </button>
              <button type="submit" class="primary-button" disabled={isSavingEdit()}>
                {isSavingEdit() ? "Sparar..." : "Spara ändringar"}
              </button>
            </div>
          </form>
        </Show>

        <div class="catch-post__actions">
          <button
            type="button"
            class={`catch-action-btn ${likedByMe() ? "is-liked" : ""}`}
            onClick={() => void toggleLike()}
            disabled={isTogglingLike()}
            aria-label={likedByMe() ? "Ta bort gilla-markering" : "Gilla fångst"}
          >
            <HeartIcon />
            <span>{likesCount()}</span>
          </button>
          <button
            type="button"
            class="catch-action-btn"
            onClick={openCommentComposer}
            aria-label="Kommentera fångst"
          >
            <CommentIcon />
            <span>{commentsCount()}</span>
          </button>
        </div>

        <div class="catch-post__meta">
          <strong>{likesCount()} gillar</strong>
          <button type="button" class="link-button catch-comment-compose" onClick={openCommentComposer}>
            Skriv kommentar
          </button>
        </div>

        <Show when={commentsCount() > 0}>
          <div class="catch-comments">
            <For each={visibleComments()}>
              {(comment) => (
                <div class="catch-comment-row">
                  <div class="catch-comment-text">
                    <strong>{comment.userName || "Anonym"}</strong> {comment.text}
                  </div>
                  <Show when={props.currentUser()?.uid === comment.uid}>
                    <button
                      type="button"
                      class="link-button catch-comment-delete"
                      onClick={() => void deleteComment(comment._id)}
                    >
                      Radera
                    </button>
                  </Show>
                </div>
              )}
            </For>
            <Show when={!isCommentsOpen() && commentsCount() > 2}>
              <button
                type="button"
                class="link-button catch-comments-more"
                onClick={() => setIsCommentsOpen(true)}
              >
                Visa alla kommentarer
              </button>
            </Show>
          </div>
        </Show>

        <form class="catch-comment-form" onSubmit={(event) => void submitComment(event)}>
          <Show
            when={isComposerOpen()}
            fallback={
              <button type="button" class="catch-comment-open" onClick={openCommentComposer}>
                Lägg till kommentar...
              </button>
            }
          >
            <input
              class="catch-comment-input"
              type="text"
              placeholder="Skriv en kommentar..."
              value={commentText()}
              onInput={(event) => setCommentText(event.currentTarget.value)}
              maxLength={280}
            />
            <button type="submit" class="catch-comment-submit" disabled={isSavingComment()}>
              <SendIcon />
              <span>{isSavingComment() ? "Skickar..." : "Skicka"}</span>
            </button>
          </Show>
        </form>

        <Show when={actionStatus()}>
          <div class="muted catch-post__status">{actionStatus()}</div>
        </Show>

        <Show when={actionError()}>
          <div class="muted catch-post__error">{actionError()}</div>
        </Show>
      </div>
    </li>
  );
};

const WaterCatchesComponent = () => {
  const params = useParams();
  const waterId = () => params.id;

  const catches = useGetCatches(() => waterId() ?? "");
  const [currentUser, setCurrentUser] = createSignal<User | null>(auth.currentUser);
  const [deletingId, setDeletingId] = createSignal<string | null>(null);
  const [deleteError, setDeleteError] = createSignal<string | null>(null);
  const catchItems = createMemo(() =>
    (catches.data() ?? []).filter((item): item is CatchItem => Boolean(item._id))
  );

  onMount(() => {
    const unsub = onAuthStateChanged(auth, (user) => setCurrentUser(user));
    const handleCatchSaved = (event: Event) => {
      const custom = event as CustomEvent<{ waterId?: string }>;
      if (!custom.detail?.waterId || custom.detail.waterId === waterId()) {
        catches.refetch();
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("perchfinder:catch-saved", handleCatchSaved as EventListener);
    }

    onCleanup(() => {
      unsub();
      if (typeof window !== "undefined") {
        window.removeEventListener("perchfinder:catch-saved", handleCatchSaved as EventListener);
      }
    });
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

      <Show
        when={!catches.isLoading()}
        fallback={
          <ul class="catch-list catch-feed catch-feed--loading" aria-busy="true" aria-live="polite">
            <For each={LOADING_PLACEHOLDERS}>
              {(item) => (
                <li class="catch-card catch-post catch-skeleton" data-id={`skeleton-${item}`}>
                  <div class="catch-skeleton__header">
                    <span class="catch-skeleton__avatar" />
                    <div class="catch-skeleton__meta">
                      <span />
                      <span />
                    </div>
                  </div>
                  <div class="catch-skeleton__image" />
                  <div class="catch-skeleton__line catch-skeleton__line--wide" />
                  <div class="catch-skeleton__line" />
                  <div class="catch-skeleton__actions">
                    <span />
                    <span />
                  </div>
                </li>
              )}
            </For>
          </ul>
        }
      >
        <Show
          when={catchItems().length > 0}
          fallback={<div class="catch-empty">Inga fångster registrerade ännu.</div>}
        >
          <ul class="catch-list catch-feed">
            <For each={catchItems()}>
              {(item) => (
                <CatchFeedItem
                  catchItem={item}
                  currentUser={currentUser}
                  deletingId={deletingId}
                  onDelete={handleDelete}
                />
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </section>
  );
};

export default WaterCatchesComponent;

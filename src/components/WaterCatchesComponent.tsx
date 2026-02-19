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
  const [isSavingComment, setIsSavingComment] = createSignal(false);
  const [isTogglingLike, setIsTogglingLike] = createSignal(false);
  const [actionError, setActionError] = createSignal<string | null>(null);
  const [photoIndex, setPhotoIndex] = createSignal(0);

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
    setActionError(null);
    const user = props.currentUser();
    if (!user) {
      setActionError("Logga in för att kunna gilla.");
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
          userName: toUserLabel(user.displayName, user.email),
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
    setActionError(null);
    const user = props.currentUser();
    const text = commentText().trim();
    if (!user) {
      setActionError("Logga in för att kunna kommentera.");
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
        userName: toUserLabel(user.displayName, user.email),
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
    setActionError(null);
    try {
      await deleteDoc(doc(db, "Fangster", props.catchItem._id, "Comments", commentId));
    } catch (err) {
      console.error("Kunde inte radera kommentar", err);
      setActionError("Kunde inte radera kommentaren.");
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
              {"<"}
            </button>
            <button type="button" class="slider-btn next" onClick={goNext} aria-label="Nästa bild">
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

        <div class="catch-post__actions">
          <button
            type="button"
            class={`catch-action-btn ${likedByMe() ? "is-liked" : ""}`}
            onClick={() => void toggleLike()}
            disabled={isTogglingLike()}
          >
            {likedByMe() ? "Gillad" : "Gilla"}
          </button>
          <button
            type="button"
            class="catch-action-btn"
            onClick={() => setIsCommentsOpen((open) => !open)}
          >
            Kommentarer
          </button>
        </div>

        <div class="catch-post__meta">
          <strong>{likesCount()} gillar</strong>
          <span>{commentsCount()} kommentarer</span>
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
          <input
            class="catch-comment-input"
            type="text"
            placeholder="Skriv en kommentar..."
            value={commentText()}
            onInput={(event) => setCommentText(event.currentTarget.value)}
            maxLength={280}
          />
          <button type="submit" class="link-button" disabled={isSavingComment()}>
            {isSavingComment() ? "Skickar..." : "Skicka"}
          </button>
        </form>

        <Show when={props.currentUser() && props.catchItem.userId === props.currentUser()?.uid && props.catchItem._id}>
          <button
            type="button"
            class="danger-button catch-post__delete"
            onClick={() => props.onDelete(props.catchItem._id)}
            disabled={props.deletingId() === props.catchItem._id}
          >
            {props.deletingId() === props.catchItem._id ? "Raderar..." : "Radera fångst"}
          </button>
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

      <Show when={!catches.isLoading()} fallback={<div>Laddar fångster...</div>}>
        <Show when={catchItems().length > 0} fallback={<div>Inga fångster registrerade ännu.</div>}>
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

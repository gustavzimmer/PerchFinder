import { Component, For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { onAuthStateChanged, type User } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import {
  doc,
  endAt,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  startAt,
  where,
  limit,
} from "firebase/firestore";
import { auth, dailyCatchEventCol, friendRequestCol, functions, socialProfileCol } from "../firebase";
import type { DailyBucket, DailyCatchEvent, FriendRequest, SocialProfile } from "../types/Social.types";
import { useMapUi } from "../context/MapUiContext";
import { ensureSocialProfileClaimed } from "../utils/socialProfile";
import { isFunctionsUnauthenticatedError, isUsernameTakenError } from "../utils/username";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

const BUCKETS: { key: DailyBucket; label: string; points: number }[] = [
  { key: "30", label: "30 cm", points: 1 },
  { key: "35", label: "35 cm", points: 2 },
  { key: "40", label: "40 cm", points: 4 },
  { key: "45", label: "45 cm", points: 6 },
  { key: "50+", label: "50+ cm", points: 10 },
];

const LEVELS = [
  { min: 0, name: "Nybörjare", badge: "Fiskekort" },
  { min: 25, name: "Vassjägare", badge: "Bronsabborre" },
  { min: 60, name: "Stimstoppare", badge: "Silverabborre" },
  { min: 120, name: "Troféjägare", badge: "Guldabborre" },
  { min: 220, name: "Legend", badge: "Abborrekung" },
];

const EMPTY_COUNTS = (): Record<DailyBucket, number> => ({
  "30": 0,
  "35": 0,
  "40": 0,
  "45": 0,
  "50+": 0,
});

const EMPTY_BUCKET_FLAGS = (): Record<DailyBucket, boolean> => ({
  "30": false,
  "35": false,
  "40": false,
  "45": false,
  "50+": false,
});

const formatTimeAgo = (timestampMs: number, nowMs: number) => {
  const diff = Math.max(0, nowMs - timestampMs);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "nu";
  if (minutes < 60) return `${minutes} min sedan`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h sedan`;
  return "över 24 h sedan";
};

type LeaderboardRow = {
  userId: string;
  userDisplayName: string;
  userPhotoURL: string | null;
  counts: Record<DailyBucket, number>;
  total: number;
  points: number;
};

const getLevelForPoints = (points: number) => {
  let current = LEVELS[0];
  for (const level of LEVELS) {
    if (points >= level.min) current = level;
    else break;
  }
  const next = LEVELS.find((level) => level.min > current.min) ?? null;
  const progress = next
    ? Math.max(0, Math.min(100, Math.round(((points - current.min) / (next.min - current.min)) * 100)))
    : 100;
  return { current, next, progress };
};

const buildLeaderboard = (events: DailyCatchEvent[], allowed: Set<string>): LeaderboardRow[] => {
  const byUser = new Map<string, LeaderboardRow>();

  events.forEach((event) => {
    if (!allowed.has(event.userId)) return;
    const current =
      byUser.get(event.userId) ??
      {
        userId: event.userId,
        userDisplayName: event.userDisplayName,
        userPhotoURL: event.userPhotoURL ?? null,
        counts: EMPTY_COUNTS(),
        total: 0,
        points: 0,
      };
    current.counts[event.bucket] = (current.counts[event.bucket] || 0) + event.delta;
    byUser.set(event.userId, current);
  });

  const rows = Array.from(byUser.values()).map((row) => {
    const safeCounts = EMPTY_COUNTS();
    BUCKETS.forEach((bucket) => {
      safeCounts[bucket.key] = Math.max(0, row.counts[bucket.key] || 0);
    });
    const total = BUCKETS.reduce((sum, bucket) => sum + safeCounts[bucket.key], 0);
    const points = BUCKETS.reduce((sum, bucket) => sum + safeCounts[bucket.key] * bucket.points, 0);
    return {
      ...row,
      counts: safeCounts,
      total,
      points,
    };
  });

  return rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.total !== a.total) return b.total - a.total;
    return a.userDisplayName.localeCompare(b.userDisplayName, "sv");
  });
};

const respondToFriendRequestCall = httpsCallable<
  { requestId: string; approve: boolean },
  { ok: boolean }
>(functions, "respondToFriendRequest");
const createFriendRequestCall = httpsCallable<
  { targetUid: string },
  { ok: boolean }
>(functions, "createFriendRequest");
const addDailyCatchEventCall = httpsCallable<
  { bucket: DailyBucket; delta: 1 | -1 },
  { ok: boolean }
>(functions, "addDailyCatchEvent");

const toErrorMessage = (err: unknown, fallback: string) => {
  if (
    typeof err === "object" &&
    err !== null &&
    "message" in err &&
    typeof (err as { message?: unknown }).message === "string"
  ) {
    return (err as { message: string }).message;
  }
  return fallback;
};

const DailyChallengePage: Component = () => {
  const { setMode, setSelectedLocation } = useMapUi();
  const [currentUser, setCurrentUser] = createSignal<User | null>(auth.currentUser);
  const [profile, setProfile] = createSignal<(SocialProfile & { _id: string }) | null>(null);
  const [friendProfiles, setFriendProfiles] = createSignal<(SocialProfile & { _id: string })[]>([]);
  const [incomingRequests, setIncomingRequests] = createSignal<(FriendRequest & { _id: string })[]>([]);
  const [outgoingRequests, setOutgoingRequests] = createSignal<(FriendRequest & { _id: string })[]>([]);
  const [events, setEvents] = createSignal<(DailyCatchEvent & { _id: string })[]>([]);
  const [searchResults, setSearchResults] = createSignal<(SocialProfile & { _id: string })[]>([]);
  const [isSearchingProfiles, setIsSearchingProfiles] = createSignal(false);
  const [localCounts, setLocalCounts] = createSignal<Record<DailyBucket, number>>(EMPTY_COUNTS());
  const [pendingCatchOps, setPendingCatchOps] = createSignal<Record<DailyBucket, number>>(EMPTY_COUNTS());
  const [processingCatchOps, setProcessingCatchOps] = createSignal<Record<DailyBucket, boolean>>(EMPTY_BUCKET_FLAGS());
  const [isSendingFriendRequest, setIsSendingFriendRequest] = createSignal<string | null>(null);
  const [friendSearch, setFriendSearch] = createSignal("");
  const [isFriendsOpen, setIsFriendsOpen] = createSignal(false);
  const [status, setStatus] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [nowMs, setNowMs] = createSignal(Date.now());

  onMount(() => {
    setMode("hidden");
    setSelectedLocation(null);

    const unsubAuth = onAuthStateChanged(auth, (user) => setCurrentUser(user));
    const timer = window.setInterval(() => setNowMs(Date.now()), 30000);

    onCleanup(() => {
      unsubAuth();
      window.clearInterval(timer);
    });
  });

  createEffect(() => {
    const user = currentUser();
    if (!user) {
      setProfile(null);
      setIncomingRequests([]);
      setOutgoingRequests([]);
      setEvents([]);
      setFriendProfiles([]);
      setSearchResults([]);
      setLocalCounts(EMPTY_COUNTS());
      setPendingCatchOps(EMPTY_COUNTS());
      setProcessingCatchOps(EMPTY_BUCKET_FLAGS());
      return;
    }

    void ensureSocialProfileClaimed(user).catch((err) => {
      if (isUsernameTakenError(err)) {
        setError("Ditt användarnamn krockar med ett annat konto. Byt namn i profil.");
        return;
      }
      if (isFunctionsUnauthenticatedError(err)) {
        // Undvik att visa fel när auth-token inte hunnit synkas vid sidladdning.
        console.warn("Skippade social profil-initiering: användaren var inte autentiserad ännu.");
        return;
      }
      console.error("Kunde inte initiera social profil", err);
      setError("Kunde inte initiera social profil.");
    });

    const profileRef = doc(socialProfileCol, user.uid);
    const unsubProfile = onSnapshot(
      profileRef,
      (snap) => {
        if (!snap.exists()) {
          setProfile(null);
          return;
        }
        setProfile({ ...(snap.data() as SocialProfile), _id: snap.id });
      },
      (err) => {
        console.error("Kunde inte läsa social profil", err);
        setError("Kunde inte läsa social profil.");
      }
    );

    const incomingQ = query(friendRequestCol, where("toUid", "==", user.uid));
    const outgoingQ = query(friendRequestCol, where("fromUid", "==", user.uid));
    const weeklyEventsQ = query(dailyCatchEventCol, where("createdAtMs", ">", Date.now() - WEEK_MS));

    const unsubIncoming = onSnapshot(incomingQ, (snapshot) => {
      const next = snapshot.docs
        .map((item) => ({ ...(item.data() as FriendRequest), _id: item.id }))
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      setIncomingRequests(next);
    });

    const unsubOutgoing = onSnapshot(outgoingQ, (snapshot) => {
      const next = snapshot.docs
        .map((item) => ({ ...(item.data() as FriendRequest), _id: item.id }))
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      setOutgoingRequests(next);
    });

    const unsubEvents = onSnapshot(
      weeklyEventsQ,
      (snapshot) => {
        const next = snapshot.docs.map((item) => ({
          ...(item.data() as DailyCatchEvent),
          _id: item.id,
        }));
        setEvents(next);
      },
      (err) => {
        console.error("Kunde inte läsa tävlingshändelser", err);
        setError("Kunde inte läsa tävlingshändelser.");
      }
    );

    onCleanup(() => {
      unsubProfile();
      unsubIncoming();
      unsubOutgoing();
      unsubEvents();
    });
  });

  createEffect(() => {
    const user = currentUser();
    const ids = profile()?.friends ?? [];
    if (!user || ids.length === 0) {
      setFriendProfiles([]);
      return;
    }

    let isActive = true;
    const load = async () => {
      const refs = ids.map((uid) => doc(socialProfileCol, uid));
      const docs = await Promise.all(refs.map((ref) => getDoc(ref)));
      if (!isActive) return;
      const next = docs
        .filter((snap) => snap.exists())
        .map((snap) => ({ ...(snap.data() as SocialProfile), _id: snap.id }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName, "sv"));
      setFriendProfiles(next);
    };

    void load();
    onCleanup(() => {
      isActive = false;
    });
  });

  const friendIds = createMemo(() => profile()?.friends ?? []);
  const blockedUserIds = createMemo(() => {
    const user = currentUser();
    const blocked = new Set<string>();
    if (user) blocked.add(user.uid);
    friendIds().forEach((id) => blocked.add(id));
    outgoingRequests().forEach((req) => blocked.add(req.toUid));
    incomingRequests().forEach((req) => blocked.add(req.fromUid));
    return blocked;
  });

  createEffect(() => {
    const user = currentUser();
    const term = friendSearch().trim().toLowerCase();
    const blocked = blockedUserIds();

    if (!user || term.length < 2) {
      setSearchResults([]);
      setIsSearchingProfiles(false);
      return;
    }

    let isActive = true;
    const timer = window.setTimeout(async () => {
      setIsSearchingProfiles(true);
      try {
        const q = query(
          socialProfileCol,
          orderBy("displayNameLower"),
          startAt(term),
          endAt(`${term}\uf8ff`),
          limit(10)
        );
        const snapshot = await getDocs(q);
        if (!isActive) return;
        const next = snapshot.docs
          .map((item) => ({ ...(item.data() as SocialProfile), _id: item.id }))
          .filter(
            (item) =>
              item.uid === item._id &&
              !blocked.has(item.uid) &&
              typeof item.displayName === "string" &&
              item.displayName.trim().length >= 3 &&
              item.displayName.trim().length <= 24
          );
        setSearchResults(next);
      } catch (err) {
        console.error("Kunde inte söka användare", err);
        if (isActive) setError("Kunde inte söka användare just nu.");
      } finally {
        if (isActive) setIsSearchingProfiles(false);
      }
    }, 250);

    onCleanup(() => {
      isActive = false;
      window.clearTimeout(timer);
    });
  });

  const allowedUserIds = createMemo(() => {
    const user = currentUser();
    if (!user) return new Set<string>();
    return new Set<string>([user.uid, ...friendIds()]);
  });

  const dailyEvents = createMemo(() =>
    events()
      .filter((event) => event.expiresAtMs > nowMs())
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
  );

  const weeklyEvents = createMemo(() =>
    events()
      .filter((event) => event.createdAtMs > nowMs() - WEEK_MS)
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
  );

  const dailyLeaderboard = createMemo(() => buildLeaderboard(dailyEvents(), allowedUserIds()));
  const weeklyLeaderboard = createMemo(() => buildLeaderboard(weeklyEvents(), allowedUserIds()));
  const weeklyPodium = createMemo(() => weeklyLeaderboard().slice(0, 3));

  const myCounts = createMemo(() => {
    const user = currentUser();
    if (!user) return EMPTY_COUNTS();
    const row = dailyLeaderboard().find((item) => item.userId === user.uid);
    return row?.counts ?? EMPTY_COUNTS();
  });

  createEffect(() => {
    const serverCounts = myCounts();
    const hasPendingOrProcessing = BUCKETS.some(
      (bucket) => pendingCatchOps()[bucket.key] !== 0 || processingCatchOps()[bucket.key]
    );
    if (!hasPendingOrProcessing) {
      setLocalCounts(serverCounts);
    }
  });

  const myWeekly = createMemo(() => {
    const user = currentUser();
    if (!user) return null;
    const row = weeklyLeaderboard().find((item) => item.userId === user.uid);
    const points = row?.points ?? 0;
    return {
      row,
      points,
      ...getLevelForPoints(points),
    };
  });

  const activity = createMemo(() => {
    const allowed = allowedUserIds();
    return dailyEvents()
      .filter((event) => allowed.has(event.userId))
      .slice(0, 30);
  });

  const sendFriendRequest = async (target: SocialProfile & { _id: string }) => {
    setStatus(null);
    setError(null);

    const user = currentUser();
    const sourceProfile = profile();
    if (!user || !sourceProfile) {
      setError("Du måste vara inloggad.");
      return;
    }

    if (target.uid === user.uid) {
      setError("Du kan inte lägga till dig själv.");
      return;
    }

    setIsSendingFriendRequest(target.uid);
    try {
      await createFriendRequestCall({
        targetUid: target.uid,
      });
      setStatus(`Förfrågan skickad till ${target.displayName}.`);
      setSearchResults((prev) => prev.filter((item) => item.uid !== target.uid));
      setFriendSearch("");
    } catch (err) {
      console.error("Kunde inte skicka vänförfrågan", err);
      const message =
        typeof err === "object" &&
        err !== null &&
        "message" in err &&
        typeof (err as { message?: unknown }).message === "string"
          ? (err as { message: string }).message
          : "Kunde inte skicka vänförfrågan.";
      setError(message);
    } finally {
      setIsSendingFriendRequest(null);
    }
  };

  const respondToRequest = async (request: FriendRequest & { _id: string }, approve: boolean) => {
    setStatus(null);
    setError(null);
    const user = currentUser();
    if (!user) return;

    try {
      await respondToFriendRequestCall({
        requestId: request._id,
        approve,
      });
      if (approve) setStatus(`Du och ${request.fromDisplayName} är nu vänner.`);
    } catch (err) {
      console.error("Kunde inte hantera vänförfrågan", err);
      setError("Kunde inte hantera vänförfrågan.");
    }
  };

  const flushCatchBucket = async (bucket: DailyBucket) => {
    if (processingCatchOps()[bucket]) return;

    setProcessingCatchOps((prev) => ({ ...prev, [bucket]: true }));
    try {
      while (true) {
        const pending = pendingCatchOps()[bucket];
        if (pending === 0) break;

        const delta: 1 | -1 = pending > 0 ? 1 : -1;
        setPendingCatchOps((prev) => ({ ...prev, [bucket]: prev[bucket] - delta }));

        try {
          await addDailyCatchEventCall({
            bucket,
            delta,
          });
        } catch (err) {
          console.error("Kunde inte uppdatera fångstfönstret", err);
          setLocalCounts((prev) => ({
            ...prev,
            [bucket]: Math.max(0, prev[bucket] - delta),
          }));
          setError(toErrorMessage(err, "Kunde inte uppdatera fångstfönstret."));
        }
      }
    } finally {
      setProcessingCatchOps((prev) => ({ ...prev, [bucket]: false }));
      if (pendingCatchOps()[bucket] !== 0) {
        void flushCatchBucket(bucket);
      }
    }
  };

  const adjustCatch = async (bucket: DailyBucket, delta: 1 | -1) => {
    setStatus(null);
    setError(null);
    const user = currentUser();
    if (!user) {
      setError("Du måste vara inloggad.");
      return;
    }

    if (delta === -1 && localCounts()[bucket] <= 0) {
      setError("Du kan inte minska under 0 för den klassen.");
      return;
    }

    setLocalCounts((prev) => ({
      ...prev,
      [bucket]: Math.max(0, prev[bucket] + delta),
    }));
    setPendingCatchOps((prev) => ({
      ...prev,
      [bucket]: prev[bucket] + delta,
    }));
    void flushCatchBucket(bucket);
  };

  return (
    <main class="page daily-page">
      <h1>Perch Buddy</h1>

      <Show when={currentUser()} fallback={<div>Logga in för att använda den här delen.</div>}>
        <Show when={error()}>
          <div class="form-status error">{error()}</div>
        </Show>
        <Show when={status()}>
          <div class="form-status success">{status()}</div>
        </Show>

        <section class={`daily-card daily-friends-card ${isFriendsOpen() ? "is-open" : "is-closed"}`}>
          <div class={`daily-card-header ${isFriendsOpen() ? "" : "is-icon-only"}`}>
            <Show when={isFriendsOpen()}>
              <h2>Vänner</h2>
            </Show>
            <button
              type="button"
              class={`daily-friends-toggle ${isFriendsOpen() ? "is-open" : ""}`}
              aria-label={isFriendsOpen() ? "Dölj vänner" : "Visa vänner"}
              aria-expanded={isFriendsOpen()}
              onClick={() => setIsFriendsOpen((open) => !open)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="9" cy="8.8" r="2.4" fill="none" />
                <circle cx="15.2" cy="9.6" r="2.1" fill="none" />
                <path d="M4.5 17c0-2.5 2-4.4 4.5-4.4s4.5 1.9 4.5 4.4" fill="none" />
                <path d="M12.2 17c0-2 1.6-3.6 3.5-3.6 2 0 3.6 1.6 3.6 3.6" fill="none" />
              </svg>
            </button>
          </div>

          <Show when={isFriendsOpen()}>
            <div class="daily-friends-panel">
              <input
                type="search"
                class="daily-friend-search"
                value={friendSearch()}
                onInput={(e) => setFriendSearch(e.currentTarget.value)}
                placeholder="Sök användarnamn"
              />

              <Show when={friendSearch().trim().length >= 2}>
                <Show when={!isSearchingProfiles()} fallback={<div class="muted">Söker...</div>}>
                  <Show when={searchResults().length > 0} fallback={<div class="muted">Inga träffar.</div>}>
                    <ul class="daily-list">
                      <For each={searchResults()}>
                        {(candidate) => (
                          <li class="daily-list-item">
                            <span>{candidate.displayName}</span>
                            <button
                              type="button"
                              class="primary-button"
                              onClick={() => void sendFriendRequest(candidate)}
                              disabled={isSendingFriendRequest() === candidate.uid}
                            >
                              {isSendingFriendRequest() === candidate.uid ? "Skickar..." : "Lägg till"}
                            </button>
                          </li>
                        )}
                      </For>
                    </ul>
                  </Show>
                </Show>
              </Show>

              <Show when={incomingRequests().length > 0}>
                <h3>Inkommande förfrågningar</h3>
                <ul class="daily-list">
                  <For each={incomingRequests()}>
                    {(request) => (
                      <li class="daily-list-item">
                        <span>{request.fromDisplayName}</span>
                        <div class="card-actions">
                          <button
                            type="button"
                            class="primary-button"
                            onClick={() => void respondToRequest(request, true)}
                          >
                            Acceptera
                          </button>
                          <button
                            type="button"
                            class="danger-button"
                            onClick={() => void respondToRequest(request, false)}
                          >
                            Avvisa
                          </button>
                        </div>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>

              <Show when={friendProfiles().length > 0} fallback={<div>Inga vänner ännu.</div>}>
                <h3>Dina vänner</h3>
                <ul class="daily-friends">
                  <For each={friendProfiles()}>
                    {(friend) => (
                      <li class="daily-friend-chip">
                        <span>{friend.displayName}</span>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </div>
          </Show>
        </section>

        <section class="daily-card">
          <h2>Fångster</h2>
          <ul class="daily-catch-window">
            <For each={BUCKETS}>
              {(bucket) => (
                <li class="daily-catch-row">
                  <button
                    type="button"
                    class="daily-catch-btn daily-catch-btn--minus secondary-button"
                    onClick={() => void adjustCatch(bucket.key, -1)}
                    disabled={localCounts()[bucket.key] <= 0}
                    aria-label={`Minska ${bucket.label}`}
                  >
                    -
                  </button>

                  <div class="daily-catch-info">
                    <span class="daily-catch-label">{bucket.label}</span>
                    <strong class="daily-catch-count">{localCounts()[bucket.key]} st</strong>
                  </div>

                  <button
                    type="button"
                    class="daily-catch-btn daily-catch-btn--plus primary-button"
                    onClick={() => void adjustCatch(bucket.key, 1)}
                    aria-label={`Öka ${bucket.label}`}
                  >
                    +
                  </button>
                </li>
              )}
            </For>
          </ul>
        </section>

        <section class="daily-card">
          <h2>Veckonivå (7 dagar)</h2>
          <Show when={myWeekly()}>
            <div class="daily-level-head">
              <strong>{myWeekly()!.current.badge}</strong>
              <span>
                {myWeekly()!.current.name} • {myWeekly()!.points} poäng
              </span>
            </div>
            <Show when={myWeekly()!.next} fallback={<div class="muted">Maxnivå nådd denna vecka.</div>}>
              <div class="daily-level-progress">
                <div class="daily-level-progress__bar" style={{ width: `${myWeekly()!.progress}%` }} />
              </div>
              <div class="muted">
                {myWeekly()!.next!.min - myWeekly()!.points} p till {myWeekly()!.next!.badge}
              </div>
            </Show>
          </Show>
        </section>

        <section class="daily-card">
          <h2>Veckotopplista</h2>
          <Show when={weeklyLeaderboard().length > 0} fallback={<div>Ingen aktivitet senaste 7 dagarna.</div>}>
            <Show when={weeklyPodium().length > 0}>
              <ul class="daily-podium" aria-label="Veckans topp tre">
                <For each={weeklyPodium()}>
                  {(row, index) => (
                    <li class={`daily-podium-item daily-podium-item--${index() + 1}`}>
                      <span class="daily-podium-rank">#{index() + 1}</span>
                      <strong class="daily-podium-name">{row.userDisplayName}</strong>
                      <span class="daily-podium-score">{row.points} p</span>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
            <ol class="daily-leaderboard">
              <For each={weeklyLeaderboard()}>
                {(row, index) => {
                  const level = getLevelForPoints(row.points);
                  const isMe = row.userId === currentUser()?.uid;
                  return (
                    <li
                      class={`daily-leaderboard-row ${index() < 3 ? "is-top" : ""} ${isMe ? "is-me" : ""}`}
                    >
                      <span class="daily-rank">#{index() + 1}</span>
                      <span class="daily-name">{row.userDisplayName}</span>
                      <span class="daily-score">{row.points} p</span>
                      <span class="daily-total">{row.total} fiskar • {level.current.badge}</span>
                    </li>
                  );
                }}
              </For>
            </ol>
          </Show>
        </section>

        <section class="daily-card">
          <h2>Topplista (24h)</h2>
          <Show when={dailyLeaderboard().length > 0} fallback={<div>Ingen aktivitet senaste 24 timmarna.</div>}>
            <ol class="daily-leaderboard">
              <For each={dailyLeaderboard()}>
                {(row, index) => {
                  const isMe = row.userId === currentUser()?.uid;
                  return (
                    <li
                      class={`daily-leaderboard-row ${index() < 3 ? "is-top" : ""} ${isMe ? "is-me" : ""}`}
                    >
                      <span class="daily-rank">#{index() + 1}</span>
                      <span class="daily-name">{row.userDisplayName}</span>
                      <span class="daily-score">{row.points} p</span>
                      <span class="daily-total">{row.total} fiskar</span>
                    </li>
                  );
                }}
              </For>
            </ol>
          </Show>
        </section>

        <section class="daily-card">
          <h2>Senaste aktivitet</h2>
          <Show when={activity().length > 0} fallback={<div>Ingen aktivitet ännu.</div>}>
            <ul class="daily-list daily-activity-list">
              <For each={activity()}>
                {(event) => (
                  <li class="daily-list-item">
                    <span>
                      <strong>{event.userDisplayName}</strong>{" "}
                      {event.delta > 0 ? "la till" : "tog bort"} {event.bucket} cm
                    </span>
                    <span class="muted">{formatTimeAgo(event.createdAtMs, nowMs())}</span>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </section>
      </Show>
    </main>
  );
};

export default DailyChallengePage;

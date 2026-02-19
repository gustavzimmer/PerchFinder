import { setGlobalOptions } from "firebase-functions/v2";
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";
import { createHash } from "node:crypto";
import OpenAI from "openai";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

setGlobalOptions({ maxInstances: 10 });
const OPENAI_KEY = defineSecret("OPENAI_KEY");
initializeApp();
const adminDb = getFirestore();
const adminAuth = getAuth();
const AI_RATE_LIMIT_MAX_REQUESTS = 10;
const AI_RATE_LIMIT_WINDOW_MS = 12 * 60 * 60 * 1000;

const normalizeUsername = (value: string) => value.trim().replace(/\s+/g, " ");
const toUsernameKey = (value: string) => normalizeUsername(value).toLocaleLowerCase("sv-SE");

type RateLimitRequest = {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
};

type AuthenticatedUser = {
  uid: string;
};

const hashRateKey = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 40);

const readHeader = (value: string | string[] | undefined) => {
  if (Array.isArray(value) && value.length > 0) {
    return String(value[0]);
  }
  return typeof value === "string" ? value : "";
};

const extractBearerToken = (req: RateLimitRequest) => {
  const authHeader = readHeader(req.headers["authorization"]).trim();
  if (!authHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!match?.[1]) return null;
  return match[1].trim();
};

const authenticateAiRequester = async (req: RateLimitRequest): Promise<AuthenticatedUser> => {
  const token = extractBearerToken(req);
  if (!token) {
    throw new HttpsError("unauthenticated", "Du måste vara inloggad för AI-rekommendation.");
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return { uid: decoded.uid };
  } catch (err) {
    logger.warn("Ogiltig auth-token i getWaterRecommendation", err as Error);
    throw new HttpsError("unauthenticated", "Ogiltig inloggning. Logga in igen.");
  }
};

const enforceAiRateLimit = async (rateLimitKey: string) => {
  const key = hashRateKey(`getWaterRecommendation:${rateLimitKey}`);
  const limiterRef = adminDb.collection("AiRateLimits").doc(key);
  const now = Date.now();
  let retryAfterMs = 0;

  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(limiterRef);
    const data = snap.data() as { count?: unknown; windowStartedAtMs?: unknown } | undefined;
    const currentCount = typeof data?.count === "number" ? data.count : 0;
    const windowStartedAtMs = typeof data?.windowStartedAtMs === "number" ? data.windowStartedAtMs : 0;
    const hasWindowExpired = windowStartedAtMs <= 0 || now - windowStartedAtMs >= AI_RATE_LIMIT_WINDOW_MS;

    if (!hasWindowExpired && currentCount >= AI_RATE_LIMIT_MAX_REQUESTS) {
      retryAfterMs = Math.max(1000, AI_RATE_LIMIT_WINDOW_MS - (now - windowStartedAtMs));
      throw new HttpsError("resource-exhausted", "För många AI-anrop. Försök igen om en stund.", retryAfterMs);
    }

    const nextWindowStartedAtMs = hasWindowExpired ? now : windowStartedAtMs;
    const nextCount = hasWindowExpired ? 1 : currentCount + 1;

    tx.set(
      limiterRef,
      {
        count: nextCount,
        windowStartedAtMs: nextWindowStartedAtMs,
        lastRequestAtMs: now,
        windowMs: AI_RATE_LIMIT_WINDOW_MS,
        maxRequests: AI_RATE_LIMIT_MAX_REQUESTS,
        expiresAtMs: nextWindowStartedAtMs + AI_RATE_LIMIT_WINDOW_MS * 2,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  return { retryAfterMs };
};

export const claimUsername = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Du måste vara inloggad.");
  }

  const uid = request.auth.uid;
  const payload = (request.data ?? {}) as {
    nextDisplayName?: unknown;
    previousDisplayName?: unknown;
  };

  if (typeof payload.nextDisplayName !== "string") {
    throw new HttpsError("invalid-argument", "Användarnamn saknas.");
  }

  const nextDisplayName = normalizeUsername(payload.nextDisplayName);
  if (nextDisplayName.length < 3 || nextDisplayName.length > 24) {
    throw new HttpsError("invalid-argument", "Användarnamn måste vara 3-24 tecken.");
  }

  const previousDisplayName =
    typeof payload.previousDisplayName === "string" ? normalizeUsername(payload.previousDisplayName) : null;
  const nextKey = toUsernameKey(nextDisplayName);
  const previousKey = previousDisplayName ? toUsernameKey(previousDisplayName) : null;

  await adminDb.runTransaction(async (tx) => {
    const usernameCol = adminDb.collection("UsernameIndex");
    const nextRef = usernameCol.doc(nextKey);
    const nextSnap = await tx.get(nextRef);
    const previousRef = previousKey && previousKey !== nextKey ? usernameCol.doc(previousKey) : null;
    const previousSnap = previousRef ? await tx.get(previousRef) : null;
    const profileRef = adminDb.collection("SocialProfiles").doc(uid);
    const profileSnap = await tx.get(profileRef);

    if (nextSnap.exists) {
      const data = nextSnap.data() as { uid?: string } | undefined;
      if (!data?.uid || data.uid !== uid) {
        throw new HttpsError("already-exists", "Användarnamnet används redan.");
      }
      tx.update(nextRef, {
        displayName: nextDisplayName,
        displayNameLower: nextKey,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      tx.set(nextRef, {
        uid,
        displayName: nextDisplayName,
        displayNameLower: nextKey,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    if (previousRef && previousSnap?.exists) {
      const previousData = previousSnap.data() as { uid?: string } | undefined;
      if (previousData?.uid === uid) {
        tx.delete(previousRef);
      }
    }

    if (profileSnap.exists) {
      const profileData = profileSnap.data() as { friends?: unknown; photoURL?: unknown; createdAt?: unknown };
      tx.update(profileRef, {
        uid,
        displayName: nextDisplayName,
        displayNameLower: nextKey,
        friends: Array.isArray(profileData.friends) ? profileData.friends : [],
        photoURL: typeof profileData.photoURL === "string" ? profileData.photoURL : null,
        createdAt: profileData.createdAt ?? FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      tx.set(profileRef, {
        uid,
        displayName: nextDisplayName,
        displayNameLower: nextKey,
        friends: [],
        photoURL: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  });

  await adminAuth.updateUser(uid, { displayName: nextDisplayName });
  return {
    displayName: nextDisplayName,
    displayNameLower: nextKey,
  };
});

export const respondToFriendRequest = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Du måste vara inloggad.");
  }

  const uid = request.auth.uid;
  const payload = (request.data ?? {}) as {
    requestId?: unknown;
    approve?: unknown;
  };

  if (typeof payload.requestId !== "string" || !payload.requestId.trim()) {
    throw new HttpsError("invalid-argument", "Ogiltigt requestId.");
  }
  if (typeof payload.approve !== "boolean") {
    throw new HttpsError("invalid-argument", "approve måste vara boolean.");
  }

  const requestId = payload.requestId.trim();
  const approve = payload.approve;
  const requestRef = adminDb.collection("FriendRequests").doc(requestId);

  await adminDb.runTransaction(async (tx) => {
    const reqSnap = await tx.get(requestRef);
    if (!reqSnap.exists) {
      throw new HttpsError("not-found", "Vänförfrågan hittades inte.");
    }

    const reqData = reqSnap.data() as { fromUid?: unknown; toUid?: unknown } | undefined;
    const fromUid = typeof reqData?.fromUid === "string" ? reqData.fromUid : null;
    const toUid = typeof reqData?.toUid === "string" ? reqData.toUid : null;

    if (!fromUid || !toUid) {
      throw new HttpsError("failed-precondition", "Vänförfrågan saknar användar-id.");
    }
    if (toUid !== uid) {
      throw new HttpsError("permission-denied", "Du får inte hantera denna förfrågan.");
    }

    if (approve) {
      const fromProfileRef = adminDb.collection("SocialProfiles").doc(fromUid);
      const toProfileRef = adminDb.collection("SocialProfiles").doc(toUid);

      tx.update(fromProfileRef, {
        friends: FieldValue.arrayUnion(toUid),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.update(toProfileRef, {
        friends: FieldValue.arrayUnion(fromUid),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    tx.delete(requestRef);
  });

  return { ok: true };
});

export const getWaterRecommendation = onRequest({ secrets: [OPENAI_KEY] }, async (req, res) => {
  // Enkel CORS för browser
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).send("Only POST allowed");
    return;
  }

  // Läs nyckeln INNE I funktionen
  const openaiKey =
    OPENAI_KEY.value() ||
    process.env.OPENAI_API_KEY ||
    process.env.OPENAI_KEY;
  if (!openaiKey) {
    logger.error("OPENAI_KEY saknas i environment/config");
    res.status(500).json({ error: "Servern saknar AI-nyckel (OPENAI_KEY)." });
    return;
  }

  const client = new OpenAI({ apiKey: openaiKey });

  try {
    let requester: AuthenticatedUser;
    try {
      requester = await authenticateAiRequester(req as RateLimitRequest);
    } catch (err) {
      if (err instanceof HttpsError && err.code === "unauthenticated") {
        res.status(401).json({ error: err.message });
        return;
      }
      throw err;
    }

    const stats = req.body?.stats as Record<string, unknown> | undefined;
    if (!stats || typeof stats !== "object") {
      res.status(400).send("Missing stats in body");
      return;
    }

    try {
      await enforceAiRateLimit(`uid:${requester.uid}`);
    } catch (err) {
      if (err instanceof HttpsError && err.code === "resource-exhausted") {
        const details = (err as { details?: unknown }).details;
        if (typeof details === "number" && Number.isFinite(details)) {
          res.set("Retry-After", String(Math.ceil(details / 1000)));
        }
        res.status(429).json({ error: err.message });
        return;
      }
      throw err;
    }

    const payload = {
      waterName: typeof stats.waterName === "string" ? stats.waterName : "okänt vatten",
      totalCatches: typeof stats.totalCatches === "number" ? stats.totalCatches : 0,
      general: (stats.general ?? null) as Record<string, unknown> | null,
      currentConditions: (stats.currentConditions ?? null) as Record<string, unknown> | null,
      similarWhenLikeNow: (stats.similarWhenLikeNow ?? null) as Record<string, unknown> | null,
    };

    const systemPrompt =
      "Du är en erfaren fiskeguide för abborrfiske. Du använder ENDAST datan du får och hittar inte på saknad information.";
    const userPrompt = `
Analysera detta vatten och skriv en rekommendation på svenska.

Krav på svar:
1) Svara med exakt två rubriker:
   - Generellt i vattnet
   - När vädret liknar nu
2) Under varje rubrik: 2-4 korta punkter.
3) Väg in flera parametrar samtidigt (betestyp, konkret bete, metod, tid på dygnet, väder, temperatur, lufttryck).
4) Om data för betestyper och metoder för jigg finns, lyft fram dem konkret.
5) Om underlag saknas för del 2, skriv det tydligt utan att gissa.
6) Kort, tydligt och praktiskt (max cirka 170 ord totalt).

Data:
${JSON.stringify(payload, null, 2)}
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.5,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const text = completion.choices[0]?.message?.content ?? "";

    res.status(200).json({ recommendation: text });
  } catch (err) {
    logger.error("Fel i getWaterRecommendation", err as Error);
    res.set("Access-Control-Allow-Origin", "*");
    res.status(500).json({ error: "Error generating recommendation", detail: (err as Error)?.message ?? String(err) });
  }
});

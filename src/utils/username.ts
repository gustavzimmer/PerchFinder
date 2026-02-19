import { FirebaseError } from "firebase/app";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "../firebase";

export class UsernameTakenError extends Error {
  constructor(username: string) {
    super(`Username already in use: ${username}`);
    this.name = "UsernameTakenError";
  }
}

export const normalizeUsername = (value: string) => value.trim().replace(/\s+/g, " ");

export const toUsernameKey = (value: string) => normalizeUsername(value).toLocaleLowerCase("sv-SE");

export const isUsernameTakenError = (err: unknown): err is UsernameTakenError =>
  err instanceof UsernameTakenError;

export const isFunctionsUnauthenticatedError = (err: unknown) => {
  if (!err || typeof err !== "object") return false;
  const code = "code" in err ? String((err as { code?: unknown }).code ?? "") : "";
  const status = "status" in err ? String((err as { status?: unknown }).status ?? "") : "";
  return (
    code === "functions/unauthenticated" ||
    code === "unauthenticated" ||
    status === "UNAUTHENTICATED"
  );
};

const isFunctionsAlreadyExistsError = (err: unknown) => {
  if (!err || typeof err !== "object") return false;
  const code = "code" in err ? String((err as { code?: unknown }).code ?? "") : "";
  const status = "status" in err ? String((err as { status?: unknown }).status ?? "") : "";
  return (
    code === "functions/already-exists" ||
    code === "already-exists" ||
    status === "ALREADY_EXISTS"
  );
};

type ClaimUsernameParams = {
  uid: string;
  nextDisplayName: string;
  previousDisplayName?: string | null;
  idToken?: string | null;
};

const claimViaFetch = async (
  payload: { nextDisplayName: string; previousDisplayName: string | null },
  idToken: string
) => {
  const projectId = (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined)?.trim();
  if (!projectId) {
    throw new Error("Saknar VITE_FIREBASE_PROJECT_ID för username-claim fallback.");
  }

  const response = await fetch(`https://us-central1-${projectId}.cloudfunctions.net/claimUsername`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ data: payload }),
  });

  const body = (await response.json().catch(() => null)) as
    | {
        result?: unknown;
        error?: {
          status?: string;
          message?: string;
        };
      }
    | null;

  const status = body?.error?.status;
  if (status === "ALREADY_EXISTS") {
    throw new UsernameTakenError(payload.nextDisplayName);
  }
  if (status === "UNAUTHENTICATED") {
    throw new FirebaseError("functions/unauthenticated", body?.error?.message ?? "Unauthenticated");
  }
  if (!response.ok || status) {
    throw new Error(body?.error?.message ?? `Kunde inte claima användarnamn (HTTP ${response.status}).`);
  }
};

export const claimUniqueUsername = async ({
  uid,
  nextDisplayName,
  previousDisplayName,
  idToken,
}: ClaimUsernameParams) => {
  if (!uid) {
    throw new Error("uid krävs för att claima användarnamn.");
  }

  const nextName = normalizeUsername(nextDisplayName);
  const payload = {
    nextDisplayName: nextName,
    previousDisplayName: previousDisplayName ? normalizeUsername(previousDisplayName) : null,
  };
  const callClaim = httpsCallable<
    { nextDisplayName: string; previousDisplayName: string | null },
    { displayName: string; displayNameLower: string }
  >(functions, "claimUsername");

  const claim = async () => callClaim(payload);

  try {
    await claim();
  } catch (err) {
    if (isFunctionsAlreadyExistsError(err)) {
      throw new UsernameTakenError(nextName);
    }

    if (isFunctionsUnauthenticatedError(err)) {
      let tokenForFallback = idToken ?? null;
      const activeUser = auth.currentUser;

      if (!tokenForFallback && activeUser?.uid === uid) {
        tokenForFallback = await activeUser.getIdToken(true);
      }

      if (tokenForFallback) {
        try {
          await claimViaFetch(payload, tokenForFallback);
          return;
        } catch (fallbackErr) {
          if (isUsernameTakenError(fallbackErr) || isFunctionsAlreadyExistsError(fallbackErr)) {
            throw new UsernameTakenError(nextName);
          }
          throw fallbackErr;
        }
      }
    }

    throw err;
  }
};

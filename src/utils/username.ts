import { FirebaseError } from "firebase/app";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

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

type ClaimUsernameParams = {
  uid: string;
  nextDisplayName: string;
  previousDisplayName?: string | null;
};

export const claimUniqueUsername = async ({ uid, nextDisplayName, previousDisplayName }: ClaimUsernameParams) => {
  if (!uid) {
    throw new Error("uid krävs för att claima användarnamn.");
  }

  const nextName = normalizeUsername(nextDisplayName);
  const callClaim = httpsCallable<
    { nextDisplayName: string; previousDisplayName: string | null },
    { displayName: string; displayNameLower: string }
  >(functions, "claimUsername");

  try {
    await callClaim({
      nextDisplayName: nextName,
      previousDisplayName: previousDisplayName ? normalizeUsername(previousDisplayName) : null,
    });
  } catch (err) {
    if (err instanceof FirebaseError && err.code === "functions/already-exists") {
      throw new UsernameTakenError(nextName);
    }
    throw err;
  }
};

import { type User } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { socialProfileCol } from "../firebase";
import { claimUniqueUsername, normalizeUsername, toUsernameKey } from "./username";

const toDisplayName = (
  displayName: string | null | undefined,
  email: string | null | undefined,
  uid: string
) => {
  const name = normalizeUsername(displayName ?? "");
  if (name) return name.slice(0, 24);
  if (!email) return `user${uid.slice(0, 6)}`;
  const [localPart] = email.split("@");
  const fallback = normalizeUsername(localPart || email);
  if (fallback.length >= 3) return fallback.slice(0, 24);
  return `user${uid.slice(0, 6)}`;
};

export const ensureSocialProfile = async (user: User, preferredDisplayName?: string) => {
  const ref = doc(socialProfileCol, user.uid);
  const displayName = toDisplayName(preferredDisplayName ?? user.displayName, user.email, user.uid);
  const base = {
    uid: user.uid,
    displayName,
    displayNameLower: toUsernameKey(displayName),
    photoURL: user.photoURL ?? null,
    updatedAt: serverTimestamp(),
  };

  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      ...base,
      friends: [],
      createdAt: serverTimestamp(),
    });
    return;
  }

  await updateDoc(ref, base);
};

export const ensureSocialProfileClaimed = async (user: User, preferredDisplayName?: string) => {
  const displayName = toDisplayName(preferredDisplayName ?? user.displayName, user.email, user.uid);
  const displayNameLower = toUsernameKey(displayName);
  const profileRef = doc(socialProfileCol, user.uid);
  const profileSnap = await getDoc(profileRef);
  const currentProfile = profileSnap.exists()
    ? (profileSnap.data() as { displayName?: unknown; displayNameLower?: unknown })
    : null;
  const currentDisplayName = typeof currentProfile?.displayName === "string" ? currentProfile.displayName : null;
  const currentDisplayNameLower =
    typeof currentProfile?.displayNameLower === "string" ? currentProfile.displayNameLower : null;

  const shouldClaim =
    !currentDisplayName ||
    !currentDisplayNameLower ||
    currentDisplayName !== displayName ||
    currentDisplayNameLower !== displayNameLower;

  if (shouldClaim) {
    let idToken: string | null = null;
    try {
      idToken = await user.getIdToken();
    } catch (err) {
      console.warn("Kunde inte hämta idToken inför username-claim", err);
    }
    await claimUniqueUsername({
      uid: user.uid,
      nextDisplayName: displayName,
      previousDisplayName: currentDisplayName ?? user.displayName,
      idToken,
    });
  }
  await ensureSocialProfile(user, displayName);
  return displayName;
};

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFunctions } from "firebase/functions";
import {
  collection,
  CollectionReference,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  type DocumentData,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { WaterLocation, WaterRequest } from "./types/Map.types";
import { Catch, LureOption } from "./types/Catch.types";
import {
  AdminProfile,
  DailyCatchEvent,
  FriendRequest,
  SocialProfile,
  UsernameIndex,
} from "./types/Social.types";

// Config from env file
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// initialize app
const app = initializeApp(firebaseConfig);

const createFirestore = () => {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch (err) {
    console.warn("Persistent cache stöds inte här, använder minnescache istället.", err);
    return initializeFirestore(app, {
      localCache: memoryLocalCache(),
    });
  }
};

export const db = createFirestore();

export const storage = getStorage(app);

export const auth = getAuth(app);
export const functions = getFunctions(app);

const createCollection = <T = DocumentData>(collectionName: string) => {
  return collection(db, collectionName) as CollectionReference<T>;
};

export const waterCol = createCollection<WaterLocation>("FiskeVatten");
export const waterRequestCol = createCollection<WaterRequest>("FiskeVattenRequests");
export const catchCol = createCollection<Catch>("Fangster");
export const lureCol = createCollection<LureOption>("Lures");
export const socialProfileCol = createCollection<SocialProfile>("SocialProfiles");
export const usernameIndexCol = createCollection<UsernameIndex>("UsernameIndex");
export const adminsCol = createCollection<AdminProfile>("Admins");
export const friendRequestCol = createCollection<FriendRequest>("FriendRequests");
export const dailyCatchEventCol = createCollection<DailyCatchEvent>("DailyCatchEvents");

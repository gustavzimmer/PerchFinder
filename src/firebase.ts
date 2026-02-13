import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  collection,
  CollectionReference,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type DocumentData,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { WaterLocation, WaterRequest } from "./types/Map.types";
import { Catch } from "./types/Catch.types";

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

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

export const storage = getStorage(app);

export const auth = getAuth(app);

const createCollection = <T = DocumentData>(collectionName: string) => {
  return collection(db, collectionName) as CollectionReference<T>;
};

export const waterCol = createCollection<WaterLocation>("FiskeVatten");
export const waterRequestCol = createCollection<WaterRequest>("FiskeVattenRequests");
export const catchCol = createCollection<Catch>("Fangster");

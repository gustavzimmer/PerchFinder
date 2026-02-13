import {
  CollectionReference,
  doc,
  DocumentSnapshot,
  getDoc,
  getDocFromCache,
} from "firebase/firestore";
import { createEffect, createSignal, onCleanup } from "solid-js";

const useGetDocument = <T>(
  colRef: CollectionReference<T>,
  documentId: string | undefined
) => {
  const [data, setData] = createSignal<(T & { _id: string }) | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [isLoading, setIsLoading] = createSignal(true);

  createEffect(() => {
    let isActive = true;
    const id = documentId;

    if (!id) {
      setError("Saknar dokument-id.");
      setData(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const docRef = doc(colRef, id);

    const applySnapshot = (snapshot: DocumentSnapshot<T>) => {
      if (!snapshot.exists()) {
        setError("Document not found");
        setData(null);
        setIsLoading(false);
        return;
      }

      const docData = {
        ...snapshot.data(),
        _id: snapshot.id,
      } as T & { _id: string };

      setData(() => docData);
      setIsLoading(false);
    };

    const loadData = async () => {
      try {
        const cachedSnapshot = await getDocFromCache(docRef);
        if (!isActive) return;
        applySnapshot(cachedSnapshot);
        return;
      } catch {
        // No cache available, fall back to server.
      }

      try {
        const serverSnapshot = await getDoc(docRef);
        if (!isActive) return;
        applySnapshot(serverSnapshot);
      } catch {
        if (!isActive) return;
        setError("Kunde inte hämta dokument.");
        setIsLoading(false);
      }
    };

    void loadData();

    onCleanup(() => {
      isActive = false;
    });
  });

  return {
    data,
    error,
    isLoading,
  };
};

export default useGetDocument;

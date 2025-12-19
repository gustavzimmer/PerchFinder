import { CollectionReference, doc, onSnapshot } from "firebase/firestore";
import { createEffect, createSignal, onCleanup } from "solid-js";

const useGetDocument = <T>(
  colRef: CollectionReference<T>,
  documentId: string | undefined
) => {
  const [data, setData] = createSignal<(T & { _id: string }) | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [isLoading, setIsLoading] = createSignal(true);

  createEffect(() => {
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

    const unsubscribe = onSnapshot(docRef, (snapshot) => {
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
    });

    onCleanup(() => unsubscribe());
  });

  return {
    data,
    error,
    isLoading,
  };
};

export default useGetDocument;

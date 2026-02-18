import { Accessor, createEffect, createSignal, onCleanup } from "solid-js";
import { getDocs, getDocsFromCache, query, where } from "firebase/firestore";
import { catchCol } from "../firebase";
import type { Catch } from "../types/Catch.types";

const useGetUserCatches = (userId: Accessor<string | null>) => {
  const [data, setData] = createSignal<(Catch & { _id: string })[] | null>(null);
  const [isLoading, setIsLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  createEffect(() => {
    const id = userId();
    let isActive = true;

    if (!id) {
      setData(null);
      setIsLoading(false);
      return;
    }

    const queryRef = query(catchCol, where("userId", "==", id));

    const applySnapshot = (snapshot: Awaited<ReturnType<typeof getDocs>>) => {
      const list = snapshot.docs.map((doc) => ({
        ...(doc.data() as Catch),
        _id: doc.id,
      })) as (Catch & { _id: string })[];

      setData(list);
      setIsLoading(false);
    };

    const loadData = async () => {
      setIsLoading(true);
      setError(null);
      let hasCacheResult = false;

      try {
        const cachedSnapshot = await getDocsFromCache(queryRef);
        if (!isActive) return;
        applySnapshot(cachedSnapshot);
        hasCacheResult = true;
      } catch {
        // No cache available, fall back to server.
      }

      try {
        const serverSnapshot = await getDocs(queryRef);
        if (!isActive) return;
        applySnapshot(serverSnapshot);
      } catch (err) {
        if (!isActive) return;
        console.error("Kunde inte hämta användarfångster", err);
        if (!hasCacheResult) {
          setError("Kunde inte hämta dina fångster just nu.");
        }
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
    isLoading,
    error,
  };
};

export default useGetUserCatches;

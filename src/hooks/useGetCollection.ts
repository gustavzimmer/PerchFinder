import {
  CollectionReference,
  getDocs,
  getDocsFromCache,
  query,
  QueryConstraint,
  QuerySnapshot,
} from "firebase/firestore";
import { FirebaseError } from "firebase/app";
import { createEffect, createSignal, onCleanup } from "solid-js";

const useGetCollection = <T> (
    colRef: CollectionReference<T>,
    ...queryConstraints: QueryConstraint[]
) => {
    const [data, setData] = createSignal<(T & { _id: string })[] | null>(null);
    const [isLoading, setIsLoading] = createSignal(true);
    const [error, setError] = createSignal<string | null>(null);

    createEffect(() => {
        let isActive = true;
        const queryRef = query(colRef, ...queryConstraints);

        const applySnapshot = (snapshot: QuerySnapshot<T>) => {
            const data = snapshot.docs.map((doc) => {
                return {
                    ...doc.data(),
                    _id: doc.id,
                };
            });

            setError(null);
            setData(data);
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
                console.error("Kunde inte hämta collection", err);
                if (!hasCacheResult) {
                    if (err instanceof FirebaseError && err.code === "permission-denied") {
                        setError("permission-denied");
                    } else {
                        setError("Kunde inte hämta data.");
                    }
                }
                setIsLoading(false);
            }
        };

        void loadData();

        onCleanup(() => {
            isActive = false;
        });
    });

    return{
        data,
        isLoading,
        error,
    }
}

export default useGetCollection;

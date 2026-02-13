import {
  CollectionReference,
  getDocs,
  getDocsFromCache,
  query,
  QueryConstraint,
  QuerySnapshot,
} from "firebase/firestore";
import { createEffect, createSignal, onCleanup } from "solid-js";

const useGetCollection = <T> (
    colRef: CollectionReference<T>,
    ...queryConstraints: QueryConstraint[]
) => {
    const [data, setData] = createSignal<(T & { _id: string })[] | null>(null);
    const [isLoading, setIsLoading] = createSignal(true)

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

            setData(data);
            setIsLoading(false);
        };

        const loadData = async () => {
            setIsLoading(true);

            try {
                const cachedSnapshot = await getDocsFromCache(queryRef);
                if (!isActive) return;
                applySnapshot(cachedSnapshot);
                return;
            } catch {
                // No cache available, fall back to server.
            }

            try {
                const serverSnapshot = await getDocs(queryRef);
                if (!isActive) return;
                applySnapshot(serverSnapshot);
            } catch {
                if (!isActive) return;
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
        isLoading
    }
}

export default useGetCollection;

import {
  CollectionReference,
  onSnapshot,
  query,
  QueryConstraint,
} from "firebase/firestore";
import { createEffect, createSignal, onCleanup } from "solid-js";

const useGetCollection = <T> (
    colRef: CollectionReference<T>,
    ...queryConstraints: QueryConstraint[]
) => {
    const [data, setData] = createSignal<(T & { _id: string })[] | null>(null);
    const [isLoading, setIsLoading] = createSignal(true)

    createEffect(() => {
        const queryRef = query(colRef, ...queryConstraints);

        const unSub = onSnapshot(queryRef, (snapshot) => {
            const data = snapshot.docs.map((doc) => {
                return {
                    ...doc.data(),
                    _id: doc.id,
                };
            });

            setData(data);
            setIsLoading(false);
        });

        onCleanup(() => unSub());
    });

    return{
        data,
        isLoading
    }
}

export default useGetCollection;

import { orderBy, where } from "firebase/firestore";
import { Accessor } from "solid-js";
import { catchCol } from "../firebase";
import { Catch } from "../types/Catch.types";
import useGetCollection from "./useGetCollection";

export const useGetCatches = (waterId: Accessor<string>) => {
  return useGetCollection<Catch>(
    catchCol,
    where("waterId", "==", waterId()),
    orderBy("caughtAt", "desc")
  );
};

export default useGetCatches;

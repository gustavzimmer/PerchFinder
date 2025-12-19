import { orderBy, where } from "firebase/firestore";
import { catchCol } from "../firebase";
import { Catch } from "../types/Catch.types";
import useGetCollection from "./useGetCollection";



export const useGetCatches = (waterId: string) => {
  return useGetCollection<Catch>(
    catchCol,
    where("waterId", "==", waterId),
    orderBy("caughtAt", "desc")
  );
}

export default useGetCatches
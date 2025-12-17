import { waterCol } from "../firebase";
import { WaterLocation } from "../types/Map.types";
import useGetCollection from "./useGetCollection";

const useGetWaters = () => {
    return useGetCollection<WaterLocation>(waterCol);
};

export default useGetWaters;

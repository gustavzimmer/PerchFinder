import { waterCol } from "../firebase";
import { WaterLocation } from "../types/Map.types";
import useGetDocument from "./useGetDocument";

const useGetSingleWater = (waterId: string) => {
    return useGetDocument<WaterLocation>(waterCol, waterId);
};

export default useGetSingleWater;

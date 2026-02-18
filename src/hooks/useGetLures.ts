import { createMemo } from "solid-js";
import { lureCol } from "../firebase";
import type { LureOption } from "../types/Catch.types";
import useGetCollection from "./useGetCollection";

const hasCompleteLureInfo = (lure: LureOption) => {
  const fields = [lure.name, lure.brand, lure.type, lure.size, lure.color];
  if (fields.some((field) => !field || !field.trim())) return false;
  return !fields.some((field) => /varierar/i.test(field));
};

const useGetLures = () => {
  const result = useGetCollection<LureOption>(lureCol);

  const data = createMemo(() => {
    const list = result.data() ?? [];
    return list.filter(hasCompleteLureInfo);
  });

  return {
    data,
    isLoading: result.isLoading,
    error: result.error,
  };
};

export default useGetLures;

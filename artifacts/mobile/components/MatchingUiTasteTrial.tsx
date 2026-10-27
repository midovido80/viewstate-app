import { createContext, useContext } from "react";

/** Temporary presentation experiment; the approved baseline lives at 30fcd58. */
export const MatchingUiTasteTrial = createContext(true);
export const useMatchingUiTasteTrial = () => useContext(MatchingUiTasteTrial);

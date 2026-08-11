import { create } from "zustand";
import type { BrokerPosition } from "@/types/broker";

interface SelectedPositionState {
  position: BrokerPosition | null;
  setPosition: (pos: BrokerPosition | null) => void;
}

export const useSelectedPositionStore = create<SelectedPositionState>((set) => ({
  position: null,
  setPosition: (position) => set({ position }),
}));

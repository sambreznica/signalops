import {
  CURRENT_WINDOW_END,
  CURRENT_WINDOW_START,
  PRIOR_WINDOW_END,
  PRIOR_WINDOW_START,
} from "../../fixtures/constants";

export const WINDOW_LABELS = ["current", "prior"] as const;
export type WindowLabel = (typeof WINDOW_LABELS)[number];

export type WindowResolved = {
  label: WindowLabel;
  start: string;
  end: string;
};

export function resolveWindow(label: WindowLabel): WindowResolved {
  if (label === "current") {
    return {
      label,
      start: CURRENT_WINDOW_START,
      end: CURRENT_WINDOW_END,
    };
  }
  return {
    label,
    start: PRIOR_WINDOW_START,
    end: PRIOR_WINDOW_END,
  };
}

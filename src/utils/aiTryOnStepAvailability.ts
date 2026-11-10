import { useEffect, useRef, useState } from "react";
import type { AiTryOnAvailabilityDetails } from "../services/aiTryOnGateway";

/**
 * What the AI Try-on step should show.
 *
 * A previous "unavailable" answer is not shown again while a new check is
 * still running. That was the few-second flash of the old unavailable page
 * when the customer came back to the step. A settled "unavailable" answer
 * still shows. An in-flight check does not hide a step that is already
 * available.
 */
export type AiTryOnReportedAvailabilityStatus = "unknown" | "available" | "unavailable";

export type AiTryOnStepAvailability = "checking" | "available" | "unavailable";

/** Controls stay on screen while a check runs. A settled unavailable answer hides them. */
export const aiTryOnControlsVisible = (availability: AiTryOnStepAvailability): boolean =>
  availability !== "unavailable";

/** A preview request is allowed only after availability has settled as available. */
export const aiTryOnGenerationEnabled = (availability: AiTryOnStepAvailability): boolean =>
  availability === "available";

export const resolveAiTryOnStepAvailability = ({
  reported,
  checkInFlight,
  inputFingerprintPending = false,
}: {
  reported: AiTryOnReportedAvailabilityStatus;
  checkInFlight: boolean;
  inputFingerprintPending?: boolean;
}): AiTryOnStepAvailability => {
  if (inputFingerprintPending || reported === "unknown") return "checking";
  if (checkInFlight && reported === "unavailable") return "checking";
  return reported;
};

export type AiTryOnReportedAvailability = AiTryOnAvailabilityDetails | { status: "unknown" };

/**
 * Loads try-on availability while the step is open.
 * `reloadKey` changes when the customer or draft identity changes.
 * `load` is read from a ref so a new function each render does not refetch.
 */
export const useAiTryOnStepAvailability = ({
  active,
  reloadKey,
  load,
}: {
  active: boolean;
  reloadKey: string;
  load: () => Promise<AiTryOnAvailabilityDetails>;
}) => {
  const [details, setDetails] = useState<AiTryOnReportedAvailability>({ status: "unknown" });
  const [checkInFlight, setCheckInFlight] = useState(false);
  const requestRef = useRef(0);
  const wasActiveRef = useRef(false);
  const loadRef = useRef(load);
  loadRef.current = load;

  // Entering the step with a leftover unavailable answer: hide it before paint.
  if (active && !wasActiveRef.current) {
    wasActiveRef.current = true;
    if (details.status !== "available" && !checkInFlight) {
      setCheckInFlight(true);
    }
  } else if (!active && wasActiveRef.current) {
    wasActiveRef.current = false;
  }

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const requestId = ++requestRef.current;
    setCheckInFlight(true);
    void loadRef.current().then((availability) => {
      if (cancelled || requestId !== requestRef.current) return;
      setDetails(availability);
      setCheckInFlight(false);
    });
    return () => {
      cancelled = true;
    };
  }, [active, reloadKey]);

  const reported: AiTryOnReportedAvailabilityStatus =
    details.status === "available" || details.status === "unavailable" ? details.status : "unknown";

  return {
    details,
    setDetails,
    checkInFlight,
    /** Ignores a check still running and shows the real unavailable page. */
    reportUnavailable: () => {
      requestRef.current += 1;
      setDetails({ status: "unavailable" });
      setCheckInFlight(false);
    },
    availability: resolveAiTryOnStepAvailability({ reported, checkInFlight }),
  };
};

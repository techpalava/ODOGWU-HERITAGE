import { ArrowLeft, ArrowRight, LockKeyhole, Users } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import type { BusinessSettings } from "../types";

export interface PrivateBatchSetupValues {
  readonly batchName: string;
  readonly occasion: string;
  readonly description: string;
  readonly country: string;
  readonly city: string;
  readonly preferredDeliveryMonth: string;
  readonly expectedParticipants: number;
  readonly closingDate: string;
}

export type PrivateBatchSetupSubmission =
  | Readonly<{ status: "created" | "requires_sign_in" | "requires_draft_resolution" }>
  | Readonly<{ status: "error"; message: string }>;

const fieldClassName =
  "mt-1 min-h-11 w-full rounded-xl border border-heritage-green/20 bg-white px-3 py-2 text-sm text-heritage-ink outline-none transition focus:border-heritage-gold focus:ring-2 focus:ring-heritage-gold/30 disabled:cursor-wait disabled:opacity-60";

export const PrivateBatchSetupView = ({
  businessSettings,
  onBack,
  onSubmit,
  externalError = null,
}: {
  businessSettings: BusinessSettings;
  onBack: () => void;
  onSubmit: (values: PrivateBatchSetupValues) => Promise<PrivateBatchSetupSubmission>;
  externalError?: string | null;
}) => {
  const [batchName, setBatchName] = useState("");
  const [occasion, setOccasion] = useState("");
  const [description, setDescription] = useState("");
  const [country, setCountry] = useState(
    businessSettings.applicationSettings.defaultCountry || "",
  );
  const [city, setCity] = useState("");
  const [preferredDeliveryMonth, setPreferredDeliveryMonth] = useState("");
  const [expectedParticipants, setExpectedParticipants] = useState(
    businessSettings.batchSettings.minParticipantsRequired,
  );
  const [closingDate, setClosingDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionInFlight = useRef(false);

  const minParticipants = businessSettings.batchSettings.minParticipantsRequired;
  const maxParticipants = businessSettings.batchSettings.maxGarmentsPerBatch;
  const displayedError = error || externalError;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submissionInFlight.current) return;
    setError(null);
    if (!batchName.trim()) {
      setError("Please enter a name for your Private Batch.");
      return;
    }
    if (!occasion.trim()) {
      setError("Please tell us what the batch is for.");
      return;
    }
    if (!country.trim() || !city.trim()) {
      setError("Please enter the delivery country and city.");
      return;
    }
    if (!preferredDeliveryMonth) {
      setError("Please choose your delivery target month.");
      return;
    }
    if (!closingDate) {
      setError("Please choose when member ordering should close.");
      return;
    }
    if (
      !Number.isSafeInteger(expectedParticipants) ||
      expectedParticipants < minParticipants ||
      expectedParticipants > maxParticipants
    ) {
      setError(
        `Expected participants must be between ${minParticipants} and ${maxParticipants}.`,
      );
      return;
    }

    submissionInFlight.current = true;
    setIsSubmitting(true);
    try {
      const result = await onSubmit({
        batchName: batchName.trim(),
        occasion: occasion.trim(),
        description: description.trim(),
        country: country.trim(),
        city: city.trim(),
        preferredDeliveryMonth,
        expectedParticipants,
        closingDate,
      });
      if (result.status === "error") setError(result.message);
    } catch {
      setError("We couldn't create your Private Batch. Your details have been kept so you can try again.");
    } finally {
      submissionInFlight.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <section
      aria-labelledby="private-batch-setup-title"
      data-private-batch-setup="true"
      className="mx-auto max-w-2xl"
    >
      <button
        type="button"
        onClick={onBack}
        disabled={isSubmitting}
        className="mb-5 inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-heritage-green transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold disabled:opacity-50"
      >
        <ArrowLeft size={16} aria-hidden="true" /> Back to home
      </button>
      <div className="overflow-hidden rounded-3xl border border-heritage-gold/25 bg-white shadow-sm">
        <header className="bg-heritage-green px-5 py-6 text-white sm:px-8 sm:py-8">
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-heritage-gold/15 text-heritage-gold">
              <LockKeyhole size={20} aria-hidden="true" />
            </span>
            <div>
              <h1 id="private-batch-setup-title" className="font-display text-3xl font-bold">
                Create a Private Batch
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-heritage-beige">
                Create a private ordering group for your family, friends, colleagues or community. You will be the organizer and only invited members can join.
              </p>
            </div>
          </div>
        </header>

        <form onSubmit={submit} noValidate className="space-y-5 p-5 sm:p-8">
          {displayedError ? (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-900">
              {displayedError}
            </p>
          ) : null}
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block min-w-0 text-sm font-semibold text-heritage-green sm:col-span-2">
              Private Batch Name <span aria-hidden="true">*</span>
              <input data-testid="private-batch-name" value={batchName} onChange={(event) => setBatchName(event.target.value)} disabled={isSubmitting} className={fieldClassName} autoComplete="off" />
            </label>
            <label className="block min-w-0 text-sm font-semibold text-heritage-green sm:col-span-2">
              Occasion / Purpose <span aria-hidden="true">*</span>
              <input data-testid="private-batch-occasion" value={occasion} onChange={(event) => setOccasion(event.target.value)} disabled={isSubmitting} className={fieldClassName} autoComplete="off" />
            </label>
            <label className="block min-w-0 text-sm font-semibold text-heritage-green">
              Country <span aria-hidden="true">*</span>
              <input data-testid="private-batch-country" value={country} onChange={(event) => setCountry(event.target.value)} disabled={isSubmitting} className={fieldClassName} autoComplete="country-name" />
            </label>
            <label className="block min-w-0 text-sm font-semibold text-heritage-green">
              City <span aria-hidden="true">*</span>
              <input data-testid="private-batch-city" value={city} onChange={(event) => setCity(event.target.value)} disabled={isSubmitting} className={fieldClassName} autoComplete="address-level2" />
            </label>
            <label className="block min-w-0 text-sm font-semibold text-heritage-green">
              Delivery Target <span aria-hidden="true">*</span>
              <input data-testid="private-batch-delivery-target" type="month" value={preferredDeliveryMonth} onChange={(event) => setPreferredDeliveryMonth(event.target.value)} disabled={isSubmitting} className={fieldClassName} />
            </label>
            <label className="block min-w-0 text-sm font-semibold text-heritage-green">
              Expected Participants <span aria-hidden="true">*</span>
              <input data-testid="private-batch-participants" type="number" min={minParticipants} max={maxParticipants} value={expectedParticipants} onChange={(event) => setExpectedParticipants(Number(event.target.value))} disabled={isSubmitting} className={fieldClassName} />
              <span className="mt-1 block text-xs font-normal text-heritage-ink/60">{minParticipants}–{maxParticipants} participants</span>
            </label>
            <label className="block min-w-0 text-sm font-semibold text-heritage-green sm:col-span-2">
              Ordering Closes <span aria-hidden="true">*</span>
              <input data-testid="private-batch-closing-date" type="date" value={closingDate} onChange={(event) => setClosingDate(event.target.value)} disabled={isSubmitting} className={fieldClassName} />
            </label>
            <label className="block min-w-0 text-sm font-semibold text-heritage-green sm:col-span-2">
              Description <span className="font-normal text-heritage-ink/55">(Optional)</span>
              <textarea data-testid="private-batch-description" value={description} onChange={(event) => setDescription(event.target.value)} disabled={isSubmitting} className={`${fieldClassName} min-h-24 resize-y`} maxLength={2000} />
            </label>
          </div>
          <div className="border-t border-heritage-gold/15 pt-5">
            <button
              data-testid="create-private-batch-submit"
              type="submit"
              disabled={isSubmitting}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-heritage-green px-5 py-3 text-sm font-bold uppercase tracking-wide text-white transition hover:bg-heritage-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
            >
              {isSubmitting ? "Creating Private Batch..." : "Create Private Batch"}
              {!isSubmitting && <ArrowRight size={17} aria-hidden="true" />}
            </button>
            <p className="mt-3 flex gap-2 text-xs leading-relaxed text-heritage-ink/65">
              <Users size={15} className="mt-0.5 shrink-0 text-heritage-gold" aria-hidden="true" />
              You will be the organizer of this private batch. Only invited members will be able to join.
            </p>
          </div>
        </form>
      </div>
    </section>
  );
};

export default PrivateBatchSetupView;

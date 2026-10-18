import { useId, useState } from "react";

const copyText = async (value: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
};

/**
 * The saved email/WhatsApp script and its one follow-up. Staff copy and send
 * these themselves. This component never sends a message.
 */
export const PersonalizedAdditionContactScript = ({
  customerName,
  message,
  followUp,
}: {
  customerName: string;
  message: string;
  followUp: string;
}) => {
  const messageId = useId();
  const followUpId = useId();
  const [copied, setCopied] = useState<"message" | "followUp" | null>(null);
  if (!message.trim()) return null;
  const copy = async (kind: "message" | "followUp", value: string) => {
    const ok = await copyText(value);
    setCopied(ok ? kind : null);
  };
  return (
    <div
      data-admin-v2-contact-script
      className="space-y-3 rounded-xl border border-heritage-gold/30 bg-white p-3 text-left"
    >
      <p className="font-bold text-heritage-green">
        Contact script for {customerName.trim() || "the customer"}
      </p>
      <p className="text-heritage-ink/70">
        Copy the message and send it by email or WhatsApp yourself. Nothing is sent automatically.
        If there is no reply, send the follow-up once, then leave the addition off.
      </p>
      <label className="block font-bold text-heritage-green" htmlFor={messageId}>
        Email / WhatsApp message
      </label>
      <textarea
        id={messageId}
        readOnly
        value={message}
        data-admin-v2-contact-message
        className="h-40 w-full resize-y rounded-lg border border-heritage-gold/20 bg-heritage-forest/5 px-3 py-2 font-sans text-xs"
      />
      <button
        type="button"
        data-admin-v2-contact-copy-message
        onClick={() => void copy("message", message)}
        className="rounded-lg border border-heritage-green/30 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-heritage-green"
      >
        {copied === "message" ? "Copied" : "Copy message"}
      </button>
      <label className="block font-bold text-heritage-green" htmlFor={followUpId}>
        Follow-up reminder (send once)
      </label>
      <textarea
        id={followUpId}
        readOnly
        value={followUp}
        data-admin-v2-contact-follow-up
        className="h-32 w-full resize-y rounded-lg border border-heritage-gold/20 bg-heritage-forest/5 px-3 py-2 font-sans text-xs"
      />
      <button
        type="button"
        data-admin-v2-contact-copy-follow-up
        onClick={() => void copy("followUp", followUp)}
        className="rounded-lg border border-heritage-green/30 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-heritage-green"
      >
        {copied === "followUp" ? "Copied" : "Copy follow-up"}
      </button>
    </div>
  );
};

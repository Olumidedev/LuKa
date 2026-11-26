"use client";

import { useState } from "react";
import { track } from "@/lib/analytics";
import { Button, Label, Segmented, Sheet, cx, inputCls, useToast } from "./ui";

type Kind = "problem" | "idea" | "other";

/** Sends feedback to the admin area (Errors & feedback). */
export function FeedbackSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [kind, setKind] = useState<Kind>("problem");
  const [message, setMessage] = useState("");

  const send = () => {
    const m = message.trim();
    if (m.length < 5) return;
    track("feedback", { kind, message: m, screen: `${window.innerWidth}x${window.innerHeight}` });
    setMessage("");
    onClose();
    toast({ text: "Thanks. Your note went straight to the LUKA team." });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Tell us what happened"
      footer={
        <div className="flex justify-end">
          <Button variant="primary" onClick={send} disabled={message.trim().length < 5}>
            Send
          </Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <Segmented<Kind>
          value={kind}
          onChange={setKind}
          options={[
            { value: "problem", label: "Something's wrong" },
            { value: "idea", label: "An idea" },
            { value: "other", label: "Other" },
          ]}
        />
        <div>
          <Label htmlFor="feedback-msg">{kind === "problem" ? "What were you doing, and what went wrong?" : "Your message"}</Label>
          <textarea id="feedback-msg" rows={6} maxLength={2000} className={cx(inputCls, "h-auto py-2")} value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>
        <p className="text-[13px] text-muted">If you&apos;re signed in, we&apos;ll see your email so we can reply. Please don&apos;t include health details.</p>
      </div>
    </Sheet>
  );
}

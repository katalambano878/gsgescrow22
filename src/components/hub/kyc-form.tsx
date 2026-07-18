"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Upload, ShieldCheck, X, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { submitKyc } from "@/lib/actions/kyc";

type DocType = "ghana_card" | "passport" | "drivers_license" | "voter_id";

const DOC_LABELS: Record<DocType, string> = {
  ghana_card: "Ghana Card",
  passport: "Passport",
  drivers_license: "Driver's License",
  voter_id: "Voter's ID",
};

type Upload = { path: string; name: string; size: number } | null;

export function KycForm({
  current,
}: {
  current: { kycStatus: string; legalName?: string | null };
}) {
  const [docType, setDocType] = useState<DocType>("ghana_card");
  const [legalName, setLegalName] = useState(current.legalName ?? "");
  const [docNumber, setDocNumber] = useState("");
  const [front, setFront] = useState<Upload>(null);
  const [back, setBack] = useState<Upload>(null);
  const [selfie, setSelfie] = useState<Upload>(null);
  const [isPending, startTransition] = useTransition();

  const locked = current.kycStatus === "pending" || current.kycStatus === "approved";

  function submit() {
    if (!legalName || !front) {
      toast.error("Legal name and the front of your document are required");
      return;
    }
    startTransition(async () => {
      const r = await submitKyc({
        legalName,
        docType,
        docNumber,
        docFrontPath: front?.path,
        docBackPath: back?.path,
        selfiePath: selfie?.path,
      });
      if (!r.ok) toast.error(r.error ?? "Couldn't submit");
      else toast.success("KYC submitted — we'll review within 2 business days");
    });
  }

  if (current.kycStatus === "approved") {
    return (
      <Card className="p-6 bg-[var(--primary-soft)] border-[var(--border-strong)]">
        <div className="flex items-center gap-3">
          <ShieldCheck size={20} className="text-[var(--primary)]" />
          <div>
            <p className="font-display font-semibold text-[var(--primary)]">You&rsquo;re verified.</p>
            <p className="text-sm text-[var(--primary)]/80 mt-0.5">
              Trust Badge enabled. Payouts above the soft-launch cap unlocked.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  if (current.kycStatus === "pending") {
    return (
      <Card className="p-6 bg-[#fbf2dd] border-[#ecdba8]">
        <p className="font-display font-semibold text-[#7a5410]">Review in progress</p>
        <p className="text-sm text-[#7a5410]/90 mt-1">
          We received your documents. An SBBS reviewer will approve or come back with questions within 2 business days.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <Label required>Legal name</Label>
          <Input
            placeholder="As shown on your ID"
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            disabled={locked}
          />
        </div>
        <div>
          <Label>Document type</Label>
          <select
            className="h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-[15px]"
            value={docType}
            onChange={(e) => setDocType(e.target.value as DocType)}
          >
            {(Object.keys(DOC_LABELS) as DocType[]).map((k) => (
              <option key={k} value={k}>
                {DOC_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <Label>Document number</Label>
          <Input
            placeholder="Optional"
            value={docNumber}
            onChange={(e) => setDocNumber(e.target.value)}
          />
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <FileSlot label="Front of document" value={front} onChange={setFront} subKey="front" required />
        <FileSlot label="Back of document" value={back} onChange={setBack} subKey="back" />
        <FileSlot label="Selfie" value={selfie} onChange={setSelfie} subKey="selfie" />
      </div>

      <div className="rounded-md bg-[var(--surface-muted)] p-3 text-xs text-[var(--muted)]">
        Files are uploaded directly to a private Supabase bucket via a signed URL
        valid for 5 minutes. SBBS staff can only see them through an admin review tool that audit-logs every access.
      </div>

      <Button onClick={submit} loading={isPending} size="lg">
        Submit for review
      </Button>
    </div>
  );
}

function FileSlot({
  label,
  value,
  onChange,
  subKey,
  required,
}: {
  label: string;
  value: Upload;
  onChange: (v: Upload) => void;
  subKey: string;
  required?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const inputId = `file-${subKey}`;

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const res = await fetch("/api/upload/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "kyc",
          fileName: file.name,
          mime: file.type,
          sizeBytes: file.size,
          subKey,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        signedUrl?: string;
        path?: string;
        error?: string;
      };
      if (!data.ok || !data.signedUrl || !data.path) {
        toast.error(data.error ?? "Couldn't prepare upload");
        return;
      }
      const upload = await fetch(data.signedUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!upload.ok) {
        toast.error("Upload failed");
        return;
      }
      onChange({ path: data.path, name: file.name, size: file.size });
      toast.success(`${file.name} uploaded`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <Label required={required}>{label}</Label>
      {value ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--primary)]/30 bg-[var(--primary-soft)] p-3 flex items-center gap-2">
          <FileText size={16} className="text-[var(--primary)] shrink-0" />
          <span className="text-xs truncate flex-1">{value.name}</span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[var(--muted)] hover:text-[var(--danger)]"
            aria-label="Remove"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className="flex flex-col items-center justify-center rounded-[var(--radius-md)] border-2 border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)]/40 p-4 cursor-pointer hover:border-[var(--primary)]/50 hover:bg-[var(--primary-soft)]/30 transition-colors"
        >
          <Upload size={18} className="text-[var(--muted)]" />
          <span className="mt-2 text-xs font-medium text-[var(--muted)]">
            {uploading ? "Uploading…" : "Click to upload"}
          </span>
          <span className="mt-0.5 text-[10px] text-[var(--muted)]">JPG, PNG, PDF — up to 12MB</span>
        </label>
      )}
      <input
        id={inputId}
        type="file"
        accept="image/*,.pdf"
        className="sr-only"
        disabled={uploading}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
    </div>
  );
}

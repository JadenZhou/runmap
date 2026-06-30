import { useRef, useState } from "react";
import { uploadActivity } from "../api";

interface Props {
  onUploaded: () => void;
}

export default function UploadButton({ onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setStatus(null);
    try {
      const r = await uploadActivity(file);
      setStatus(`Added ${r.tracks} track(s), ${r.points} points.`);
      onUploaded();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section className="panel">
      <h2>Upload activity</h2>
      <input
        ref={inputRef}
        type="file"
        accept=".gpx,.tcx,application/gpx+xml"
        onChange={handleFile}
        disabled={busy}
      />
      <p className="hint">GPX or TCX — folds into the heatmap on upload.</p>
      {status && <p className="hint">{status}</p>}
    </section>
  );
}

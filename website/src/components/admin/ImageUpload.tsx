import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";

const BUCKET = "website";
const MAX_SIZE_MB = 5;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];

type ImageUploadProps = {
  label: string;
  value: string;
  onChange: (url: string) => void;
  folder: string;
  accept?: string;
};

export function ImageUpload({ label, value, onChange, folder, accept = "image/*" }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      toast.error(`File must be under ${MAX_SIZE_MB}MB`);
      return;
    }
    if (ALLOWED_TYPES.length && !ALLOWED_TYPES.includes(file.type)) {
      toast.error("Allowed: JPEG, PNG, GIF, WebP, SVG");
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${folder}/${crypto.randomUUID()}.${ext}`;
    const { data, error } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });
    setUploading(false);
    if (error) {
      toast.error(error.message || "Upload failed");
      return;
    }
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path);
    onChange(urlData.publicUrl);
    toast.success("Image uploaded");
    e.target.value = "";
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Paste URL or upload below"
          className="flex-1"
        />
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={handleFile}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Upload
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="icon" onClick={() => onChange("")} aria-label="Clear">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      {value && (
        <div className="rounded border overflow-hidden max-w-[200px]">
          <img src={value} alt="Preview of uploaded image" className="w-full h-auto object-cover" />
        </div>
      )}
    </div>
  );
}

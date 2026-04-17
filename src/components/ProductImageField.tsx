import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStorePlan } from "@/hooks/useStorePlan";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, Loader2, X, Crown } from "lucide-react";
import { toast } from "sonner";

interface Props {
  value: string;
  onChange: (url: string) => void;
  storeId?: string;
}

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif"];

const ProductImageField = ({ value, onChange, storeId }: Props) => {
  const { plan, loading } = useStorePlan();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const canUpload = !loading && (plan === "pro" || plan === "business");
  const isFreePlan = !loading && !canUpload;

  const handleFile = async (file: File) => {
    if (!canUpload) {
      toast.error("Image upload requires Pro or Business plan");
      return;
    }
    if (!storeId) {
      toast.error("Select a store first");
      return;
    }
    if (!ALLOWED.includes(file.type)) {
      toast.error("Only PNG, JPG, WEBP, or GIF allowed");
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error("Image must be under 5MB");
      return;
    }

    setUploading(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `${storeId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("product-images")
      .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });

    if (error) {
      toast.error(error.message);
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from("product-images").getPublicUrl(path);
    onChange(data.publicUrl);
    toast.success("Image uploaded");
    setUploading(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Product Image</Label>
        {isFreePlan && (
          <Badge variant="outline" className="gap-1 text-xs">
            <Crown className="h-3 w-3" />
            Upload requires Pro
          </Badge>
        )}
      </div>

      {canUpload && (
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept={ALLOWED.join(",")}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="gap-2"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? "Uploading..." : "Upload Image"}
          </Button>
          {value && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")} className="gap-1">
              <X className="h-4 w-4" /> Remove
            </Button>
          )}
        </div>
      )}

      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={loading ? "https://..." : canUpload ? "Or paste image URL — https://..." : "https://... (Free plan: URL only)"}
      />

      {value && (
        <img
          src={value}
          alt="Preview"
          className="h-20 w-20 rounded-lg border object-cover"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      )}
    </div>
  );
};

export default ProductImageField;

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Pencil, Eye, Sparkles, Plus, Trash2, Type, MousePointerClick,
  Variable, TestTube, Copy, CheckCircle2, Palette, LayoutTemplate, GripVertical,
  Bold, AlignLeft, Mail, X, FileText
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────
interface EmailTemplate {
  id?: string;
  store_id: string;
  user_id: string;
  template_type: string;
  subject: string;
  body: string;
  is_active: boolean;
}

interface CTAButton {
  text: string;
  url: string;
  color: string;
  style: "solid" | "outline";
}

interface TemplateBlock {
  id: string;
  type: "text" | "heading" | "cta" | "divider" | "spacer" | "image";
  content: string;
  align?: "left" | "center" | "right";
  cta?: CTAButton;
}

interface EmailTemplateEditorProps {
  templates: EmailTemplate[];
  storeId: string;
  userId: string;
  senderEmail?: string;
  senderName?: string;
  onSave: () => void;
}

// ─── Constants ────────────────────────────────────────────
const DEFAULT_TEMPLATES: Record<string, { subject: string; body: string }> = {
  first_reminder: {
    subject: "Subscription Expiring Soon - {{product_name}}",
    body: "Hi {{customer_name}},\n\nYour subscription for \"{{product_name}}\" will expire on {{expiry_date}}.\n\nPlease renew to continue enjoying our services.\n\nThank you!",
  },
  second_reminder: {
    subject: "Reminder: {{product_name}} Expiring Tomorrow",
    body: "Hi {{customer_name}},\n\nThis is a reminder that your subscription for \"{{product_name}}\" expires tomorrow ({{expiry_date}}).\n\nRenew now to avoid service interruption.\n\nThank you!",
  },
  final_reminder: {
    subject: "Final Notice: {{product_name}} Expires Today",
    body: "Hi {{customer_name}},\n\nYour subscription for \"{{product_name}}\" expires today ({{expiry_date}}).\n\nPlease renew immediately to continue your service.\n\nThank you!",
  },
  expired: {
    subject: "{{product_name}} Has Expired",
    body: "Hi {{customer_name}},\n\nYour subscription for \"{{product_name}}\" has expired on {{expiry_date}}.\n\nRenew now to restore your service.\n\nThank you!",
  },
  campaign: {
    subject: "Renew Your {{product_name}} Subscription",
    body: "Hi {{customer_name}},\n\nWe noticed your subscription for \"{{product_name}}\" needs renewal.\n\nRenew today for uninterrupted service.\n\nThank you!",
  },
};

const templateLabels: Record<string, string> = {
  first_reminder: "First Reminder (7 days)",
  second_reminder: "Second Reminder (3 days)",
  final_reminder: "Final Reminder (1 day)",
  expired: "Expired Notice",
  campaign: "Campaign Email",
};

const templateIcons: Record<string, string> = {
  first_reminder: "🔔",
  second_reminder: "⏰",
  final_reminder: "🚨",
  expired: "❌",
  campaign: "📣",
};

const VARIABLES = [
  { key: "{{customer_name}}", label: "Customer Name", example: "John Doe" },
  { key: "{{product_name}}", label: "Product Name", example: "Premium Plan" },
  { key: "{{expiry_date}}", label: "Expiry Date", example: "15 Jan 2026" },
  { key: "{{store_name}}", label: "Store Name", example: "My Store" },
  { key: "{{renewal_link}}", label: "Renewal Link", example: "https://example.com/renew" },
  { key: "{{days_left}}", label: "Days Remaining", example: "3" },
];

const CTA_PRESETS = [
  { text: "Renew Now", url: "{{renewal_link}}", color: "#006d5b" },
  { text: "View Order", url: "{{order_link}}", color: "#2563eb" },
  { text: "Pay Now", url: "{{payment_link}}", color: "#16a34a" },
  { text: "Contact Us", url: "{{support_link}}", color: "#7c3aed" },
];

const BRAND_COLORS = [
  "#006d5b", "#0284c7", "#2563eb", "#7c3aed",
  "#c026d3", "#dc2626", "#ea580c", "#16a34a",
];

// ─── Helpers ──────────────────────────────────────────────
const isCustomType = (type: string) => type.startsWith("custom_");

const getTemplateLabel = (type: string, tpl?: EmailTemplate) => {
  if (templateLabels[type]) return templateLabels[type];
  // Custom: use subject as label fallback or stripped id
  return tpl?.subject?.slice(0, 40) || "Custom Template";
};

const getTemplateIcon = (type: string) => templateIcons[type] || "✉️";

const parseBodyToBlocks = (body: string): TemplateBlock[] => {
  if (!body) return [{ id: crypto.randomUUID(), type: "text", content: "", align: "left" }];
  const lines = body.split("\n");
  const blocks: TemplateBlock[] = [];
  let currentText = "";
  for (const line of lines) {
    if (line.startsWith("[CTA:")) {
      if (currentText.trim()) {
        blocks.push({ id: crypto.randomUUID(), type: "text", content: currentText.trim(), align: "left" });
        currentText = "";
      }
      try {
        const json = line.replace("[CTA:", "").replace("]", "");
        const cta = JSON.parse(json);
        blocks.push({ id: crypto.randomUUID(), type: "cta", content: "", cta, align: "center" });
      } catch {
        currentText += line + "\n";
      }
    } else if (line === "---") {
      if (currentText.trim()) {
        blocks.push({ id: crypto.randomUUID(), type: "text", content: currentText.trim(), align: "left" });
        currentText = "";
      }
      blocks.push({ id: crypto.randomUUID(), type: "divider", content: "" });
    } else {
      currentText += line + "\n";
    }
  }
  if (currentText.trim()) {
    blocks.push({ id: crypto.randomUUID(), type: "text", content: currentText.trim(), align: "left" });
  }
  return blocks.length > 0 ? blocks : [{ id: crypto.randomUUID(), type: "text", content: "", align: "left" }];
};

const serializeBlocks = (blocks: TemplateBlock[]): string => {
  return blocks
    .map((b) => {
      if (b.type === "cta" && b.cta) return `[CTA:${JSON.stringify(b.cta)}]`;
      if (b.type === "divider") return "---";
      if (b.type === "spacer") return "\n";
      return b.content;
    })
    .join("\n");
};

// ─── Live Preview Component ───────────────────────────────
const EmailPreview = ({ subject, blocks, senderName, accentColor }: {
  subject: string;
  blocks: TemplateBlock[];
  senderName: string;
  accentColor: string;
}) => {
  const replaceVars = (text: string) =>
    text
      .replace(/\{\{customer_name\}\}/g, "John Doe")
      .replace(/\{\{product_name\}\}/g, "Premium Plan")
      .replace(/\{\{expiry_date\}\}/g, "15 Jan 2026")
      .replace(/\{\{store_name\}\}/g, senderName || "My Store")
      .replace(/\{\{renewal_link\}\}/g, "#")
      .replace(/\{\{days_left\}\}/g, "3")
      .replace(/\{\{order_link\}\}/g, "#")
      .replace(/\{\{payment_link\}\}/g, "#")
      .replace(/\{\{support_link\}\}/g, "#");

  return (
    <div className="bg-muted/50 rounded-xl p-2 sm:p-4 h-full overflow-auto">
      <div className="bg-card rounded-lg shadow-lg overflow-hidden border w-full max-w-[480px] mx-auto">
        <div className="px-3 sm:px-4 py-3 border-b bg-muted/30">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-primary-foreground shrink-0" style={{ backgroundColor: accentColor }}>
              {(senderName || "S")[0].toUpperCase()}
            </div>
            <span className="text-xs font-semibold truncate">{senderName || "Store Name"}</span>
          </div>
          <p className="text-sm font-semibold break-words">{replaceVars(subject) || "Subject line..."}</p>
        </div>
        <div className="bg-white">
          <div className="h-1.5" style={{ backgroundColor: accentColor }} />
          <div className="px-4 sm:px-6 py-5 sm:py-6 space-y-4">
            {blocks.map((block) => {
              if (block.type === "text") {
                return (
                  <div key={block.id} style={{ textAlign: block.align || "left" }}>
                    {replaceVars(block.content).split("\n").map((line, i) => (
                      <p key={i} className="text-sm text-gray-700 leading-relaxed break-words" style={{ minHeight: line ? undefined : "0.75em" }}>
                        {line}
                      </p>
                    ))}
                  </div>
                );
              }
              if (block.type === "heading") {
                return (
                  <h2 key={block.id} className="text-lg font-bold text-gray-900 break-words" style={{ textAlign: block.align || "left" }}>
                    {replaceVars(block.content)}
                  </h2>
                );
              }
              if (block.type === "cta" && block.cta) {
                const isOutline = block.cta.style === "outline";
                return (
                  <div key={block.id} className="text-center py-2">
                    <a
                      href="#"
                      onClick={(e) => e.preventDefault()}
                      className="inline-block px-6 sm:px-8 py-3 rounded-lg text-sm font-semibold transition-all"
                      style={{
                        backgroundColor: isOutline ? "transparent" : (block.cta.color || accentColor),
                        color: isOutline ? (block.cta.color || accentColor) : "#ffffff",
                        border: isOutline ? `2px solid ${block.cta.color || accentColor}` : "none",
                        textDecoration: "none",
                      }}
                    >
                      {replaceVars(block.cta.text)}
                    </a>
                  </div>
                );
              }
              if (block.type === "divider") {
                return <hr key={block.id} className="border-gray-200 my-2" />;
              }
              if (block.type === "spacer") {
                return <div key={block.id} className="h-4" />;
              }
              return null;
            })}
          </div>
          <div className="px-4 sm:px-6 py-4 bg-gray-50 border-t border-gray-100">
            <p className="text-[11px] text-gray-400 text-center">
              Sent by {senderName || "Your Store"} • Powered by Mirror App
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Block Editor Item ────────────────────────────────────
const BlockEditor = ({ block, onChange, onRemove }: {
  block: TemplateBlock;
  onChange: (block: TemplateBlock) => void;
  onRemove: () => void;
}) => {
  if (block.type === "divider" || block.type === "spacer") {
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg border border-dashed border-border bg-muted/30 group">
        <GripVertical className="h-4 w-4 text-muted-foreground/50 shrink-0" />
        <span className="text-xs text-muted-foreground flex-1">
          {block.type === "divider" ? "── Divider ──" : "⬜ Spacer"}
        </span>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onRemove}>
          <Trash2 className="h-3 w-3 text-destructive" />
        </Button>
      </div>
    );
  }

  if (block.type === "cta") {
    return (
      <div className="rounded-lg border bg-card p-3 space-y-3 group">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <GripVertical className="h-4 w-4 text-muted-foreground/50 shrink-0" />
            <MousePointerClick className="h-4 w-4 text-primary shrink-0" />
            <span className="text-xs font-medium truncate">CTA Button</span>
          </div>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={onRemove}>
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Button Text</Label>
            <Input
              value={block.cta?.text || ""}
              onChange={(e) => onChange({ ...block, cta: { ...block.cta!, text: e.target.value } })}
              className="h-8 text-xs"
              placeholder="Renew Now"
            />
          </div>
          <div>
            <Label className="text-xs">Link URL</Label>
            <Input
              value={block.cta?.url || ""}
              onChange={(e) => onChange({ ...block, cta: { ...block.cta!, url: e.target.value } })}
              className="h-8 text-xs"
              placeholder="{{renewal_link}}"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-xs">Color</Label>
          <div className="flex gap-1 flex-wrap">
            {BRAND_COLORS.map((c) => (
              <button
                key={c}
                className="w-5 h-5 rounded-full border-2 transition-all"
                style={{
                  backgroundColor: c,
                  borderColor: block.cta?.color === c ? "hsl(var(--foreground))" : "transparent",
                }}
                onClick={() => onChange({ ...block, cta: { ...block.cta!, color: c } })}
              />
            ))}
          </div>
          <Select
            value={block.cta?.style || "solid"}
            onValueChange={(v) => onChange({ ...block, cta: { ...block.cta!, style: v as "solid" | "outline" } })}
          >
            <SelectTrigger className="h-7 w-24 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="solid">Solid</SelectItem>
              <SelectItem value="outline">Outline</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2 group">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <GripVertical className="h-4 w-4 text-muted-foreground/50 shrink-0" />
          {block.type === "heading" ? <Bold className="h-4 w-4 text-primary shrink-0" /> : <Type className="h-4 w-4 text-muted-foreground shrink-0" />}
          <span className="text-xs font-medium truncate">{block.type === "heading" ? "Heading" : "Text Block"}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <div className="hidden sm:flex border rounded overflow-hidden">
            {(["left", "center", "right"] as const).map((a) => (
              <button
                key={a}
                className={`p-1 text-xs ${block.align === a ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                onClick={() => onChange({ ...block, align: a })}
              >
                <AlignLeft className="h-3 w-3" style={{ transform: a === "center" ? undefined : a === "right" ? "scaleX(-1)" : undefined }} />
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onRemove}>
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      </div>
      <Textarea
        value={block.content}
        onChange={(e) => onChange({ ...block, content: e.target.value })}
        className="text-sm min-h-[60px] resize-none"
        placeholder={block.type === "heading" ? "Enter heading..." : "Write your email content here..."}
        rows={block.type === "heading" ? 1 : 3}
      />
      <div className="flex flex-wrap gap-1">
        {VARIABLES.slice(0, 4).map((v) => (
          <button
            key={v.key}
            className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 font-mono transition-colors"
            onClick={() => onChange({ ...block, content: block.content + v.key })}
          >
            {v.key}
          </button>
        ))}
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────
const EmailTemplateEditor = ({ templates, storeId, userId, senderEmail, senderName, onSave }: EmailTemplateEditorProps) => {
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [editingLabel, setEditingLabel] = useState<string>("");
  const [blocks, setBlocks] = useState<TemplateBlock[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editorTab, setEditorTab] = useState<"visual" | "code">("visual");
  const [accentColor, setAccentColor] = useState("#006d5b");
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [rawBody, setRawBody] = useState("");
  const [mobilePreview, setMobilePreview] = useState(false);

  // Custom templates already saved
  const customTemplates = useMemo(
    () => templates.filter((t) => isCustomType(t.template_type)),
    [templates]
  );

  const openEditor = (type: string, existingOverride?: EmailTemplate) => {
    const existing = existingOverride || templates.find((t) => t.template_type === type);
    const tpl = existing || {
      store_id: storeId,
      user_id: userId,
      template_type: type,
      subject: DEFAULT_TEMPLATES[type]?.subject || "",
      body: DEFAULT_TEMPLATES[type]?.body || "",
      is_active: true,
    };
    setEditingTemplate(tpl);
    setEditingLabel(getTemplateLabel(tpl.template_type, tpl));
    const parsed = parseBodyToBlocks(tpl.body);
    setBlocks(parsed);
    setRawBody(tpl.body);
    setDialogOpen(true);
    setEditorTab("visual");
    setMobilePreview(false);
  };

  const createCustomTemplate = () => {
    const newType = `custom_${crypto.randomUUID().slice(0, 8)}`;
    const tpl: EmailTemplate = {
      store_id: storeId,
      user_id: userId,
      template_type: newType,
      subject: "My Custom Email Subject",
      body: "Hi {{customer_name}},\n\nWrite your custom message here.\n\nThanks!",
      is_active: true,
    };
    setEditingTemplate(tpl);
    setEditingLabel("My Custom Template");
    setBlocks(parseBodyToBlocks(tpl.body));
    setRawBody(tpl.body);
    setDialogOpen(true);
    setEditorTab("visual");
    setMobilePreview(false);
  };

  const updateBlock = (id: string, updated: TemplateBlock) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? updated : b)));
  };

  const removeBlock = (id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  };

  const addBlock = (type: TemplateBlock["type"]) => {
    const newBlock: TemplateBlock = {
      id: crypto.randomUUID(),
      type,
      content: "",
      align: "left",
      ...(type === "cta" ? { cta: { text: "Renew Now", url: "{{renewal_link}}", color: accentColor, style: "solid" as const } } : {}),
    };
    setBlocks((prev) => [...prev, newBlock]);
  };

  const saveTemplate = async () => {
    if (!editingTemplate) return;
    const body = editorTab === "visual" ? serializeBlocks(blocks) : rawBody;
    // For custom templates, store the user-given label as a hidden marker in subject prefix? No—keep label in subject.
    const payload = {
      store_id: storeId,
      user_id: userId,
      template_type: editingTemplate.template_type,
      subject: editingTemplate.subject,
      body,
      is_active: editingTemplate.is_active,
    };

    if (editingTemplate.id) {
      const { error } = await supabase.from("renewal_email_templates").update(payload).eq("id", editingTemplate.id);
      if (error) toast.error(error.message);
      else toast.success("Template saved!");
    } else {
      const { error } = await supabase.from("renewal_email_templates").insert(payload);
      if (error) toast.error(error.message);
      else toast.success("Template created!");
    }
    setDialogOpen(false);
    onSave();
  };

  const deleteTemplate = async (tpl: EmailTemplate) => {
    if (!tpl.id) return;
    if (!confirm("Delete this custom template?")) return;
    const { error } = await supabase.from("renewal_email_templates").delete().eq("id", tpl.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Template deleted");
      onSave();
    }
  };

  const handleTestSend = async () => {
    if (!testEmail) { toast.error("Enter a test email address"); return; }
    setSendingTest(true);
    try {
      const { data, error } = await supabase.functions.invoke("test-store-email", {
        body: { store_id: storeId, test_email: testEmail },
      });
      if (error) throw error;
      if (data?.success) toast.success("✅ Test email sent!");
      else toast.error(`Failed: ${data?.error || "Unknown error"}`);
    } catch (e: any) {
      toast.error(e.message);
    }
    setSendingTest(false);
  };

  const copyVariable = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success(`Copied ${key}`);
  };

  const currentBlocks = editorTab === "visual" ? blocks : parseBodyToBlocks(rawBody);

  // All template card entries: defaults + custom
  const cardEntries: { type: string; label: string; tpl?: EmailTemplate; isCustom: boolean }[] = [
    ...Object.entries(templateLabels).map(([type, label]) => ({
      type,
      label,
      tpl: templates.find((t) => t.template_type === type),
      isCustom: false,
    })),
    ...customTemplates.map((tpl) => ({
      type: tpl.template_type,
      label: getTemplateLabel(tpl.template_type, tpl),
      tpl,
      isCustom: true,
    })),
  ];

  return (
    <>
      {/* Template Cards Grid - fully responsive */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
        {cardEntries.map(({ type, label, tpl, isCustom }) => {
          const isCustomized = !!tpl;
          return (
            <Card
              key={tpl?.id || type}
              className="group cursor-pointer border hover:border-primary/40 hover:shadow-md transition-all duration-200 overflow-hidden"
              onClick={() => openEditor(type, tpl)}
            >
              <div className="h-1" style={{ backgroundColor: isCustomized ? accentColor : "hsl(var(--border))" }} />
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className="text-xl shrink-0">{isCustom ? "✉️" : getTemplateIcon(type)}</span>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-sm font-semibold truncate">{label}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 break-words">
                        {tpl?.subject || DEFAULT_TEMPLATES[type]?.subject}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {isCustom ? (
                      <Badge className="text-[10px] bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20">
                        <Sparkles className="h-3 w-3 mr-0.5" /> Custom
                      </Badge>
                    ) : isCustomized ? (
                      <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20 hover:bg-primary/15">
                        <CheckCircle2 className="h-3 w-3 mr-0.5" /> Edited
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">Default</Badge>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-0">
                <div className="rounded-md bg-muted/50 p-3 mb-3 border border-dashed border-border/50">
                  <div className="h-1 w-12 rounded-full mb-2" style={{ backgroundColor: accentColor, opacity: 0.5 }} />
                  <div className="space-y-1.5">
                    <div className="h-2 bg-muted-foreground/10 rounded w-3/4" />
                    <div className="h-2 bg-muted-foreground/10 rounded w-full" />
                    <div className="h-2 bg-muted-foreground/10 rounded w-1/2" />
                  </div>
                  <div className="mt-3 flex justify-center">
                    <div className="h-5 w-16 rounded text-[8px] flex items-center justify-center text-white font-medium" style={{ backgroundColor: accentColor, opacity: 0.7 }}>
                      CTA
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 flex-1 group-hover:bg-primary/5">
                    <Pencil className="h-3 w-3" /> Edit
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 flex-1 group-hover:bg-primary/5">
                    <Eye className="h-3 w-3" /> Preview
                  </Button>
                  {isCustom && tpl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 hover:bg-destructive/10"
                      onClick={(e) => { e.stopPropagation(); deleteTemplate(tpl); }}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {/* Create custom template card */}
        <Card
          className="group cursor-pointer border-2 border-dashed border-border hover:border-primary/40 hover:bg-primary/5 transition-all flex items-center justify-center min-h-[220px]"
          onClick={createCustomTemplate}
        >
          <div className="flex flex-col items-center text-center p-6">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <Plus className="h-6 w-6 text-primary" />
            </div>
            <p className="text-sm font-semibold">Create Custom Template</p>
            <p className="text-xs text-muted-foreground mt-1">Build your own email from scratch</p>
          </div>
        </Card>
      </div>

      {/* Variables & Tips Card */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 mt-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Variable className="h-4 w-4 text-primary" /> Dynamic Variables
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {VARIABLES.map((v) => (
                <div key={v.key} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50 hover:bg-muted transition-colors">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <code className="text-xs font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded shrink-0">{v.key}</code>
                    <span className="text-xs text-muted-foreground truncate hidden sm:inline">{v.label}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground/60 hidden md:inline">→ {v.example}</span>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => copyVariable(v.key)}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Palette className="h-4 w-4 text-primary" /> Brand Accent Color
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              {BRAND_COLORS.map((c) => (
                <button
                  key={c}
                  className="w-8 h-8 rounded-lg border-2 transition-all hover:scale-110"
                  style={{
                    backgroundColor: c,
                    borderColor: accentColor === c ? "hsl(var(--foreground))" : "transparent",
                  }}
                  onClick={() => setAccentColor(c)}
                />
              ))}
              <Input
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="w-8 h-8 p-0 border-0 cursor-pointer"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              This color will be used for CTA buttons, header strips, and accents in your email templates.
            </p>
            <Separator />
            <div>
              <Label className="text-xs">Quick Test Send</Label>
              <div className="flex flex-col sm:flex-row gap-2 mt-1.5">
                <Input
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="test@example.com"
                  className="h-8 text-xs"
                />
                <Button size="sm" className="h-8 text-xs gap-1" onClick={handleTestSend} disabled={sendingTest}>
                  <TestTube className="h-3 w-3" />
                  {sendingTest ? "Sending..." : "Test"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Editor Dialog (responsive: full screen on mobile) ─── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[1400px] w-screen sm:w-[96vw] h-[100dvh] sm:h-[92vh] max-h-[100dvh] sm:max-h-[92vh] flex flex-col p-0 gap-0 sm:rounded-2xl rounded-none overflow-hidden">
          <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b shrink-0">
            <div className="flex items-start sm:items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="text-xl shrink-0">{editingTemplate ? getTemplateIcon(editingTemplate.template_type) : "📧"}</span>
                <div className="min-w-0 flex-1">
                  {editingTemplate && isCustomType(editingTemplate.template_type) ? (
                    <Input
                      value={editingLabel}
                      onChange={(e) => setEditingLabel(e.target.value)}
                      className="h-8 text-sm font-semibold"
                      placeholder="Template name..."
                    />
                  ) : (
                    <DialogTitle className="text-sm sm:text-base truncate">
                      {editingTemplate ? getTemplateLabel(editingTemplate.template_type, editingTemplate) : "Edit Template"}
                    </DialogTitle>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-0.5 hidden sm:block">Design your email with live preview</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <Switch
                    checked={editingTemplate?.is_active || false}
                    onCheckedChange={(v) => editingTemplate && setEditingTemplate({ ...editingTemplate, is_active: v })}
                  />
                  <Label className="text-xs">Active</Label>
                </div>
                {/* Mobile preview toggle */}
                <Button
                  variant="outline"
                  size="sm"
                  className="lg:hidden h-8 gap-1 text-xs"
                  onClick={() => setMobilePreview(!mobilePreview)}
                >
                  {mobilePreview ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  {mobilePreview ? "Edit" : "Preview"}
                </Button>
                <Button size="sm" onClick={saveTemplate} className="h-8 gap-1.5 text-xs">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Save
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
            {/* Left: Editor */}
            <div className={`${mobilePreview ? "hidden" : "flex"} md:flex w-full md:w-1/2 md:border-r flex-col overflow-hidden min-h-0`}>
              {/* Subject */}
              <div className="px-3 sm:px-4 py-3 border-b bg-muted/20 shrink-0">
                <Label className="text-xs text-muted-foreground">Subject Line</Label>
                <Input
                  value={editingTemplate?.subject || ""}
                  onChange={(e) => editingTemplate && setEditingTemplate({ ...editingTemplate, subject: e.target.value })}
                  className="h-9 mt-1 font-medium text-sm"
                  placeholder="Enter email subject..."
                />
              </div>

              {/* Editor mode tabs */}
              <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2 border-b shrink-0 flex-wrap">
                <div className="flex gap-1">
                  <Button
                    variant={editorTab === "visual" ? "default" : "ghost"}
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => {
                      if (editorTab === "code") setBlocks(parseBodyToBlocks(rawBody));
                      setEditorTab("visual");
                    }}
                  >
                    <LayoutTemplate className="h-3 w-3" /> Visual
                  </Button>
                  <Button
                    variant={editorTab === "code" ? "default" : "ghost"}
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => {
                      if (editorTab === "visual") setRawBody(serializeBlocks(blocks));
                      setEditorTab("code");
                    }}
                  >
                    <Type className="h-3 w-3" /> Code
                  </Button>
                </div>

                {editorTab === "visual" && (
                  <div className="flex gap-1 flex-wrap">
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1 px-2" onClick={() => addBlock("text")}>
                      <Plus className="h-3 w-3" /> Text
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1 px-2" onClick={() => addBlock("heading")}>
                      <Bold className="h-3 w-3" /> H
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1 px-2" onClick={() => addBlock("cta")}>
                      <MousePointerClick className="h-3 w-3" /> CTA
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1 px-2" onClick={() => addBlock("divider")}>
                      ─
                    </Button>
                  </div>
                )}
              </div>

              {/* Editor content */}
              <div className="flex-1 overflow-auto p-3 sm:p-4 space-y-3 min-h-0">
                {editorTab === "visual" ? (
                  blocks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-10">
                      <LayoutTemplate className="h-10 w-10 mb-3 opacity-30" />
                      <p className="text-sm">Add content blocks to build your email</p>
                      <div className="flex gap-2 mt-3">
                        <Button variant="outline" size="sm" onClick={() => addBlock("text")}>
                          <Plus className="h-3 w-3 mr-1" /> Text
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => addBlock("cta")}>
                          <MousePointerClick className="h-3 w-3 mr-1" /> CTA
                        </Button>
                      </div>
                    </div>
                  ) : (
                    blocks.map((block) => (
                      <BlockEditor
                        key={block.id}
                        block={block}
                        onChange={(b) => updateBlock(block.id, b)}
                        onRemove={() => removeBlock(block.id)}
                      />
                    ))
                  )
                ) : (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1 mb-2">
                      {VARIABLES.map((v) => (
                        <button
                          key={v.key}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 font-mono"
                          onClick={() => setRawBody((prev) => prev + v.key)}
                        >
                          {v.key}
                        </button>
                      ))}
                    </div>
                    <Textarea
                      value={rawBody}
                      onChange={(e) => setRawBody(e.target.value)}
                      className="min-h-[300px] sm:min-h-[400px] font-mono text-sm resize-none"
                      placeholder="Write your email body here..."
                    />
                  </div>
                )}
              </div>

              {/* CTA Presets */}
              {editorTab === "visual" && (
                <div className="px-3 sm:px-4 py-3 border-t bg-muted/20 shrink-0">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Quick CTA Presets</p>
                  <div className="flex flex-wrap gap-1.5">
                    {CTA_PRESETS.map((preset) => (
                      <Button
                        key={preset.text}
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => {
                          const newBlock: TemplateBlock = {
                            id: crypto.randomUUID(),
                            type: "cta",
                            content: "",
                            align: "center",
                            cta: { ...preset, style: "solid" },
                          };
                          setBlocks((prev) => [...prev, newBlock]);
                        }}
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: preset.color }} />
                        {preset.text}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Live Preview */}
            <div className={`${mobilePreview ? "flex" : "hidden"} lg:flex w-full lg:w-1/2 flex-col bg-muted/20 overflow-hidden min-h-0`}>
              <div className="px-3 sm:px-4 py-2.5 border-b flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium">Live Preview</span>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  <Mail className="h-3 w-3 mr-1" /> Email Client View
                </Badge>
              </div>
              <div className="flex-1 overflow-auto p-3 sm:p-4 min-h-0">
                <EmailPreview
                  subject={editingTemplate?.subject || ""}
                  blocks={currentBlocks}
                  senderName={senderName || "Store"}
                  accentColor={accentColor}
                />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default EmailTemplateEditor;

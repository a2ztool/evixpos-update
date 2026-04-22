import { useEffect, useState } from "react";
import { useAdmin } from "@/hooks/useAdmin";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Megaphone, Send, Trash2, Users } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useFormValidation } from "@/hooks/useFormValidation";
import { broadcastSchema } from "@/lib/validations";

const AdminBroadcasts = () => {
  const { adminCall, loading } = useAdmin();
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [targetType, setTargetType] = useState("all");
  const [targetValue, setTargetValue] = useState("");
  const [channel, setChannel] = useState("in_app");
  const v = useFormValidation(broadcastSchema);

  const fetchBroadcasts = async () => {
    const data = await adminCall("get_broadcasts");
    if (data) setBroadcasts(data);
  };

  useEffect(() => { fetchBroadcasts(); /* eslint-disable-next-line */ }, []);

  const handleSend = async () => {
    if (!v.validateAll({ title, message, target_type: targetType, target_value: targetValue })) return;
    if (!confirm(`Send this broadcast to ${targetType === "all" ? "ALL users" : targetType + (targetValue ? ": " + targetValue : "")}?`)) return;

    const result = await adminCall("send_broadcast", { title, message, target_type: targetType, target_value: targetValue, channel });
    if (result?.success) {
      toast.success(`Broadcast sent to ${result.recipients} user(s)`);
      setTitle(""); setMessage(""); setTargetValue("");
      v.clearErrors();
      fetchBroadcasts();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this broadcast record?")) return;
    const result = await adminCall("delete_broadcast", { id });
    if (result?.success) {
      toast.success("Deleted");
      fetchBroadcasts();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center">
          <Megaphone className="h-5 w-5 text-blue-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Broadcasts</h1>
          <p className="text-xs text-slate-400">Send announcements to users in-app or via email</p>
        </div>
      </div>

      <Card className="bg-slate-800 border-slate-700 p-5 space-y-4">
        <h3 className="text-white font-semibold">New Broadcast</h3>
        <div>
          <Input
            placeholder="Title (e.g. Scheduled Maintenance)"
            value={title}
            onChange={(e) => { setTitle(e.target.value); v.clearField("title"); }}
            error={!!v.getError("title")}
            className="bg-slate-900 border-slate-700 text-white"
          />
          {v.getError("title") && <p className="text-xs text-destructive mt-1">{v.getError("title")}</p>}
        </div>
        <div>
          <Textarea
            placeholder="Message..."
            rows={4}
            value={message}
            onChange={(e) => { setMessage(e.target.value); v.clearField("message"); }}
            aria-invalid={!!v.getError("message")}
            className={`bg-slate-900 border-slate-700 text-white ${v.getError("message") ? "border-destructive" : ""}`}
          />
          {v.getError("message") && <p className="text-xs text-destructive mt-1">{v.getError("message")}</p>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Select value={targetType} onValueChange={(val) => { setTargetType(val); setTargetValue(""); v.clearField("target_value"); }}>
            <SelectTrigger className="bg-slate-900 border-slate-700 text-white">
              <SelectValue placeholder="Target" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="all" className="text-white">All users</SelectItem>
              <SelectItem value="active" className="text-white">Active (not suspended)</SelectItem>
              <SelectItem value="suspended" className="text-white">Suspended only</SelectItem>
              <SelectItem value="plan" className="text-white">Specific plan</SelectItem>
              <SelectItem value="user" className="text-white">Specific user (by ID)</SelectItem>
            </SelectContent>
          </Select>

          {targetType === "plan" && (
            <div>
              <Select value={targetValue} onValueChange={(val) => { setTargetValue(val); v.clearField("target_value"); }}>
                <SelectTrigger className={`bg-slate-900 border-slate-700 text-white ${v.getError("target_value") ? "border-destructive" : ""}`}>
                  <SelectValue placeholder="Choose plan" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="free" className="text-white">Free</SelectItem>
                  <SelectItem value="pro" className="text-white">Pro</SelectItem>
                  <SelectItem value="business" className="text-white">Business</SelectItem>
                </SelectContent>
              </Select>
              {v.getError("target_value") && <p className="text-xs text-destructive mt-1">{v.getError("target_value")}</p>}
            </div>
          )}
          {targetType === "user" && (
            <div>
              <Input
                placeholder="User ID (UUID)"
                value={targetValue}
                onChange={(e) => { setTargetValue(e.target.value); v.clearField("target_value"); }}
                error={!!v.getError("target_value")}
                className="bg-slate-900 border-slate-700 text-white"
              />
              {v.getError("target_value") && <p className="text-xs text-destructive mt-1">{v.getError("target_value")}</p>}
            </div>
          )}

          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger className="bg-slate-900 border-slate-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="in_app" className="text-white">In-app only</SelectItem>
              <SelectItem value="email" className="text-white" disabled>Email (coming soon)</SelectItem>
              <SelectItem value="both" className="text-white" disabled>Both (coming soon)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button onClick={handleSend} disabled={loading} className="bg-blue-600 hover:bg-blue-700">
          <Send className="h-4 w-4 mr-2" />
          Send Broadcast
        </Button>
      </Card>

      <Card className="bg-slate-800 border-slate-700 p-5">
        <h3 className="text-white font-semibold mb-3">Recent Broadcasts</h3>
        <div className="space-y-2">
          {broadcasts.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-8">No broadcasts sent yet.</p>
          ) : broadcasts.map((b) => (
            <div key={b.id} className="bg-slate-900/50 border border-slate-700 rounded-lg p-3 flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-white text-sm font-medium truncate">{b.title}</h4>
                  <Badge className="bg-blue-500/20 text-blue-400 border-0 text-[10px]">{b.target_type}{b.target_value ? `: ${b.target_value}` : ""}</Badge>
                  <Badge className="bg-slate-600/30 text-slate-300 border-0 text-[10px] flex items-center gap-1">
                    <Users className="h-3 w-3" />{b.recipients_count}
                  </Badge>
                </div>
                <p className="text-slate-400 text-xs line-clamp-2">{b.message}</p>
                <p className="text-slate-500 text-[10px] mt-1">{new Date(b.created_at).toLocaleString()}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => handleDelete(b.id)} className="text-red-400 hover:bg-red-500/10">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default AdminBroadcasts;

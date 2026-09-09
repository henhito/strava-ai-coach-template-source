import React, { useState, useEffect } from "react";
import { Loader2, Save, Check, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Activity } from "@/entities/Activity";
import { useToast } from "@/components/ui/use-toast";

export default function ActivityNoteEditor({ activityId, initialNote }) {
  const [note, setNote] = useState(initialNote || "");
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setNote(initialNote || "");
  }, [initialNote]);

  const handleSave = async () => {
    if (!activityId) return;
    setIsSaving(true);
    try {
      await Activity.update(activityId, { athlete_note: note.trim() });
      setSaved(true);
      toast({ title: "Note saved" });
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      toast({ title: "Could not save note", description: e.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <StickyNote className="h-5 w-5 text-orange-500" />
          Athlete Note
        </CardTitle>
        <CardDescription>
          Add your own notes about this session. Elite Coach can read and comment on these.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="How did this session feel? Anything your coach should know?"
          rows={4}
        />
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : saved ? (
            <Check className="h-4 w-4 mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          {saved ? "Saved" : "Save note"}
        </Button>
      </CardContent>
    </Card>
  );
}
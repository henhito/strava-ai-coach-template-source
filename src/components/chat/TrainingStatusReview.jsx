import React from "react";
import { AlertTriangle, CircleHelp, ClipboardList, ShieldAlert } from "lucide-react";

const items = (values) => values?.map((item, index) => <li key={index}>{typeof item === "string" ? item : item.watchout || item.limitation}</li>);

export default function TrainingStatusReview({ data }) {
  let review = data;
  try { review = typeof data === "string" ? JSON.parse(data) : data; } catch { return null; }
  const status = review.training_status?.label || "Unable to assess";
  const summary = review.summary?.text || review.summary;
  return <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
    <div className="flex items-center gap-2">
      <ClipboardList className="h-5 w-5 text-primary" />
      <h3 className="font-semibold">Training review</h3>
    </div>
    <p className="text-sm leading-relaxed text-muted-foreground">{summary}</p>
    <div className="rounded-lg bg-muted px-3 py-2 text-sm"><span className="font-medium">Training status: </span>{status}</div>
    {review.watchouts?.length > 0 && <section><h4 className="mb-1 flex items-center gap-1 text-sm font-medium"><AlertTriangle className="h-4 w-4" /> Watchouts</h4><ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{items(review.watchouts)}</ul></section>}
    {review.suggested_next_7_days?.length > 0 && <section><h4 className="mb-1 text-sm font-medium">Next 7 days</h4><ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{items(review.suggested_next_7_days)}</ul></section>}
    {review.questions_for_athlete?.length > 0 && <section><h4 className="mb-1 flex items-center gap-1 text-sm font-medium"><CircleHelp className="h-4 w-4" /> Questions for you</h4><ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{items(review.questions_for_athlete)}</ul></section>}
    {review.data_limitations?.length > 0 && <section className="border-t border-border pt-3"><h4 className="mb-1 flex items-center gap-1 text-sm font-medium"><ShieldAlert className="h-4 w-4" /> Data limitations</h4><ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{items(review.data_limitations)}</ul></section>}
  </div>;
}
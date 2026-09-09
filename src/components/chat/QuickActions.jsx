import React from "react";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, TrendingUp, Heart, Activity, AlertTriangle } from "lucide-react";

const quickActions = [
  { 
    label: "Analyze last 7 days", 
    type: "weekly_analysis",
    icon: TrendingUp,
    color: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
  },
  { 
    label: "Check training load", 
    type: "load_check",
    icon: AlertTriangle,
    color: "bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100"
  },
  { 
    label: "Latest workout", 
    type: "last_run",
    icon: Activity,
    color: "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100"
  },
  { 
    label: "HR zone analysis", 
    type: "hr_zones",
    icon: Heart,
    color: "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
  },
  { 
    label: "Recommend next workout", 
    type: "next_workout",
    icon: Clock,
    color: "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
  },
  { 
    label: "This month summary", 
    type: "this_month",
    icon: Calendar,
    color: "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100"
  }
];

export default function QuickActions({ onActionClick }) {
  return (
    <div className="flex flex-wrap gap-2">
      <span className="text-sm text-gray-500 mr-2 self-center">Quick actions:</span>
      {quickActions.map((action) => (
        <Button
          key={action.type}
          variant="outline"
          size="sm"
          onClick={() => onActionClick(action)}
          className={`flex items-center gap-2 ${action.color} transition-all duration-200`}
        >
          <action.icon className="w-3 h-3" />
          {action.label}
        </Button>
      ))}
    </div>
  );
}
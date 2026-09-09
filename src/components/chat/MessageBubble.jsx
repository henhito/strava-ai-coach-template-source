import React from "react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { User, Zap } from "lucide-react";
import ReactMarkdown from "react-markdown";
import CoachingResponse from "./CoachingResponse";
import TrainingStatusReview from "./TrainingStatusReview";
import ActivityTable from "./ActivityTable";

export default function MessageBubble({ message }) {
  const isUser = message.role === "user";

  // DEFENSIVE: Handle missing or malformed content
  if (!message || !message.content) {
    console.warn('MessageBubble received invalid message:', message);
    return null;
  }

  const isCoachingResponse = message.content && ((typeof message.content === 'string' && message.content.includes('"summary"') && message.content.includes('"insights"')) || (typeof message.content === "object" && message.content.summary && message.content.insights));
  const isTrainingReview = message.content && ((typeof message.content === "string" && message.content.includes('"training_status"')) || (typeof message.content === "object" && message.content.training_status));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`flex gap-3 max-w-3xl ${
          isUser ? "flex-row-reverse" : "flex-row"
        }`}
      >
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
            isUser
              ? "bg-orange-500 text-white"
              : "bg-white shadow-sm border border-orange-200"
          }`}
        >
          {isUser ? (
            <User className="w-4 h-4" />
          ) : (
            <Zap className="w-4 h-4 text-orange-500" />
          )}
        </div>

        <div className={`flex-1 ${isUser ? "text-right" : "text-left"}`}>
          {isUser ? (
            <div className="inline-block px-4 py-3 rounded-2xl shadow-sm bg-orange-500 text-white rounded-tr-md">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {isTrainingReview ? (
                <TrainingStatusReview data={message.content} />
              ) : isCoachingResponse ? (
                <CoachingResponse data={message.content} activity={message.activity} />
              ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-orange-100 px-4 py-3">
                  <ReactMarkdown className="text-sm prose prose-sm max-w-none">
                    {typeof message.content === "string"
                      ? message.content
                      : JSON.stringify(message.content)}
                  </ReactMarkdown>
                </div>
              )}

              {message.tableData && Array.isArray(message.tableData) && message.tableData.length > 0 && (
                <ActivityTable activities={message.tableData} />
              )}
            </div>
          )}

          <p className="text-xs text-gray-400 mt-2">
            {message.timestamp ? format(new Date(message.timestamp), "h:mm a") : ''}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
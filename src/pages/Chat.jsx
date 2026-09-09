import React, { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2, MessageCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import QuickActions from "../components/chat/QuickActions";
import MessageBubble from "../components/chat/MessageBubble";
import StravaConnect from "../components/chat/StravaConnect";
import ConversationSidebar from "../components/chat/ConversationSidebar";

import { checkStravaConnection } from "@/functions/checkStravaConnection";
import { getStravaAuthUrl } from "@/functions/getStravaAuthUrl";
import { chatWithEliteCoach } from "@/functions/chatWithEliteCoach";
import { generateTrainingAnalysis } from "@/functions/generateTrainingAnalysis";

import { Conversation } from "@/entities/Conversation";
import { Message } from "@/entities/Message";
import { base44 } from "@/api/base44Client";

export default function ChatPage() {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [requireLogin, setRequireLogin] = useState(false);
  const [functionsAvailable, setFunctionsAvailable] = useState(true);
  
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [justConnected, setJustConnected] = useState(false);

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const checkConnection = async () => {
    try {
      const res = await checkStravaConnection();
      const data = res?.data || res; 

      if (data?.isConnected) {
        setIsConnected(true);
        const urlParams = new URLSearchParams(window.location.search);
        const justConnectedParam = urlParams.get('strava_connected') === 'true';
        setJustConnected(justConnectedParam);
        if (justConnectedParam) {
            window.history.replaceState({}, document.title, window.location.pathname);
        }
      } else {
        setIsConnected(false);
      }
    } catch (err) {
      console.error("Error checking Strava connection:", err);
      const errorCode = err.code; 
      const httpStatus = err?.response?.status || err?.status; 

      if (errorCode === 'unauthenticated' || httpStatus === 401) {
        setRequireLogin(true);
      } else if (errorCode === 'not-found' || httpStatus === 404) {
        setFunctionsAvailable(false);
        setIsConnected(false);
      } else if (errorCode === 'internal' || httpStatus === 500) {
        setFunctionsAvailable(true);
        setIsConnected(false);
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const createDefaultConversation = async () => {
    try {
      const defaultConv = await Conversation.create({
        title: "Training Chat",
        description: "Your main conversation with Elite Coach",
        last_activity: new Date().toISOString(),
        message_count: 0
      });
      setConversations([defaultConv]);
      setActiveConversation(defaultConv);
      return defaultConv;
    } catch (error) {
      console.error('Failed to create default conversation:', error);
      setConversations([]);
      setActiveConversation(null);
      return null;
    }
  };

  const loadConversations = async () => {
    try {
      const allConversations = await Conversation.list('-last_activity');
      setConversations(allConversations);
      
      if (allConversations.length > 0) {
        const lastConversation = allConversations[0];
        setActiveConversation(lastConversation);
      } else {
        await createDefaultConversation();
      }
    } catch (error) {
      console.error('Failed to load conversations:', error);
      await createDefaultConversation();
    }
  };

  useEffect(() => {
    const initializeChat = async () => {
      setIsConnecting(true);
      try {
        await checkConnection();
        await loadConversations();
      } catch (error) {
        console.error("Error during initial chat setup:", error);
      } finally {
        setIsConnecting(false);
      }
    };
    
    initializeChat();
  }, []);

  const saveMessage = useCallback(async (messageData, conversationId = activeConversation?.id) => {
    if (!conversationId) {
      console.error('Cannot save message: No active conversation ID provided.');
      return;
    }
    
    try {
      const savedMessage = await Message.create({
        conversation_id: conversationId,
        role: messageData.role,
        content: typeof messageData.content === 'string' ? messageData.content : JSON.stringify(messageData.content),
        timestamp: messageData.timestamp.toISOString(),
      });
      
      await Conversation.update(conversationId, {
        message_count: (activeConversation?.message_count || 0) + 1,
        last_activity: new Date().toISOString()
      });

      return savedMessage;
    } catch (error) {
      console.error('Failed to save message:', error);
    }
  }, [activeConversation]);

  // Send message to Elite Coach using backend function
  const sendToAgent = async (userContent) => {
    try {
      console.log('🤖 Sending message via backend function...');
      
      const response = await chatWithEliteCoach({
        conversationId: activeConversation.id,
        message: userContent
      });

      const data = response?.data || response;
      
      if (data.error) {
        throw new Error(data.error);
      }

      // Update conversation with agent conversation ID if returned
      if (data.agentConversationId && !activeConversation.agent_conversation_id) {
        setActiveConversation(prev => ({
          ...prev,
          agent_conversation_id: data.agentConversationId
        }));
      }

      console.log('✅ Received response from Elite Coach');
      return data.response;
      
    } catch (error) {
      console.error('❌ Agent communication error:', error);
      throw new Error(error.message || 'Failed to communicate with Elite Coach');
    }
  };

  useEffect(() => {
    const loadAndSetMessages = async () => {
      if (!activeConversation) {
        setMessages([]);
        return;
      }
      
      try {
        const conversationMessages = await Message.filter(
          { conversation_id: activeConversation.id },
          'created_date'
        );
        
        const formattedMessages = conversationMessages.map(msg => {
          let content = msg.content;
          try {
            const parsed = JSON.parse(msg.content);
            if (parsed && typeof parsed === 'object') {
              content = parsed;
            }
          } catch (e) {
            // Keep as string
          }
          
          return {
            id: msg.id,
            role: msg.role,
            content: content,
            timestamp: new Date(msg.timestamp),
          };
        });
        
        if (formattedMessages.length === 0) {
          let initialContent = "Hi! I'm Elite Coach, your AI running and cycling coach. Connect your Strava account to get personalized training insights and coaching recommendations.";
          if (justConnected) {
            initialContent = "Great! I've connected to your Strava account. Let me analyze your recent training data...";
          } else if (isConnected) {
            initialContent = "Welcome back! Your Strava account is connected. How can I assist with your training today?";
          }

          const initialAssistantMessage = {
            id: Date.now(),
            role: "assistant",
            content: initialContent,
            timestamp: new Date(),
          };
          
          setMessages([initialAssistantMessage]);
          await saveMessage(initialAssistantMessage, activeConversation.id);
        } else {
          setMessages(formattedMessages);
        }

        if (justConnected) {
            setJustConnected(false);
        }

      } catch (error) {
        console.error('Failed to load messages:', error);
        setMessages([]);
      }
    };

    loadAndSetMessages();
  }, [activeConversation, isConnected, justConnected, saveMessage]);

  // Auto-generate training analysis when conversation loads with Strava connected
  useEffect(() => {
    const generateInitialAnalysis = async () => {
      if (!activeConversation || !isConnected || !activeConversation.id) {
        return;
      }
      
      // Check if this conversation already has messages (analysis already done)
      if (messages.length > 1) {
        return;
      }
      
      // Check if we've already generated analysis for this conversation
      if (activeConversation.analysis_generated) {
        return;
      }
      
      console.log('🔍 Generating automatic training analysis...');
      
      try {
        // Generate comprehensive training analysis
        const response = await generateTrainingAnalysis();
        const data = response?.data || response;
        
        if (data.error) {
          console.log('Analysis skipped:', data.error);
          return;
        }
        
        if (data.analysis?.hasData) {
          // Add analysis as an assistant message
          const analysisMessage = {
            id: Date.now(),
            role: "assistant",
            content: data.analysis.message,
            timestamp: new Date(),
          };
          
          setMessages(prev => [...prev, analysisMessage]);
          await saveMessage(analysisMessage);
          
          // Mark conversation as having analysis generated
          await Conversation.update(activeConversation.id, {
            analysis_generated: true
          });
          
          console.log('✅ Automatic analysis added to conversation');
        }
      } catch (error) {
        console.error('Failed to generate automatic analysis:', error);
        // Don't show error to user - analysis is optional enhancement
      }
    };
    
    // Delay slightly to let initial messages load first
    const timer = setTimeout(generateInitialAnalysis, 1000);
    return () => clearTimeout(timer);
  }, [activeConversation, isConnected, messages.length, saveMessage]);

  const selectConversation = async (conversation) => {
    setActiveConversation(conversation);
    try {
      const updatedConv = await Conversation.update(conversation.id, {
        last_activity: new Date().toISOString()
      });
      setConversations(prev => prev.map(c => c.id === conversation.id ? updatedConv : c));
    } catch (error) {
      console.error('Failed to update conversation activity:', error);
    }
  };

  const createConversation = async (conversationData) => {
    try {
      const newConversation = await Conversation.create({
        ...conversationData,
        last_activity: new Date().toISOString(),
        message_count: 0
      });
      
      setConversations(prev => [newConversation, ...prev]);
      setActiveConversation(newConversation);
      setMessages([]);
      
      return newConversation;
    } catch (error) {
      console.error('Failed to create new conversation:', error);
      return null;
    }
  };

  const archiveConversation = async (conversationId) => {
    try {
      await Conversation.update(conversationId, { is_active: false });
      setConversations(prev => prev.filter(c => c.id !== conversationId));
      
      if (activeConversation?.id === conversationId) {
        const remaining = conversations.filter(c => c.id !== conversationId);
        if (remaining.length > 0) {
          await selectConversation(remaining[0]);
        } else {
          await createConversation({
            title: "New Training Chat",
            description: "Continue your conversation with Elite Coach"
          });
        }
      }
    } catch (error) {
      console.error('Failed to archive conversation:', error);
    }
  };
  
  const handleLogin = async () => {
    try {
      await base44.auth.redirectToLogin(window.location.href);
    } catch (e) {
      console.error("Login redirect error:", e);
    }
  };

  const handleStravaConnect = async () => {
    setIsConnecting(true);
    try {
      const res = await getStravaAuthUrl();
      const data = res?.data || res;
      if (!data?.authUrl) {
        setMessages(prev => [...prev, {
          id: Date.now(),
          role: "assistant",
          content: "No authentication URL returned. Make sure STRAVA_CLIENT_ID and STRAVA_REDIRECT_URI are set in your Environment Variables.",
          timestamp: new Date(),
        }]);
        setIsConnecting(false);
        return;
      }
      window.location.href = data.authUrl;
    } catch (err) {
      console.error("Error initiating Strava connection:", err);
      const errorCode = err.code;
      const httpStatus = err?.response?.status || err?.status;

      if (errorCode === 'unauthenticated' || httpStatus === 401) {
        setRequireLogin(true);
        setMessages(prev => [...prev, {
          id: Date.now(),
          role: "assistant",
          content: "Please log in to continue, then try connecting Strava again.",
          timestamp: new Date(),
        }]);
      } else if (errorCode === 'not-found' || httpStatus === 404) {
        setFunctionsAvailable(false);
        setMessages(prev => [...prev, {
          id: Date.now(),
          role: "assistant",
          content: "Backend Functions Required: Enable backend functions in Dashboard → Settings to connect Strava.",
          timestamp: new Date(),
        }]);
      } else {
        setMessages(prev => [...prev, {
          id: Date.now(),
          role: "assistant",
          content: `There was an error initiating the Strava connection. Please try again. Error: ${err.message || 'unknown'}`,
          timestamp: new Date(),
        }]);
      }
      setIsConnecting(false);
    }
  };

  const handleQuickAction = async (action) => {
    if (isLoading || !activeConversation) return;

    const userMessage = {
      id: Date.now(),
      role: "user", 
      content: action.label,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    await saveMessage(userMessage);
    setIsLoading(true);
    
    try {
      const assistantContent = await sendToAgent(action.label);
      
      const assistantMessage = {
        id: Date.now() + 1,
        role: "assistant",
        content: assistantContent,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
      await saveMessage(assistantMessage);
    } catch (error) {
      console.error('Quick action error:', error);
      
      const errorMessage = {
        id: Date.now() + 1,
        role: "assistant",
        content: `I'm having trouble analyzing your data. ${error.message || 'Please try again.'}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
      await saveMessage(errorMessage);
    }
    
    setIsLoading(false);
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading || !activeConversation) return;

    const userMessage = {
      id: Date.now(),
      role: "user",
      content: inputMessage,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    await saveMessage(userMessage);
    setInputMessage("");
    setIsLoading(true);

    try {
      const assistantContent = await sendToAgent(userMessage.content);
      
      const assistantMessage = {
        id: Date.now() + 1,
        role: "assistant", 
        content: assistantContent,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
      await saveMessage(assistantMessage);
    } catch (error) {
      console.error('Send message error:', error);
      
      const isRateLimitError = error.message?.includes('rate limit') || 
                               error.message?.includes('429') || 
                               error.response?.status === 429;
      
      const errorMessage = {
        id: Date.now() + 1,
        role: "assistant",
        content: isRateLimitError 
          ? "⏰ Strava rate limit exceeded. Please wait 15 minutes and try again. I can still answer general training questions in the meantime."
          : `I'm having trouble right now. ${error.message || 'Please try again.'}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
      await saveMessage(errorMessage);
    }

    setIsLoading(false);
  };

  if (isConnecting && messages.length === 0) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-gray-50">
        <div className="flex flex-col items-center gap-4 text-gray-500">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
          <p>Loading Elite Coach...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-gradient-to-br from-orange-50 to-gray-50">
      <AnimatePresence>
        {showSidebar && (
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="absolute inset-y-0 left-0 z-50 w-64 md:relative md:w-auto md:max-w-xs bg-white border-r border-orange-100 flex-shrink-0"
          >
            <ConversationSidebar
              conversations={conversations}
              activeConversation={activeConversation}
              onSelectConversation={selectConversation}
              onCreateConversation={createConversation}
              onArchiveConversation={archiveConversation}
              onCloseSidebar={() => setShowSidebar(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col">
        <div className="bg-white/80 backdrop-blur-sm border-b border-orange-100 p-4">
          <div className="flex items-center justify-between max-w-4xl mx-auto">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSidebar(!showSidebar)}
                className="hover:bg-orange-50"
              >
                <MessageCircle className="w-4 h-4" />
              </Button>
              <div>
                <h1 className="font-bold text-gray-900">Elite Coach</h1>
                <p className="text-sm text-gray-500">
                  {isConnected ? 'AI Training Analysis' : 'Connect Strava to Start'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {isConnected && (
          <div className="bg-white/60 backdrop-blur-sm border-b border-orange-100 px-4 py-3">
            <div className="max-w-4xl mx-auto">
              <QuickActions onActionClick={handleQuickAction} />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-4xl mx-auto space-y-6">
            <AnimatePresence>
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </AnimatePresence>
            
            {isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start"
              >
                <div className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-orange-100 max-w-md">
                  <div className="flex items-center gap-2 text-gray-500">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce delay-75" />
                      <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce delay-150" />
                    </div>
                    <span className="text-sm">Elite Coach is analyzing...</span>
                  </div>
                </div>
              </motion.div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="bg-white border-t border-orange-100 p-4">
          <div className="max-w-4xl mx-auto">
            {!isConnected ? (
              <div className="space-y-3">
                {requireLogin && (
                  <div className="p-3 border border-yellow-200 bg-yellow-50 rounded-lg text-sm flex items-center justify-between">
                    <span className="text-yellow-800">You need to log in to continue.</span>
                    <Button variant="outline" onClick={handleLogin} className="border-yellow-300">
                      Log in
                    </Button>
                  </div>
                )}
                <StravaConnect onConnect={handleStravaConnect} isConnecting={isConnecting} isFunctionsAvailable={functionsAvailable} />
              </div>
            ) : (
              <div className="flex gap-3">
                <Input
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Ask about your training, request analysis, or get coaching advice..."
                  className="flex-1 bg-gray-50 border-gray-200 focus:border-orange-300 focus:ring-orange-200"
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  disabled={isLoading}
                />
                <Button 
                  onClick={handleSendMessage}
                  disabled={!inputMessage.trim() || isLoading}
                  className="bg-orange-500 hover:bg-orange-600 px-4"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
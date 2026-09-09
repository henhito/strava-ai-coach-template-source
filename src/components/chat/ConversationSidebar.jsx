import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Plus, MessageCircle, Archive, Trash2, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

export default function ConversationSidebar({ 
  conversations, 
  activeConversation, 
  onSelectConversation, 
  onCreateConversation,
  onArchiveConversation 
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const handleCreateConversation = async () => {
    if (!newTitle.trim()) return;
    
    await onCreateConversation({
      title: newTitle.trim(),
      description: newDescription.trim() || null
    });
    
    setNewTitle('');
    setNewDescription('');
    setShowNewDialog(false);
  };

  const filteredConversations = conversations.filter(conv => 
    conv.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (conv.description && conv.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="w-80 bg-white border-r border-gray-200 h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">Conversations</h2>
          <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-orange-500 hover:bg-orange-600">
                <Plus className="w-4 h-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Conversation</DialogTitle>
                <DialogDescription>
                  Create a focused conversation on a specific training topic.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    placeholder="e.g., Marathon Training Plan"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description (optional)</Label>
                  <Textarea
                    id="description"
                    placeholder="What will you discuss in this conversation?"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    className="mt-1"
                    rows={3}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowNewDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateConversation} disabled={!newTitle.trim()}>
                    Create
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search conversations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Conversations List */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-2">
          {filteredConversations.map((conversation) => (
            <Card
              key={conversation.id}
              className={`p-3 cursor-pointer transition-all duration-200 hover:shadow-md ${
                activeConversation?.id === conversation.id
                  ? 'border-orange-300 bg-orange-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => onSelectConversation(conversation)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <MessageCircle className="w-4 h-4 text-orange-500" />
                    <h3 className="font-medium text-gray-900 truncate">
                      {conversation.title}
                    </h3>
                  </div>
                  
                  {conversation.description && (
                    <p className="text-xs text-gray-500 line-clamp-2 mb-2">
                      {conversation.description}
                    </p>
                  )}
                  
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs">
                      {conversation.message_count || 0} messages
                    </Badge>
                    <span className="text-xs text-gray-400">
                      {format(new Date(conversation.last_activity || conversation.created_date), 'MMM d')}
                    </span>
                  </div>
                </div>
                
                <div className="flex flex-col gap-1 ml-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-gray-400 hover:text-gray-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      onArchiveConversation(conversation.id);
                    }}
                  >
                    <Archive className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
          
          {filteredConversations.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <MessageCircle className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No conversations found</p>
              <p className="text-xs">Create your first conversation to get started</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
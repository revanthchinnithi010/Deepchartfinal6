import { useState, useRef, useEffect, useCallback } from "react";
import { useListNotes, useCreateNote, useUpdateNote, useDeleteNote, getListNotesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash, Search } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { tweenStandard } from "@/animations/motion";
import { 
  PageTransition, 
  AnimatedPresenceList, 
  AnimatedListItem, 
  AnimatedButton, 
  AnimatedCard,
  AnimatedIconButton
} from "@/components/animations";
import { toArray } from "@/lib/safeArray";

export default function Notebook() {
  const queryClient = useQueryClient();
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: notesRaw } = useListNotes();
  const notes = toArray(notesRaw, "notebook.notes");
  const createNote = useCreateNote({
    mutation: {
      onSuccess: (newNote) => {
        queryClient.invalidateQueries({ queryKey: getListNotesQueryKey() });
        setSelectedNoteId(newNote.id);
      }
    }
  });

  const deleteNote = useDeleteNote({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListNotesQueryKey() });
        setSelectedNoteId(null);
      }
    }
  });

  const updateNote = useUpdateNote();

  const handleCreate = () => {
    createNote.mutate({ data: { title: "New Note", content: "" } });
  };

  const filteredNotes = notes.filter(n => 
    n.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    n.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedNote = notes.find(n => n.id === selectedNoteId);

  // Auto-save logic
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  
  const initializedForId = useRef<number | null>(null);
  const lastSaved = useRef({ title: "", content: "" });
  const mutateFnRef = useRef(updateNote.mutate);
  mutateFnRef.current = updateNote.mutate;

  useEffect(() => {
    if (selectedNote && initializedForId.current !== selectedNote.id) {
      initializedForId.current = selectedNote.id;
      setTitle(selectedNote.title);
      setContent(selectedNote.content);
      lastSaved.current = { title: selectedNote.title, content: selectedNote.content };
    }
  }, [selectedNote]);

  useEffect(() => {
    if (!selectedNoteId || initializedForId.current !== selectedNoteId) return;
    
    const timer = setTimeout(() => {
      if (title !== lastSaved.current.title || content !== lastSaved.current.content) {
        mutateFnRef.current(
          { id: selectedNoteId, data: { title, content } },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: getListNotesQueryKey() });
              lastSaved.current = { title, content };
            }
          }
        );
      }
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [title, content, selectedNoteId, queryClient]);

  return (
    <PageTransition className="h-[calc(100vh-8rem)] flex gap-6">
      {/* Sidebar */}
      <Card className="glass-card w-80 flex flex-col border-none overflow-hidden shrink-0">
        <div className="p-4 border-b border-white/10 flex flex-col gap-4">
          <AnimatedButton onClick={handleCreate} className="w-full bg-primary hover:bg-primary/90">
            <Plus className="w-4 h-4 mr-2" />
            New Note
          </AnimatedButton>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search notes..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-input/50 border-white/10"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <AnimatedPresenceList className="space-y-1">
            {(filteredNotes || []).map((note, idx) => (
              <AnimatedListItem key={note.id} index={idx}>
                <button
                  onClick={() => setSelectedNoteId(note.id)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedNoteId === note.id 
                      ? "bg-primary/20 text-white" 
                      : "hover:bg-white/5 text-muted-foreground hover:text-white"
                  }`}
                >
                  <div className="font-medium truncate">{note.title || "Untitled"}</div>
                  <div className="text-xs opacity-70 truncate mt-1">
                    {new Date(note.updatedAt).toLocaleDateString()}
                  </div>
                </button>
              </AnimatedListItem>
            ))}
          </AnimatedPresenceList>
        </div>
      </Card>

      {/* Editor */}
      <Card className="glass-card flex-1 border-none flex flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          {selectedNote ? (
            <motion.div
              key={selectedNote.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={tweenStandard}
              className="flex-1 flex flex-col overflow-hidden"
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="text-xl font-bold bg-transparent border-none px-0 focus-visible:ring-0 shadow-none h-auto"
                  placeholder="Note Title"
                />
                <AnimatedIconButton
                  variant="ghost" 
                  size="icon" 
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0"
                  onClick={() => deleteNote.mutate({ id: selectedNote.id })}
                >
                  <Trash className="w-4 h-4" />
                </AnimatedIconButton>
              </div>
              <div className="flex-1 p-4 overflow-hidden flex flex-col">
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Start typing your journal entry..."
                  className="flex-1 resize-none bg-transparent border-none p-0 focus-visible:ring-0 shadow-none text-base leading-relaxed"
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center text-muted-foreground"
            >
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                <Plus className="w-8 h-8 opacity-50" />
              </div>
              <p>Select a note or create a new one</p>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </PageTransition>
  );
}

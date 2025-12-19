"use client";

/* -------------------------------------------------------------------------- */
/* IMPORTS                                                                    */
/* -------------------------------------------------------------------------- */

import React, { useState, useRef, useEffect, memo, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, ArrowRight, Upload, FileText, Layers, Network, MessageCircle, 
  X, Send, Download, Clock, AlertTriangle, BookOpen, GraduationCap, Check, 
  Eye, CheckCircle2, LayoutDashboard, BarChart3, Settings2, Trash2, Youtube, 
  FileDown, Copy, Volume2, Square, Settings, Image as ImageIcon, ExternalLink, 
  PenTool, Award
} from 'lucide-react';

import ReactFlow, { 
  Background, Controls, Node, Edge, useNodesState, useEdgesState, 
  ConnectionLineType, ReactFlowProvider, Panel
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';

import { jsPDF } from "jspdf";
import confetti from 'canvas-confetti';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

// 🔥 IMPORT TOAST
import { Toaster, toast } from 'sonner';

/* -------------------------------------------------------------------------- */
/* INTERFACES                                                                 */
/* -------------------------------------------------------------------------- */
interface Flashcard { front: string; back: string; }
interface QuizItem { q: string; a: string[]; correct: string; }
interface MindMapEdgeRaw { source: string; target: string; }
interface ExamQuestion { id: number; type: 'mcq' | 'text'; question: string; options?: string[]; correct?: string; }
interface GradingResult { score: string; feedback: string; corrections: { questionId: number; status: string; remark: string }[]; }

interface ResultData {
  title: string; summary: string; keyPoints: string[];
  stats: { accuracy: string; timeSaved: string };
  quiz: QuizItem[]; flashcards: Flashcard[]; mindMapEdges: MindMapEdgeRaw[];
}

interface ChatMessage { role: 'user' | 'ai'; content: string; }

interface AppSettings {
  apiKey: string;
  language: 'english' | 'arabic' | 'french' | 'spanish';
  voiceSpeed: number;
  model: 'gemini-pro' | 'gpt-4o' | 'gpt-3.5';
  difficulty: 'Easy' | 'Normal' | 'Hard';
}

/* -------------------------------------------------------------------------- */
/* UI COMPONENTS (Visual Features)                                            */
/* -------------------------------------------------------------------------- */

// 1.Aurora Background
const AuroraBackground = memo(() => (
  <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-[#050505]">
    <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
    <motion.div 
      animate={{ scale: [1, 1.1, 1], opacity: [0.2, 0.3, 0.2], x: [0, 30, 0], y: [0, -20, 0] }} 
      transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      className="absolute -top-[10%] -left-[10%] w-[600px] h-[600px] bg-green-900/20 rounded-full blur-[120px]" 
    />
    <motion.div 
      animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.2, 0.1], x: [0, -40, 0], y: [0, 40, 0] }} 
      transition={{ duration: 15, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      className="absolute top-[20%] right-[-10%] w-[500px] h-[500px] bg-emerald-900/20 rounded-full blur-[120px]" 
    />
    <motion.div 
      animate={{ scale: [1, 1.3, 1], opacity: [0.1, 0.3, 0.1] }} 
      transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 2 }}
      className="absolute bottom-[-10%] left-[20%] w-[700px] h-[500px] bg-teal-900/10 rounded-full blur-[120px]" 
    />
  </div>
));

// 2.Skeleton Loading
const SkeletonLoader = () => (
  <div className="w-full max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-6 p-4 animate-pulse">
    <div className="md:col-span-12 h-24 bg-zinc-900/50 border border-zinc-800 rounded-2xl"></div>
    <div className="md:col-span-8 h-[500px] bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8 space-y-4">
      <div className="h-6 w-1/3 bg-zinc-800 rounded"></div>
      <div className="space-y-2 mt-8">
        <div className="h-4 w-full bg-zinc-800 rounded"></div>
        <div className="h-4 w-11/12 bg-zinc-800 rounded"></div>
        <div className="h-4 w-full bg-zinc-800 rounded"></div>
      </div>
    </div>
    <div className="md:col-span-4 space-y-6">
      <div className="h-64 bg-zinc-900/50 border border-zinc-800 rounded-2xl"></div>
      <div className="h-48 bg-zinc-900/50 border border-zinc-800 rounded-2xl"></div>
    </div>
  </div>
);

// 3.Reading Progress Bar
const ReadingProgressBar = ({ targetRef }: { targetRef: React.RefObject<HTMLDivElement> }) => {
  const [progress, setProgress] = useState(0);
  
  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const scrolled = (scrollTop / (scrollHeight - clientHeight)) * 100;
      setProgress(scrolled);
    };
    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, [targetRef]);

  return (
    <div className="absolute top-0 left-0 w-full h-1 bg-zinc-800 z-20">
      <div 
        className="h-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-150 ease-out" 
        style={{ width: `${progress}%` }} 
      />
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* UTILITY FUNCTIONS                                                          */
/* -------------------------------------------------------------------------- */
const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));
const nodeWidth = 180; const nodeHeight = 60;

const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
    dagreGraph.setGraph({ rankdir: 'TB' });
    nodes.forEach((node) => dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight }));
    edges.forEach((edge) => dagreGraph.setEdge(edge.source, edge.target));
    dagre.layout(dagreGraph);
    nodes.forEach((node) => {
      const nodeWithPosition = dagreGraph.node(node.id);
      node.position = { x: nodeWithPosition.x - nodeWidth / 2, y: nodeWithPosition.y - nodeHeight / 2 };
    });
    return { nodes, edges };
};

const fireConfetti = () => {
  const duration = 3000;
  const animationEnd = Date.now() + duration;
  const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };
  const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;
  // @ts-ignore
  const interval = setInterval(function() {
    const timeLeft = animationEnd - Date.now();
    if (timeLeft <= 0) return clearInterval(interval);
    const particleCount = 50 * (timeLeft / duration);
    confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }, colors: ['#22c55e', '#ffffff'] });
    confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }, colors: ['#22c55e', '#ffffff'] });
  }, 250);
};

const handleTimestampClick = (timeStr: string) => {
    const parts = timeStr.replace(/[\[\]]/g, '').split(':');
    if (parts.length === 2) {
        const seconds = parseInt(parts[0]) * 60 + parseInt(parts[1]);
        const inputEl = document.getElementById('topic-input') as HTMLInputElement;
        const currentTopic = inputEl?.value || '';
        if (currentTopic.includes('youtube.com') || currentTopic.includes('youtu.be')) {
             const videoId = currentTopic.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/)?.[2];
             if (videoId) {
                window.open(`https://www.youtube.com/watch?v=${videoId}&t=${seconds}s`, '_blank');
                toast.success(`Jumping to ${timeStr} in video`); // 🔥 Toast Added
             }
        } else { 
            toast.info(`Timestamp: ${timeStr} (No video context)`); // 🔥 Toast Added
        }
    }
};

/* -------------------------------------------------------------------------- */
/* SUB-COMPONENTS                                                             */
/* -------------------------------------------------------------------------- */
const CodeBlock = memo(({ className, children, inline }: any) => {
  const match = /language-(\w+)/.exec(className || '');
  const [isCopied, setIsCopied] = useState(false);
  const handleCopy = useCallback(() => {
    const text = String(children).replace(/\n$/, '');
    navigator.clipboard.writeText(text); 
    setIsCopied(true); 
    toast.success("Code copied to clipboard!"); // 🔥 Toast Added
    setTimeout(() => setIsCopied(false), 2000);
  }, [children]);
  if (!inline && match) {
    return (
      <div className="rounded-lg overflow-hidden my-4 border border-zinc-700 shadow-xl bg-[#1e1e1e] group relative">
          <div className="bg-zinc-800/80 backdrop-blur px-4 py-2 flex justify-between items-center border-b border-zinc-700/50">
              <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">{match[1]}</span>
              <button onClick={handleCopy} className={`flex items-center gap-1.5 text-[10px] font-medium transition-all px-2 py-1 rounded-md ${isCopied ? 'text-green-400 bg-green-400/10' : 'text-zinc-400 hover:text-white hover:bg-zinc-700'}`}>
                  {isCopied ? (<><CheckCircle2 className="w-3 h-3" /> Copied!</>) : (<><Copy className="w-3 h-3" /> Copy</>)}
              </button>
          </div>
          <SyntaxHighlighter style={vscDarkPlus} language={match[1]} PreTag="div" customStyle={{ margin: 0, padding: '1rem', fontSize: '13px' }}>{String(children).replace(/\n$/, '')}</SyntaxHighlighter>
      </div>
    );
  }
  return <code className={`${className} bg-zinc-800/80 px-1.5 py-0.5 rounded text-green-400 font-mono text-xs border border-zinc-700`}>{children}</code>;
});
CodeBlock.displayName = 'CodeBlock';

const MarkdownRenderer = memo(({ content }: { content: string }) => (
    <ReactMarkdown
      components={{
        code: CodeBlock,
        p: ({children}) => <p className="mb-3 last:mb-0 leading-7 text-zinc-300">{children}</p>,
        strong: ({children}) => <strong className="font-bold text-white">{children}</strong>,
        ul: ({children}) => <ul className="list-disc pl-4 mb-3 space-y-1 text-zinc-300 marker:text-zinc-500">{children}</ul>,
        ol: ({children}) => <ol className="list-decimal pl-4 mb-3 space-y-1 text-zinc-300 marker:text-zinc-500">{children}</ol>,
        li: ({children}) => <li className="pl-1">{children}</li>,
        h1: ({children}) => <h1 className="text-xl font-bold text-white mt-6 mb-3 pb-2 border-b border-zinc-800">{children}</h1>,
        h2: ({children}) => <h2 className="text-lg font-bold text-white mt-5 mb-2">{children}</h2>,
        h3: ({children}) => <h3 className="text-sm font-bold text-green-400 mt-4 mb-1 uppercase tracking-wide">{children}</h3>,
        blockquote: ({children}) => <blockquote className="border-l-2 border-green-500 pl-4 py-1 my-4 bg-green-500/5 rounded-r text-zinc-400 italic text-sm">{children}</blockquote>,
        a: ({href, children}) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-green-400 hover:text-green-300 hover:underline">{children}</a>
      }}
    >
      {content.replace(/\[(\d{1,2}:\d{2})\]/g, '`$1`')}
    </ReactMarkdown>
));
MarkdownRenderer.displayName = 'MarkdownRenderer';

const Typewriter = memo(({ text, speed = 10, shouldAnimate = true, onComplete }: any) => {
  const [displayedText, setDisplayedText] = useState(shouldAnimate ? '' : text);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => {
    if (!shouldAnimate) { setDisplayedText(text); return; }
    let i = 0; setDisplayedText('');
    const interval = setInterval(() => {
      if (i < text.length) { setDisplayedText(text.substring(0, i + 1)); i++; } 
      else { clearInterval(interval); if (onCompleteRef.current) onCompleteRef.current(); }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed, shouldAnimate]);
  const renderedContent = useMemo(() => {
      return displayedText.split(/(\[`?\d{1,2}:\d{2}`?\])/g).map((part: string, i: number) => {
          if (part.match(/^\[`?\d{1,2}:\d{2}`?\]$/)) {
              const cleanTime = part.replace(/[`\[\]]/g, '');
              return (<button key={i} onClick={() => handleTimestampClick(cleanTime)} className="inline-flex items-center gap-1 mx-1 px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 text-[10px] font-mono hover:bg-red-500/20 transition-all cursor-pointer"><ExternalLink className="w-2.5 h-2.5" /> {cleanTime}</button>);
          }
          return <span key={i}><MarkdownRenderer content={part} /></span>;
      });
  }, [displayedText]);
  return (<div dir="auto">{renderedContent}{displayedText.length < text.length && shouldAnimate && <span className="inline-block w-2 h-4 bg-green-500 ml-1 animate-pulse align-middle" />}</div>);
});
Typewriter.displayName = 'Typewriter';

const DockItem = memo(({ icon: Icon, label, onClick, isActive, colorClass = "text-zinc-400 group-hover:text-white" }: any) => (
    <button onClick={onClick} className="relative group flex flex-col items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-2xl transition-all duration-300 hover:-translate-y-2 hover:scale-110 cursor-pointer">
      <div className={`flex items-center justify-center w-full h-full rounded-xl transition-all duration-300 ${isActive ? 'bg-zinc-800 shadow-inner' : 'hover:bg-zinc-800/50'}`}><Icon className={`w-5 h-5 md:w-6 md:h-6 transition-colors duration-300 ${isActive ? 'text-green-400' : colorClass}`} /></div>
      {isActive && <div className="absolute -bottom-2 w-1 h-1 bg-green-500 rounded-full shadow-[0_0_10px_rgba(34,197,94,0.8)]" />}
      <span className="absolute -top-12 px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wide opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0 whitespace-nowrap pointer-events-none bg-zinc-900 border border-zinc-800 text-white shadow-xl z-50">{label}<div className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-2 h-2 rotate-45 bg-zinc-900 border-r border-b border-zinc-800" /></span>
    </button>
));
DockItem.displayName = 'DockItem';

/* -------------------------------------------------------------------------- */
/* MAIN COMPONENT                                                             */
/* -------------------------------------------------------------------------- */

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  
  const [result, setResult] = useState<ResultData | null>(null);
  const [topic, setTopic] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [inputType, setInputType] = useState<'text' | 'youtube'>('text');

  const [activeTab, setActiveTab] = useState<'overview' | 'mindmap' | 'flashcards' | 'quiz'>('overview');
  const [hasAnimated, setHasAnimated] = useState(false);
  const [speakingItem, setSpeakingItem] = useState<string | null>(null);
  
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  
  const [isExamMode, setIsExamMode] = useState(false);
  const [examQuestions, setExamQuestions] = useState<ExamQuestion[]>([]);
  const [examAnswers, setExamAnswers] = useState<{[key: number]: string}>({});
  const [gradingResult, setGradingResult] = useState<GradingResult | null>(null);
  const [isGrading, setIsGrading] = useState(false);

  const [selectedAnswers, setSelectedAnswers] = useState<{ [key: number]: string }>({});
  const [flippedCards, setFlippedCards] = useState<{ [key: number]: boolean }>({});
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  
  const [settings, setSettings] = useState<AppSettings>({
    apiKey: '', language: 'english', voiceSpeed: 1, model: 'gemini-pro', difficulty: 'Normal'
  });

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const summaryScrollRef = useRef<HTMLDivElement>(null);

  // Load / Save Logic
  useEffect(() => {
    const savedResult = localStorage.getItem('study_ai_result');
    const savedSettings = localStorage.getItem('study_ai_settings');
    if (savedResult) {
      try { const parsed = JSON.parse(savedResult); setResult(parsed); setHasAnimated(true); if (parsed.mindMapEdges) processMindMapData(parsed.mindMapEdges); } catch (e) { }
    }
    if (savedSettings) { try { setSettings(JSON.parse(savedSettings)); } catch(e) {} }
  }, []);

  useEffect(() => { if (result) localStorage.setItem('study_ai_result', JSON.stringify(result)); }, [result]);
  useEffect(() => { localStorage.setItem('study_ai_settings', JSON.stringify(settings)); }, [settings]);

  useEffect(() => {
    if (chatScrollRef.current) { chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight; }
  }, [chatMessages, isChatLoading]);

  // Handlers
  const resetSession = useCallback(() => {
      setResult(null); setFile(null); setTopic(''); 
      setHasAnimated(false); setSelectedAnswers({}); setFlippedCards({}); 
      setIsExamMode(false); setGradingResult(null);
      setNodes([]); setEdges([]); setChatMessages([]);
      window.speechSynthesis.cancel();
      localStorage.removeItem('study_ai_result');
      toast("Session Cleared", { icon: "🗑️" }); // 🔥 Toast Added
  }, [setNodes, setEdges]);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]); reader.onerror = error => reject(error);
    });
  };

  const processMindMapData = useCallback((rawEdges: MindMapEdgeRaw[]) => {
    const uniqueNodes = new Set<string>();
    rawEdges.forEach(e => { uniqueNodes.add(e.source); uniqueNodes.add(e.target); });
    
    const newNodes: Node[] = Array.from(uniqueNodes).map((label, index) => ({
        id: label.replace(/\s+/g, '_').toLowerCase(),
        data: { label }, position: { x: 0, y: 0 },
        style: { background: '#18181b', color: '#e4e4e7', border: index === 0 ? '1px solid #22c55e' : '1px solid #27272a', borderRadius: '12px', padding: '12px', fontSize: '11px', fontFamily: 'JetBrains Mono, monospace', fontWeight: index === 0 ? 'bold' : 'normal', textAlign: 'center', width: 160, cursor: 'pointer' }
    }));
    const newEdges: Edge[] = rawEdges.map((e, i) => ({
        id: `e${i}`, source: e.source.replace(/\s+/g, '_').toLowerCase(), target: e.target.replace(/\s+/g, '_').toLowerCase(), type: ConnectionLineType.SmoothStep, animated: true, style: { stroke: '#52525b' }
    }));
    const layouted = getLayoutedElements(newNodes, newEdges);
    setNodes(layouted.nodes); setEdges(layouted.edges);
  }, [setNodes, setEdges]);

  const handleGenerate = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault(); if (!topic.trim() && !file) {
      toast.error("Please enter a topic or upload a file!"); // 🔥 Toast Added
      return;
    }
    setLoading(true); setError(null); resetSession(); 
    try {
      let fileData = null; let mimeType = null;
      if (file) { fileData = await fileToBase64(file); mimeType = file.type; }
      const res = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic, fileData, mimeType, type: inputType, settings }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation Failed");
      setResult(data); if (data.mindMapEdges) processMindMapData(data.mindMapEdges);
      toast.success("Study Guide Generated!"); // 🔥 Toast Added
    } catch (err: any) { 
      setError(err.message); 
      toast.error(`Error: ${err.message}`); // 🔥 Toast Added
    } finally { setLoading(false); }
  }, [topic, file, inputType, settings, resetSession, processMindMapData]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault(); if (!currentMessage.trim()) return;
    const userMsg = currentMessage; setChatMessages(p => [...p, { role: 'user', content: userMsg }]); setCurrentMessage(''); setIsChatLoading(true);
    
    // 🔥 FIX: Construct full context payload
    let contextPayload = topic;
    if (result) {
        contextPayload = `
            Title: ${result.title}
            Summary: ${result.summary}
            Key Points: ${result.keyPoints.join('\n')}
            Flashcards: ${result.flashcards.map(f => f.front + ':' + f.back).join('\n')}
        `;
    }

    try {
      const res = await fetch('/api/chat', { 
          method: 'POST', headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ messages: [...chatMessages, { role: 'user', content: userMsg }], context: contextPayload, settings }) 
      });
      const data = await res.json();
      setChatMessages(prev => [...prev, { role: 'ai', content: data.reply || "Error" }]);
    } catch (err) { setChatMessages(prev => [...prev, { role: 'ai', content: "Error." }]); } finally { setIsChatLoading(false); }
  };

  // Node Expansion (Mind Map)
  const onNodeClick = useCallback(async (_: any, node: Node) => {
      const label = node.data.label; if (!label) return;
      setNodes((nds) => nds.map(n => n.id === node.id ? { ...n, style: { ...n.style, borderColor: '#22c55e', borderStyle: 'dashed' }, data: { label: 'Thinking...' } } : n));
      toast.info(`Expanding topic: ${label}...`); // 🔥 Toast Added
      try {
          let fileData = null; let mimeType = null; if (file) { fileData = await fileToBase64(file); mimeType = file.type; }
          const res = await fetch('/api/generate', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ action: 'expand', nodeLabel: label, topic, fileData, mimeType, type: inputType }) });
          const data = await res.json();
          if (data.newEdges) {
              const allEdges = [...(result?.mindMapEdges || []), ...data.newEdges];
              if (result) setResult({ ...result, mindMapEdges: allEdges });
              processMindMapData(allEdges);
              toast.success("Mind Map Expanded!"); // 🔥 Toast Added
          }
      } catch (e) { 
        setNodes((nds) => nds.map(n => n.id === node.id ? { ...n, style: { ...n.style, borderColor: '#27272a', borderStyle: 'solid' }, data: { label } } : n)); 
        toast.error("Could not expand node."); // 🔥 Toast Added
      }
  }, [file, topic, inputType, result, setNodes, processMindMapData]);

  // Exam
  const startExam = useCallback(async () => {
      setLoading(true); setIsExamMode(true); setGradingResult(null); setExamAnswers({});
      toast.loading("Generating comprehensive exam..."); // 🔥 Toast Added
      try {
          let fileData = null; let mimeType = null; if (file) { fileData = await fileToBase64(file); mimeType = file.type; }
          const res = await fetch('/api/generate', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ action: 'exam', topic, fileData, mimeType, type: inputType, settings }) });
          const data = await res.json();
          setExamQuestions(data.exam || []);
          toast.dismiss(); // Remove loading toast
          toast.success("Exam Ready!"); // 🔥 Toast Added
      } catch (e) { 
        setError("Exam generation failed"); 
        setIsExamMode(false); 
        toast.error("Failed to generate exam"); // Toast Added
      } finally { setLoading(false); }
  }, [file, topic, inputType, settings]);

  const submitExam = useCallback(async () => {
      setIsGrading(true);
      toast.loading("Grading your answers..."); // Toast Added
      try {
          let fileData = null; let mimeType = null; if (file) { fileData = await fileToBase64(file); mimeType = file.type; }
          const userContext = examQuestions.map(q => ({ question: q.question, answer: examAnswers[q.id] || "No answer" }));
          const res = await fetch('/api/generate', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ action: 'grade', userAnswers: userContext, topic, fileData, mimeType, type: inputType }) });
          const data = await res.json();
          setGradingResult(data); 
          fireConfetti();
          toast.dismiss(); // Remove loading
          toast.success("Exam Graded! Great effort! 🎉"); // 🔥 Toast Added
      } catch(e) { 
        alert("Grading failed."); 
        toast.error("Grading failed. Please try again."); // 🔥 Toast Added
      } finally { setIsGrading(false); }
  }, [file, topic, inputType, examQuestions, examAnswers]);

  //  Added handleExportFlashcards with Toast
  const handleExportFlashcards = useCallback(() => {
    if (!result?.flashcards) return;
    const csvContent = "data:text/csv;charset=utf-8," + "Front,Back\n" + result.flashcards.map(card => `"${card.front.replace(/"/g, '""')}","${card.back.replace(/"/g, '""')}"`).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a"); 
    link.setAttribute("href", encodedUri); 
    link.setAttribute("download", `${result.title.replace(/\s+/g, '_')}_flashcards.csv`);
    document.body.appendChild(link); 
    link.click(); 
    document.body.removeChild(link);
    toast.success("Flashcards exported to CSV/Anki!"); // 🔥 Toast Added
  }, [result]);

  const handleTTS = useCallback((text: string, e?: React.MouseEvent) => {
      e?.stopPropagation(); if (!('speechSynthesis' in window)) {
        toast.error("Text-to-Speech not supported in this browser"); // 🔥 Toast Added
        return;
      }
      if (speakingItem === text) { window.speechSynthesis.cancel(); setSpeakingItem(null); } 
      else { window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.rate = settings.voiceSpeed; utterance.onend = () => setSpeakingItem(null); window.speechSynthesis.speak(utterance); setSpeakingItem(text); }
  }, [speakingItem, settings.voiceSpeed]);

  const handleDownloadPDF = () => {
      if (!result) return;
      const doc = new jsPDF(); doc.setFontSize(20); doc.setTextColor(34, 197, 94); doc.text(result.title || "Study Guide", 105, 20, { align: "center" }); doc.setFontSize(12); doc.setTextColor(0); const splitText = doc.splitTextToSize(result.summary, 180); doc.text(splitText, 15, 40); doc.save("Study_Guide.pdf");
      toast.success("PDF Downloaded successfully!"); // 🔥 Toast Added
  };

  const removeFile = (e: React.MouseEvent) => { 
    e.stopPropagation(); 
    setFile(null); 
    if (fileInputRef.current) fileInputRef.current.value = ""; 
    toast.info("File removed"); // 🔥 Toast Added
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white selection:bg-green-500/30 selection:text-green-200 font-sans overflow-x-hidden p-4 md:p-8 flex flex-col items-center relative">
      <style>{`.perspective-1000 { perspective: 1000px; } .preserve-3d { transform-style: preserve-3d; } .backface-hidden { backface-visibility: hidden; } .rotate-y-180 { transform: rotateY(180deg); } @keyframes spotlight { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } } .animate-spotlight { animation: spotlight 15s ease infinite; background-size: 200% 200%; }`}</style>
      
      {/* ADDED TOASTER */}
      <Toaster position="top-center" richColors theme="dark" />

      {/* AURORA BACKGROUND */}
      <AuroraBackground />

      {/* --- SETTINGS MODAL --- */}
      <AnimatePresence>
        {showSettings && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm">
                <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
                    <button onClick={() => setShowSettings(false)} className="absolute top-4 right-4 text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
                    <h2 className="text-xl font-bold flex items-center gap-2 mb-6"><Settings className="w-5 h-5 text-green-500" /> Settings</h2>
                    <div className="space-y-5">
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="block text-xs font-mono text-zinc-400 mb-2">DIFFICULTY</label><select value={settings.difficulty} onChange={(e: any) => setSettings({...settings, difficulty: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm outline-none text-white focus:border-green-500/50"><option>Easy</option><option>Normal</option><option>Hard</option></select></div>
                            <div><label className="block text-xs font-mono text-zinc-400 mb-2">LANG</label><select value={settings.language} onChange={(e: any) => setSettings({...settings, language: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm outline-none text-white focus:border-green-500/50"><option value="english">English</option><option value="arabic">Arabic</option></select></div>
                        </div>
                        <div><label className="block text-xs font-mono text-zinc-400 mb-2">VOICE SPEED ({settings.voiceSpeed}x)</label><input type="range" min="0.5" max="2" step="0.1" value={settings.voiceSpeed} onChange={(e) => setSettings({...settings, voiceSpeed: parseFloat(e.target.value)})} className="w-full accent-green-500" /></div>
                    </div>
                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* --- CHAT MODAL --- */}
      <AnimatePresence>
        {isChatOpen && result && (
          <motion.div initial={{ opacity: 0, y: 50, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 50, scale: 0.9 }} className="fixed bottom-28 left-1/2 -translate-x-1/2 w-full max-w-lg bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 rounded-3xl shadow-2xl flex flex-col h-[500px] z-[60] overflow-hidden ring-1 ring-white/10">
            <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/50"><span className="text-xs font-mono font-medium text-green-400 flex items-center gap-2"><div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>AI_TUTOR_CHAT</span><button onClick={() => setIsChatOpen(false)}><X className="w-4 h-4 text-zinc-500 hover:text-white" /></button></div>
            <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">{chatMessages.length === 0 && <p className="text-zinc-600 text-[10px] font-mono text-center mt-20">Ask me anything about the content...</p>}{chatMessages.map((msg, i) => (<div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-xs leading-relaxed ${msg.role === 'user' ? 'bg-zinc-100 text-zinc-950 font-medium' : 'bg-zinc-800 text-zinc-300 border border-zinc-700'}`}><MarkdownRenderer content={msg.content} /></div></div>))}{isChatLoading && <div className="flex gap-1 px-3"><div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce"></div><div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce delay-75"></div><div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce delay-150"></div></div>}</div>
            <form onSubmit={handleSendMessage} className="p-3 border-t border-zinc-800 flex gap-2 bg-zinc-950/50"><input value={currentMessage} onChange={(e) => setCurrentMessage(e.target.value)} placeholder="Type a question..." className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-green-500/50 transition-colors text-white"/><button type="submit" disabled={!currentMessage.trim() || isChatLoading} className="p-3 bg-zinc-100 text-black rounded-xl hover:bg-zinc-300 disabled:opacity-50"><Send className="w-4 h-4" /></button></form>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="text-center mb-8 max-w-xl mx-auto animate-fade-in relative w-full pt-4 font-mono z-10"><h1 className="text-3xl font-black tracking-tight flex items-center justify-center gap-2">Study_AI<span className="text-green-500 animate-pulse">_</span>Nexus</h1></header>

      <main className="max-w-6xl w-full flex flex-col items-center z-10 pb-40"> 
        <AnimatePresence mode="wait">
          {!result && !loading && !isExamMode && (
            <motion.div key="input" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="w-full max-w-2xl space-y-6">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl relative group transition-all hover:border-zinc-700">
                 <div className="flex items-center justify-between mb-4"><h2 className="text-sm font-bold flex items-center gap-2 text-zinc-400 font-mono"><Settings2 className="w-4 h-4 text-green-500" /> INPUT_SOURCE</h2><div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800"><button onClick={() => setInputType('text')} className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all flex items-center gap-2 ${inputType === 'text' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}><FileText className="w-3 h-3" /> Files</button><button onClick={() => setInputType('youtube')} className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all flex items-center gap-2 ${inputType === 'youtube' ? 'bg-red-950/30 text-red-400' : 'text-zinc-500'}`}><Youtube className="w-3 h-3" /> YouTube</button></div></div>
                 <div className="relative flex items-center gap-2">{inputType === 'text' && (<><input type="file" ref={fileInputRef} onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden" accept="application/pdf, image/*"/><button onClick={() => fileInputRef.current?.click()} className={`h-12 px-4 rounded-xl border flex items-center gap-2 text-sm transition-all ${file ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-zinc-950 border-zinc-800 text-zinc-400'}`}>{file ? <FileText className="w-4 h-4"/> : <Upload className="w-4 h-4"/>}</button></>)}<input id="topic-input" type="text" value={topic} onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleGenerate(e)} placeholder={inputType === 'youtube' ? "Paste YouTube Link..." : "Enter topic or paste text..."} className="flex-1 bg-zinc-950 border border-zinc-800 text-white px-4 h-12 rounded-xl focus:border-green-500/50 outline-none transition-all font-mono text-sm"/><button onClick={handleGenerate} className="h-12 w-12 bg-green-500 hover:bg-green-400 text-black rounded-xl flex items-center justify-center transition-all shadow-lg shadow-green-500/20"><ArrowRight className="w-5 h-5" /></button></div>
                 {file && inputType === 'text' && (<div className="mt-3 flex items-center justify-between bg-zinc-950/50 px-3 py-2 rounded-lg border border-zinc-800/50"><p className="text-[10px] text-green-400 font-mono flex items-center gap-2">{file.type.startsWith('image/') ? <ImageIcon className="w-3 h-3"/> : <FileText className="w-3 h-3"/>}{file.name}</p><button onClick={removeFile} className="text-zinc-500 hover:text-red-400"><X className="w-3 h-3"/></button></div>)}
              </div>
            </motion.div>
          )}

          {/* 2. SKELETON LOADING */}
          {loading && <SkeletonLoader />}

          {isExamMode && !loading && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-3xl space-y-8">
                  <div className="flex justify-between items-center mb-6"><h2 className="text-2xl font-bold flex items-center gap-2 text-white"><PenTool className="w-6 h-6 text-green-500" /> Advanced Exam</h2><button onClick={() => setIsExamMode(false)} className="text-xs text-zinc-500 hover:text-white">Exit Exam</button></div>
                  {gradingResult ? (
                      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 space-y-6"><div className="text-center"><h3 className="text-4xl font-black text-green-500 mb-2">{gradingResult.score}</h3><p className="text-zinc-400">{gradingResult.feedback}</p></div><div className="space-y-4">{gradingResult.corrections.map((corr, i) => (<div key={i} className={`p-4 rounded-xl border ${corr.status.toLowerCase().includes('correct') ? 'border-green-900/50 bg-green-950/20' : 'border-red-900/50 bg-red-950/20'}`}><p className="font-bold text-sm mb-1">Q {corr.questionId}</p><p className="text-zinc-300 text-sm">{corr.remark}</p></div>))}</div><button onClick={startExam} className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl font-bold transition-all">Retake Exam</button></div>
                  ) : (
                      <div className="space-y-6">{examQuestions.map((q, i) => (<div key={q.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6"><p className="font-medium text-lg text-white mb-4 flex gap-3"><span className="text-zinc-600 font-mono text-sm pt-1">0{i+1}</span>{q.question}</p>{q.type === 'mcq' ? (<div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-8">{q.options?.map((opt, idx) => (<button key={idx} onClick={() => setExamAnswers({...examAnswers, [q.id]: opt})} className={`text-left px-4 py-3 rounded-xl text-sm border transition-all ${examAnswers[q.id] === opt ? 'border-green-500 bg-green-500/10 text-green-400' : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:bg-zinc-800'}`}>{opt}</button>))}</div>) : (<textarea value={examAnswers[q.id] || ''} onChange={(e) => setExamAnswers({...examAnswers, [q.id]: e.target.value})} placeholder="Explain your answer..." className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-sm text-white focus:border-green-500/50 outline-none h-32 ml-8 w-[calc(100%-2rem)]" />)}</div>))}<button onClick={submitExam} disabled={isGrading} className="w-full py-4 bg-green-500 hover:bg-green-400 text-black font-bold rounded-xl text-lg shadow-lg shadow-green-500/20 transition-all flex justify-center items-center gap-2">{isGrading ? "AI Grading..." : "Submit Answers"} <Send className="w-5 h-5" /></button></div>
                  )}
              </motion.div>
          )}

          {result && !loading && !isExamMode && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full min-h-[600px]">
                {activeTab === 'overview' && (
                   <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                      <div className="md:col-span-12 bg-zinc-900 border border-zinc-800 rounded-2xl p-6"><h2 className="text-3xl font-black text-white mb-2">{result.title}</h2><div className="flex gap-4 text-xs font-mono text-zinc-500"><span className="flex items-center gap-1"><Clock className="w-3 h-3"/> {result.stats.timeSaved} Saved</span><span className="flex items-center gap-1 text-green-500"><CheckCircle2 className="w-3 h-3"/> {result.stats.accuracy} Accuracy</span></div></div>
                      <div className="md:col-span-8 bg-zinc-900 border border-zinc-800 rounded-2xl p-8 relative overflow-hidden" ref={summaryScrollRef} style={{maxHeight: '600px', overflowY: 'auto'}}>
                          
                          {/* 📏 6. Reading Progress Bar */}
                          <ReadingProgressBar targetRef={summaryScrollRef} />

                          <button onClick={(e) => handleTTS(result.summary, e)} className={`absolute top-6 right-6 p-2 rounded-full transition-all z-10 ${speakingItem === result.summary ? 'bg-red-500/20 text-red-400' : 'bg-zinc-800 text-zinc-400 hover:text-green-400'}`}>{speakingItem === result.summary ? <Square className="w-4 h-4 fill-current"/> : <Volume2 className="w-4 h-4"/>}</button><div className="flex items-center gap-2 text-zinc-500 font-mono text-xs uppercase tracking-widest mb-6"><BookOpen className="w-4 h-4 text-green-500"/> Executive Summary</div><Typewriter text={result.summary} className="text-zinc-300 leading-8 text-sm font-light" speed={5} shouldAnimate={!hasAnimated} onComplete={() => setHasAnimated(true)} />
                      </div>
                      <div className="md:col-span-4 bg-zinc-900 border border-zinc-800 rounded-2xl p-6"><div className="flex items-center gap-2 mb-4 text-zinc-500 font-mono text-xs uppercase tracking-widest"><BarChart3 className="w-4 h-4 text-green-500"/> Key Takeaways</div><ul className="space-y-3">{result.keyPoints.map((point, i) => (<li key={i} className="flex gap-3 text-sm text-zinc-300 items-start"><span className="mt-1.5 w-1.5 h-1.5 bg-green-500 rounded-full shrink-0"/><span dir="auto"><MarkdownRenderer content={point} /></span></li>))}</ul></div>
                   </div>
                )}
                
                {/* 5. GRAPH CONTROLS */}
                {activeTab === 'mindmap' && (
                   <div className="h-[600px] bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden relative shadow-2xl">
                       <div className="absolute top-4 left-4 z-10 px-3 py-1.5 bg-zinc-950/80 backdrop-blur border border-zinc-700 rounded-lg text-[10px] font-mono text-green-400 flex items-center gap-2"><Network className="w-3 h-3"/> CLICK NODE TO EXPAND</div>
                       
                       <ReactFlowProvider>
                         <ReactFlow nodes={nodes} edges={edges} onNodeClick={onNodeClick} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} fitView proOptions={{ hideAttribution: true }}>
                             <Background color="#3f3f46" gap={24} size={1} className="opacity-10" />
                             <Controls className="bg-zinc-800 border-zinc-700 text-zinc-400 rounded-lg p-1 [&>button]:border-b-zinc-700 hover:[&>button]:bg-zinc-700" showInteractive={true} />
                             <Panel position="bottom-right" className="bg-zinc-900/80 backdrop-blur px-3 py-1 rounded-full border border-zinc-800 text-[10px] text-zinc-500">
                                Drag to move • Scroll to zoom
                             </Panel>
                         </ReactFlow>
                       </ReactFlowProvider>
                   </div>
                )}

                {activeTab === 'flashcards' && (
                   <div><div className="flex justify-between items-center mb-4"><h3 className="text-xl font-bold flex items-center gap-2"><Layers className="w-5 h-5 text-green-500"/> Flashcards</h3><button onClick={handleExportFlashcards} className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border border-zinc-700 hover:border-green-500/50 hover:text-green-400 rounded-lg text-xs font-mono transition-all text-zinc-400"><FileDown className="w-3 h-3" /> Export to Anki/CSV</button></div><div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">{result.flashcards?.map((card, i) => (<div key={i} onClick={() => setFlippedCards(p => ({...p, [i]: !p[i]}))} className="h-64 cursor-pointer perspective-1000 group"><motion.div initial={false} animate={{ rotateY: flippedCards[i] ? 180 : 0 }} transition={{ duration: 0.4 }} className="w-full h-full relative preserve-3d"><div className="absolute inset-0 backface-hidden bg-zinc-900 border border-zinc-800 group-hover:border-green-500/40 rounded-2xl p-8 flex flex-col items-center justify-center text-center shadow-lg"><button onClick={(e) => handleTTS(card.front, e)} className="absolute top-4 right-4 text-zinc-600 hover:text-green-400"><Volume2 className="w-4 h-4"/></button><span className="absolute top-4 left-4 text-[10px] text-zinc-600 font-mono">0{i+1}</span><p className="font-bold text-xl text-white">{card.front}</p><span className="absolute bottom-4 text-[10px] text-green-500 font-mono animate-pulse">Click to flip</span></div><div className="absolute inset-0 backface-hidden bg-green-950/20 border border-green-500/20 rounded-2xl p-8 flex flex-col items-center justify-center text-center rotate-y-180"><button onClick={(e) => handleTTS(card.back, e)} className="absolute top-4 right-4 text-green-700 hover:text-green-400"><Volume2 className="w-4 h-4"/></button><p className="text-zinc-200 text-sm leading-relaxed">{card.back}</p></div></motion.div></div>))}</div></div>
                )}
                {activeTab === 'quiz' && (
                   <div className="max-w-3xl mx-auto space-y-6"><div className="flex justify-end mb-4"><button onClick={startExam} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 text-black font-bold rounded-xl transition-all shadow-lg shadow-green-500/20"><Award className="w-4 h-4"/> Start Full Exam</button></div>{result.quiz?.map((q, i) => (<div key={i} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6"><p className="font-medium text-lg text-white mb-4 flex gap-3"><span className="text-zinc-600 font-mono text-sm pt-1">0{i+1}</span>{q.q}</p><div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-8">{q.a.map((opt, idx) => { const isSelected = selectedAnswers[i] === opt; const isCorrect = opt === q.correct; const showResult = !!selectedAnswers[i]; let style = "border-zinc-800 bg-zinc-950 text-zinc-400 hover:bg-zinc-800"; if (showResult) { if (isCorrect) style = "border-green-500/50 bg-green-500/10 text-green-400"; else if (isSelected) style = "border-red-500/50 bg-red-500/10 text-red-400"; else style = "border-zinc-800 opacity-40"; } else if (isSelected) { style = "border-zinc-100 bg-zinc-100 text-zinc-950"; } return (<button key={idx} onClick={() => { if (!selectedAnswers[i]) { setSelectedAnswers(prev => ({...prev, [i]: opt})); if (opt === q.correct && Object.keys(selectedAnswers).length + 1 === result.quiz.length) fireConfetti(); } }} disabled={showResult} className={`text-left px-4 py-3 rounded-xl text-sm border transition-all flex justify-between font-mono ${style}`}><span>{opt}</span>{showResult && isCorrect && <Check className="w-4 h-4"/>}</button>); })}</div></div>))}</div>
                )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* --- DOCK NAVIGATION --- */}
        {result && !loading && !isExamMode && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-auto max-w-[95%] animate-fade-in-up">
             <div className="flex items-center gap-1 md:gap-2 px-3 py-2 md:px-4 md:py-3 rounded-2xl bg-zinc-900/80 backdrop-blur-2xl border border-white/10 shadow-2xl ring-1 ring-white/5">
                <DockItem icon={LayoutDashboard} label="Overview" isActive={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
                <DockItem icon={Network} label="Mind Map" isActive={activeTab === 'mindmap'} onClick={() => setActiveTab('mindmap')} />
                <DockItem icon={Layers} label="Flashcards" isActive={activeTab === 'flashcards'} onClick={() => setActiveTab('flashcards')} />
                <DockItem icon={GraduationCap} label="Quiz" isActive={activeTab === 'quiz'} onClick={() => setActiveTab('quiz')} />
                <div className="w-px h-8 bg-white/10 mx-1 md:mx-2"/>
                <DockItem icon={Settings} label="Settings" onClick={() => setShowSettings(true)} colorClass="text-zinc-400 group-hover:text-purple-400" />
                <DockItem icon={MessageCircle} label="AI Chat" isActive={isChatOpen} onClick={() => setIsChatOpen(!isChatOpen)} colorClass="text-zinc-400 group-hover:text-blue-400" />
                <DockItem icon={Download} label="Download PDF" onClick={handleDownloadPDF} colorClass="text-zinc-400 group-hover:text-yellow-400" />
                <DockItem icon={Trash2} label="Clear Session" onClick={resetSession} colorClass="text-zinc-400 group-hover:text-red-400" />
                <DockItem icon={Sparkles} label="New Topic" onClick={resetSession} colorClass="text-zinc-400 group-hover:text-green-400" />
             </div>
          </div>
        )}
      </main>
    </div>
  );
}
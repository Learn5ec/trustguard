import { Code, Bot } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface Props {
  codeReview?: string;
  isStreaming: boolean;
  streamedText: string;
}

export function CodeReviewPanel({ codeReview, isStreaming, streamedText }: Props) {
  // Try to extract codeReview from the stream if it's currently streaming
  let displayText = codeReview;

  if (isStreaming && !codeReview) {
    try {
      const match = streamedText.match(/"codeReview"\s*:\s*"([^"]*)/);
      if (match && match[1]) {
        displayText = match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
      }
    } catch {
      // Ignore parse errors during stream
    }
  }

  if (!displayText && !isStreaming) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden mt-8">
      <div className="bg-zinc-950 px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="bg-indigo-500/10 p-2 rounded-lg">
            <Code className="w-5 h-5 text-indigo-400" />
          </div>
          <h3 className="text-zinc-100 font-semibold">Code Review — Narrative Analysis</h3>
        </div>
        {isStreaming && (
          <div className="flex items-center space-x-2 text-indigo-400 text-sm">
            <Bot className="w-4 h-4 animate-pulse" />
            <span className="animate-pulse">Agent is reading source code...</span>
          </div>
        )}
      </div>
      <div className="p-6">
        <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-headings:text-zinc-200">
          {displayText ? (
            <ReactMarkdown>{displayText}</ReactMarkdown>
          ) : (
            <div className="h-24 flex items-center justify-center text-zinc-500 italic">
              Initializing code analysis...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import React, { useRef, useEffect } from 'react';
import { SupportedLanguage } from '../types';

interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  title: string;
  borderColor?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  language?: SupportedLanguage;
}

declare global {
  interface Window {
    Prism: any;
  }
}

export const CodeEditor: React.FC<CodeEditorProps> = ({ 
  value, 
  onChange, 
  readOnly = false, 
  placeholder,
  title,
  borderColor = 'border-vs-border',
  actions,
  children,
  language = SupportedLanguage.JAVASCRIPT
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const codeRef = useRef<HTMLElement>(null);

  // Map supported language enum to Prism language strings
  const getPrismLang = (lang: SupportedLanguage) => {
    switch(lang) {
      case SupportedLanguage.PYTHON: return 'python';
      case SupportedLanguage.TYPESCRIPT: return 'typescript';
      case SupportedLanguage.JAVASCRIPT: default: return 'javascript';
    }
  };

  // Sync scrolling between textarea and pre block
  const handleScroll = () => {
    if (textareaRef.current && preRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop;
      preRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  // Trigger Highlight on value change
  useEffect(() => {
    if (codeRef.current && window.Prism) {
      // Update text content manually to avoid React re-render flicker with Prism
      codeRef.current.textContent = value || placeholder || ''; 
      
      // If empty and has placeholder, don't highlight comments if it's just placeholder text logic, 
      // but here we just highlight whatever is in the block.
      
      codeRef.current.className = `language-${getPrismLang(language)}`;
      window.Prism.highlightElement(codeRef.current);
    }
  }, [value, language, placeholder]);

  return (
    <div className={`flex flex-col h-full border-2 rounded-lg overflow-hidden bg-vs-sidebar transition-colors duration-300 ${borderColor}`}>
      {/* Header */}
      <div className="px-4 py-2 bg-vs-sidebar border-b border-vs-border flex justify-between items-center select-none h-10 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-vs-fg uppercase tracking-wider opacity-70">{title}</span>
          {readOnly && <span className="text-[10px] px-1.5 py-0.5 bg-vs-border rounded text-vs-fg opacity-50">READ ONLY</span>}
        </div>
        {actions && (
          <div className="flex items-center gap-2">
            {actions}
          </div>
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 flex flex-col min-h-0 relative bg-vs-bg">
        {/* Banner rendered in flow */}
        {children}
        
        {/* Editor Container */}
        <div className="relative flex-1 min-h-0 w-full overflow-hidden">
          
          {/* Transparent Textarea for Input */}
          <textarea
            ref={textareaRef}
            className={`absolute inset-0 w-full h-full bg-transparent text-transparent caret-vs-fg font-mono text-sm p-4 resize-none outline-none leading-6 z-10 whitespace-pre overflow-auto ${readOnly ? 'cursor-default' : 'cursor-text'}`}
            style={{ color: 'transparent' }} /* Ensure text is transparent so Prism shows through */
            spellCheck={false}
            value={value}
            onChange={(e) => onChange && onChange(e.target.value)}
            onScroll={handleScroll}
            readOnly={readOnly}
            placeholder={placeholder}
          />

          {/* Syntax Highlighted Layer */}
          <pre
            ref={preRef}
            aria-hidden="true"
            className="absolute inset-0 w-full h-full m-0 p-4 font-mono text-sm leading-6 pointer-events-none overflow-hidden whitespace-pre !bg-transparent"
          >
            <code ref={codeRef} className={`language-${getPrismLang(language)}`}>
              {/* Content injected via useEffect */}
            </code>
          </pre>

        </div>
      </div>
    </div>
  );
};
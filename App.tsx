
import React, { useState, useEffect, useRef } from 'react';
import { Activity, Check, AlertTriangle, Cpu, Zap, RotateCcw, XCircle, CheckCircle2, FileCode, Terminal, ListChecks, Brain, Gauge, Copy, Search, Filter, Wand2, Bug, ChevronDown, ChevronUp, Play } from 'lucide-react';
import { CodeEditor } from './components/CodeEditor';
import { StatusBadge } from './components/StatusBadge';
import { useDebounce } from './hooks/useDebounce';
import { generateUnitTest, estimateTokens } from './services/geminiService';
import { runTests } from './services/executionService';
import { AgentStatus, TestSimulationResult, GenerationMetrics, SupportedLanguage, TestCaseResult, ModelTier } from './types';

type Scenario = { name: string; code: string };

const SCENARIOS: Record<SupportedLanguage, Scenario[]> = {
  [SupportedLanguage.JAVASCRIPT]: [
    {
      name: "Shopping Cart (Math)",
      code: `function calculateTotal(items, taxRate) {
  if (!Array.isArray(items)) {
    throw new Error("Items must be an array");
  }
  
  const subtotal = items.reduce((sum, item) => sum + item.price, 0);
  const tax = subtotal * taxRate;
  
  return Number((subtotal + tax).toFixed(2));
}`
    },
    {
      name: "User API (Async)",
      code: `async function fetchUserProfile(userId) {
  if (!userId) throw new Error("User ID is required");
  
  try {
    const response = await fetch(\`https://api.example.com/users/\${userId}\`);
    
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error("Network error");
    }
    
    const data = await response.json();
    return {
      id: data.id,
      fullName: \`\${data.firstName} \${data.lastName}\`,
      isActive: data.lastLogin > Date.now() - 86400000
    };
  } catch (error) {
    console.error(error);
    throw error;
  }
}`
    },
    {
      name: "Password Validator (Regex)",
      code: `function validatePassword(password) {
  const minLength = 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  const errors = [];
  if (password.length < minLength) errors.push("Too short");
  if (!hasUpperCase) errors.push("Missing uppercase");
  if (!hasLowerCase) errors.push("Missing lowercase");
  if (!hasNumbers) errors.push("Missing number");
  
  return {
    isValid: errors.length === 0,
    errors
  };
}`
    }
  ],
  [SupportedLanguage.TYPESCRIPT]: [
    {
      name: "Inventory System (Interfaces)",
      code: `interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
}

class InventoryManager {
  private products: Map<string, Product> = new Map();

  addProduct(product: Product): void {
    if (this.products.has(product.id)) {
      throw new Error("Product already exists");
    }
    this.products.set(product.id, product);
  }

  updateStock(id: string, quantity: number): number {
    const product = this.products.get(id);
    if (!product) throw new Error("Product not found");
    
    if (product.stock + quantity < 0) {
      throw new Error("Insufficient stock");
    }
    
    product.stock += quantity;
    return product.stock;
  }
}`
    },
    {
      name: "Generic Queue (Generics)",
      code: `class PriorityQueue<T> {
  private items: { item: T; priority: number }[] = [];

  enqueue(item: T, priority: number): void {
    const element = { item, priority };
    let added = false;

    for (let i = 0; i < this.items.length; i++) {
      if (priority < this.items[i].priority) {
        this.items.splice(i, 0, element);
        added = true;
        break;
      }
    }

    if (!added) {
      this.items.push(element);
    }
  }

  dequeue(): T | undefined {
    return this.items.shift()?.item;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }
}`
    },
    {
      name: "Status Reducer (Union Types)",
      code: `type Status = 'idle' | 'loading' | 'success' | 'error';
type Action = 
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; payload: any }
  | { type: 'FETCH_ERROR'; error: string };

interface State {
  status: Status;
  data: any | null;
  error: string | null;
}

export const statusReducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'FETCH_START':
      return { ...state, status: 'loading', error: null };
    case 'FETCH_SUCCESS':
      return { status: 'success', data: action.payload, error: null };
    case 'FETCH_ERROR':
      return { ...state, status: 'error', error: action.error };
    default:
      return state;
  }
};`
    }
  ],
  [SupportedLanguage.PYTHON]: [
    {
      name: "Weather API (Requests)",
      code: `import requests

def get_current_temperature(city):
    if not city:
        raise ValueError("City name required")
        
    api_key = "dummy_key"
    url = f"https://api.weather.com/v1/current?city={city}&key={api_key}"
    
    try:
        response = requests.get(url, timeout=5)
        response.raise_for_status()
        
        data = response.json()
        if "temp_c" not in data:
            raise KeyError("Temperature data missing")
            
        return data["temp_c"]
    except requests.exceptions.RequestException as e:
        print(f"API Error: {e}")
        return None`
    },
    {
      name: "Data Analysis (List Comp)",
      code: `def analyze_scores(scores):
    if not scores:
        return None
        
    valid_scores = [s for s in scores if isinstance(s, (int, float)) and 0 <= s <= 100]
    
    if not valid_scores:
        return {"average": 0, "max": 0, "min": 0}
        
    return {
        "average": round(sum(valid_scores) / len(valid_scores), 2),
        "max": max(valid_scores),
        "min": min(valid_scores),
        "count": len(valid_scores)
    }`
    },
    {
      name: "Bank Account (Class)",
      code: `class BankAccount:
    def __init__(self, owner, balance=0.0):
        self.owner = owner
        self.balance = balance
        self.is_active = True

    def deposit(self, amount):
        if not self.is_active:
            raise ValueError("Account is closed")
        if amount <= 0:
            raise ValueError("Deposit amount must be positive")
        self.balance += amount
        return self.balance

    def withdraw(self, amount):
        if not self.is_active:
            raise ValueError("Account is closed")
        if amount > self.balance:
            raise ValueError("Insufficient funds")
        self.balance -= amount
        return self.balance

    def close_account(self):
        self.is_active = False
        return self.balance`
    }
  ]
};

const App: React.FC = () => {
  const [language, setLanguage] = useState<SupportedLanguage>(SupportedLanguage.JAVASCRIPT);
  const [modelTier, setModelTier] = useState<ModelTier>(ModelTier.FLASH);
  const [sourceCode, setSourceCode] = useState<string>(SCENARIOS[SupportedLanguage.JAVASCRIPT][0].code);
  const [generatedTest, setGeneratedTest] = useState<string>("// Start typing to generate tests...");
  const [status, setStatus] = useState<AgentStatus>(AgentStatus.IDLE);
  const [metrics, setMetrics] = useState<GenerationMetrics>({ latencyMs: 0, tokenEstimate: 0 });
  const [simulation, setSimulation] = useState<TestSimulationResult>({ status: null, message: "" });
  const [simulating, setSimulating] = useState(false);
  const [filterTerm, setFilterTerm] = useState("");
  const [autoDetected, setAutoDetected] = useState(false);
  const [expandedErrorId, setExpandedErrorId] = useState<string | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(true);

  // Debounce source code input by 500ms
  const debouncedCode = useDebounce<string>(sourceCode, 500);
  const startTimeRef = useRef<number>(0);

  const handleLanguageChange = (newLang: SupportedLanguage) => {
    setLanguage(newLang);
    setSourceCode(SCENARIOS[newLang][0].code);
    setGeneratedTest("// Waiting for code...");
    setSimulation({ status: null, message: "" });
    setAutoDetected(false);
  };

  const handleScenarioChange = (code: string) => {
    setSourceCode(code);
    setGeneratedTest("// Waiting for code...");
    setSimulation({ status: null, message: "" });
  };

  // Auto-detect language heuristic
  const detectLanguage = (code: string): SupportedLanguage | null => {
    if (/def\s+/.test(code) || /import\s+pytest/.test(code) || /class\s+\w+:\s*$/.test(code)) return SupportedLanguage.PYTHON;
    if (/interface\s+/.test(code) || /type\s+\w+\s*=/.test(code) || /:\s*(string|number|boolean|void|any)(\[\])?/.test(code)) return SupportedLanguage.TYPESCRIPT;
    return null;
  };

  useEffect(() => {
    // Auto-detect language
    if (sourceCode) {
      const detected = detectLanguage(sourceCode);
      if (detected && detected !== language) {
        setLanguage(detected);
        setAutoDetected(true);
      }
    }
  }, [sourceCode, language]);

  // Agent Generation Effect
  useEffect(() => {
    let isMounted = true;

    const runAgent = async () => {
      if (!debouncedCode || debouncedCode.trim().length === 0) {
        setGeneratedTest("// Waiting for code...");
        setStatus(AgentStatus.IDLE);
        return;
      }

      setStatus(AgentStatus.THINKING);
      setSimulation({ status: null, message: "" });
      startTimeRef.current = performance.now();

      const result = await generateUnitTest(debouncedCode, language, modelTier);

      if (isMounted) {
        const endTime = performance.now();
        const latency = Math.round(endTime - startTimeRef.current);
        
        setGeneratedTest(result);
        setMetrics({
          latencyMs: latency,
          tokenEstimate: estimateTokens(result)
        });
        setStatus(AgentStatus.DONE);

        // Automatically run tests if generation looks successful
        if (!result.startsWith("// Error") && !result.startsWith("// Waiting")) {
           handleRunTests(debouncedCode, result);
        }
      }
    };

    runAgent();

    return () => {
      isMounted = false;
    };
  }, [debouncedCode, language, modelTier]);

  // Real Execution Handler
  const handleRunTests = async (src: string, tests: string) => {
    if (!tests || tests.startsWith("//")) return;

    setSimulating(true);
    setSimulation({ status: null, message: "" });
    setExpandedErrorId(null);
    setIsDetailsOpen(true);
    
    try {
      // Execute safely in worker/pyodide
      const results = await runTests(language, src, tests);
      
      const passedCount = results.filter(r => r.status === 'pass').length;
      const totalCount = results.length;
      const isSuccess = totalCount > 0 && passedCount === totalCount;

      setSimulation({
        status: isSuccess ? 'pass' : 'fail',
        message: isSuccess 
          ? `All ${totalCount} tests passed successfully`
          : `${totalCount - passedCount} failed, ${passedCount} passed`,
        details: results
      });

    } catch (error: any) {
      setSimulation({
        status: 'fail',
        message: 'Execution Error: ' + error.message,
        details: []
      });
    } finally {
      setSimulating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getLatencyColor = (ms: number) => {
    if (ms === 0) return 'text-vs-fg';
    if (ms < 1000) return 'text-vs-green';
    if (ms < 2000) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getModelIcon = (tier: ModelTier) => {
    switch(tier) {
      case ModelTier.LITE: return <Zap className="w-3 h-3 text-yellow-400" />;
      case ModelTier.PRO: return <Brain className="w-3 h-3 text-purple-400" />;
      default: return <Cpu className="w-3 h-3 text-vs-blue" />;
    }
  };

  // Filter details
  const filteredDetails = simulation.details?.filter(
    t => (t.name || "Unknown").toLowerCase().includes(filterTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col h-screen bg-vs-bg text-vs-fg font-sans overflow-hidden">
      {/* Header */}
      <header className="h-14 border-b border-vs-border bg-vs-sidebar flex items-center justify-between px-6 shrink-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-vs-blue/10 rounded-lg">
            <Cpu className="w-5 h-5 text-vs-blue" />
          </div>
          <h1 className="font-semibold text-lg tracking-tight hidden md:block">Zero-Touch <span className="text-vs-blue font-normal">Unit Test Agent</span></h1>
          <h1 className="font-semibold text-lg tracking-tight md:hidden">Zero-Touch</h1>
        </div>
        
        <div className="flex items-center gap-4">
          {!process.env.API_KEY && (
             <div className="hidden md:flex items-center gap-2 text-amber-500 text-xs bg-amber-500/10 px-3 py-1.5 rounded border border-amber-500/20">
               <AlertTriangle className="w-3 h-3" />
               <span>Demo Mode</span>
             </div>
          )}
          
          <div className="flex items-center gap-2 bg-vs-bg border border-vs-border rounded-md px-2 py-1" title="Select AI Model">
            <div className="opacity-70 flex items-center justify-center w-4">
               {getModelIcon(modelTier)}
            </div>
            <select 
              value={modelTier}
              onChange={(e) => setModelTier(e.target.value as ModelTier)}
              className="bg-transparent text-sm text-vs-fg outline-none cursor-pointer font-medium w-24 md:w-auto"
            >
              <option value={ModelTier.LITE}>Flash Lite (Fast)</option>
              <option value={ModelTier.FLASH}>Flash (Standard)</option>
              <option value={ModelTier.PRO}>Pro (Deep Thinking)</option>
            </select>
          </div>

          <div className="hidden md:flex items-center gap-2 bg-vs-bg border border-vs-border rounded-md px-2 py-1 relative">
            <span className="text-xs opacity-50 uppercase font-mono">Lang:</span>
            <select 
              value={language}
              onChange={(e) => handleLanguageChange(e.target.value as SupportedLanguage)}
              className="bg-transparent text-sm text-vs-fg outline-none cursor-pointer font-medium"
            >
              <option value={SupportedLanguage.JAVASCRIPT}>JavaScript</option>
              <option value={SupportedLanguage.TYPESCRIPT}>TypeScript</option>
              <option value={SupportedLanguage.PYTHON}>Python</option>
            </select>
            {autoDetected && (
               <div className="absolute -top-2 -right-2 flex h-3 w-3">
                 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-vs-blue opacity-75"></span>
                 <span className="relative inline-flex rounded-full h-3 w-3 bg-vs-blue"></span>
               </div>
            )}
          </div>

          <StatusBadge status={status} />
        </div>
      </header>

      {/* Main Content Split View */}
      <main className="flex-1 flex overflow-hidden flex-col md:flex-row">
        {/* Left Panel: Source Code */}
        <section className="flex-1 p-4 min-h-[300px] md:min-w-[300px] flex flex-col gap-2">
          <CodeEditor 
            title={`Source Code (${language === SupportedLanguage.PYTHON ? 'PY' : language === SupportedLanguage.TYPESCRIPT ? 'TS' : 'JS'})`} 
            value={sourceCode} 
            onChange={setSourceCode}
            placeholder="// Type your function here..."
            borderColor={status === AgentStatus.THINKING ? 'border-vs-blue/50' : 'border-vs-border'}
            language={language}
            actions={
              <div className="flex items-center gap-2">
                 {autoDetected && (
                   <div className="flex items-center gap-1 text-xs text-vs-blue animate-pulse mr-2">
                     <Wand2 className="w-3 h-3" />
                     <span>Auto-Detected</span>
                   </div>
                 )}
                 <div className="flex items-center gap-2 px-2 py-0.5 rounded bg-vs-bg border border-vs-border hover:border-vs-fg/30 transition-colors">
                  <FileCode className="w-3 h-3 opacity-60" />
                  <select 
                    className="bg-transparent text-xs outline-none cursor-pointer w-24 md:w-32 truncate"
                    onChange={(e) => {
                      const scenario = SCENARIOS[language].find(s => s.name === e.target.value);
                      if (scenario) handleScenarioChange(scenario.code);
                    }}
                    value={SCENARIOS[language].find(s => s.code === sourceCode)?.name || ""}
                  >
                    <option value="" disabled>Load Template...</option>
                    {SCENARIOS[language].map(s => (
                      <option key={s.name} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            }
          />
        </section>

        {/* Right Panel: Generated Test */}
        <section className="flex-1 p-4 bg-[#1e1e1e]/50 md:border-l border-t md:border-t-0 border-vs-border min-h-[300px] md:min-w-[300px] flex flex-col gap-2">
          <CodeEditor 
            title={`Generated ${language === SupportedLanguage.PYTHON ? 'Pytest' : 'Jest'} Test`}
            value={generatedTest} 
            readOnly={true}
            placeholder="// Tests will appear here automatically..."
            borderColor={simulation.status === 'pass' ? 'border-vs-green/50' : simulation.status === 'fail' ? 'border-red-500/50' : 'border-vs-border'}
            language={language}
            actions={
              <>
                <button
                  onClick={() => copyToClipboard(generatedTest)}
                  disabled={!generatedTest || generatedTest.startsWith("// Waiting")}
                  title="Copy Full Code"
                  className="flex items-center gap-1 px-2 py-0.5 text-xs bg-vs-bg border border-vs-border rounded hover:bg-vs-border/50 transition-colors disabled:opacity-50"
                >
                  <Copy className="w-3 h-3" />
                  <span>Copy All</span>
                </button>
                <div className="w-px h-3 bg-vs-border mx-1"></div>
                <button 
                  onClick={() => handleRunTests(debouncedCode, generatedTest)}
                  disabled={simulating || !generatedTest || generatedTest.startsWith("//")}
                  title="Run Tests in Sandbox"
                  className="flex items-center gap-1.5 px-3 py-0.5 bg-green-600/20 hover:bg-green-600/30 border border-green-600/50 rounded text-green-400 disabled:opacity-20 transition-colors"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span className="text-xs font-bold">RUN</span>
                </button>
              </>
            }
          >
            {/* Expanded Simulation Banner with Details */}
            {simulation.status && !simulating && status !== AgentStatus.THINKING && (
              <div className="w-full border-b border-vs-border animate-in fade-in slide-in-from-top-2 duration-300 shadow-2xl z-20 flex flex-col bg-vs-bg">
                {/* Summary Header & Toggle */}
                <div 
                  className={`px-4 py-2 flex items-center justify-between cursor-pointer select-none transition-colors ${
                    simulation.status === 'pass' 
                      ? 'bg-vs-green/10 text-vs-green hover:bg-vs-green/20' 
                      : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                  }`}
                  onClick={() => setIsDetailsOpen(!isDetailsOpen)}
                >
                  <div className="flex items-center gap-2 font-mono text-sm">
                    {isDetailsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    {simulation.status === 'pass' ? <Terminal className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                    <span className="font-bold">{simulation.status === 'pass' ? 'PASS' : 'FAIL'}</span>
                    <span className="opacity-70 text-xs ml-2 hidden sm:inline truncate max-w-[300px]">{simulation.message}</span>
                  </div>
                  
                  {/* Filter Input - Only visible when expanded */}
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    {isDetailsOpen && simulation.details && simulation.details.length > 0 && (
                      <div className="flex items-center gap-2 bg-vs-bg/40 px-2 py-0.5 rounded-md border border-vs-border/20 animate-in fade-in duration-200">
                        <Search className="w-3 h-3 opacity-50" />
                        <input 
                          type="text"
                          value={filterTerm}
                          onChange={(e) => setFilterTerm(e.target.value)}
                          placeholder="Filter tests..."
                          className="bg-transparent border-none outline-none text-xs text-vs-fg w-20 md:w-24 placeholder:text-vs-fg/30"
                          onClick={(e) => e.stopPropagation()}
                        />
                        {filterTerm && (
                          <span className="text-[10px] opacity-50">{filteredDetails?.length}/{simulation.details.length}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Collapsible Test Case Details */}
                {isDetailsOpen && (
                  <div className="max-h-[40vh] overflow-y-auto border-t border-vs-border/10 bg-vs-bg/50">
                    {filteredDetails && filteredDetails.length > 0 ? (
                       <div className="py-1">
                        {filteredDetails.map((test) => (
                          <div key={test.id} className="flex flex-col border-b border-vs-border/10 last:border-0">
                            <div 
                              className={`px-4 py-1.5 flex items-center gap-3 hover:bg-vs-border/30 group cursor-pointer ${expandedErrorId === test.id ? 'bg-vs-border/30' : ''}`}
                              onClick={() => test.status === 'fail' && setExpandedErrorId(expandedErrorId === test.id ? null : test.id)}
                            >
                              {test.status === 'pass' 
                                ? <Check className="w-3.5 h-3.5 text-vs-green shrink-0" /> 
                                : <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                              }
                              <span className={`text-xs font-mono opacity-80 truncate flex-1 ${test.status === 'fail' ? 'text-red-300' : 'text-vs-fg'}`} title={test.name}>
                                {test.name || "Unnamed Test"}
                              </span>
                              
                              <div className="flex items-center gap-3">
                                <span className="text-[10px] text-vs-fg opacity-40 font-mono">{test.duration}ms</span>
                              </div>
                            </div>

                            {/* Error Detail View */}
                            {test.status === 'fail' && expandedErrorId === test.id && test.failureDetails && (
                              <div className="px-4 py-3 bg-[#252526] border-t border-vs-border/20 text-xs font-mono overflow-x-auto animate-in slide-in-from-top-1 duration-200">
                                 <div className="text-red-300 mb-2 font-bold">
                                   ● {test.name || "Unnamed Test"}
                                 </div>
                                 <div className="pl-2 border-l-2 border-red-500/50 ml-1">
                                    <div className="mb-2 whitespace-pre-wrap text-vs-fg/90">
                                      {test.failureDetails.message}
                                    </div>
                                    {test.failureDetails.expected && (
                                      <div className="grid grid-cols-[80px_1fr] gap-2 mb-3 text-vs-fg/80">
                                        <span className="text-green-500">Expected:</span>
                                        <span className="text-green-500">{test.failureDetails.expected}</span>
                                        <span className="text-red-400">Received:</span>
                                        <span className="text-red-400">{test.failureDetails.received}</span>
                                      </div>
                                    )}
                                    <div className="text-vs-fg/50 whitespace-pre overflow-x-auto">
                                      {test.failureDetails.stack}
                                    </div>
                                 </div>
                              </div>
                            )}
                          </div>
                        ))}
                       </div>
                    ) : (
                        simulation.details && simulation.details.length > 0 && (
                           <div className="p-4 text-center text-xs text-vs-fg opacity-40 italic">
                             No tests match "{filterTerm}"
                           </div>
                        )
                    )}
                  </div>
                )}
              </div>
            )}

            {simulating && (
               <div className="w-full px-4 py-3 bg-vs-blue/5 border-b border-vs-blue/10 text-vs-blue flex items-center justify-center gap-3">
                  <Activity className="w-4 h-4 animate-spin" />
                  <span className="text-sm font-mono">Executing in Sandbox...</span>
               </div>
            )}
          </CodeEditor>
        </section>
      </main>

      {/* Footer */}
      <footer className="h-8 bg-vs-blue/10 border-t border-vs-blue/20 flex items-center px-4 justify-between text-xs font-mono text-vs-fg/80 select-none shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2" title="Time from typing stop to AI response">
            <Zap className="w-3 h-3 opacity-70" />
            <span>Latency: <span className={`font-bold ${getLatencyColor(metrics.latencyMs)}`}>{metrics.latencyMs}ms</span></span>
          </div>
          <div className="flex items-center gap-2" title="Estimated tokens used">
            <span className="opacity-70">Tokens:</span>
            <span>{metrics.tokenEstimate}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2 opacity-60">
           <span>{modelTier === ModelTier.PRO ? 'Gemini 3 Pro (Reasoning)' : modelTier === ModelTier.LITE ? 'Gemini Flash Lite' : 'Gemini 2.5 Flash'}</span>
           <span className="w-1 h-1 rounded-full bg-vs-fg opacity-30"></span>
           <span>Auto-Agent</span>
        </div>
      </footer>
    </div>
  );
};

export default App;


import { SupportedLanguage, TestCaseResult } from '../types';
import { JEST_POLYFILLS } from './runtimePolyfills';

declare global {
  interface Window {
    Babel: any;
    loadPyodide: any;
  }
}

let pyodideInstance: any = null;

/**
 * Transforms TypeScript/ES6 to ES5 for the browser using Babel Standalone.
 */
const transpileCode = (code: string): string => {
  if (!window.Babel) return code;
  try {
    const result = window.Babel.transform(code, {
      presets: [
        ['env', { 
          targets: { ie: '11' }, 
          modules: 'commonjs' 
        }], 
        'typescript'
      ],
      filename: 'file.ts',
    });
    return result.code || code;
  } catch (e) {
    console.error("Babel transform error:", e);
    throw new Error(`Syntax Error in Source Code: ${e}`);
  }
};

/**
 * Executes JavaScript or TypeScript tests in a Web Worker.
 */
const executeJS = async (sourceCode: string, testCode: string): Promise<TestCaseResult[]> => {
  return new Promise((resolve, reject) => {
    try {
      const transpiledSource = transpileCode(sourceCode);
      const transpiledTest = transpileCode(testCode);

      const workerScript = `
        ${JEST_POLYFILLS}
        
        var exports = {};
        var module = { exports: exports };
        self.exports = exports; 

        (async () => {
          try {
            const sourceText = ${JSON.stringify(transpiledSource)};
            const testText = ${JSON.stringify(transpiledTest)};
            
            try {
                eval(sourceText);
            } catch(e) {
                throw new Error("Source Code execution failed: " + e.message);
            }
            
            for (var key in exports) {
               if (exports.hasOwnProperty(key)) {
                  self[key] = exports[key];
               }
            }

            try {
                eval(testText);
            } catch(e) {
                throw new Error("Test Script execution failed: " + e.message);
            }
            
            setTimeout(() => {
                self.postMessage({ type: 'result', results: self.__test_results__ || [] });
            }, 100);
            
          } catch (e) {
            self.postMessage({ type: 'error', error: e.message + "\\n" + (e.stack || '') });
          }
        })();
      `;

      const blob = new Blob([workerScript], { type: 'application/javascript' });
      const worker = new Worker(URL.createObjectURL(blob));

      const timeoutId = setTimeout(() => {
        worker.terminate();
        reject(new Error("Execution timed out (Infinite loop?)"));
      }, 5000);

      worker.onmessage = (e) => {
        clearTimeout(timeoutId);
        if (e.data.type === 'result') {
          resolve(e.data.results);
        } else if (e.data.type === 'error') {
          resolve([{
              id: 'global_error',
              name: 'Runtime Error',
              status: 'fail',
              duration: 0,
              failureDetails: {
                  message: e.data.error,
                  stack: ''
              }
          }]);
        }
        worker.terminate();
      };

      worker.onerror = (e) => {
        clearTimeout(timeoutId);
        worker.terminate();
        reject(new Error(`Worker Error: ${e.message}`));
      };

    } catch (error: any) {
      reject(error);
    }
  });
};

/**
 * Executes Python tests using Pyodide.
 */
const executePython = async (sourceCode: string, testCode: string): Promise<TestCaseResult[]> => {
  if (!pyodideInstance) {
      if (!window.loadPyodide) {
          throw new Error("Pyodide script not loaded. Check internet connection.");
      }
      pyodideInstance = await window.loadPyodide();
      // Load micropip just in case, though we mock most things
      await pyodideInstance.loadPackage("micropip");
  }

  // Set code as globals to avoid syntax errors during string injection
  pyodideInstance.globals.set("USER_SOURCE_CODE", sourceCode);
  pyodideInstance.globals.set("USER_TEST_CODE", testCode);

  const pythonRunner = `
import sys
import traceback
from unittest.mock import MagicMock

# 1. Mock External Libraries
# This prevents 'ModuleNotFoundError' for common libs
sys.modules['requests'] = MagicMock()
sys.modules['numpy'] = MagicMock()
sys.modules['pandas'] = MagicMock()

# 2. Simple Pytest Shim
# This allows 'import pytest' to work and provides a basic 'raises' context manager
# so that 'with pytest.raises(...):' doesn't crash immediately.
class PytestShim:
    def raises(self, exc):
        class RaisesContext:
            def __enter__(self): return None
            def __exit__(self, exc_type, exc_val, exc_tb):
                if exc_type and issubclass(exc_type, exc):
                    return True # Suppress expected exception
                return False # Propagate others
        return RaisesContext()
    
    @property
    def mark(self):
        return MagicMock()
    
    def fixture(self, func):
        return func

sys.modules['pytest'] = PytestShim()

results = []

try:
    # 3. Execute Source and Test Code
    exec(USER_SOURCE_CODE, globals())
    exec(USER_TEST_CODE, globals())

    # 4. Discover Test Functions
    test_functions = [name for name in list(globals().keys()) if name.startswith('test_') and callable(globals()[name])]
    
    if not test_functions:
        results.append({
            "name": "Discovery", 
            "status": "fail", 
            "duration": 0, 
            "error": {"message": "No functions starting with 'test_' found.", "stack": ""}
        })

    # 5. Run Tests
    for test_name in test_functions:
        try:
            func = globals()[test_name]
            func()
            results.append({"name": test_name, "status": "pass", "duration": 1, "error": None})
        except AssertionError as ae:
            results.append({
                "name": test_name, 
                "status": "fail", 
                "duration": 1,
                "error": {
                    "message": str(ae) if str(ae) else "Assertion failed", 
                    "stack": traceback.format_exc()
                }
            })
        except Exception as e:
            results.append({
                "name": test_name, 
                "status": "fail", 
                "duration": 1,
                "error": {
                    "message": f"{type(e).__name__}: {str(e)}", 
                    "stack": traceback.format_exc()
                }
            })

except Exception as e:
    results.append({
        "name": "Runtime Error",
        "status": "fail",
        "duration": 0,
        "error": {
            "message": str(e),
            "stack": traceback.format_exc()
        }
    })

results
`;

  try {
      const pyResults = await pyodideInstance.runPythonAsync(pythonRunner);
      
      // Use proper conversion to handle Pyodide Proxies
      const jsResults = pyResults.toJs({
          dict_converter: Object.fromEntries,
          create_proxies: false
      });
      
      return jsResults.map((r: any) => ({
          id: r.name,
          name: r.name || "Unknown Python Test",
          status: r.status,
          duration: r.duration || 0,
          failureDetails: r.error ? {
              message: r.error.message,
              stack: r.error.stack,
          } : undefined
      }));

  } catch (e: any) {
      console.error("Pyodide Error", e);
      return [{
          id: 'py_error',
          name: 'Python Runtime Error',
          status: 'fail',
          duration: 0,
          failureDetails: {
              message: e.message,
              stack: e.stack || ''
          }
      }];
  }
};

export const runTests = async (
  language: SupportedLanguage, 
  sourceCode: string, 
  testCode: string
): Promise<TestCaseResult[]> => {
  if (language === SupportedLanguage.PYTHON) {
      return executePython(sourceCode, testCode);
  } else {
      return executeJS(sourceCode, testCode);
  }
};

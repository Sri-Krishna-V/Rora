
/**
 * This string is injected into the Web Worker to provide a Jest-like environment.
 * It mocks 'expect', 'describe', 'it', and 'jest' object functionality.
 */
export const JEST_POLYFILLS = `
  self.__test_results__ = [];
  
  // Simple hook storage
  let __beforeEach__ = null;
  let __afterEach__ = null;
  
  // Global state for test execution
  const describe = (name, fn) => {
    const safeName = name || 'Unnamed Suite';
    const previousBeforeEach = __beforeEach__;
    const previousAfterEach = __afterEach__;
    try {
      fn();
    } catch (e) {
      console.error("Error in describe block " + safeName, e);
      self.__test_results__.push({
        name: 'Describe Block: ' + safeName,
        status: 'fail',
        duration: 0,
        failureDetails: {
          message: e.message,
          stack: e.stack
        }
      });
    } finally {
      // Restore hooks to support simple nesting
      __beforeEach__ = previousBeforeEach;
      __afterEach__ = previousAfterEach;
    }
  };
  
  const beforeAll = (fn) => {
    try { fn(); } catch(e) { console.error("beforeAll failed", e); }
  };
  
  const afterAll = (fn) => {
    try { fn(); } catch(e) { console.error("afterAll failed", e); }
  };
  
  const beforeEach = (fn) => {
    __beforeEach__ = fn;
  };
  
  const afterEach = (fn) => {
    __afterEach__ = fn;
  };
  
  const it = async (name, fn) => {
    const safeName = name || 'Unnamed Test';
    const start = performance.now();
    try {
      if (__beforeEach__) await __beforeEach__();
      await fn();
      if (__afterEach__) await __afterEach__();
      
      const duration = Math.round(performance.now() - start);
      self.__test_results__.push({ 
        name: safeName, 
        status: 'pass', 
        duration 
      });
    } catch (e) {
      const duration = Math.round(performance.now() - start);
      self.__test_results__.push({ 
        name: safeName, 
        status: 'fail', 
        duration,
        failureDetails: { 
          message: e.message, 
          stack: e.stack,
          expected: e.expected,
          received: e.received
        } 
      });
    }
  };
  
  const test = it;

  // Expect assertion library implementation
  const expect = (actual) => {
    return {
      toBe: (expected) => {
        if (actual !== expected) {
          const err = new Error(\`Expected \${expected} but received \${actual}\`);
          err.expected = String(expected);
          err.received = String(actual);
          throw err;
        }
      },
      toEqual: (expected) => {
        // Simple deep equal
        const stringify = (obj) => JSON.stringify(obj, (k,v) => v === undefined ? '__undefined__' : v);
        const actualStr = stringify(actual);
        const expectedStr = stringify(expected);
        if (actualStr !== expectedStr) {
           const err = new Error(\`Expected deep equality failed\`);
           err.expected = JSON.stringify(expected, null, 2);
           err.received = JSON.stringify(actual, null, 2);
           throw err;
        }
      },
      toBeDefined: () => {
        if (actual === undefined) throw new Error(\`Expected value to be defined\`);
      },
      toBeUndefined: () => {
        if (actual !== undefined) throw new Error(\`Expected value to be undefined\`);
      },
      toBeNull: () => {
        if (actual !== null) throw new Error(\`Expected null but received \${actual}\`);
      },
      toBeTruthy: () => {
        if (!actual) throw new Error(\`Expected truthy but received \${actual}\`);
      },
      toBeFalsy: () => {
        if (actual) throw new Error(\`Expected falsy but received \${actual}\`);
      },
      toBeGreaterThan: (n) => {
        if (!(actual > n)) throw new Error(\`Expected \${actual} to be greater than \${n}\`);
      },
      toBeLessThan: (n) => {
        if (!(actual < n)) throw new Error(\`Expected \${actual} to be less than \${n}\`);
      },
      toContain: (item) => {
        if (Array.isArray(actual)) {
           if (!actual.includes(item)) throw new Error(\`Expected array to contain \${item}\`);
        } else if (typeof actual === 'string') {
           if (!actual.includes(item)) throw new Error(\`Expected string to contain \${item}\`);
        } else {
           throw new Error(\`toContain used on non-iterable\`);
        }
      },
      toThrow: (msg) => {
         let threw = false;
         try {
            actual();
         } catch (e) {
            threw = true;
            if (msg) {
               const errMsg = e.message || e;
               if (typeof msg === 'string' && !errMsg.includes(msg)) {
                   throw new Error(\`Expected error containing "\${msg}" but got "\${errMsg}"\`);
               }
               if (msg instanceof RegExp && !msg.test(errMsg)) {
                   throw new Error(\`Expected error matching \${msg} but got "\${errMsg}"\`);
               }
            }
         }
         if (!threw) throw new Error("Expected function to throw but it did not.");
      },
      resolves: {
        toBe: async (expected) => {
           const val = await actual;
           if (val !== expected) throw new Error(\`Expected \${expected} but received \${val}\`);
        },
        toEqual: async (expected) => {
           const val = await actual;
           if (JSON.stringify(val) !== JSON.stringify(expected)) throw new Error(\`Expected \${JSON.stringify(expected)} but received \${JSON.stringify(val)}\`);
        }
      },
      rejects: {
        toThrow: async (msg) => {
           let threw = false;
           try {
              await actual;
           } catch (e) {
              threw = true;
              if (msg) {
                 const errMsg = e.message || e;
                 if (typeof msg === 'string' && !errMsg.includes(msg)) {
                    throw new Error(\`Expected error containing "\${msg}" but got "\${errMsg}"\`);
                 }
              }
           }
           if (!threw) throw new Error("Expected promise to reject but it resolved.");
        }
      },
      not: {
         toBe: (expected) => {
            if (actual === expected) throw new Error(\`Expected value not to be \${expected}\`);
         },
         toEqual: (expected) => {
            if (JSON.stringify(actual) === JSON.stringify(expected)) throw new Error(\`Expected value not to equal \${expected}\`);
         },
         toBeNull: () => {
            if (actual === null) throw new Error(\`Expected value not to be null\`);
         }
      }
    };
  };

  // Jest mock functions
  const jest = {
    fn: (impl) => {
      const mockFn = (...args) => {
        mockFn.mock.calls.push(args);
        mockFn.mock.instances.push(this);
        return impl ? impl(...args) : undefined;
      };
      mockFn.mock = { calls: [], instances: [] };
      mockFn.mockReturnValue = (val) => { impl = () => val; return mockFn; };
      mockFn.mockResolvedValue = (val) => { impl = () => Promise.resolve(val); return mockFn; };
      mockFn.mockRejectedValue = (val) => { impl = () => Promise.reject(val); return mockFn; };
      mockFn.mockImplementation = (newImpl) => { impl = newImpl; return mockFn; };
      return mockFn;
    },
    spyOn: (obj, method) => {
      if (!obj) throw new Error("Cannot spyOn undefined object");
      const original = obj[method];
      const mockFn = jest.fn();
      
      let currentImpl = (...args) => {
          mockFn.mock.calls.push(args);
          if (mockFn.mock.impl) return mockFn.mock.impl(...args);
          // By default spyOn calls original unless mocked
          return original.apply(obj, args);
      };
      
      // Replace method
      obj[method] = (...args) => currentImpl(...args);
      
      // Add jest mock API to the spy
      obj[method].mock = mockFn.mock;
      obj[method].mockReturnValue = (val) => { mockFn.mock.impl = () => val; return obj[method]; };
      obj[method].mockResolvedValue = (val) => { mockFn.mock.impl = () => Promise.resolve(val); return obj[method]; };
      obj[method].mockRejectedValue = (val) => { mockFn.mock.impl = () => Promise.reject(val); return obj[method]; };
      obj[method].mockImplementation = (fn) => { mockFn.mock.impl = fn; return obj[method]; };
      obj[method].mockRestore = () => { obj[method] = original; };
      
      return obj[method];
    }
  };

  // Dummy require to handle imports
  const require = (moduleName) => {
      // Return self for local imports, or a mock proxy for external
      if (moduleName.startsWith('./') || moduleName.startsWith('../')) {
        return self;
      }
      return new Proxy({}, {
          get: (target, prop) => {
             return jest.fn(); 
          }
      });
  };

  // Expose to global scope
  self.describe = describe;
  self.it = it;
  self.test = test;
  self.expect = expect;
  self.jest = jest;
  self.beforeAll = beforeAll;
  self.afterAll = afterAll;
  self.beforeEach = beforeEach;
  self.afterEach = afterEach;
  self.require = require;
`;

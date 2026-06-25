const code = process.argv[2];
const fs = require('fs');

// Read the actual code
const userCode = fs.readFileSync(code, 'utf8');

// Inject tracing
const tracedCode = `
const __steps = [];
const __stack = [];
const __output = [];
const __originalLog = console.log;

console.log = (...args) => {
  const val = args.join(' ');
  __output.push(val);
  __originalLog(...args);
};

function __trace(stepInfo) {
  __steps.push({
    ...stepInfo,
    output: [...__output],
    stack: [...__stack]
  });
}

${userCode}

// Output trace
process.stderr.write(JSON.stringify({
  steps: __steps,
  output: __output
}));
`;

try {
  eval(tracedCode);
} catch(e) {
  process.stderr.write(JSON.stringify({ error: e.message, steps: [], output: [] }));
}
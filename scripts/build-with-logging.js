// Build wrapper with progress logging
import { spawn } from 'child_process';
import { appendFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const LOG_PATH = join(projectRoot, '.cursor', 'debug.log');
const SERVER_ENDPOINT = 'http://127.0.0.1:7242/ingest/b773e295-2062-4db8-a92f-2b7878abf6fc';

function log(message, data = {}) {
  const entry = {
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    location: 'build-with-logging.js',
    message,
    data,
    sessionId: 'debug-session',
    runId: 'build-debug',
    hypothesisId: 'BUILD_TIMEOUT'
  };
  
  try {
    appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n');
  } catch (e) {
    // Ignore file write errors
  }
  
  fetch(SERVER_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry)
  }).catch(() => {});
  
  console.log(`[BUILD-LOG] ${message}`, data);
}

// #region agent log
log('Build wrapper script started', { 
  projectRoot, 
  logPath: LOG_PATH,
  timestamp: Date.now() 
});
// #endregion

const buildStartTime = Date.now();

// #region agent log
log('Spawning npm run build process', { 
  command: 'npm run build',
  cwd: projectRoot,
  timestamp: Date.now() 
});
// #endregion

const buildProcess = spawn('npm', ['run', 'build'], {
  cwd: projectRoot,
  shell: true,
  stdio: 'inherit'
});

// #region agent log
log('Build process spawned', { 
  pid: buildProcess.pid,
  timestamp: Date.now() 
});
// #endregion

let lastOutputTime = Date.now();
const OUTPUT_TIMEOUT = 60000; // 60 seconds
const checkInterval = setInterval(() => {
  const timeSinceLastOutput = Date.now() - lastOutputTime;
  // #region agent log
  log('Build process heartbeat check', { 
    timeSinceLastOutput,
    totalElapsed: Date.now() - buildStartTime,
    pid: buildProcess.pid 
  });
  // #endregion
  
  if (timeSinceLastOutput > OUTPUT_TIMEOUT) {
    // #region agent log
    log('Build process appears hung - no output for 60s', { 
      timeSinceLastOutput,
      totalElapsed: Date.now() - buildStartTime 
    });
    // #endregion
    clearInterval(checkInterval);
  }
}, 10000); // Check every 10 seconds

buildProcess.stdout?.on('data', (data) => {
  lastOutputTime = Date.now();
  const output = data.toString();
  // #region agent log
  log('Build process stdout', { 
    output: output.substring(0, 200), // First 200 chars
    timestamp: Date.now() 
  });
  // #endregion
});

buildProcess.stderr?.on('data', (data) => {
  lastOutputTime = Date.now();
  const output = data.toString();
  // #region agent log
  log('Build process stderr', { 
    output: output.substring(0, 200), // First 200 chars
    timestamp: Date.now() 
  });
  // #endregion
});

buildProcess.on('close', (code) => {
  clearInterval(checkInterval);
  const duration = Date.now() - buildStartTime;
  // #region agent log
  log('Build process completed', { 
    exitCode: code,
    duration,
    durationSeconds: (duration / 1000).toFixed(2),
    timestamp: Date.now() 
  });
  // #endregion
  process.exit(code || 0);
});

buildProcess.on('error', (error) => {
  clearInterval(checkInterval);
  // #region agent log
  log('Build process error', { 
    error: error.message,
    stack: error.stack,
    timestamp: Date.now() 
  });
  // #endregion
  process.exit(1);
});















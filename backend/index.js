import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { exec } from 'child_process';
import bodyParser from 'body-parser';
import * as k8s from '@kubernetes/client-node';
import { fileURLToPath } from 'url';
import { buildTestRun } from './k8s/createTestRun.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🔹 Kubernetes client setup (EKS / AKS / local)
const kc = new k8s.KubeConfig();

// Automatically picks kubeconfig from:
// - ~/.kube/config (local)
// - In-cluster config (if deployed in k8s)
kc.loadFromDefault();

// Core API → ConfigMap, Pods, Services
const coreV1Api = kc.makeApiClient(k8s.CoreV1Api);

// Custom Objects API → k6 TestRun CR
const k8sApi = kc.makeApiClient(k8s.CustomObjectsApi);


const app = express();
const PORT = 5001;
const EXECUTION_MODE = process.env.EXECUTION_MODE || 'local';

console.log(">>> EXECUTION_MODE =", EXECUTION_MODE);

console.log("INDEX.JS LOADED");


// Create scripts directory structure if it doesn't exist
const SCRIPTS_BASE_DIR = './k6-scripts';
const ENVIRONMENTS = ['stage', 'prod'];
const APPLICATIONS = ['ab', 'cd'];

// Initialize directory structure
const initializeDirectoryStructure = () => {
  if (!fs.existsSync(SCRIPTS_BASE_DIR)) {
    fs.mkdirSync(SCRIPTS_BASE_DIR);
  }

  ENVIRONMENTS.forEach(env => {
    const envDir = path.join(SCRIPTS_BASE_DIR, env);
    if (!fs.existsSync(envDir)) {
      fs.mkdirSync(envDir);
    }

    APPLICATIONS.forEach(app => {
      const appDir = path.join(envDir, app);
      if (!fs.existsSync(appDir)) {
        fs.mkdirSync(appDir);
      }
    });
  });
};

initializeDirectoryStructure();

const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Get environment and application options
app.get('/api/config', (req, res) => {
  res.json({
    environments: ENVIRONMENTS.map(env => ({
      id: env,
      name: env.charAt(0).toUpperCase() + env.slice(1),
      value: env
    })),
    applications: APPLICATIONS.map(app => ({
      id: app,
      name: app.toUpperCase(),
      value: app
    }))
  });
});

// Get filtered list of K6 scripts based on environment and application
app.get('/api/scripts', (req, res) => {
  try {
    const { environment, application } = req.query;
    let scriptsPath = SCRIPTS_BASE_DIR;

    // Build path based on filters
    if (environment) {
      scriptsPath = path.join(scriptsPath, environment);
      if (application) {
        scriptsPath = path.join(scriptsPath, application);
      }
    }

    // If no specific path or path doesn't exist, return empty array
    if (!fs.existsSync(scriptsPath)) {
      return res.json([]);
    }

    let files = [];

    if (environment && application) {
      // Get scripts from specific environment/application folder
      const scriptFiles = fs.readdirSync(scriptsPath)
        .filter(file => file.endsWith('.js'))
        .map(file => ({
          id: file.replace('.js', ''),
          name: file.replace('.js', '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          filename: file,
          path: path.join(scriptsPath, file),
          environment: environment,
          application: application,
          fullId: `${environment}-${application}-${file.replace('.js', '')}`
        }));
      files = scriptFiles;
    } else if (environment && !application) {
      // Get scripts from all applications in the environment
      APPLICATIONS.forEach(app => {
        const appPath = path.join(scriptsPath, app);
        if (fs.existsSync(appPath)) {
          const appScripts = fs.readdirSync(appPath)
            .filter(file => file.endsWith('.js'))
            .map(file => ({
              id: file.replace('.js', ''),
              name: `${app.toUpperCase()} - ${file.replace('.js', '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`,
              filename: file,
              path: path.join(appPath, file),
              environment: environment,
              application: app,
              fullId: `${environment}-${app}-${file.replace('.js', '')}`
            }));
          files = files.concat(appScripts);
        }
      });
    } else {
      // Get all scripts from all environments and applications
      ENVIRONMENTS.forEach(env => {
        APPLICATIONS.forEach(app => {
          const fullPath = path.join(SCRIPTS_BASE_DIR, env, app);
          if (fs.existsSync(fullPath)) {
            const envAppScripts = fs.readdirSync(fullPath)
              .filter(file => file.endsWith('.js'))
              .map(file => ({
                id: file.replace('.js', ''),
                name: `${env.toUpperCase()} ${app.toUpperCase()} - ${file.replace('.js', '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`,
                filename: file,
                path: path.join(fullPath, file),
                environment: env,
                application: app,
                fullId: `${env}-${app}-${file.replace('.js', '')}`
              }));
            files = files.concat(envAppScripts);
          }
        });
      });
    }

    // Sort files by name
    files.sort((a, b) => a.name.localeCompare(b.name));
    
    res.json(files);
  } catch (error) {
    console.error('Error reading scripts directory:', error);
    res.json([]);
  }
});

// Get specific script content
app.get('/api/scripts/:environment/:application/:scriptId', (req, res) => {
  try {
    const { environment, application, scriptId } = req.params;
    const scriptPath = path.join(SCRIPTS_BASE_DIR, environment, application, `${scriptId}.js`);
    
    if (fs.existsSync(scriptPath)) {
      const content = fs.readFileSync(scriptPath, 'utf8');
      res.json({ 
        content, 
        scriptId,
        environment,
        application,
        fullId: `${environment}-${application}-${scriptId}`
      });
    } else {
      res.status(404).json({ message: 'Script not found' });
    }
  } catch (error) {
    console.error('Error reading script:', error);
    res.status(500).json({ message: 'Error reading script' });
  }
});

// Save or update a script
app.post('/api/scripts', (req, res) => {
  try {
    const { scriptName, content, environment, application } = req.body;
    
    if (!scriptName || !content || !environment || !application) {
      return res.status(400).json({ 
        message: 'Script name, content, environment, and application are required' 
      });
    }

    const filename = `${scriptName.toLowerCase().replace(/\s+/g, '-')}.js`;
    const scriptDir = path.join(SCRIPTS_BASE_DIR, environment, application);
    const scriptPath = path.join(scriptDir, filename);
    
    // Ensure directory exists
    if (!fs.existsSync(scriptDir)) {
      fs.mkdirSync(scriptDir, { recursive: true });
    }
    
    fs.writeFileSync(scriptPath, content);
    
    res.json({ 
      message: 'Script saved successfully',
      scriptId: scriptName.toLowerCase().replace(/\s+/g, '-'),
      filename,
      environment,
      application,
      fullId: `${environment}-${application}-${scriptName.toLowerCase().replace(/\s+/g, '-')}`
    });
  } catch (error) {
    console.error('Error saving script:', error);
    res.status(500).json({ message: 'Error saving script' });
  }
});

// Delete a script
app.delete('/api/scripts/:environment/:application/:scriptId', (req, res) => {
  try {
    const { environment, application, scriptId } = req.params;
    const scriptPath = path.join(SCRIPTS_BASE_DIR, environment, application, `${scriptId}.js`);
    
    if (fs.existsSync(scriptPath)) {
      fs.unlinkSync(scriptPath);
      res.json({ message: 'Script deleted successfully' });
    } else {
      res.status(404).json({ message: 'Script not found' });
    }
  } catch (error) {
    console.error('Error deleting script:', error);
    res.status(500).json({ message: 'Error deleting script' });
  }
});

// Run test with selected script
app.post('/api/run-test', upload.single('file'), async (req, res) => {

  let script;
  const { selectedScriptId, selectedEnvironment, selectedApplication } = req.body;

  // Priority: uploaded file > selected script > inline script
  if (req.file) {
    script = fs.readFileSync(req.file.path, 'utf8');
  } else if (selectedScriptId && selectedEnvironment && selectedApplication) {
    const scriptPath = path.join(SCRIPTS_BASE_DIR, selectedEnvironment, selectedApplication, `${selectedScriptId}.js`);
    if (fs.existsSync(scriptPath)) {
      script = fs.readFileSync(scriptPath, 'utf8');
    } else {
      return res.status(400).json({ message: 'Selected script not found' });
    }
  } else if (req.body.script) {
    script = req.body.script;
  } else {
    return res.status(400).json({ message: 'No script provided' });
  }

  // Extract load configuration from request body
  const { 
    rampUpVUs, rampUpDuration, 
    steadyVUs, steadyDuration, 
    rampDownVUs, rampDownDuration 
  } = req.body;

  // Modify the script to include the load configuration
  const modifiedScript = modifyScriptWithLoadConfig(script, {
    rampUpVUs, rampUpDuration,
    steadyVUs, steadyDuration,
    rampDownVUs, rampDownDuration
  });

  fs.writeFileSync('test-script.js', modifiedScript);

  // Run K6 with detailed output including tags
  // 🔀 EXECUTION MODE SWITCH
if (EXECUTION_MODE === 'local') {

  // ✅ LOCAL k6 EXECUTION (old code yahin aaya)
  exec(`k6 run --out json=results.json test-script.js`, (error, stdout, stderr) => {

    if (error && error.code !== 99) {
      console.error('k6 run error:', error);
      return res.status(500).json({ 
        message: 'Test failed to start', 
        error: stderr,
        output: stdout 
      });
    }

    const metrics = parseK6Metrics(stdout);
    const urlMetrics = parseUrlMetrics();

    const message = error && error.code === 99 
      ? 'Test completed with threshold violations' 
      : 'Test completed successfully';

    return res.json({ 
      message, 
      output: stdout, 
      metrics,
      urlMetrics,
      thresholdViolated: error && error.code === 99,
      scriptUsed: selectedScriptId || 'inline',
      environment: selectedEnvironment,
      application: selectedApplication
    });
  });

} else {

   // ✅ REAL CLUSTER MODE (EKS / AKS)
  try {
    const testRunName = `k6-test-${Date.now()}`;
    const configMapName = `k6-script-${Date.now()}`;

    // 1️⃣ Create ConfigMap (FIXED)
    await coreV1Api.createNamespacedConfigMap({
      namespace: 'k6',
      body: {
        metadata: {
          name: configMapName
        },
        data: {
          'test.js': modifiedScript
        }
      }
    });

    // 2️⃣ Create TestRun CR
    const body = buildTestRun({
      name: testRunName,
      scriptConfigMap: configMapName
    });

    await k8sApi.createNamespacedCustomObject({
    group: 'k6.io',
    version: 'v1alpha1',
    namespace: 'k6',
    plural: 'testruns',
    body: body,
});


    // 3️⃣ Response
    return res.json({
      executionMode: 'cluster',
      jobId: testRunName,
      configMap: configMapName,
      message: 'Test submitted to Kubernetes cluster'
    });

  } catch (err) {
    console.error('❌ Cluster submission failed:', err);

    return res.status(500).json({
      executionMode: 'cluster',
      error: 'Failed to submit test to cluster',
      details: err.body || err.message
    });
  }
}


});

function modifyScriptWithLoadConfig(script, config) {
  const { rampUpVUs, rampUpDuration, steadyVUs, steadyDuration, rampDownVUs, rampDownDuration } = config;
  
  // Create stages configuration
  const stages = [];
  
  if (rampUpVUs > 0 && rampUpDuration && rampUpDuration !== '0s') {
    stages.push(`{ duration: '${rampUpDuration}', target: ${rampUpVUs} }`);
  }
  
  if (steadyVUs > 0 && steadyDuration && steadyDuration !== '0s') {
    stages.push(`{ duration: '${steadyDuration}', target: ${steadyVUs} }`);
  }
  
  if (rampDownVUs >= 0 && rampDownDuration && rampDownDuration !== '0s') {
    stages.push(`{ duration: '${rampDownDuration}', target: ${rampDownVUs} }`);
  }

  // Replace the options in the script
  const stagesConfig = stages.length > 0 ? 
    `stages: [${stages.join(', ')}]` : 
    `vus: ${steadyVUs || 10}, duration: '${steadyDuration || '30s'}'`;

  // Find and replace the export const options
  const optionsRegex = /export\s+const\s+options\s*=\s*{[^}]*};?/;
  const newOptions = `export const options = {
  ${stagesConfig},
  thresholds: {
    'http_req_duration': ['p(95)<5000'], // 5 second threshold - more realistic
    'http_req_failed': ['rate<0.5'], // 50% failure rate threshold - very lenient
  },
};`;

  if (optionsRegex.test(script)) {
    return script.replace(optionsRegex, newOptions);
  } else {
    // If no options found, add them at the top after imports
    const lines = script.split('\n');
    const importEndIndex = lines.findIndex(line => !line.trim().startsWith('import') && line.trim() !== '');
    lines.splice(importEndIndex >= 0 ? importEndIndex : 0, 0, '', newOptions, '');
    return lines.join('\n');
  }
}

function parseK6Metrics(output) {
  const metrics = {};
  const lines = output.split('\n');

  for (let line of lines) {
    if (line.includes('http_req_duration')) {
      const avgMatch = line.match(/avg=([\d.]+ms)/);
      const p90Match = line.match(/p\(90\)=([\d.]+ms)/);
      const p95Match = line.match(/p\(95\)=([\d.]+ms)/);
      if (avgMatch) metrics.http_req_duration_avg = avgMatch[1];
      if (p90Match) metrics.http_req_duration_p90 = p90Match[1];
      if (p95Match) metrics.http_req_duration_p95 = p95Match[1];
    }

    if (line.includes('http_req_failed')) {
      const failMatch = line.match(/:\s+([\d.]+%)/);
      if (failMatch) metrics.http_req_failed = failMatch[1];
    }

    if (line.includes('http_reqs')) {
      const reqsMatch = line.match(/:\s+(\d+)/);
      if (reqsMatch) metrics.http_reqs = parseInt(reqsMatch[1]);
    }

    if (line.includes('iterations')) {
      const iterMatch = line.match(/:\s+(\d+)/);
      if (iterMatch) metrics.iterations = parseInt(iterMatch[1]);
    }

    if (line.includes('vus_max')) {
      const vusMaxMatch = line.match(/:\s+(\d+)/);
      if (vusMaxMatch) metrics.vus_max = parseInt(vusMaxMatch[1]);
    }

    if (line.includes('vus') && !line.includes('vus_max')) {
      const vusMatch = line.match(/:\s+(\d+)/);
      if (vusMatch) metrics.vus = parseInt(vusMatch[1]);
    }
  }

  return metrics;
}

function parseUrlMetrics() {
  try {
    // Read the JSON output file if it exists
    if (fs.existsSync('results.json')) {
      const jsonData = fs.readFileSync('results.json', 'utf8');
      const lines = jsonData.trim().split('\n');
      const urlStats = {};

      lines.forEach(line => {
        try {
          const data = JSON.parse(line);
          
          if (data.type === 'Point' && data.metric === 'http_req_duration' && data.data && data.data.tags) {
            const url = data.data.tags.url;
            const status = data.data.tags.status;
            const duration = data.data.value;

            if (!urlStats[url]) {
              urlStats[url] = {
                label: url,
                requests_total: 0,
                request_duration_ms: [],
                request_errors: 0
              };
            }

            urlStats[url].requests_total++;
            urlStats[url].request_duration_ms.push(duration);
            
            if (status && (status.startsWith('4') || status.startsWith('5'))) {
              urlStats[url].request_errors++;
            }
          }
        } catch (e) {
          // Skip invalid JSON lines
        }
      });

      // Calculate average duration for each URL
      const result = Object.values(urlStats).map(stat => ({
        label: stat.label,
        requests_total: stat.requests_total,
        request_duration_ms: stat.request_duration_ms.length > 0 
          ? Math.round(stat.request_duration_ms.reduce((a, b) => a + b, 0) / stat.request_duration_ms.length)
          : 0,
        request_errors: stat.request_errors
      }));

      // Clean up the results file
      fs.unlinkSync('results.json');
      
      return result;
    }
    
    // Fallback: parse from console output if JSON file doesn't exist
    return parseUrlMetricsFromConsole();
    
  } catch (error) {
    console.error('Error parsing URL metrics:', error);
    return [];
  }
}

function parseUrlMetricsFromConsole() {
  try {
    const scriptContent = fs.readFileSync('test-script.js', 'utf8');
    const urlRegex = /http\.get\(['"`](https?:\/\/[^'"`]+)['"`]/g;
    const urls = [];
    let match;
    
    while ((match = urlRegex.exec(scriptContent)) !== null) {
      urls.push(match[1]);
    }
    
    return urls.map(url => ({
      label: url,
      requests_total: 0,
      request_duration_ms: 0,
      request_errors: 0
    }));
  } catch (error) {
    return [];
  }
}

// Initialize with sample scripts organized by environment and application
const initializeSampleScripts = () => {
  const sampleScripts = [
    {
      environment: 'stage',
      application: 'ab',
      name: 'ab-stage-homepage-test',
      content: `import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  vus: 10,
  duration: '2m',
};

export default function() {
  const res = http.get('https://www.google.com', {
    headers: {
      'Cookie': 'xxxxx=true', 
    }
  });
  check(res, { "Stage ab Home status is 200": (res) => res.status === 200 });
  sleep(1);
}`
    },
    {
      environment: 'stage',
      application: 'ab',
      name: 'ab-stage-plp-test',
      content: `import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  vus: 5,
  duration: '1m',
};

export default function() {
  const res = http.get('https://www.google.com/', {
    headers: {
      'Cookie': 'xxxxx=true', 
    }
  });
  check(res, { "Stage ab PLP status is 200": (res) => res.status === 200 });
  sleep(2);
}`
    },
    {
      environment: 'stage',
      application: 'cd',
      name: 'cd-stage-homepage-test',
      content: `import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  vus: 8,
  duration: '90s',
};

export default function() {
  const res = http.get('https://www.google.com');
  check(res, { "Stage cd Home status is 200": (res) => res.status === 200 });
  sleep(1);
}`
    },
    {
      environment: 'prod',
      application: 'ab',
      name: 'ab-prod-homepage-test',
      content: `import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  vus: 20,
  duration: '5m',
};

export default function() {
  const res = http.get('https://www.google.com');
  check(res, { "Prod ab Home status is 200": (res) => res.status === 200 });
  sleep(3);
}`
    },
    {
      environment: 'prod',
      application: 'cd',
      name: 'cd-prod-homepage-test',
      content: `import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  vus: 15,
  duration: '3m',
};

export default function() {
  const res = http.get('https://www.google.com');
  check(res, { "Prod cd Home status is 200": (res) => res.status === 200 });
  sleep(2);
}`
    }
  ];

  sampleScripts.forEach(script => {
    const scriptDir = path.join(SCRIPTS_BASE_DIR, script.environment, script.application);
    const scriptPath = path.join(scriptDir, `${script.name}.js`);
    
    if (!fs.existsSync(scriptPath)) {
      fs.writeFileSync(scriptPath, script.content);
    }
  });
};

// Initialize sample scripts on server start
initializeSampleScripts();

app.get('/', (req, res) => {
  res.send('K6 Load Test Runner Backend with Environment & Application Filtering');
});

app.listen(PORT, () => {
  console.log(`Backend server listening at http://localhost:${PORT}`);
  console.log(`Scripts directory structure:`);
  console.log(`${path.resolve(SCRIPTS_BASE_DIR)}/`);
  console.log(`├── stage/`);
  console.log(`│   ├── ab/`);
  console.log(`│   └── cd/`);
  console.log(`└── prod/`);
  console.log(`    ├── ab/`);
  console.log(`    └── cd/`);
});
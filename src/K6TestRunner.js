import React, { useState, useEffect } from 'react';
import axios from 'axios';
import DropDowns from './DropDowns';
import './K6TestRunner.css';

const K6TestRunner = React.memo(() => {
  const [testCases, setTestCases] = useState([
    {
      id: Date.now(),
      scriptText: '',
      selectedFile: null,
      selectedScriptId: '',
      selectedEnvironment: '',
      selectedApplication: '',
      isRunning: false,
      output: '',
      metrics: null,
      urlMetrics: null,
      rampUpVUs: 0,
      rampUpDuration: '0s',
      steadyVUs: 10,
      steadyDuration: '30s',
      rampDownVUs: 0,
      rampDownDuration: '0s',
    },
  ]);
  const [availableScripts, setAvailableScripts] = useState([]);
  const [environments, setEnvironments] = useState([]);
  const [applications, setApplications] = useState([]);
  const [toast, setToast] = useState(null);
  const [showScriptManager, setShowScriptManager] = useState(false);
  const [newScriptName, setNewScriptName] = useState('');
  const [newScriptContent, setNewScriptContent] = useState('');
  const [newScriptEnvironment, setNewScriptEnvironment] = useState('');
  const [newScriptApplication, setNewScriptApplication] = useState('');

  // Load configuration and scripts on component mount
  useEffect(() => {
    loadConfiguration();
  }, []);

  const loadConfiguration = async () => {
    try {
      const response = await axios.get('http://localhost:5001/api/config');
      setEnvironments(response.data.environments);
      setApplications(response.data.applications);
      
      // Load all scripts initially
      loadScripts();
    } catch (error) {
      console.error('Error loading configuration:', error);
      setToast({ type: 'error', message: 'Failed to load configuration' });
    }
  };

  const loadScripts = async (environment = '', application = '') => {
    try {
      let url = 'http://localhost:5001/api/scripts';
      const params = new URLSearchParams();
      
      if (environment) params.append('environment', environment);
      if (application) params.append('application', application);
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      
      const response = await axios.get(url);
      setAvailableScripts(response.data);
    } catch (error) {
      console.error('Error loading scripts:', error);
      setToast({ type: 'error', message: 'Failed to load scripts' });
    }
  };

  const addTestCase = () => {
    setTestCases([
      ...testCases,
      {
        id: Date.now(),
        scriptText: '',
        selectedFile: null,
        selectedScriptId: '',
        selectedEnvironment: '',
        selectedApplication: '',
        isRunning: false,
        output: '',
        metrics: null,
        urlMetrics: null,
        rampUpVUs: 0,
        rampUpDuration: '10s',
        steadyVUs: 10,
        steadyDuration: '30s',
        rampDownVUs: 0,
        rampDownDuration: '10s',
      },
    ]);
  };

  const updateTestCase = (id, updates) => {
    setTestCases((prev) =>
      prev.map((tc) => (tc.id === id ? { ...tc, ...updates } : tc))
    );
  };

  const handleEnvironmentChange = (testId, environment) => {
    updateTestCase(testId, { 
      selectedEnvironment: environment,
      selectedApplication: '',
      selectedScriptId: '',
      scriptText: ''
    });
    
    // Load scripts for the selected environment
    loadScripts(environment);
  };

  const handleApplicationChange = (testId, application) => {
    const testCase = testCases.find(tc => tc.id === testId);
    updateTestCase(testId, { 
      selectedApplication: application,
      selectedScriptId: '',
      scriptText: ''
    });
    
    // Load scripts for the selected environment and application
    if (testCase.selectedEnvironment) {
      loadScripts(testCase.selectedEnvironment, application);
    }
  };

  const handleScriptChange = (testId, scriptId) => {
    updateTestCase(testId, { selectedScriptId: scriptId });
    loadSelectedScript(testId, scriptId);
  };

  const loadSelectedScript = async (testId, scriptId) => {
    const testCase = testCases.find(tc => tc.id === testId);
    
    if (!scriptId || !testCase.selectedEnvironment || !testCase.selectedApplication) {
      updateTestCase(testId, { scriptText: '', selectedScriptId: '' });
      return;
    }

    try {
      const response = await axios.get(
        `http://localhost:5001/api/scripts/${testCase.selectedEnvironment}/${testCase.selectedApplication}/${scriptId}`
      );
      updateTestCase(testId, { 
        scriptText: response.data.content,
        selectedScriptId: scriptId 
      });
    } catch (error) {
      console.error('Error loading script:', error);
      setToast({ type: 'error', message: 'Failed to load selected script' });
    }
  };

  const saveNewScript = async () => {
    if (!newScriptName.trim() || !newScriptContent.trim() || !newScriptEnvironment || !newScriptApplication) {
      setToast({ type: 'error', message: 'All fields are required: name, content, environment, and application' });
      return;
    }

    try {
      await axios.post('http://localhost:5001/api/scripts', {
        scriptName: newScriptName,
        content: newScriptContent,
        environment: newScriptEnvironment,
        application: newScriptApplication
      });
      setToast({ type: 'success', message: 'Script saved successfully' });
      setNewScriptName('');
      setNewScriptContent('');
      setNewScriptEnvironment('');
      setNewScriptApplication('');
      setShowScriptManager(false);
      loadScripts(); // Refresh the scripts list
    } catch (error) {
      console.error('Error saving script:', error);
      setToast({ type: 'error', message: 'Failed to save script' });
    }
  };

  const deleteScript = async (script) => {
    if (!window.confirm(`Are you sure you want to delete "${script.name}"?`)) {
      return;
    }

    try {
      await axios.delete(`http://localhost:5001/api/scripts/${script.environment}/${script.application}/${script.id}`);
      setToast({ type: 'success', message: 'Script deleted successfully' });
      loadScripts(); // Refresh the scripts list
    } catch (error) {
      console.error('Error deleting script:', error);
      setToast({ type: 'error', message: 'Failed to delete script' });
    }
  };

  const runTest = async (id) => {
    updateTestCase(id, { isRunning: true });
    setToast(null);
    const testCase = testCases.find((tc) => tc.id === id);
    const formData = new FormData();

    // Priority: uploaded file > selected script > inline script
    if (testCase.selectedFile) {
      formData.append('file', testCase.selectedFile);
    } else if (testCase.selectedScriptId && testCase.selectedEnvironment && testCase.selectedApplication) {
      formData.append('selectedScriptId', testCase.selectedScriptId);
      formData.append('selectedEnvironment', testCase.selectedEnvironment);
      formData.append('selectedApplication', testCase.selectedApplication);
    } else if (testCase.scriptText.trim()) {
      formData.append('script', testCase.scriptText);
    } else {
      updateTestCase(id, { isRunning: false });
      setToast({ type: 'error', message: 'Please provide a script to run' });
      return;
    }

    // Add load configuration parameters
    formData.append('rampUpVUs', testCase.rampUpVUs);
    formData.append('rampUpDuration', testCase.rampUpDuration);
    formData.append('steadyVUs', testCase.steadyVUs);
    formData.append('steadyDuration', testCase.steadyDuration);
    formData.append('rampDownVUs', testCase.rampDownVUs);
    formData.append('rampDownDuration', testCase.rampDownDuration);

    try {
      const response = await axios.post('http://localhost:5001/api/run-test', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      // ✅ CLUSTER MODE HANDLING
    if (response.data.executionMode === 'cluster') {
  updateTestCase(id, {
    isRunning: false,
    output: `Test submitted successfully.\nTest ID: ${response.data.jobId}`,
    metrics: null,
    urlMetrics: null,
  });

  setToast({
    type: 'success',
    message: `Test submitted successfully. Test ID: ${response.data.jobId}`,
  });

  return;
}

  // ✅ LOCAL MODE HANDLING (MISSING PART)
  updateTestCase(id, {
  output: response.data.output,
  metrics: response.data.metrics,
  urlMetrics: response.data.urlMetrics,
  isRunning: false,
});

if (response.data.thresholdViolated) {
  setToast({
    type: 'warning',
    message: 'Test completed but some thresholds were exceeded. Check results below.',
  });
} else {
  setToast({ type: 'success', message: 'Test completed successfully.' });
}

    } catch (error) {
      console.error('Error running test:', error);
      updateTestCase(id, { isRunning: false });
      setToast({ 
        type: 'error', 
        message: error.response?.data?.message || 'Failed to run test.' 
      });
    }
  };

  const removeTestCase = (id) => {
    if (testCases.length > 1) {
      setTestCases(testCases.filter(tc => tc.id !== id));
    }
  };

  return (
    <div className="k6-test-runner">
      <div className="k6-header">
        <h2>K6 Load Test Runner</h2>
        <button 
          onClick={() => setShowScriptManager(true)}
          className="manage-scripts-btn"
        >
          🛠️ Manage Scripts
        </button>
      </div>

      {/* Script Manager Modal */}
      {showScriptManager && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Script Manager</h3>
            
            {/* Existing Scripts by Environment and Application */}
            <div className="existing-scripts">
              <h4>Existing Scripts ({availableScripts.length})</h4>
              {availableScripts.length > 0 ? (
                <div className="scripts-list">
                  {environments.map(env => {
                    const envScripts = availableScripts.filter(script => script.environment === env.value);
                    if (envScripts.length === 0) return null;
                    
                    return (
                      <div key={env.value} className="environment-group">
                        <div className="environment-header">
                          🌍 {env.name} Environment
                        </div>
                        {applications.map(app => {
                          const appScripts = envScripts.filter(script => script.application === app.value);
                          if (appScripts.length === 0) return null;
                          
                          return (
                            <div key={`${env.value}-${app.value}`} className="application-group">
                              <div className="application-header">
                                📱 {app.name} Application
                              </div>
                              {appScripts.map(script => (
                                <div key={script.fullId} className="script-item">
                                  <div className="script-info">
                                    <strong>{script.name}</strong>
                                    <div className="script-filename">
                                      {script.filename}
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => deleteScript(script)}
                                    className="delete-script-btn"
                                  >
                                    🗑️ Delete
                                  </button>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="no-scripts">No scripts available</p>
              )}
            </div>

            {/* Add New Script */}
            <div className="new-script-form">
              <h4>Add New Script</h4>
              
              <div className="form-row">
                <div>
                  <label>Environment:</label>
                  <select
                    value={newScriptEnvironment}
                    onChange={(e) => setNewScriptEnvironment(e.target.value)}
                    className="form-input"
                  >
                    <option value="">Select Environment</option>
                    {environments.map(env => (
                      <option key={env.id} value={env.value}>{env.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Application:</label>
                  <select
                    value={newScriptApplication}
                    onChange={(e) => setNewScriptApplication(e.target.value)}
                    className="form-input"
                  >
                    <option value="">Select Application</option>
                    {applications.map(app => (
                      <option key={app.id} value={app.value}>{app.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="form-group">
                <label>Script Name:</label>
                <input
                  type="text"
                  value={newScriptName}
                  onChange={(e) => setNewScriptName(e.target.value)}
                  placeholder="Enter script name"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>Script Content:</label>
                <textarea
                  rows={10}
                  value={newScriptContent}
                  onChange={(e) => setNewScriptContent(e.target.value)}
                  placeholder="Paste your K6 script here..."
                  className="form-textarea"
                />
              </div>
            </div>

            <div className="modal-buttons">
              <button
                onClick={() => setShowScriptManager(false)}
                className="cancel-btn"
              >
                Cancel
              </button>
              <button
                onClick={saveNewScript}
                className="save-btn"
              >
                Save Script
              </button>
            </div>
          </div>
        </div>
      )}

      {testCases.map((test, idx) => (
        <div key={test.id} className="test-case">
          <div className="test-case-header">
            <h4>Test Case #{idx + 1}</h4>
            <div className="test-case-buttons">
              <button 
                onClick={() => runTest(test.id)} 
                disabled={test.isRunning}
                className="run-test-btn"
              >
                {test.isRunning ? '⏳ Running...' : '▶️ Run Test'}
              </button>
              {testCases.length > 1 && (
                <button 
                  onClick={() => removeTestCase(test.id)}
                  className="remove-test-btn"
                >
                  ✕ Remove
                </button>
              )}
            </div>
          </div>
          
          <div>
            {(test.selectedScriptId && test.selectedEnvironment && test.selectedApplication) && !test.isRunning && (
              <div className="script-ready">
                ✅ Script ready to run: {test.selectedEnvironment.toUpperCase()} - {test.selectedApplication.toUpperCase()} - {test.selectedScriptId}
              </div>
            )}
          </div>

          {/* Using the DropDowns component */}
          <DropDowns
            testCase={test}
            environments={environments}
            applications={applications}
            availableScripts={availableScripts}
            onEnvironmentChange={(environment) => handleEnvironmentChange(test.id, environment)}
            onApplicationChange={(application) => handleApplicationChange(test.id, application)}
            onScriptChange={(scriptId) => handleScriptChange(test.id, scriptId)}
          />

          <div className="file-upload">
            <label>📄 Or Upload Script File (.js):</label>
            <input
              type="file"
              accept=".js"
              onChange={(e) => {
                updateTestCase(test.id, { 
                  selectedFile: e.target.files[0],
                  selectedScriptId: '', // Clear selected script when file is uploaded
                  selectedEnvironment: '',
                  selectedApplication: ''
                });
              }}
            />
            <div className="file-info">
              {test.selectedFile && `File selected: ${test.selectedFile.name}`}
            </div>
          </div>

          <div className="script-editor">
            <h4>✏️ Or Edit Script Directly</h4>
            <textarea
              rows={12}
              className="script-textarea"
              value={test.scriptText}
              onChange={(e) => {
                updateTestCase(test.id, { 
                  scriptText: e.target.value,
                  selectedScriptId: test.selectedScriptId // Keep selected script ID if editing
                });
              }}
              placeholder="Write or paste your k6 script here..."
            />
            <div className="script-priority-note">
              Priority: Uploaded File → Selected Script (Environment + Application) → Inline Script
            </div>
          </div>

          {/* Load Configuration */}
          <div className="load-config">
            <h4>⚙️ Load Configuration</h4>
            
            <div className="load-config-grid">
              <div className="load-phase">
                <h5>📈 Ramp-Up Phase</h5>
                <div className="load-input-group">
                  <label>Virtual Users:</label>
                  <input
                    type="number"
                    min="0"
                    value={test.rampUpVUs}
                    onChange={(e) =>
                      updateTestCase(test.id, { rampUpVUs: Number(e.target.value) })
                    }
                    className="load-input"
                  />
                </div>
                <div className="load-input-group">
                  <label>Duration:</label>
                  <input
                    type="text"
                    value={test.rampUpDuration}
                    onChange={(e) => updateTestCase(test.id, { rampUpDuration: e.target.value })}
                    placeholder="e.g., 30s, 2m"
                    className="load-input"
                  />
                </div>
              </div>

              <div className="load-phase">
                <h5>⚡ Steady State</h5>
                <div className="load-input-group">
                  <label>Virtual Users:</label>
                  <input
                    type="number"
                    min="0"
                    value={test.steadyVUs}
                    onChange={(e) =>
                      updateTestCase(test.id, { steadyVUs: Number(e.target.value) })
                    }
                    className="load-input"
                  />
                </div>
                <div className="load-input-group">
                  <label>Duration:</label>
                  <input
                    type="text"
                    value={test.steadyDuration}
                    onChange={(e) => updateTestCase(test.id, { steadyDuration: e.target.value })}
                    placeholder="e.g., 1m, 60s"
                    className="load-input"
                  />
                </div>
              </div>

              <div className="load-phase">
                <h5>📉 Ramp-Down Phase</h5>
                <div className="load-input-group">
                  <label>Virtual Users:</label>
                  <input
                    type="number"
                    min="0"
                    value={test.rampDownVUs}
                    onChange={(e) =>
                      updateTestCase(test.id, { rampDownVUs: Number(e.target.value) })
                    }
                    className="load-input"
                  />
                </div>
                <div className="load-input-group">
                  <label>Duration:</label>
                  <input
                    type="text"
                    value={test.rampDownDuration}
                    onChange={(e) => updateTestCase(test.id, { rampDownDuration: e.target.value })}
                    placeholder="e.g., 10s, 30s"
                    className="load-input"
                  />
                </div>
              </div>
            </div>
          </div>

          {test.isRunning && (
            <div className="running-indicator">
              <div className="running-indicator-content">
                <span>⏳</span>
                <span>Test is running, please wait...</span>
              </div>
            </div>
          )}

          {/* URL-specific Metrics Table */}
          {test.urlMetrics && test.urlMetrics.length > 0 && (
            <div className="metrics-section">
              <h4>📊 URL Performance Metrics</h4>
              <div className="metrics-table-container">
                <table className="metrics-table">
                  <thead>
                    <tr>
                      <th>Label</th>
                      <th className="center">Requests Total</th>
                      <th className="center">Avg Duration (ms)</th>
                      <th className="center">Request Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {test.urlMetrics.map((urlMetric, index) => (
                      <tr key={index}>
                        <td className="url-label">
                          {urlMetric.label}
                        </td>
                        <td className="center bold">
                          {urlMetric.requests_total}
                        </td>
                        <td className={`center ${urlMetric.request_duration_ms > 1000 ? 'duration-bad' : 'duration-good'}`}>
                          {urlMetric.request_duration_ms}
                        </td>
                        <td className={`center ${urlMetric.request_errors > 0 ? 'errors-bad' : 'errors-good'}`}>
                          {urlMetric.request_errors}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Overall Metrics */}
          {test.metrics && (
            <div className="metrics-section">
              <h4>📈 Overall Test Metrics</h4>
              <div className="metrics-table-container">
                <table className="overall-metrics-table">
                  <thead>
                    <tr>
                      {Object.keys(test.metrics).map((key) => (
                        <th key={key}>
                          {key.replace(/_/g, ' ').toUpperCase()}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {Object.values(test.metrics).map((value, idx) => (
                        <td key={idx}>
                          {value}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Console Output */}
          {test.output && (
            <div className="console-output">
              <h4>🖥️ Console Output</h4>
              <pre className="console-pre">
                {test.output}
              </pre>
            </div>
          )}
        </div>
      ))}

      <div className="add-test-case">
        <button 
          onClick={addTestCase}
          className="add-test-case-btn"
        >
          ➕ Add Another Test Case
        </button>
      </div>

      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
});

export default K6TestRunner;
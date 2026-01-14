import React from 'react';
import './DropDowns.css';

const DropDowns = ({
  testCase,
  environments,
  applications,
  availableScripts,
  onEnvironmentChange,
  onApplicationChange,
  onScriptChange
}) => {

  // Get filtered scripts for current test case
  const getFilteredScripts = () => {
    if (!testCase.selectedEnvironment || !testCase.selectedApplication) {
      return [];
    }
    
    return availableScripts.filter(script => 
      script.environment === testCase.selectedEnvironment && 
      script.application === testCase.selectedApplication
    );
  };

  const filteredScripts = getFilteredScripts();

  return (
    <div className="dropdowns-container">
      <h4>Selection</h4>
      
      <div className="dropdowns-grid">
        {/* Environment Selection */}
        <div className="dropdown-item">
          <label>Environment:</label>
          <select
            value={testCase.selectedEnvironment}
            onChange={(e) => onEnvironmentChange(e.target.value)}
            className="compact-select"
          >
            <option value="">-- Select --</option>
            {environments.map(env => (
              <option key={env.id} value={env.value}>{env.name}</option>
            ))}
          </select>
        </div>

        {/* Application Selection */}
        <div className="dropdown-item">
          <label>Application:</label>
          <select
            value={testCase.selectedApplication}
            onChange={(e) => onApplicationChange(e.target.value)}
            disabled={!testCase.selectedEnvironment}
            className="compact-select"
          >
            <option value="">-- Select --</option>
            {applications.map(app => (
              <option key={app.id} value={app.value}>{app.name}</option>
            ))}
          </select>
        </div>

        {/* Script Selection */}
        <div className="dropdown-item">
          <label>Script:</label>
          <select
            value={testCase.selectedScriptId}
            onChange={(e) => onScriptChange(e.target.value)}
            disabled={!testCase.selectedEnvironment || !testCase.selectedApplication}
            className="compact-select"
          >
            <option value="">
              {!testCase.selectedEnvironment || !testCase.selectedApplication 
                ? '-- Select Env/App first --' 
                : '-- Select Script --'}
            </option>
            {filteredScripts.map(script => (
              <option key={script.fullId} value={script.id}>
                {script.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Status Message */}
      <div className="script-status">
        {testCase.selectedScriptId && testCase.selectedEnvironment && testCase.selectedApplication
          ? `Selected: ${testCase.selectedEnvironment.toUpperCase()} - ${testCase.selectedApplication.toUpperCase()} - ${filteredScripts.find(s => s.id === testCase.selectedScriptId)?.name || 'Unknown'}`
          : !testCase.selectedEnvironment || !testCase.selectedApplication
          ? 'Please select environment and application first'
          : 'No script selected'}
      </div>
    </div>
  );
};

export default DropDowns;
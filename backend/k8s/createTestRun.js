export function buildTestRun({ name, scriptConfigMap }) {
  return {
    apiVersion: 'k6.io/v1alpha1',
    kind: 'TestRun',
    metadata: {
      name
    },
    spec: {
      parallelism: 1,
      script: {
        configMap: {
          name: scriptConfigMap,
          file: 'test.js'
        }
      }
    }
  };
}

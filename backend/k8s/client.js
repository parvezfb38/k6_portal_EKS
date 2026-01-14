const k8s = require('@kubernetes/client-node');

const kc = new k8s.KubeConfig();
kc.loadFromDefault(); // ~/.kube/config OR in-cluster

const k8sApi = kc.makeApiClient(k8s.CustomObjectsApi);
const coreV1Api = kc.makeApiClient(k8s.CoreV1Api);

module.exports = {
  k8sApi,
  coreV1Api
};

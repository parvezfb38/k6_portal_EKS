import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  stages: [{ duration: '30s', target: 10 }],
  thresholds: {
    'http_req_duration': ['p(95)<5000'], // 5 second threshold - more realistic
    'http_req_failed': ['rate<0.5'], // 50% failure rate threshold - very lenient
  },
};

export default function() {
  const res = http.get('https://www.google.com', {
    headers: {
      'Cookie': 'xxxxx=true', 
    }
  });
  check(res, { "Stage ab Home status is 200": (res) => res.status === 200 });
  sleep(1);
}
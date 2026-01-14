import http from 'k6/http';
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
}
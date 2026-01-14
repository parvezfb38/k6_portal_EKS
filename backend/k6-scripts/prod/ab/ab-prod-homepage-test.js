import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  vus: 20,
  duration: '5m',
};

export default function() {
  const res = http.get('https://www.google.com');
  check(res, { "Prod ab Home status is 200": (res) => res.status === 200 });
  sleep(3);
}
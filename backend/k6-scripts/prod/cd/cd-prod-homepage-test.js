import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  vus: 15,
  duration: '3m',
};

export default function() {
  const res = http.get('https://www.google.com');
  check(res, { "Prod cd Home status is 200": (res) => res.status === 200 });
  sleep(2);
}
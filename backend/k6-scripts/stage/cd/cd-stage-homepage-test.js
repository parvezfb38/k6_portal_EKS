import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  vus: 8,
  duration: '90s',
};

export default function() {
  const res = http.get('https://www.google.com');
  check(res, { "Stage cd Home status is 200": (res) => res.status === 200 });
  sleep(1);
}
import http from 'k6/http';
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
}